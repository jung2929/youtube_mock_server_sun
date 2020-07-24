const {pool} = require('../../../config/database');
const {logger} = require('../../../config/winston');

const jwt = require('jsonwebtoken');
const regexEmail = require('regex-email');
const crypto = require('crypto');
const secret_config = require('../../../config/secret');
const request = require('request');

// const admin = require('firebase-admin');
// const serviceAccount = require("path/to/serviceAccountKey.json");
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//     databaseURL: "https://clone-e7f75.firebaseio.com"
// });

const {google} = require("googleapis");
const admin = require("firebase-admin");

const serviceAccount = require("../../../config/serviceAccountKey.json");
const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/firebase.database"
];
const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    scopes
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://clone-e7f75.firebaseio.com"
});

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
exports.signUp = async function( req, res ){
    // console.log('/app/signup (post)');
    // const accessToken = req.headers['x-access-token'];
    // const url = 'https://www.googleapis.com/youtube/v3/channels';
    // let responseData = {};
    //
    //  request({
    //     url: url,
    //     method: 'GET',
    //     qs:{
    //         part:'id',
    //         mine:true
    //     },
    //     headers:{
    //             'Authorization': 'Bearer ' + accessToken
    //         }
    //     },function (err,responese,body) {
    //         if(err) throw err;
    //         responseData = JSON.parse(body);
    //         if(!responseData.items){
    //             res.json({isSuccess : false,code:'200',message:'유효하지 않은 토큰입니다. Request had invalid authentication credentials.'});
    //         }
    //         else{
    //
    //             res.json({isSuccess : true,code:'100',message:'회원 가입'});
    //         }
    //     });


    const idToken = req.headers['x-access-token'];

    //id 토큰 유효성 검사 코드
    let checkRevoked = true;
    admin.auth().verifyIdToken(idToken, checkRevoked)
        .then(payload => {
            // Token is valid.
            console.log("s");
        })
        .catch(error => {
            if (error.code == 'auth/id-token-revoked') {
                // Token has been revoked. Inform the user to reauthenticate or signOut() the user.
                console.log("revokde");
            } else {
                console.log("invalid");
                // Token is invalid.
            }
        });

    //  id 토큰 디코딩 코
    // console.log(idToken);
    //
    // admin.auth().verifyIdToken(idToken)
    //     .then(function(decodedToken) {
    //         let uid = decodedToken.uid;
    //         console.log(uid);
    //         res.json({test:'test'});
    //
    //         // ...
    //     }).catch(function(error) {
    //     // Handle error
    // });



    res.json({test: 'test'});

}

/**
 update : 2019.11.01
 02.signIn API = 로그인
 **/
exports.signIn = async function (req, res) {
    const {
        email, password
    } = req.body;

    if (!email) return res.json({isSuccess: false, code: 301, message: "이메일을 입력해주세요."});
    if (email.length > 30) return res.json({
        isSuccess: false,
        code: 302,
        message: "이메일은 30자리 미만으로 입력해주세요."
    });

    if (!regexEmail.test(email)) return res.json({isSuccess: false, code: 303, message: "이메일을 형식을 정확하게 입력해주세요."});

    if (!password) return res.json({isSuccess: false, code: 304, message: "비밀번호를 입력 해주세요."});

    try {
        const connection = await pool.getConnection(async conn => conn);
        try {
            const selectUserInfoQuery = `
                SELECT id, email , pswd, nickname, status 
                FROM UserInfo 
                WHERE email = ?;
                `;

            let selectUserInfoParams = [email];connection.release();

            const [userInfoRows] = await connection.query(selectUserInfoQuery, selectUserInfoParams);

            if (userInfoRows.length < 1) {
                connection.release();
                return res.json({
                    isSuccess: false,
                    code: 310,
                    message: "아이디를 확인해주세요."
                });
            }

            const hashedPassword = await crypto.createHash('sha512').update(password).digest('hex');
            if (userInfoRows[0].pswd !== hashedPassword) {
                connection.release();
                return res.json({
                    isSuccess: false,
                    code: 311,
                    message: "비밀번호를 확인해주세요."
                });
            }

            if (userInfoRows[0].status === "INACTIVE") {
                connection.release();
                return res.json({
                    isSuccess: false,
                    code: 312,
                    message: "비활성화 된 계정입니다. 고객센터에 문의해주세요."
                });
            } else if (userInfoRows[0].status === "DELETED") {
                connection.release();
                return res.json({
                    isSuccess: false,
                    code: 313,
                    message: "탈퇴 된 계정입니다. 고객센터에 문의해주세요."
                });
            }

            //토큰 생성
            let token = await jwt.sign({
                    id: userInfoRows[0].id,
                    email: email,
                    password: hashedPassword,
                    nickname: userInfoRows[0].nickname,
                }, // 토큰의 내용(payload)
                secret_config.jwtsecret, // 비밀 키
                {
                    expiresIn: '365d',
                    subject: 'userInfo',
                } // 유효 시간은 365일
            );

            res.json({
                userInfo: userInfoRows[0],
                jwt: token,
                isSuccess: true,
                code: 200,
                message: "로그인 성공"
            });

            connection.release();
        } catch (err) {
            logger.error(`App - SignIn Query error\n: ${JSON.stringify(err)}`);
            connection.release();
            return false;
        }
    } catch (err) {
        logger.error(`App - SignIn DB Connection error\n: ${JSON.stringify(err)}`);
        return false;
    }
};

/**
 update : 2019.09.23
 03.check API = token 검증
 **/
exports.check = async function (req, res) {
    res.json({
        isSuccess: true,
        code: 200,
        message: "검증 성공",
        info: req.verifiedToken
    })
};