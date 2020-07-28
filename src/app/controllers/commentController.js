const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');
const validationFunctions = require('../../../config/validationFunctions');
const validation = new validationFunctions.validation();
const resFormat = require('../../../config/responseMessages');

const jwt = require('jsonwebtoken');
const secret_config = require('../../../config/secret');
const moment = require('moment');

//댓글
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
            const getInserCommentsIdx = await connection.query(insertCommentQuery, [userIdx, videoIdx, commentsText]);
            await connection.query(addCommentsCountQuery,videoIdx);
            await connection.commit();

            const commentsIdx = getInserCommentsIdx[0].insertId;

            let responseData = {};
            responseData = resFormat(true, 100, '댓글 작성 api 성공');
            responseData.result = {userIdx: userIdx, videoIdx: videoIdx, CommentsIdx:commentsIdx ,commentsText: commentsText};

            console.log("POST Comments api");
            connection.release();
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Post Comments Query error\n: ${JSON.stringify(err)}`);
            console.log(err);
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
exports.getComment = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    let page = parseInt(req.query.page);
    let pagingCount = 10;
    const filter = req.query.filter;

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
            if(filter === 'new'){
                page = 1;
                pagingCount = 1;
            }
            // paging 댓글 조회
            const getCommentQuery = `
            select CommentsIdx,
                   Comments.UserIdx,
                   U.UserId,
                   U.ProfileUrl,
                   CmtReplyCount,
                   VideoIdx,
                   CommentText,
                   LikesCount,
                   LikesStatus,
                   CmtReplyCount,
                   Comments.CreatedAt
            from Comments
            left outer join User U on Comments.UserIdx = U.UserIdx
            where VideoIdx = ?
              and Comments.IsDeleted = 'N'
            order by Comments.CreatedAt desc
            limit ? offset ?;
            `;
            const [CommentsArr] = await connection.query(getCommentQuery,[videoIdx,pagingCount,(page-1)*10]);

            let responseData = {};
            responseData = resFormat(true,100,'댓글 조회 api 성공');
            responseData.result = CommentsArr;

            console.log("get Comments api");
            connection.release();
            res.json(responseData);
        } catch (err) {
            logger.error(`App - Get Comments Query error\n: ${JSON.stringify(err)}`);
            console.log(err);
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

            console.log("update Comments api");
            connection.release();
            return res.json(responseData);
        } catch (err) {
            logger.error(`App - Update Comments Query error\n: ${JSON.stringify(err)}`);
            console.log(err);
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

            console.log("update Comments api");
            connection.release();
            return res.json(responseData);
        }catch (err) {
            logger.error(`App - Delete Comments Query error\n: ${JSON.stringify(err)}`);
            console.log(err);
            connection.release();
            return res.json(resFormat(false, 290, 'Delete comment query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - Delete Comments connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};

//답글
//app.route('/videos/:videoIdx/comments/:commentsIdx').post(comment.postReply);
/**
 update : 2020.07.26
 09.reply get API = 댓글의 답글 조회
 **/
exports.getReply = async function (req, res) {
    const videoIdx = parseInt(req.params.videoIdx);
    const commentsIdx = parseInt(req.params.commentsIdx);
    const page = parseInt(req.query.page);
    if (!(validation.isValidePageIndex(videoIdx) && validation.isValidePageIndex(page) && validation.isValidePageIndex(commentsIdx))) {
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

            // 댓글 인덱스 존재 유무
            const checkCommentsIdxQuery = `select exists(select CommentsIdx from Comments where CommentsIdx = ?) as exist;`;
            const [isValidCommentsIdx] = await connection.query(checkCommentsIdxQuery,commentsIdx);
            if(!isValidCommentsIdx[0].exist){
                connection.release();
                return res.json(resFormat(false,202,'존재하지 않는 댓글 인덱스 입니다.'));
            }

            // paging 댓글 조회
            const getCommentQuery = `
                select CommentsIdx,
                       CmtReplyIdx,      
                       CommentsReply.UserIdx,
                       U.UserId,
                       VideoIdx,
                       ReplyText,
                       LikesCount,
                       U.ProfileUrl,
                      CommentsReply.CreatedAt
                from CommentsReply
                         left outer join User U on U.UserIdx = CommentsReply.UserIdx
                where CommentsIdx = ?
                  and CommentsReply.IsDeleted = 'N'
                order by CommentsReply.CreatedAt desc
                limit 10 offset ?;
            `;
            const [CommentsArr] = await connection.query(getCommentQuery,[commentsIdx,(page-1)*10]);

            let responseData = {};
            responseData = resFormat(true,100,'답글 조회 api 성공');
            responseData.result = CommentsArr;

            console.log("get reply api");
            connection.release();
            res.json(responseData);
        } catch (err) {
            logger.error(`App - Get Comments Reply Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            console.log(err);
            return res.json(resFormat(false, 290, 'Get Comment Reply query 중 오류가 발생하였습니다.'));
        }
    } catch (err) {
        logger.error(`App - Comments connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.26
 10.reply post API = (jwt) 댓글의 답글 작성
 **/
exports.postReply = async function (req ,res) {
    const videoIdx = parseInt(req.params.videoIdx);
    const commentsIdx = parseInt(req.params.commentsIdx);
    const jwtoken = req.headers['x-access-token'];
    const replyText = req.body.replyText;

    if(!(validation.isValidePageIndex(videoIdx) && validation.isValidePageIndex(commentsIdx))){
        return res.json(resFormat(false,200,'파라미터 값은 1이상의 정수이어야합니다.'));
    }
    if(!jwtoken){
        return res.json(resFormat(false,201,'로그인 후 사용이 가능한 기능입니다.'));
    }
    if(!replyText){
        return res.json(resFormat(false,202,'답글의 작성하여 주세요.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // 비디오 인덱스 존재 유무
            const checkVideoIdxQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isValidIdx] = await connection.query(checkVideoIdxQuery, videoIdx);
            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '존재하지 않는 비디오 인덱스 입니다.'));
            }

            // 댓글 인덱스 존재 유무
            const checkCommentsIdxQuery = `select exists(select CommentsIdx from Comments where CommentsIdx = ?) as exist;`;
            const [isValidCommentsIdx] = await connection.query(checkCommentsIdxQuery,commentsIdx);
            if(!isValidCommentsIdx[0].exist){
                connection.release();
                return res.json(resFormat(false,204,'존재하지 않는 댓글 인덱스 입니다.'));
            }

            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser) {
                connection.release();
                return res.json(resFormat(false, 205, '유효하지않는 토큰입니다.'));
            }

            const addReplyCountQuery = `update Comments set CmtReplyCount = CmtReplyCount + 1 where CommentsIdx = ?;`;
            const postReplyQuery = `insert into CommentsReply(useridx, videoidx,CommentsIdx, ReplyText) values (?,?,?,?);`;
            await connection.beginTransaction();
            await connection.query(addReplyCountQuery,commentsIdx);
            const getReplyIdx = await connection.query(postReplyQuery,[userIdx,videoIdx,commentsIdx,replyText]);
            await connection.commit();

            const replyIdx = getReplyIdx[0].insertId;
            const getUserDataQuery = `
                                    select CommentsReply.CreatedAt,
                                           U.ProfileUrl
                                    from CommentsReply
                                    left outer join User U on CommentsReply.UserIdx = U.UserIdx
                                    where CommentsReply.UserIdx = ?
                                      and CmtReplyIdx = ?;
                                             `;
            const [getUserData] = await connection.query(getUserDataQuery,[userIdx,replyIdx]);

            let responseData = {};
            responseData = resFormat(true, 100, '답글 작성 api 성공');
            responseData.result = {
                userIdx: userIdx,
                videoIdx: videoIdx,
                commentsIdx: commentsIdx,
                replyIdx: replyIdx,
                replyText: replyText,
                ProfileUrl: getUserData[0].ProfileUrl,
                CreateAt : getUserData[0].CreatedAt
            };

            console.log("post reply api");
            connection.release();
            return res.json(responseData);
        }catch(err){
            logger.error(`App - Post Reply Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            console.log(err);
            return res.json(resFormat(false, 290, 'Post Reply query 중 오류가 발생하였습니다.'));
        }
    }catch(err) {
        logger.error(`App - Post Reply connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.26
 11.reply update API = 댓글의 답글 수정
 **/
exports.updateReply = async function (req, res) {
    const videoIdx = parseInt(req.params.videoIdx);
    const commentsIdx = parseInt(req.params.commentsIdx);
    const jwtoken = req.headers['x-access-token'];
    const replyIdx = req.body.replyIdx;
    const replyText = req.body.replyText;

    if (!(validation.isValidePageIndex(videoIdx) && validation.isValidePageIndex(commentsIdx))) {
        return res.json(resFormat(false, 200, '파라미터 값은 1이상의 정수이어야합니다.'));
    }
    if(!jwtoken){
        return res.json(resFormat(false,201,'로그인 후 사용이 가능한 기능입니다.'));
    }
    if(!replyText){
        return res.json(resFormat(false,202,'답글의 작성하여 주세요.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // 비디오 인덱스 존재 유무
            const checkVideoIdxQuery = `select exists(select VideoIdx from Videos where VideoIdx = ?) as exist;`;
            const [isValidIdx] = await connection.query(checkVideoIdxQuery, videoIdx);
            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '존재하지 않는 비디오 인덱스 입니다.'));
            }

            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser) {
                connection.release();
                return res.json(resFormat(false, 205, '유효하지않는 토큰입니다.'));
            }

            // 답글 인덱스 존재 유무
            const checkReplyIdxQuery = `select exists(select CmtReplyIdx from CommentsReply where CmtReplyIdx = ? and CommentsIdx = ? and UserIdx = ?) as exist;`;
            const [isValidCommentsIdx] = await connection.query(checkReplyIdxQuery,[replyIdx,commentsIdx,userIdx]);
            if(!isValidCommentsIdx[0].exist){
                connection.release();
                return res.json(resFormat(false,204,'존재하지 않는 글 인덱스 입니다.'));
            }

            const updateReplyQuery = `update CommentsReply set ReplyText = ? where UserIdx = ? and CommentsIdx = ? and CmtReplyIdx =?;`;
            await connection.beginTransaction();
            await connection.query(updateReplyQuery,[replyText,userIdx,commentsIdx,replyIdx]);
            await connection.commit();

            let responseData = {};
            responseData = resFormat(true, 100, '답글 수정 api 성공');
            responseData.result = {userIdx: userIdx, commentsIdx: commentsIdx, videoIdx:videoIdx,replyIdx: replyIdx,replyText: replyText};

            console.log("update reply api");
            connection.release();
            return res.json(responseData);
        }catch(err){
            logger.error(`App - Update Reply Query error\n: ${JSON.stringify(err)}`);
            console.log(err);
            connection.release();
            return res.json(resFormat(false, 290, 'Update Reply query 중 오류가 발생하였습니다.'));
        }
    }catch(err) {
        logger.error(`App - Update Reply connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.26
 12.reply delete API = 댓글의 답글 삭제
 **/
exports.deleteReply = async function (req, res) {
    const videoIdx = req.params.videoIdx;
    const commentsIdx = parseInt(req.params.commentsIdx);
    const jwtoken = req.headers['x-access-token'];
    const replyIdx = req.body.replyIdx;
    if (!(validation.isValidePageIndex(videoIdx)&& validation.isValidePageIndex(replyIdx)&& validation.isValidePageIndex(commentsIdx))) {
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
            const checkValidCommentsQuery = `select exists(select CmtReplyIdx from CommentsReply where CmtReplyIdx = ? and UserIdx = ?  and CommentsIdx = ? and isDeleted = 'N') as exist;`;
            const [isValidIdx] = await connection.query(checkValidCommentsQuery, [replyIdx,userIdx,commentsIdx]);
            if (!isValidIdx[0].exist) {
                connection.release();
                return res.json(resFormat(alse, 202, '답글 삭제가 거부되었습니다.'));
            }

            // 댓글 delete 처리
            const insertCommentQuery = `update CommentsReply set IsDeleted = 'Y' where CmtReplyIdx=? and CommentsIdx = ? and UserIdx = ?;`;
            const subCommentsCountQuery = `update Comments set CmtReplyCount = CmtReplyCount -1 where CommentsIdx = ?;`;
            await connection.beginTransaction();
            await connection.query(insertCommentQuery, [replyIdx,commentsIdx,userIdx]);
            await connection.query(subCommentsCountQuery,commentsIdx);
            await connection.commit();

            let responseData = {};
            responseData = resFormat(true, 100, '답글 삭제 api 성공');
            responseData.result = {userIdx: userIdx, commentsIdx: commentsIdx, replyIdx:replyIdx ,IsDeleted: 'Y'};

            console.log("delete reply api");
            connection.release();
            return res.json(responseData);
        }catch (err) {
            logger.error(`App - Delete Reply Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            console.log(err);
            return res.json(resFormat(false, 290, 'Delete Reply query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - Delete Reply connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};













