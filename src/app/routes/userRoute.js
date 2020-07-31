module.exports = function(app){
    const user = require('../controllers/userController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');


    app.patch('/users/:userIdx/subscribe',user.updateSubscribe);
    app.get('/users/:userIdx/subscribe',user.getSubscribeData);
    app.get('/users/:userIdx/subscribe/profile',user.getSubscribeProfile);
    app.get('/users/:userIdx/subscribe/:channelIdx',user.getSubscribeChannel);
    app.get('/user/:userIdx/inbox',user.getInbox);
    app.delete('/user/:userIdx/inbox/:inboxIdx',user.deleteInbox);
    app.get('/user/:userIdx/watched',user.getWatched);
    app.delete('/user/:userIdx/watched/:watchedIdx',user.deleteWatched);

    //test api for login
    app.route('/users').post(user.login);


    //example
    //app.route('/app/signUp').post(user.signUp);
    //app.route('/app/signIn').post(user.signIn);
    app.get('/check', jwtMiddleware, user.check);
};