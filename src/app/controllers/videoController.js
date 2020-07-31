const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');
const validationFunctions = require('../../../config/validationFunctions');
const validation = new validationFunctions.validation();
const resFormat = require('../../../config/responseMessages');

const jwt = require('jsonwebtoken');
const secret_config = require('../../../config/secret');
const schedule = require('node-schedule');



var admin = require('firebase-admin');
var serviceAccount = require("../../../config/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://clone-e7f75.firebaseio.com"
});

const DEF_HOME_PAGE_INDEX = 1;
let videoArr = [];
let communityArr = [];
let recommentVideoIdx = 1;

/**
 update : 2020.07.23
 01.video API = 비디오 영상 10개 씩 page 조회
 **/
exports.getVideo = async function (req, res) {
    const queryPage = Number(req.query.page);
    const jwtoken = req.headers['x-access-token'];
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
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 204, '유효하지않는 토큰입니다.'));
            }


            //무한 스크롤를 위한 처리
            const temp = parseInt(queryPage % parseInt((maxListCount / 10) + 1))
            let page = temp === 0 ? 3 : temp;

            if (page === DEF_HOME_PAGE_INDEX || videoArr.length <= 1) {
                // 토큰이 없을때 랜덤 배열
                videoArr = await getRandomArr(maxListCount);
                //토큰이 있을때 추천 알고리즘
                if(jwtoken){
                    const getHistoryDataQuery = `
                    select UW.VideoIdx,
                           WatchCount,
                           WatchingTime,
                           V.Category,
                           VC.CatName
                    from UserWatchHistory as UW
                    left outer join Videos V on UW.VideoIdx = V.VideoIdx
                    left outer join VideoCategoryDef VC on V.Category = VC.CatIdx
                    where UserIdx = ?
                    order by WatchCount desc ;
                `;
                    const [getHistoryData] = await connection.query(getHistoryDataQuery,userIdx)
                    let recommendArr = await getRecommendArr(maxListCount,getHistoryData);
                    const getCategoryVideoQuery = `select VideoIdx from Videos where Category = ?`

                    let videoRecommendArr = [];
                    for (let i=0;i<recommendArr.length;i++){
                        const [getCategoryVideo] = await connection.query(getCategoryVideoQuery,[recommendArr[i][1]])

                        let tempArr = [];
                        for (let i = 0;i<getCategoryVideo.length;i++){
                            tempArr[i] = getCategoryVideo[i].VideoIdx;
                        }
                        videoRecommendArr = videoRecommendArr.concat(tempArr);
                    }
                    videoArr = videoRecommendArr;
                    console.log(videoArr);
                    recommentVideoIdx = videoArr[0];
                }
            }
            //todo
            // 추천 알고리즘 완성 git 하고 푸쉬해야함

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
exports.getStory = async function (req, res) {
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
exports.getCommunity = async function (req, res) {
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
exports.getWatch = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    if (!validation.isValidePageIndex(videoIdx)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        //likeStatus를 확인하기위한 유저 인덱스 값 jwt가 존재한다면 변경
        let watchUserIdx = 0;
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
                console.log('/video/:videoIdx (get) with JWToken');
                let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
                const userIdx = jwtDecode.userIdx;
                const userId = jwtDecode.userId;
                watchUserIdx = userIdx;

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
                const addWatchCountQuery = `update UserWatchHistory set WatchCount = WatchCount + 1 where UserIdx = ? and VideoIdx = ?;`;
                await connection.query(addWatchCountQuery,[userIdx,videoIdx]);
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
                   Videos.LikesCount,
                   DislikesCount,
                   U.SubscribeCount,
                   CommentsCount,
                   case
                       when isnull(UP.IsDeleted) then 'false'
                       else case when UP.IsDeleted = 'N' then true else false end end as SaveStatus,
                   case when isnull(UL.LikeStatus) then 0 else UL.LikeStatus end          as LikeStatus,
                   case
                       when isnull(US.IsDeleted) then 'false'
                       else case when US.IsDeleted = 'N' then 'true' else 'false' end end as SubscribeStatus,
                   VideoUrl,
                   U.ProfileUrl,
                   UW.WatchingTime,
                   Videos.CreatedAt
            
            from Videos
                     left outer join User U on U.UserId = Videos.UserId
                     left outer join UserLikes UL on UL.VideoIdx = Videos.VideoIdx and UL.UserIdx = ?
                     left outer join UserSubscribes US on US.UserIdx = ? and U.UserIdx = US.ChannelUserIdx
                    left outer join UserPlayList UP on UP.UserIdx = ? and UP.VideoIdx = Videos.VideoIdx
                    left outer join UserWatchHistory UW on UW.UserIdx = ? and UW.VideoIdx = Videos.VideoIdx
            where Videos.VideoIdx = ?;
`;
            const [videoInfo] = await connection.query(videoInfoQuery, [watchUserIdx,watchUserIdx,watchUserIdx,watchUserIdx,videoIdx]);
            let resultArr = {};
            resultArr.videoInfo = videoInfo[0];

            let responseData = resFormat(true, 100, '영상 시청 정보 조회 api 성공');
            responseData.result = resultArr;

            console.log("/video/:videoIdx (get)");
            connection.release();
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
/**
 update : 2020.07.25
 13.watch = 영상 좋아요 설정 api
 **/
exports.updateLikes = async function (req, res){
    try{
        const videoIdx = parseInt(req.params.videoIdx);
        const jwtoken = req.headers['x-access-token'];
        const likeStatus = req.body.likeStatus;
        console.log('Patch Video Likes Body data = '+videoIdx+', '+likeStatus);
        // likeStatus 정의
        const DEF_NOT_SET_STATUS = 0;
        const DEF_LIKE_STATUS = 1;
        const DEF_DISLIKE_STATUS = 2;

        if (!validation.isValidePageIndex(videoIdx)) {
            return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
        }
        if (!jwtoken){
            return res.json(resFormat(false, 201, '로그인후 사용가능한 기능입니다.'));
        }
        if (likeStatus<0 || likeStatus>2 || likeStatus === undefined){
            return res.json(resFormat(false, 202, '좋아요 설정값은 0~2 사이의 값입니다.'));
        }

        const connection = await pool.getConnection(async conn => conn);
        try{
            // db에 비디오 인덱스 존재 판별
            const videoExistQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isExists] = await connection.query(videoExistQuery, videoIdx);
            if (!isExists[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '존재하지 않는 비디오 인덱스 입니다.'))
            }
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 204, '유효하지않는 토큰입니다.'));
            }
            const checkExistLikeHistoryQuery = `select exists(select UserLikesIdx from UserLikes where UserIdx = ? and VideoIdx = ? and IsDeleted = 'N') as exist;`;
            const [isExistLikeHistory] = await connection.query(checkExistLikeHistoryQuery,[userIdx,videoIdx]);

            //존재 하지 않으면 insert 하면서 기록
            //Like Status 값에 따라서 해당 영상의 좋아요 갯수 +1,-1 설정
            //존재 한다면 update
            if(!isExistLikeHistory[0].exist){
                const insertLikeStatusQuery = `insert into UserLikes(UserIdx, VideoIdx, LikeStatus) values (?,?,?);`;

                let likeCount = 0;
                let dislikeCount = 0;
                switch (likeStatus) {
                    case DEF_LIKE_STATUS:
                        likeCount = 1;
                        break;
                    case DEF_DISLIKE_STATUS:
                        dislikeCount = 1;
                        break;
                }
                const updateVideoLikeCountQuery = 'UPDATE Videos SET LikesCount= LikesCount+'+likeCount+', DislikesCount=DislikesCount+'+dislikeCount+' WHERE VideoIdx = ?;'
                //insert UserLike history
                await connection.beginTransaction();
                await connection.query(insertLikeStatusQuery,[userIdx,videoIdx,likeStatus]);
                await connection.query(updateVideoLikeCountQuery,videoIdx);
                await connection.commit();
            } else{
                //이전값과 비교하여 계산할 필요가 있음. ex) like -> dislike 일 경우 likecount -1 , dislikecount +1
                const getPreviousLikeStatusQuery = `select LikeStatus from UserLikes where UserIdx = ? and VideoIdx = ?;`;
                const [previousLikeStatus] = await connection.query(getPreviousLikeStatusQuery,[userIdx,videoIdx]);

                //변경 값이 없음
                if(previousLikeStatus[0].LikeStatus === likeStatus){
                    connection.release();
                    return res.json(resFormat(false,205,"LikeStatus의 변경값이 없습니다."))
                }

                // 좋아요 변동에 따른 갯수 변화 처리 인데... 더 좋은 방법이 있을것이다.....
                let likeCount = 0;
                let dislikeCount = 0;
                switch (previousLikeStatus[0].LikeStatus) {
                    case DEF_NOT_SET_STATUS://0
                        if(likeStatus === 1)likeCount = 1;
                        else if(likeStatus === 2)dislikeCount = 1;
                        break;
                    case DEF_LIKE_STATUS://1
                        if(likeStatus === 0)likeCount = -1;
                        else if(likeStatus === 2){
                            likeCount = -1;
                            dislikeCount = 1;
                        }
                        break;
                    case DEF_DISLIKE_STATUS://2
                        if(likeStatus === 0)dislikeCount = -1;
                        else if(likeStatus === 1){
                            likeCount = 1;
                            dislikeCount = -1;
                        }
                        break;
                }
                let updateVideoLikeCountQuery = 'UPDATE Videos SET LikesCount= LikesCount+'+likeCount+', DislikesCount=DislikesCount+'+dislikeCount+' WHERE VideoIdx = ?;';
                const updateLikeStatusQuery = `update UserLikes set LikeStatus = ? where UserIdx = ? and VideoIdx = ?;`;
                await connection.beginTransaction();
                await connection.query(updateVideoLikeCountQuery,videoIdx);
                await connection.query(updateLikeStatusQuery,[likeStatus,userIdx,videoIdx]);
                await connection.commit();
            }

            let responseData = resFormat(true,100,'좋아요 상태 업데이트');
            responseData.result = {userIdx:userIdx,videoIdx:videoIdx,likeStatus:likeStatus};
            connection.release();
            return res.json(responseData);
        }catch (err) {
            logger.error(`App - Videos/:videoIdx/likes Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'Like 정보 query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - Videos/:videoIdx/likes connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }

};
/**
 update : 2020.07.28
 15.save-videos = 나중에 볼 영상 리스트에 조회
 **/
exports.getSaveVideo = async function(req, res){
    const page = parseInt(req.query.page);
    const jwtoken = req.headers['x-access-token'];

    if (!validation.isValidePageIndex(page)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    if(!jwtoken){
        return res.json(resFormat(false, 201, '로그인후 사용가능한 기능입니다. '));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try {
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 204, '유효하지않는 토큰입니다.'));
            }
            const getSavePlayListQuery = `
                                    select PlayListIdx,
                                           UserPlayList.UserIdx,
                                           U.UserId,
                                           UserPlayList.VideoIdx,
                                           V.VideoIdx,
                                           V.TitleText,
                                           V.Views,
                                           U.ProfileUrl,
                                           V.ThumUrl,
                                           V.PlayTime,
                                           V.CreatedAt
                                    from UserPlayList
                                             left outer join Videos V on UserPlayList.VideoIdx = V.VideoIdx
                                             left outer join  User U on UserPlayList.UserIdx = U.UserIdx
                                    where UserPlayList.UserIdx = ?
                                    order by UserPlayList.CreatedAt DESC
                                    limit 10 offset ?;
                                    `;
            const [getSavePlayList] = await connection.query(getSavePlayListQuery,[userIdx,parseInt((page-1)*10)]);
            let resposeData = resFormat(true,100,'저장 영상 조회 성공');
            resposeData.result = getSavePlayList;

            console.log("get /saved-videos/:videoIdx");
            connection.release();
            return res.json(resposeData);
        }catch (err) {
            logger.error(`App - get /saved-videos/:videoIdx Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'get /saved-videos/:videoIdx 정보 query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - get /saved-videos/:videoIdx connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.28
 14.save-videos = 나중에 볼 영상 리스트에 저장 및 삭제 api
 **/
exports.postSaveVideo = async function (req, res) {
    const videoIdx = parseInt(req.params.videoIdx);
    const jwtoken = req.headers['x-access-token'];

    if (!validation.isValidePageIndex(videoIdx)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    if (!jwtoken){
        return res.json(resFormat(false, 201, '로그인후 사용가능한 기능입니다.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // db에 비디오 인덱스 존재 판별
            const videoExistQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isExists] = await connection.query(videoExistQuery, videoIdx);
            if (!isExists[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '존재하지 않는 비디오 인덱스 입니다.'))
            }
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 204, '유효하지않는 토큰입니다.'));
            }

            const isExistInPlayListQuery = `select exists(select PlayListIdx from UserPlayList where UserIdx = ? and VideoIdx = ?) as exist;`;
            const [isExistInPlayList] = await connection.query(isExistInPlayListQuery,[userIdx,videoIdx]);
            //db에 isDeleted 토글

            let savePlayListStatus = '';
            if(isExistInPlayList[0].exist){
                const togglePlayListDeletedQuery = `update UserPlayList set IsDeleted = (if(IsDeleted='N','Y','N')) where UserIdx=? and VideoIdx=?;`;
                await connection.beginTransaction();
                await connection.query(togglePlayListDeletedQuery,[userIdx,videoIdx]);
                await connection.commit();

                const getDeletedQuery = `select IsDeleted from UserPlayList where UserIdx = ? and VideoIdx = ? ;`;
                const [getDeleted] = await connection.query(getDeletedQuery,[userIdx,videoIdx]);

                savePlayListStatus = getDeleted[0].IsDeleted === 'N'
            }
            else{
                const insertPlayListQuery = `INSERT INTO UserPlayList(UserIdx, VideoIdx) values (?,?);`;
                await connection.beginTransaction();
                await connection.query(insertPlayListQuery,[userIdx,videoIdx]);
                await connection.commit();
                savePlayListStatus = true;
            }

            let responseData = resFormat(true,100,'나중에 볼 영상 설정 api 성공')
            responseData.result = {savePlayListStatus : savePlayListStatus};

            connection.release();
            console.log('/saved-videos/:videoIdx post api ');
            return res.json(responseData);
        }catch (err) {
            logger.error(`App - post /saved-videos/:videoIdx Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'post /saved-videos/:videoIdx 정보 query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - post /saved-videos/:videoIdx connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.28
 20./videos/:videoIdx/play-time = play time 기록
 **/
exports.updatePlayTime = async function (req, res) {
    const videoIdx = parseInt(req.params.videoIdx);
    const jwtoken = req.headers['x-access-token'];
    const playTime = req.body.playTime;

    if (!validation.isValidePageIndex(videoIdx)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    if (!jwtoken){
        return res.json(resFormat(false, 201, '로그인후 사용가능한 기능입니다.'));
    }
    if (!playTime){
        return res.json(resFormat(false, 202, '시청 시간 데이터가 없습니다.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // db에 비디오 인덱스 존재 판별
            const videoExistQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isExists] = await connection.query(videoExistQuery, videoIdx);
            if (!isExists[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '존재하지 않는 비디오 인덱스 입니다.'))
            }
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 204, '유효하지않는 토큰입니다.'));
            }
            // Mmm:ss,mm:ss 형식만을 지원함
            const regexTimeExpend = /^([0-9][0-9][0-9]):?([0-5][0-9])$/;
            const regexTime = /^([0-9][0-9]):?([0-5][0-9])$/;
            if(!regexTimeExpend.test(playTime) && !regexTime.test(playTime)){
                connection.release();
                return res.json(resFormat(false, 205, 'mm:ss 형식의 문자를 지원합니다.'));
            }
            const updatePlayTimeQuery = `update UserWatchHistory set WatchingTime = ? where UserIdx = ? and VideoIdx = ?`;
            await connection.beginTransaction();
            await connection.query(updatePlayTimeQuery,[playTime,userIdx,videoIdx]);
            await connection.commit();
            connection.release();

            let responseData =resFormat(true, 100, 'update playTime');
            responseData.result = {userIdx:userIdx,videoIdx:videoIdx,playTime:playTime};
            return res.json(responseData);
        }
        catch (err) {
            logger.error(`App - update /videos/:videoIdx/play-time Query error\n: ${JSON.stringify(err)}`);
            connection.rollback();
            connection.release();
            return res.json(resFormat(false, 290, 'update /videos/:videoIdx/play-time 정보 query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - update /videos/:videoIdx/play-time connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.30
 20. /user/:userIdx/inbox = 수신함 목록 조회
 **/



/**
 update : 2020.07.30
 23./videos = 비디오 업로드
 **/
exports.postVideo = async function (req, res) {
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            const insertInboxQuery = `insert into UserInbox(UserIdx, VideoIdx) VALUES (?, ?);`;
            await connection.beginTransaction();
            await connection.query(insertInboxQuery,[13,11]);
            await connection.commit();

            var registrationToken = 'c0TMqyI3AMo:APA91bHkkU1U_G85c0rjY0yS1_bu7SmfKR_jQZ68yowPUGadKypxPjDfBq6hNBWuwb1ArDteodcW63EChvJ6_EGkRbysxQdbhRWyz8taFO2tlbVGFXUgfwZHi_EAAdKFahLfYObjtrU3';

            var fcmMessage = {
                data: {
                    title: 'sub) 기가지니 - 백수 일상 브이로그',
                    body: '멸치 myeolchi',
                    videoIdx: '11',
                    playTime : '13:30',
                    ProfileUrl: 'https://firebasestorage.googleapis.com/v0/b/clone-e7f75.appspot.com/o/profile%2F%E1%84%86%E1%85%A7%E1%86%AF%E1%84%8E%E1%85%B5%20myeolchi.png?alt=media&token=8e32f5c8-4321-4b29-acfb-cff8353900cf',
                    ThumUrl: 'https://firebasestorage.googleapis.com/v0/b/clone-e7f75.appspot.com/o/thumnail%2Fsub)%20%E1%84%80%E1%85%B5%E1%84%80%E1%85%A1%E1%84%8C%E1%85%B5%E1%84%82%E1%85%B5%20-%20%E1%84%87%E1%85%A2%E1%86%A8%E1%84%89%E1%85%AE%20%E1%84%8B%E1%85%B5%E1%86%AF%E1%84%89%E1%85%A1%E1%86%BC%20%E1%84%87%E1%85%B3%E1%84%8B%E1%85%B5%E1%84%85%E1%85%A9%E1%84%80%E1%85%B3.png?alt=media&token=31a1280f-3996-4346-bdf6-8259adcbed74',
                    CreateAt: '2020-07-18 18:09:55'
                },
                token: registrationToken
            };

            // Send a message to the device corresponding to the provided
            // registration token.
            admin.messaging().send(fcmMessage)
                .then((response) => {
                    // Response is a message ID string.
                    console.log('Successfully sent message:', response);
                    return res.json(resFormat(true,100,'test success'));
                })
                .catch((error) => {
                    console.log('Error sending message:', error);
                    return res.json(resFormat(false,200,'test fail'));
                });
        }catch(err){
            logger.error(`App - push /videos Query error\n: ${JSON.stringify(err)}`);
            connection.release();
        }
    }catch (err) {
        logger.error(`App - video upload test api connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'video upload test api  connection error'));
    }
};
/**
 update : 2020.07.30
 한시간 간격으로 추천 영상 스캐줄러
 **/
const j = schedule.scheduleJob('* */60 * * * *',async function(){
    try{
        var registrationToken = 'c0TMqyI3AMo:APA91bHkkU1U_G85c0rjY0yS1_bu7SmfKR_jQZ68yowPUGadKypxPjDfBq6hNBWuwb1ArDteodcW63EChvJ6_EGkRbysxQdbhRWyz8taFO2tlbVGFXUgfwZHi_EAAdKFahLfYObjtrU3';
        const connection = await pool.getConnection(async conn => conn);
        try{
            const pushRecommendVideoQuery = `
                                            select VideoIdx,
                                                   Videos.UserId,
                                                   TitleText,
                                                   ProfileUrl,
                                                   ThumUrl,
                                                   PlayTime,
                                                   Videos.CreatedAt
                                            from Videos
                                            left outer join User U on U.UserId = Videos.UserId
                                            where VideoIdx = ?;
                                            `;
            const [pushRecommendVideo] = await connection.query(pushRecommendVideoQuery,recommentVideoIdx);
            const insertInboxQuery = `insert into UserInbox(UserIdx, VideoIdx) VALUES (?, ?);`;
            await connection.beginTransaction();
            await connection.query(insertInboxQuery,[1,pushRecommendVideo[0].VideoIdx]);
            await connection.commit();
            connection.release();
            var fcmMessage = {
                data: {
                    title: "[당신에게 맞는 추천영상!!!] "+pushRecommendVideo[0].TitleText.toString(),
                    body: pushRecommendVideo[0].UserId.toString(),
                    videoIdx: pushRecommendVideo[0].VideoIdx.toString(),
                    playTime : pushRecommendVideo[0].PlayTime.toString(),
                    ProfileUrl: pushRecommendVideo[0].ProfileUrl.toString(),
                    ThumUrl: pushRecommendVideo[0].ThumUrl.toString(),
                    CreateAt: pushRecommendVideo[0].CreatedAt.toString()
                },
                token: registrationToken
            };
            // Send a message to the device corresponding to the provided
            // registration token.
            admin.messaging().send(fcmMessage)
                .then((response) => {
                    console.log('Successfully sent message:', response);
                })
                .catch((error) => {
                    console.log('Error sending message:', error);
                });

        }catch(err){
            logger.error(`App - push /videos Query error\n: ${JSON.stringify(err)}`);
            connection.release();
        }
    }catch (err) {
        logger.error(`App - push /videos connection error\n: ${JSON.stringify(err)}`);
    }
});



// video random 배열 함수
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
// video 추천 알고리즘
function getRecommendArr(maxListCount,historyData){
    let userData = [];
    for (let data in historyData){
        let watchCount = historyData[data].WatchCount;
        let watchTime = historyData[data].WatchingTime;
        let catNum = historyData[data].Category;

        let watchTimeParser = watchTime.split(':');
        let watchTimePoint = (parseInt(watchTimeParser[0])*60)+parseInt(watchTimeParser[1]);

        let innerUserData = [];
        innerUserData[0] = catNum;
        innerUserData[1] = watchCount + watchTimePoint;

        userData[data] = innerUserData;
    }
    let numList = [];
    for (let i=0; i<10;i++) {
        numList[i] = 0;
    }

    for (let i=0; i<userData.length;i++){
        numList[userData[i][0]-1] +=userData[i][1];
    }
    let resultList = [];
    for (let i=0; i<numList.length;i++){
        let innerList = [];
        innerList[0] = numList[i];
        innerList[1] = i+1;
        resultList[i] = innerList;
    }
    resultList.sort(function (a,b) {
        return b[0]-a[0];
    });

    return resultList;
}
