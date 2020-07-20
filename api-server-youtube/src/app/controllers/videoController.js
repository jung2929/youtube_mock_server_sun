const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');

const jwt = require('jsonwebtoken');
const regexEmail = require('regex-email');
const crypto = require('crypto');
const secret_config = require('../../../config/secret');

let listOrderNumber = [];
let communityArr = [];

exports.list = async function (req, res) {
    try {
        //parameter 예외처리
        const page = Number(req.query.page);
        if (!Number.isInteger(Number(page)) || page === 0) {
            return res.json({isSuccess: false, code: 200, message: "parameter값은 0이상의 정수이여야 합니다."});
        }

        const connection = await pool.getConnection(async conn => conn);

        //최대 video 갯수 쿼라
        const countVideoQuery = `select count(VideoIdx) as VideoCount from Videos ;`
        const [videoCount] = await connection.query(countVideoQuery);
        const maxListCount = videoCount[0].VideoCount;


        const resultArr = {};
        // 모든 리스트 랜덤배열로 초기화
        if (page === 1) {
            listOrderNumber = [];

            for (let i = 0; i < maxListCount; i++) {
                listOrderNumber[i] = i + 1
            }
            for (let i = 0; i < listOrderNumber.length; i++) {
                rnum = Math.floor(Math.random() * maxListCount); //난수발생
                temp = listOrderNumber[i];
                listOrderNumber[i] = listOrderNumber[rnum];
                listOrderNumber[rnum] = temp;
            }

            //story videos random sort
            let storyVideoRandomList = [];
            const storyVideoCount = 5;

            for (let i = 0; i < storyVideoCount; i++) {
                storyVideoRandomList[i] = i + 1
            }
            for (let i = 0; i < storyVideoCount; i++) {
                rnum = Math.floor(Math.random() * storyVideoCount); //난수발생
                temp = storyVideoRandomList[i];
                storyVideoRandomList[i] = storyVideoRandomList[rnum];
                storyVideoRandomList[rnum] = temp;
            }
            //storyVideoRandomList communityArr 재사용
            communityArr = storyVideoRandomList;


            const storyVideoQuery = ` select StoryVideoIdx, UserId, ThumUrl, ProfileUrl
                                        from StoryVideo
                                        order by field(StoryVideoIdx,?);
                                     `;

            const [storyVideoRows] = await connection.query(storyVideoQuery, [storyVideoRandomList]);
            resultArr.storyVideo = storyVideoRows
        }


        let responseData = {};
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
                       ThumUrl,
                       U.ProfileUrl
                
                from Videos
                         left outer join User U on Videos.UserId = U.UserId
                order by field(VideoIdx, ?)
                limit 10 offset ?;
                `;

        const [videoRows] = await connection.query(videoListQuery, [listOrderNumber, 10 * (page - 1)]);
        resultArr.video = videoRows;

        const communitySelectQuery = `select CommunityIdx,
                                               UserId,
                                               MainText,
                                               LikesCount,
                                               DislikesCount,
                                               ImgUrl,
                                               ProfileUrl,
                                               CommentCount,
                                               case when TIMESTAMPDIFF(SECOND , CreatedAt, CURRENT_TIMESTAMP) < 60
                                                   then concat(TIMESTAMPDIFF(SECOND , CreatedAt, CURRENT_TIMESTAMP),'초 전')
                                                   else case when TIMESTAMPDIFF(minute , CreatedAt, CURRENT_TIMESTAMP) < 60
                                                       then concat(TIMESTAMPDIFF(minute , CreatedAt, CURRENT_TIMESTAMP),'분 전')
                                                       else case when TIMESTAMPDIFF(HOUR , CreatedAt, CURRENT_TIMESTAMP) < 24
                                                           then concat(TIMESTAMPDIFF(HOUR , CreatedAt, CURRENT_TIMESTAMP),'시간 전')
                                                            else case when TIMESTAMPDIFF(day , CreatedAt, CURRENT_TIMESTAMP) < 30
                                                                then concat(TIMESTAMPDIFF(day , CreatedAt, CURRENT_TIMESTAMP),'일 전')
                                                                end
                                                           end
                                                       end
                                                   end as CreateAt
                                        from UserCommunity
                                        where CommunityIdx = ?;`;

        const [communityRows] = await connection.query(communitySelectQuery,Number(communityArr[page % 5]));
        resultArr.community = communityRows;

        responseData.isSuccess = 'true';
        responseData.code = '100';
        responseData.message = 'video list api 성공';
        responseData.result = resultArr;

        console.log("/videos (get)");

        connection.release();

        return res.json(responseData);
    } catch (err) {
        logger.error(`App - SignIn Query error\n: ${JSON.stringify(err)}`);
        connection.release();
        // TODO 여기서 response 를 클라이언트에게 보내줘야함
        return false;
    }
};

exports.watch = async function (req, res) {
    let responseData = {};
    //const connection = await pool.getConnection(async conn => conn);
    res.json({test:"test"});

}