module.exports = function(app){
    const user = require('../controllers/userController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');


    app.patch('/users/subscribe',user.updateSubscribe);


    //test api for login
    app.route('/users').post(user.login);


    //example
    app.route('/app/signUp').post(user.signUp);
    app.route('/app/signIn').post(user.signIn);

    app.get('/check', jwtMiddleware, user.check);
};