const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');

const jwt = require('jsonwebtoken');
const regexEmail = require('regex-email');
const crypto = require('crypto');
const secret_config = require('../../../config/secret');


exports.list = async function (req,res) {
    try{
        let responseData = {};
        const videoListQuery = `
                select VideoIdx, UserId, TitleText, Views, LikesCount, DislikesCount, MainText, ViedoUrl, ThumUrl, Category, PlayListName
                from Videos;
                `;

        const connection = await pool.getConnection(async conn => conn);

        const [videoRows] = await connection.query(videoListQuery)

        responseData.isSuccess = 'true';
        responseData.code = '100';
        responseData.message = 'video list api 성공';

        responseData.result = videoRows

        res.json(responseData)
    }
    catch (err) {
            logger.error(`App - SignIn Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return false;
    }
}