module.exports = function(app){
    const user = require('../controllers/userController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');


    app.patch('/users/:userIdx/subscribe',user.updateSubscribe);
    app.get('/users/:userIdx/subscribe',user.getSubscribeData);
    app.get('/users/:userIdx/subscribe/profile',user.getSubscribeProfile);
    app.get('/users/:userIdx/subscribe/:channelIdx',user.getSubscribeChannel);

    //test api for login
    app.route('/users').post(user.login);


    //example
    //app.route('/app/signUp').post(user.signUp);
    //app.route('/app/signIn').post(user.signIn);
    app.get('/check', jwtMiddleware, user.check);
};