const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');

const jwt = require('jsonwebtoken');
const regexEmail = require('regex-email');
const crypto = require('crypto');
const secret_config = require('../../../config/secret');

let listOrderNumber = [];
exports.list = async function (req, res) {
    try {
        const connection = await pool.getConnection(async conn => conn);
        const page = Number(req.query.page);
        if (!Number.isInteger(Number(page))) {
            connection.release();
            return res.json({isSuccess: false, code: 200, message: "parameter값은 정수이여야 합니다."});
        }

        const countVideoQuery = `select count(VideoIdx) as VideoCount from Videos ;`
        const [videoCount] = await connection.query(countVideoQuery);

        const maxListCount = videoCount[0].VideoCount;

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
        }

        console.log(listOrderNumber);
        let responseData = {};
        const videoListQuery = `
                select VideoIdx,
                       UserId,
                       TitleText,
                       case when Views > 1000
                            then concat(TRUNCATE(Views/1000,1),' 회')
                            else concat(Views,' 회')
                           end as Views,
                       case when TIMESTAMPDIFF(SECOND , CreatedAt, CURRENT_TIMESTAMP) < 60
                           then concat(TIMESTAMPDIFF(SECOND , CreatedAt, CURRENT_TIMESTAMP),'초 전')
                           else case when TIMESTAMPDIFF(minute , CreatedAt, CURRENT_TIMESTAMP) < 60
                               then concat(TIMESTAMPDIFF(SECOND , CreatedAt, CURRENT_TIMESTAMP),'분 전')
                               else case when TIMESTAMPDIFF(HOUR , CreatedAt, CURRENT_TIMESTAMP) < 24
                                   then concat(TIMESTAMPDIFF(HOUR , CreatedAt, CURRENT_TIMESTAMP),'시간 전')
                                    else case when TIMESTAMPDIFF(day , CreatedAt, CURRENT_TIMESTAMP) < 30
                                        then concat(TIMESTAMPDIFF(day , CreatedAt, CURRENT_TIMESTAMP),'일 전')
                                        end
                                   end
                               end
                           end as CreateAt,
                       ThumUrl
                
                from Videos
                order by field(VideoIdx,?)
                limit 10 offset ?;
                `;

        const [videoRows] = await connection.query(videoListQuery, [listOrderNumber, 10 * (page - 1)]);

        responseData.isSuccess = 'true';
        responseData.code = '100';
        responseData.message = 'video list api 성공';

        responseData.result = videoRows;

        connection.release();
        res.json(responseData)
    } catch (err) {
        logger.error(`App - SignIn Query error\n: ${JSON.stringify(err)}`);
        connection.release();
        return false;
    }
};