const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');
const validationFunctions = require('../../../config/validationFunctions');
const validation = new validationFunctions.validation();
const resFormat = require('../../../config/responseMessages');

const jwt = require('jsonwebtoken');
const regexEmail = require('regex-email');
const crypto = require('crypto');
const secret_config = require('../../../config/secret');
const {google} = require('googleapis');
const request = require('request');
const moment = require('moment');

const DEF_HOME_PAGE_INDEX = 1;
let videoArr = [];
let communityArr = [];

/**
 update : 2020.07.23
 01.video API = 비디오 영상 10개 씩 page 조회
 **/
exports.video = async function (req, res) {
    const queryPage = Number(req.query.page);

    if (!validation.isValidePageIndex(queryPage)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            //최대 video 갯수 쿼리
            const countVideoQuery = `select count(VideoIdx) as videoCount from Videos ;`
            const [videoCount] = await connection.query(countVideoQuery);
            const maxListCount = videoCount[0].videoCount;

            //무한 스크롤를 위한 처리
            const temp = parseInt(queryPage % parseInt((maxListCount / 10) + 1))
            let page = temp === 0 ? 3 : temp;

            if (page === DEF_HOME_PAGE_INDEX || videoArr.length <= 1) {
                videoArr = getRandomArr(maxListCount);
            }

            const videoListQuery = `
                select VideoIdx,
                       Videos.UserId,
                       TitleText,
                       case
                           when Views > 1000
                               then concat(TRUNCATE(Views / 1000, 1), ' 회')
                           else concat(Views, ' 회')
                           end as Views,
                       case
                           when TIMESTAMPDIFF(SECOND, Videos.CreatedAt, CURRENT_TIMESTAMP) < 60
                               then concat(TIMESTAMPDIFF(SECOND, Videos.CreatedAt, CURRENT_TIMESTAMP), '초 전')
                           else case
                                    when TIMESTAMPDIFF(minute, Videos.CreatedAt, CURRENT_TIMESTAMP) < 60
                                        then concat(TIMESTAMPDIFF(minute, Videos.CreatedAt, CURRENT_TIMESTAMP), '분 전')
                                    else case
                                             when TIMESTAMPDIFF(HOUR, Videos.CreatedAt, CURRENT_TIMESTAMP) < 24
                                                 then concat(TIMESTAMPDIFF(HOUR, Videos.CreatedAt, CURRENT_TIMESTAMP), '시간 전')
                                             else case
                                                      when TIMESTAMPDIFF(day, Videos.CreatedAt, CURRENT_TIMESTAMP) < 30
                                                          then concat(TIMESTAMPDIFF(day, Videos.CreatedAt, CURRENT_TIMESTAMP), '일 전')
                                                 end
                                        end
                               end
                           end as CreateAt,
                       PlayTime,
                       ThumUrl,
                       U.ProfileUrl
                
                from Videos
                         left outer join User U on Videos.UserId = U.UserId
                order by field(VideoIdx, ?)
                limit 10 offset ?;
                `;

            const [videoRows] = await connection.query(videoListQuery, [videoArr, 10 * (page - 1)]);

            let resultArr = {};
            resultArr.video = videoRows;

            let responseData = {};
            responseData = resFormat(true, 100, 'video 리스트 호출 성공');
            responseData.result = resultArr;

            console.log("/videos (get)");
            connection.release();
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Story Video Query error\n: ${JSON.stringify(err)}`);
            connection.release();

            return res.json(resFormat(false, 290, 'Video 정보 조회중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Video connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.23
 02.story-video API = 스토리 비디오 영상 5개씩 조회
 **/
exports.story = async function (req, res) {
    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            //최대 Story video 갯수 쿼리
            const countStoryVideoQuery = `select count(StoryVideoIdx) as storyVideoCount from StoryVideo;`
            const [storyVideoCount] = await connection.query(countStoryVideoQuery);
            const maxListCount = storyVideoCount[0].storyVideoCount;
            let randomStoryVideoArr = getRandomArr(maxListCount);

            const storyVideoQuery = ` select StoryVideoIdx, StoryVideo.UserId, ThumUrl, U.ProfileUrl
                                            from StoryVideo
                                            left outer join User U on U.UserId = StoryVideo.UserId
                                            order by field(StoryVideoIdx, ?);
                                     `;

            const [storyVideoRows] = await connection.query(storyVideoQuery, [randomStoryVideoArr]);

            let resultArr = {};
            resultArr.storyVideo = storyVideoRows;

            let responseData = {};
            responseData = resFormat(true, 100, 'story video 리스트 호출 성공');
            responseData.result = resultArr;

            console.log("/story-videos (get)");
            connection.release();
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Story Video Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'Story Video 정보 조회중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Story Video connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.23
 03.community = 커뮤니티 게시글 1page 당 하나씩 조회
 **/
exports.community = async function (req, res) {
    const queryPage = Number(req.query.page);
    if (!validation.isValidePageIndex(queryPage)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            //최대 video 갯수 쿼리
            const countCommunityQuery = `select count(CommunityIdx) as communityoCount from UserCommunity;`
            const [communityCount] = await connection.query(countCommunityQuery);
            const maxListCount = communityCount[0].communityoCount;

            if (parseInt(queryPage % maxListCount) === DEF_HOME_PAGE_INDEX || communityArr.length <= 1) {
                communityArr = getRandomArr(maxListCount);
            }

            const communitySelectQuery = `select CommunityIdx,
                                               UserCommunity.UserId,
                                               MainText,
                                               LikesCount,
                                               DislikesCount,
                                               ImgUrl,
                                               U.ProfileUrl,
                                               CommentCount,
                                               case
                                                   when TIMESTAMPDIFF(SECOND, UserCommunity.CreatedAt, CURRENT_TIMESTAMP) < 60
                                                       then concat(TIMESTAMPDIFF(SECOND, UserCommunity.CreatedAt, CURRENT_TIMESTAMP), '초 전')
                                                   else case
                                                            when TIMESTAMPDIFF(minute, UserCommunity.CreatedAt, CURRENT_TIMESTAMP) < 60
                                                                then concat(TIMESTAMPDIFF(minute, UserCommunity.CreatedAt, CURRENT_TIMESTAMP), '분 전')
                                                            else case
                                                                     when TIMESTAMPDIFF(HOUR, UserCommunity.CreatedAt, CURRENT_TIMESTAMP) < 24
                                                                         then concat(TIMESTAMPDIFF(HOUR, UserCommunity.CreatedAt, CURRENT_TIMESTAMP), '시간 전')
                                                                     else case
                                                                              when TIMESTAMPDIFF(day, UserCommunity.CreatedAt, CURRENT_TIMESTAMP) < 30
                                                                                  then concat(TIMESTAMPDIFF(day, UserCommunity.CreatedAt, CURRENT_TIMESTAMP), '일 전')
                                                                         end
                                                                end
                                                       end
                                                   end as CreateAt
                                        from UserCommunity
                                        left outer join User U on UserCommunity.UserId = U.UserId
                                        where CommunityIdx = ?;
        `;

            const [communityRows] = await connection.query(communitySelectQuery, Number(communityArr[queryPage % 5]));

            let resultArr = {};
            resultArr.community = communityRows;

            let responseData = {};
            responseData = resFormat(true, 100, 'community 호출 성공');
            responseData.result = resultArr;

            console.log("/community-posts (get)");
            connection.release();
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Videos/:videoIdx Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'community 정보 조회중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Community connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.24
 04.watch = 영상 상세 조회 api
 **/
exports.watch = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    if (!validation.isValidePageIndex(videoIdx)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        //likeStatus를 확인하기위한 유저 인덱스 값 jwt가 존재한다면 변경
        let userIdxForLikeStatus = 0;
        try {
            const jwtoken = req.headers['x-access-token'];

            // db에 비디오 인덱스 존재 판별
            const videoExistQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isExists] = await connection.query(videoExistQuery, videoIdx);
            if (!isExists[0].exist) {
                connection.release();
                return res.json(resFormat(false, 201, '존재하지 않는 비디오 인덱스 입니다.'))
            }

            //jwt 가 있을시 히스토리 테이블에 insert
            if (jwtoken) {
                let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
                const userIdx = jwtDecode.userIdx;
                const userId = jwtDecode.userId;
                userIdxForLikeStatus = userIdx;

                const existUserCheckQuery = 'select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;';
                const [isExistUser] = await connection.query(existUserCheckQuery, [userIdx, userId]);

                //아이디 유효성 검사
                if (!isExistUser[0].exist) {
                    connection.release();
                    return res.json(resFormat(false, 202, '유효하지 않은 토큰입니다.'));
                }

                // 토큰 아이디값 , 시청영상 인덱스
                const insertHistoryParams = [userIdx, userId, videoIdx]
                //중복 검사 중복이라면 시간 업데이트 아니라면 insert
                const duplicateCheckQuery = 'select exists(select UserIdx from UserWatchHistory where UserIdx = ? and UserId = ? and VideoIdx = ?) as exist;'
                const [isDuplicateHistory] = await connection.query(duplicateCheckQuery, insertHistoryParams);

                await connection.beginTransaction();
                if (isDuplicateHistory[0].exist) {
                    const watchUpdateHistoryQuery = 'update UserWatchHistory set UpdatedAt = current_timestamp where UserIdx = ? and UserId = ? and VideoIdx = ?;';
                    await connection.query(watchUpdateHistoryQuery,insertHistoryParams);
                } else{
                    const watchInsertHistoryQuery = 'insert into UserWatchHistory(UserIdx, UserId, VideoIdx) values(?,?,?);';
                    await connection.query(watchInsertHistoryQuery, insertHistoryParams);
                }
                await connection.commit();
            }

            //비디오 조회시 조횟수 증가
            const addVideoViewsQuery = `update Videos set Views = Views + 1 where Videos.VideoIdx=?;`
            await connection.beginTransaction();
            await connection.query(addVideoViewsQuery,videoIdx);
            await connection.commit();


            // 비디오 상세정보 조회
            const videoInfoQuery = `
            select Videos.VideoIdx,
                   U.UserIdx,
                   Videos.UserId,
                   TitleText,
                   MainText,
                   Views,
                   LikesCount,
                   DislikesCount,
                   U.SubscribeCount,
                   case when isnull(UL.LikeStatus) then 0 else UL.LikeStatus end as LikeStatus,
                   ViedoUrl,
                   U.ProfileUrl,
                   Videos.CreatedAt
            
            from Videos
                     left outer join User U on U.UserId = Videos.UserId
                     left outer join UserLikes UL on UL.VideoIdx = Videos.VideoIdx and UL.UserIdx = ?
            where Videos.VideoIdx = ?;
`;
            const [videoInfo] = await connection.query(videoInfoQuery, [userIdxForLikeStatus, videoIdx]);
            let resultArr = {};
            resultArr.videoInfo = videoInfo[0];

            let responseData = resFormat(true, 100, '영상 시청 정보 조회 api 성공');
            responseData.result = resultArr;

            //todo
            // likestatus는

            console.log("/video/:videoIdx (get)");
            return res.json(responseData);
        } catch (err) {
            await connection.rollback(); // ROLLBACK
            logger.error(`App - Videos/:videoIdx Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'video/videoIdx 정보 조회중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Videos/:videoIdx connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};



//temp api for test
exports.signin = async function (req, res) {
    let responseData = {};

    url = ''

    res.json({test: "test"});

}

function getRandomArr(maxListCount) {
    let randomArr = [];

    for (let i = 0; i < maxListCount; i++) {
        randomArr[i] = i + 1
    }
    for (let i = 0; i < randomArr.length; i++) {
        rnum = Math.floor(Math.random() * maxListCount); //난수발생
        temp = randomArr[i];
        randomArr[i] = randomArr[rnum];
        randomArr[rnum] = temp;
    }

    return randomArr;
}