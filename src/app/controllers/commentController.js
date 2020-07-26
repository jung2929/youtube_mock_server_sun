const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');
const validationFunctions = require('../../../config/validationFunctions');
const validation = new validationFunctions.validation();
const resFormat = require('../../../config/responseMessages');

const jwt = require('jsonwebtoken');
const secret_config = require('../../../config/secret');
const moment = require('moment');

/**
 update : 2020.07.24
 06.comment post api = (jwt) 댓글 작성
 **/
exports.postComment = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    const jwtoken = req.headers['x-access-token'];
    const commentsText = req.body.commentsText;
    //유효한 인덱스인지확
    if (!validation.isValidePageIndex(videoIdx)) {
        return res.json(resFormat(false, 200, '파라미터 값은 1이상의 정수이어야합니다.'));
    }
    if (!commentsText) {
        return res.json(resFormat(false, 201, '댓글을 작성하여 주세요.'));
    }
    if(!jwtoken){
        return res.json(resFormat(false, 204, '로그인후 사용가능한 기능입니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            // 비디오 인덱스 존재 유무
            const checkVideoIdxQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isValidIdx] = await connection.query(checkVideoIdxQuery, videoIdx);

            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(false, 202, '존재하지 않는 비디오 인덱스 입니다.'));
            }
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser) {
                connection.release();
                return res.json(resFormat(false, 203, '유효하지않는 토큰입니다.'));
            }
            // 댓글 insert && 비디오의 댓글 count 증
            const insertCommentQuery = `insert into Comments(UserIdx, VideoIdx, commentText) values(?,?,?);`;
            const addCommentsCountQuery = `update Videos set CommentsCount = CommentsCount +1 where VideoIdx = ?;`;

            await connection.beginTransaction();
            await connection.query(insertCommentQuery, [userIdx, videoIdx, commentsText]);
            await connection.query(addCommentsCountQuery,videoIdx);
            await connection.commit();

            let responseData = {};
            responseData = resFormat(true, 100, '댓글 작성 api 성공');
            responseData.result = {userIdx: userIdx, videoIdx: videoIdx, commentsText: commentsText};
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Post Comments Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'Post comment query 중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Post Comments connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.24
 05.comment get API = 댓글 10개 씩 page 조회
 **/
exports.commentList = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    const page = parseInt(req.query.page);
    if (!(validation.isValidePageIndex(videoIdx) && validation.isValidePageIndex(page))) {
        return res.json(resFormat(false, 200, '파라미터 값은 1이상의 정수이어야합니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            // 비디오 인덱스 존재 유무
            const checkVideoIdxQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isValidIdx] = await connection.query(checkVideoIdxQuery, videoIdx);

            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(false, 201, '존재하지 않는 비디오 인덱스 입니다.'));
            }
            // paging 댓글 조회
            const getCommentQuery = `
            select CommentsIdx, UserIdx, VideoIdx, commentText, LikesCount, LikesStatus, CmtReplyCount
                    from Comments
                    where VideoIdx = ? and IsDeleted = 'N'
                    order by CreatedAt desc
                    limit 10 offset ?;
            `;
            const [CommentsArr] = await connection.query(getCommentQuery,[videoIdx,(page-1)*10]);

            let responseData = {};
            responseData = resFormat(true,100,'댓글 조회 api 성공');
            responseData.result = CommentsArr;

            res.json(responseData);
        } catch (err) {
            logger.error(`App - Get Comments Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'Get comment query 중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Comments connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.25
 07.comment update API = (jwt) 댓글 수정
 **/
exports.updateComment = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    const jwtoken = req.headers['x-access-token'];
    const commentsIdx = req.body.commentsIdx;
    const commentsText = req.body.commentsText;
    //유효한 인덱스인지확
    if (!(validation.isValidePageIndex(videoIdx)&& validation.isValidePageIndex(commentsIdx))) {
        return res.json(resFormat(false, 200, '파라미터 값은 1이상의 정수이어야합니다.'));
    }
    if (!commentsText) {
        return res.json(resFormat(false, 201, '수정할 댓글을 작성하여 주세요.'));
    }
    if (!jwtoken){
        return res.json(resFormat(false, 204, '로그인후 사용가능한 기능입니다.'));
    }
    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            // 유효한 토큰 검사환
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser) {
                connection.release();
                return res.json(resFormat(false, 203, '유효하지않는 토큰입니다.'));
            }

            // 올바른 댓글의 수정요청 검증
            const checkValidCommentsQuery = `select exists(select CommentsIdx from Comments where CommentsIdx = ? and UserIdx = ?  and VideoIdx = ?) as exist;`;
            const [isValidIdx] = await connection.query(checkValidCommentsQuery, [commentsIdx,userIdx,videoIdx]);
            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(false, 202, '(permission denide)댓글 수정이 거부되었습니다.'));
            }

            // 댓글 update
            const insertCommentQuery = `update Comments set CommentText = ? where CommentsIdx = ? and UserIdx = ? and VideoIdx = ? and IsDeleted = 'N';`;
            await connection.beginTransaction();
            await connection.query(insertCommentQuery, [commentsText,commentsIdx,userIdx,videoIdx]);
            await connection.commit();

            let responseData = {};
            responseData = resFormat(true, 100, '댓글 수정 api 성공');
            responseData.result = {userIdx: userIdx, videoIdx: videoIdx, commentsIdx:commentsIdx ,commentsText: commentsText};
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Update Comments Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'Update comment query 중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Update Comments connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.25
 08.comment delete API = (jwt) 댓글 삭제
 **/
exports.daleteComment = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    const jwtoken = req.headers['x-access-token'];
    const commentsIdx = req.body.commentsIdx;
    if (!(validation.isValidePageIndex(videoIdx)&& validation.isValidePageIndex(commentsIdx))) {
        return res.json(resFormat(false, 200, '파라미터 값은 1이상의 정수이어야합니다.'));
    }
    if (!jwtoken){
        return res.json(resFormat(false, 204, '로그인후 사용가능한 기능입니다.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // 유효한 토큰 검사환
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser) {
                connection.release();
                return res.json(resFormat(false, 203, '유효하지않는 토큰입니다.'));
            }
            // 올바른 댓글의 삭제 요청 검증
            const checkValidCommentsQuery = `select exists(select CommentsIdx from Comments where CommentsIdx = ? and UserIdx = ?  and VideoIdx = ? and isDeleted = 'N') as exist;`;
            const [isValidIdx] = await connection.query(checkValidCommentsQuery, [commentsIdx,userIdx,videoIdx]);
            //todo
            // update 형식으로 변형
            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(false, 202, '댓글 삭제가 거부되었습니다.'));
            }

            // 댓글 delete 처리
            const insertCommentQuery = `update Comments set IsDeleted = 'Y' where CommentsIdx = ? and UserIdx = ? and VideoIdx = ?;`;
            const subCommentsCountQuery = `update Videos set CommentsCount = CommentsCount -1 where VideoIdx = ?;`;
            await connection.beginTransaction();
            await connection.query(insertCommentQuery, [commentsIdx,userIdx,videoIdx]);
            await connection.query(subCommentsCountQuery,videoIdx);
            await connection.commit();

            let responseData = {};
            responseData = resFormat(true, 100, '댓글 삭제 api 성공');
            responseData.result = {userIdx: userIdx, videoIdx: videoIdx, commentsIdx:commentsIdx ,IsDeleted: 'Y'};
            return res.json(responseData);
        }catch (err) {
            logger.error(`App - Delete Comments Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, 'Delete comment query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - Delete Comments connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
