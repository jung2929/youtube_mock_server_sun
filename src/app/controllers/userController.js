const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');
const validationFunctions = require('../../../config/validationFunctions');
const validation = new validationFunctions.validation();

const jwt = require('jsonwebtoken');
const regexEmail = require('regex-email');
const crypto = require('crypto');
const secret_config = require('../../../config/secret');
const request = require('request');
const resFormat = require('../../../config/responseMessages');

var admin = require('firebase-admin');
var serviceAccount = require("../../../config/serviceAccountKey.json");
//var serviceAccount = require("path/to/serviceAccountKey.json");


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://clone-e7f75.firebaseio.com"
});

//PATCH	/user/subscribe	채널 구독 갱신
/**
 update : 2020.07.26
 16.subscribe API = 구독 상태 갱신
 **/
exports.updateSubscribe = async function (req, res){
    const channelUserIdx = parseInt(req.body.channelUserIdx);
    const jwtoken = req.headers['x-access-token'];

    if (!validation.isValidePageIndex(channelUserIdx)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    if (!jwtoken){
        return res.json(resFormat(false, 201, '로그인후 사용가능한 기능입니다.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try {
            // db에 유저 인덱스 존재 판별
            const userExistQuery = `select exists(select UserIdx from User where UserIdx = ?) as exist;`;
            const [isExists] = await connection.query(userExistQuery, channelUserIdx);
            if (!isExists[0].exist) {
                connection.release();
                return res.json(resFormat(false, 202, '존재하지 않는 유저 인덱스 입니다.'))
            }
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '유효하지않는 토큰입니다.'));
            }

            //구독 테이블에 정보 조회
            const checkExistSubscribeHistory = `select exists(select SubscribeIdx from UserSubscribes where UserIdx = ? and ChannelUserIdx = ? ) as exist;`;
            const [isExistInHistory] = await connection.query(checkExistSubscribeHistory, [userIdx, channelUserIdx]);
            // 구독 이력에 없다면 구독이력 추가
            // 구독 이력에 있다면 isDeleted 를 'Y','N' 토글
            await connection.beginTransaction();
            if (!isExistInHistory[0].exist){
                const insertSubscribeQuery = `insert into UserSubscribes( UserIdx, ChannelUserIdx) values (?,?);`;
                await connection.query(insertSubscribeQuery,[userIdx,channelUserIdx]);
            }
            else{
                const updateSubscribeToggleQuery = `update UserSubscribes set IsDeleted = (if(IsDeleted='N','Y','N')) where UserIdx=? and ChannelUserIdx=?;`;
                await connection.query(updateSubscribeToggleQuery,[userIdx,channelUserIdx]);
            }
            await connection.commit();

            //현재 구독 상태 반환
            const getSubscribeStatus = `select IsDeleted from UserSubscribes where UserIdx = ? and ChannelUserIdx=?;`;
            const [subscribeStatusRows] = await connection.query(getSubscribeStatus,[userIdx,channelUserIdx]);
            let subscribeStatus = subscribeStatusRows[0].IsDeleted === 'N';

            let responseData = resFormat(true,100, '구독 갱신 완료');
            responseData.result = {userIdx:userIdx,channelUserIdx:channelUserIdx,SubscribeStatus:subscribeStatus};

            connection.release();
            console.log("post - user/subscribe ")
            return res.json(responseData);
        } catch(err){
            logger.error(`App - user/subscribe Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, '구독 업데이트 query 중 오류가 발생하였습니다.'));
        }
    }catch (err) {
        logger.error(`App - user/subscribe connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.26
 17.video relate with subscribe API = 구독한 유저의 데이터 조회
 **/
exports.getSubscribeData = async function (req, res){
    const dataType = req.query.type;
    const DEF_SUBSCRIBE_DATA_TYPE_LIST = ["videos","continue","firstWatch","community"];
    const jwtoken = req.headers['x-access-token'];
    const page = req.query.page;

    if (!validation.isValidePageIndex(page)) {
        return res.json(resFormat(false, 200, 'parameter 값은 1이상의 정수 값이어야 합니다.'));
    }
    //유효한 필터링 검증
    if(!(DEF_SUBSCRIBE_DATA_TYPE_LIST.includes(dataType))){
        return res.json(resFormat(false,201,'지원하지 않는 필터링입니다.'));
    }
    if(!jwtoken){
        return res.json(resFormat(false, 202, '로그인후 사용가능한 기능입니다.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 203, '유효하지않는 토큰입니다.'));
            }

            let responseData = {};
            // 필터링
            switch (dataType) {
                case DEF_SUBSCRIBE_DATA_TYPE_LIST[0]://videos
                    const getSubscribeChannelVideoQuery = `select ChannelUserIdx,
                                                                   U.UserId,
                                                                   V.VideoIdx,
                                                                   V.TitleText,
                                                                   V.Views,
                                                                   V.CreatedAt,
                                                                   V.ThumUrl,
                                                                   U.ProfileUrl
                                                            from UserSubscribes
                                                                     left outer join User U on UserSubscribes.ChannelUserIdx = U.UserIdx
                                                                     left outer join Videos V on U.UserId = V.UserId
                                                            where UserSubscribes.UserIdx = ?
                                                            order by V.CreatedAt desc
                                                            limit 10 offset ?;
                                                            `;
                    const [subscribeChannelVideos] = await connection.query(getSubscribeChannelVideoQuery,[userIdx,parseInt((page-1)*10)]);
                    responseData.result = subscribeChannelVideos;
                    apiSuccessMessage = "구독 영상 조회 성공";
                    break;
                case DEF_SUBSCRIBE_DATA_TYPE_LIST[1]://continue
                    const getSubscribeChannelVideoContinueQuery = `
                                                                    select ChannelUserIdx,
                                                                           U.UserId,
                                                                           V.VideoIdx,
                                                                           V.TitleText,
                                                                           V.Views,
                                                                           V.CreatedAt,
                                                                           V.ThumUrl,
                                                                           U.ProfileUrl,
                                                                           UW.WatchingTime
                                                                    from UserSubscribes
                                                                             left outer join User U on UserSubscribes.ChannelUserIdx = U.UserIdx
                                                                             left outer join Videos V on U.UserId = V.UserId
                                                                             left outer join UserWatchHistory UW on UW.VideoIdx = V.VideoIdx
                                                                    where UserSubscribes.UserIdx = ? and UW.WatchingTime != '00:00'
                                                                    order by V.CreatedAt desc
                                                                    limit 10 offset ?;
                                                                    `;
                    const [getSubscribeChannelVideoContinue] = await connection.query(getSubscribeChannelVideoContinueQuery,[userIdx,parseInt((page-1)*10)]);
                    responseData = resFormat(true,100,"이어서 보기 영상 조회 성공");
                    responseData.result = getSubscribeChannelVideoContinue;
                    break;
                case DEF_SUBSCRIBE_DATA_TYPE_LIST[2]://firstWatch
                    const getSubscribeChannelVideoFirstWatchQuery = `
                                                                    select ChannelUserIdx,
                                                                           U.UserId,
                                                                           V.VideoIdx,
                                                                           V.TitleText,
                                                                           V.Views,
                                                                           V.CreatedAt,
                                                                           V.ThumUrl,
                                                                           U.ProfileUrl,
                                                                           UW.WatchingTime
                                                                    from UserSubscribes
                                                                             left outer join User U on UserSubscribes.ChannelUserIdx = U.UserIdx
                                                                             left outer join Videos V on U.UserId = V.UserId
                                                                             left outer join UserWatchHistory UW on UW.VideoIdx = V.VideoIdx
                                                                    where UserSubscribes.UserIdx = ? and UW.WatchingTime = '00:00'
                                                                    order by V.CreatedAt desc
                                                                    limit 10 offset ?;
                                                                    `;
                    const [getSubscribeChannelVideoFirstWatch] = await connection.query(getSubscribeChannelVideoFirstWatchQuery,[userIdx,parseInt((page-1)*10)]);
                    responseData = resFormat(true,100,"시청하지 않은 영상 조회 성공");
                    responseData.result = getSubscribeChannelVideoFirstWatch;
                    break;
                case DEF_SUBSCRIBE_DATA_TYPE_LIST[3]:
                    const getSubscribeCommunityQuery = `
                    select CommunityIdx,
                           U.UserIdx,
                           UserCommunity.UserId,
                           MainText,
                           LikesCount,
                           DislikesCount,
                           ImgUrl,
                           U.ProfileUrl,
                           CommentCount,
                           UserCommunity.CreatedAt
                    from UserCommunity
                             left outer join User U on UserCommunity.UserId = U.UserId
                             left outer join UserSubscribes US on US.ChannelUserIdx = U.UserIdx
                    where US.UserIdx = ?;
                    `;
                    const [getSubscribeCommunity] = await connection.query(getSubscribeCommunityQuery,userIdx);
                    responseData = resFormat(true,100,"구독유저 커뮤니티 글 조회 성공");
                    responseData.result = getSubscribeCommunity;
                    break;
            }
            connection.release();


            return res.json(responseData);
        }catch (err){
            logger.error(`App -  get users/subscribe Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, '구독 정보 조 query 중 오류가 발생하였습니다.'));
        }
    }catch(err){
        logger.error(`App - get users/subscribe connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
};
/**
 update : 2020.07.28
 18.video relate with subscribe API = 구독한 유저의 프로필 조회
 **/
exports.getSubscribeProfile = async function (req, res){
    const jwtoken = req.headers['x-access-token'];

    if(!jwtoken){
        return res.json(resFormat(false, 201, '로그인후 사용가능한 기능입니다.'));
    }
    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // 유효한 토큰 검사
            let jwtDecode = jwt.verify(jwtoken, secret_config.jwtsecret);
            const userIdx = jwtDecode.userIdx;
            const userId = jwtDecode.userId;
            const checkTokenValideQuery = `select exists(select UserIdx from User where UserIdx = ? and UserId = ?) as exist;`;
            const [isValidUser] = await connection.query(checkTokenValideQuery, [userIdx, userId]);
            if (!isValidUser[0].exist) {
                connection.release();
                return res.json(resFormat(false, 202, '유효하지않는 토큰입니다.'));
            }
            // 유저 프로필 조회
            const getSubscribeUserProfileQuery = `
                                                    select ChannelUserIdx,
                                                           U.UserId,
                                                           U.ProfileUrl
                                                    from UserSubscribes
                                                             left outer join User U on U.UserIdx = UserSubscribes.ChannelUserIdx
                                                    where UserSubscribes.UserIdx = ?;
                                                    `;
            const [getSubscribeUserProfile] = await connection.query(getSubscribeUserProfileQuery,userIdx);

            let responseData = resFormat(true,100,'구독 유저 프로필 조회 성공');
            responseData.result = getSubscribeUserProfile

            connection.release();
            return  res.json(responseData);

        }catch (err){
            logger.error(`App -  get users/subscribe Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return res.json(resFormat(false, 290, '구독 정보 조회 query 중 오류가 발생하였습니다.'));
        }
    }catch(err){
        logger.error(`App - get users/subscribe connection error\n: ${JSON.stringify(err)}`);
        return res.json(resFormat(false, 299, 'DB connection error'));
    }
}


/**
 update : 2020.07.27
 21.login with firebase IdToken = 아이디 토큰으로 유저 가입또는 로그
 **/
exports.login = async function (req, res){
    //id token이 넘어 왔으며 디비에 존재하면 로그인
    // id token이 디비에 존재하지 않으면 자동 회원가입후 토큰발인
    const idToken = req.headers['id-token'];
    const googleId = req.body.googleId;
    let userId = req.body.userId;
    let userIdx = '';
    if(!idToken){
        return  res.json(resFormat(false,200,'id token 이 필요합니다.'));
    }
    if(!googleId || !userId){
        return  res.json(resFormat(false,201,'body data 가 필요합니다.'));
    }
    if (!regexEmail.test(googleId)) {
        return res.json({isSuccess: false, code: 301, message: "이메일을 형식을 정확하게 입력해주세요."});
    }

    try{
        const connection = await pool.getConnection(async conn => conn);
        try{
            // id token 확인
            const isExistIdTokenQuery =`select exists(select IdToken from User where IdToken= ? ) as exist;`;
            const [isExistIdToken] = await connection.query(isExistIdTokenQuery,idToken);

            let apiSuccessMessage = '';
            //디비에 존재하지 않는다면 회원가입( 디비에 등록)
            if (!isExistIdToken[0].exist) {
                const isExistUserDataQuery = `select exists(select UserIdx from User where UserId= ? and GoogleId =? ) as exist;`;
                const [isExistUserData] = await connection.query(isExistUserDataQuery,[userId,googleId]);
                if(isExistUserData[0].exist){
                   connection.release();
                   return res.json(resFormat(false,202,'존재하는 아이디입니다. ID 토큰을 확인하여주세요.'));
                }

                const insertUserQuery = `insert into User(UserId, IdToken, GoogleId) values (?,?,?);`;
                await connection.beginTransaction();
                const insertUser = await connection.query(insertUserQuery,[userId,idToken,googleId]);
                await connection.commit();
                userIdx = insertUser[0].insertId;
                apiSuccessMessage = '회원가입 성공';
            }//디비에 존재한다면
            else{
                const getUserDataQuery = `select UserIdx,UserId from User where IdToken = ?;`;
                const [getUserData] = await connection.query(getUserDataQuery,idToken);
                userIdx = getUserData[0].UserIdx;
                userId = getUserData[0].UserId;
                apiSuccessMessage = '로그인 성공';
            }
            let token = await jwt.sign({
                    userIdx: userIdx,
                    userId: userId,
                }, // 토큰의 내용(payload)
                secret_config.jwtsecret, // 비밀 키
                {
                    expiresIn: '365d',
                    subject: 'userInfo',
                } // 유효 시간은 365일
            );
            let responseData = {};
            responseData = resFormat(true,100,apiSuccessMessage);
            responseData.result = {userIdx:userIdx,userId:userId,token:token};

            connection.release();
            res.json(responseData);
        }catch(err){
            connection.release();
            logger.error(`App - /user login/signUp Query error\n: ${JSON.stringify(err)}`);
            return res.json(statusFormat(false,290,'login api Query error'));
        }
    }catch (err) {
        logger.error(`App - /user login/signUp connection error\n: ${JSON.stringify(err)}`);
        return res.json(statusFormat(false,299,'login api connection error'));
    }
}
/**
 update : 2020.07.27
 xx.check token
 **/
exports.check = async function (req, res) {
    res.json({
        isSuccess: true,
        code: 200,
        message: "검증 성공",
        info: req.verifiedToken
    })
};



/**
 update : 2019.11.01
 01.signUp API = 회원가입
 */
// exports.signUp = async function (req, res) {
//     const {
//         email, password, nickname
//     } = req.body;
//
//     if (!email) return res.json({isSuccess: false, code: 301, message: "이메일을 입력해주세요."});
//     if (email.length > 30) return res.json({
//         isSuccess: false,
//         code: 302,
//         message: "이메일은 30자리 미만으로 입력해주세요."
//     });
//
//     if (!regexEmail.test(email)) return res.json({isSuccess: false, code: 303, message: "이메일을 형식을 정확하게 입력해주세요."});
//
//     if (!password) return res.json({isSuccess: false, code: 304, message: "비밀번호를 입력 해주세요."});
//     if (password.length < 6 || password.length > 20) return res.json({
//         isSuccess: false,
//         code: 305,
//         message: "비밀번호는 6~20자리를 입력해주세요."
//     });
//
//     if (!nickname) return res.json({isSuccess: false, code: 306, message: "닉네임을 입력 해주세요."});
//     if (nickname.length > 20) return res.json({
//         isSuccess: false,
//         code: 307,
//         message: "닉네임은 최대 20자리를 입력해주세요."
//     });
//
//     try {
//         const connection = await pool.getConnection(async conn => conn);
//         try {
//             // 이메일 중복 확인
//             const selectEmailQuery = `
//                 SELECT email, nickname
//                 FROM UserInfo
//                 WHERE email = ?;
//                 `;
//             const selectEmailParams = [email];
//             const [emailRows] = await connection.query(selectEmailQuery, selectEmailParams);
//
//             if (emailRows.length > 0) {
//                 connection.release();
//                 return res.json({
//                     isSuccess: false,
//                     code: 308,
//                     message: "중복된 이메일입니다."
//                 });
//             }
//
//             // 닉네임 중복 확인
//             const selectNicknameQuery = `
//                 SELECT email, nickname
//                 FROM UserInfo
//                 WHERE nickname = ?;
//                 `;
//             const selectNicknameParams = [nickname];
//             const [nicknameRows] = await connection.query(selectNicknameQuery, selectNicknameParams);
//
//             if (nicknameRows.length > 0) {
//                 connection.release();
//                 return res.json({
//                     isSuccess: false,
//                     code: 309,
//                     message: "중복된 닉네임입니다."
//                 });
//             }
//
//             await connection.beginTransaction(); // START TRANSACTION
//             const hashedPassword = await crypto.createHash('sha512').update(password).digest('hex');
//
//             const insertUserInfoQuery = `
//                 INSERT INTO UserInfo(email, pswd, nickname)
//                 VALUES (?, ?, ?);
//                     `;
//             const insertUserInfoParams = [email, hashedPassword, nickname];
//             await connection.query(insertUserInfoQuery, insertUserInfoParams);
//
//             await connection.commit(); // COMMIT
//             connection.c();
//             return res.json({
//                 isSuccess: true,
//                 code: 200,
//                 message: "회원가입 성공"
//             });
//         } catch (err) {
//             await connection.rollback(); // ROLLBACK
//             connection.release();
//             logger.error(`App - SignUp Query error\n: ${err.message}`);
//             return res.status(500).send(`Error: ${err.message}`);
//         }
//     } catch (err) {
//         logger.error(`App - SignUp DB Connection error\n: ${err.message}`);
//         return res.status(500).send(`Error: ${err.message}`);
//     }
// };

/**
 update : 2020.07.23
 02.signIn API = fire base 로그인
 **/
// exports.signUp = async function( req, res ){
//     // console.log('/app/signup (post)');
//     // const accessToken = req.headers['x-access-token'];
//     // const url = 'https://www.googleapis.com/youtube/v3/channels';
//     // let responseData = {};
//     //
//     //  request({
//     //     url: url,
//     //     method: 'GET',
//     //     qs:{
//     //         part:'id',
//     //         mine:true
//     //     },
//     //     headers:{
//     //             'Authorization': 'Bearer ' + accessToken
//     //         }
//     //     },function (err,responese,body) {
//     //         if(err) throw err;
//     //         responseData = JSON.parse(body);
//     //         if(!responseData.items){
//     //             res.json({isSuccess : false,code:'200',message:'유효하지 않은 토큰입니다. Request had invalid authentication credentials.'});
//     //         }
//     //         else{
//     //
//     //             res.json({isSuccess : true,code:'100',message:'회원 가입'});
//     //         }
//     //     });
//
//
//     // const idToken = req.headers['x-access-token'];
//     //
//     // //id 토큰 유효성 검사 코드
//     // let checkRevoked = true;
//     // admin.auth().verifyIdToken(idToken, checkRevoked)
//     //     .then(payload => {
//     //         // Token is valid.
//     //         console.log("s");
//     //     })
//     //     .catch(error => {
//     //         if (error.code == 'auth/id-token-revoked') {
//     //             // Token has been revoked. Inform the user to reauthenticate or signOut() the user.
//     //             console.log("revokde");
//     //         } else {
//     //             console.log("invalid");
//     //             // Token is invalid.
//     //         }
//     //     });
//
//     /*
//     //  id 토큰 디코딩 코
//     // console.log(idToken);
//     const idToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImI2M2VlMGJlMDkzZDliYzMxMmQ5NThjOTk2NmQyMWYwYzhmNmJiYmIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI3NjQzNDU2ODk1OC1pZzVlOWhzbnJmOHIwdDE5cW5xN2ZrOGw3aWlndXQ5OS5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsImF1ZCI6Ijc2NDM0NTY4OTU4LXVtMm90OXRqbXYxYTdiNHM3Z2Q4ZXUwb3RxaGdrNzQ4LmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwic3ViIjoiMTEzNDk1NzYwMDMxNjA3MzU2MTE4IiwiZW1haWwiOiJzdXllb243OTc5QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoi6rmA7IiY7JewIiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS8tYkN4T0RLaE1FRzQvQUFBQUFBQUFBQUkvQUFBQUFBQUFBQUEvQU1adXVjbVBRT3YxSzZCZ3Q4Q18xWWlnMlJ3Qmt5ZHFDdy9zOTYtYy9waG90by5qcGciLCJnaXZlbl9uYW1lIjoi7IiY7JewIiwiZmFtaWx5X25hbWUiOiLquYAiLCJsb2NhbGUiOiJrbyIsImlhdCI6MTU5NTgzMTg2MywiZXhwIjoxNTk1ODM1NDYzfQ.MarI0WpKCD-qT3lnwEJayG9zD_zhIVRzQGlEGv45FT6CBbNLTDdxDCe87Tvz6NicihmqOHn17CyD5rK4hR0VqNGwBxl8B7K4NZI4josB7Cgjcm54Ce8CIGuiS8WlRHWW5akxweicQHYljiq8K7IKp2pfOI5k-Ev6qOct0C-3hNv-V3az9hr1ZplnQEHz2H0yQaLX6Luxb1_axd6AizqoLFiuv6Co02OQJqfd5V0TlvvtEtb-1PctUtfJ1Zz1pG2zRhIZILpzcWOdL-gu6K8jNeUMZ5Qm5Y3cZMcTfzJ8MovaEjkE0xUdRkweV2ZRawRO0PsAqo5zdqBw7acRTewkpw";
//     admin.auth().verifyIdToken(idToken)
//         .then(function(decodedToken) {
//             let uid = decodedToken.uid;
//             console.log(uid);
//             res.json({test:'test'});
//
//             // ...
//         }).catch(function(error) {
//             res.json(error);
//
//         // Handle error
//     });
//     */
//
//
//
//     // res.json({test: 'test'});
//
// }

/**
 update : 2019.11.01
 02.signIn API = 로그인
 **/
// exports.signIn = async function (req, res) {
//     const {
//         email, password
//     } = req.body;
//
//     if (!email) return res.json({isSuccess: false, code: 301, message: "이메일을 입력해주세요."});
//     if (email.length > 30) return res.json({
//         isSuccess: false,
//         code: 302,
//         message: "이메일은 30자리 미만으로 입력해주세요."
//     });
//
//     if (!regexEmail.test(email)) return res.json({isSuccess: false, code: 303, message: "이메일을 형식을 정확하게 입력해주세요."});
//
//     if (!password) return res.json({isSuccess: false, code: 304, message: "비밀번호를 입력 해주세요."});
//
//     try {
//         const connection = await pool.getConnection(async conn => conn);
//         try {
//             const selectUserInfoQuery = `
//                 SELECT id, email , pswd, nickname, status
//                 FROM UserInfo
//                 WHERE email = ?;
//                 `;
//
//             let selectUserInfoParams = [email];connection.release();
//
//             const [userInfoRows] = await connection.query(selectUserInfoQuery, selectUserInfoParams);
//
//             if (userInfoRows.length < 1) {
//                 connection.release();
//                 return res.json({
//                     isSuccess: false,
//                     code: 310,
//                     message: "아이디를 확인해주세요."
//                 });
//             }
//
//             const hashedPassword = await crypto.createHash('sha512').update(password).digest('hex');
//             if (userInfoRows[0].pswd !== hashedPassword) {
//                 connection.release();
//                 return res.json({
//                     isSuccess: false,
//                     code: 311,
//                     message: "비밀번호를 확인해주세요."
//                 });
//             }
//
//             if (userInfoRows[0].status === "INACTIVE") {
//                 connection.release();
//                 return res.json({
//                     isSuccess: false,
//                     code: 312,
//                     message: "비활성화 된 계정입니다. 고객센터에 문의해주세요."
//                 });
//             } else if (userInfoRows[0].status === "DELETED") {
//                 connection.release();
//                 return res.json({
//                     isSuccess: false,
//                     code: 313,
//                     message: "탈퇴 된 계정입니다. 고객센터에 문의해주세요."
//                 });
//             }
//
//             //토큰 생성
//             let token = await jwt.sign({
//                     id: userInfoRows[0].id,
//                     email: email,
//                     password: hashedPassword,
//                     nickname: userInfoRows[0].nickname,
//                 }, // 토큰의 내용(payload)
//                 secret_config.jwtsecret, // 비밀 키
//                 {
//                     expiresIn: '365d',
//                     subject: 'userInfo',
//                 } // 유효 시간은 365일
//             );
//
//             res.json({
//                 userInfo: userInfoRows[0],
//                 jwt: token,
//                 isSuccess: true,
//                 code: 200,
//                 message: "로그인 성공"
//             });
//
//             connection.release();
//         } catch (err) {
//             logger.error(`App - SignIn Query error\n: ${JSON.stringify(err)}`);
//             connection.release();
//             return false;
//         }
//     } catch (err) {
//         logger.error(`App - SignIn DB Connection error\n: ${JSON.stringify(err)}`);
//         return false;
//     }
// };

/**
 update : 2019.09.23
 03.check API = token 검증
 **/