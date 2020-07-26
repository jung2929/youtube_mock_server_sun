module.exports = function(app){
    const user = require('../controllers/userController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');


    app.patch('/user/subscribe',user.updateSubscribe);


    //test api for login
    app.route('/user').post(user.login);


    //example
    app.route('/app/signUp').post(user.signUp);
    app.route('/app/signIn').post(user.signIn);

    app.get('/check', jwtMiddleware, user.check);
};