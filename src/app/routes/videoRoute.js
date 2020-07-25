module.exports = function(app){
    const video = require('../controllers/videoController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');

    // app.route('/app/signUp').post(user.signUp);
    // app.route('/app/signIn').post(user.signIn);

    app.get('/videos',video.video);
    app.get('/story-videos',video.story);
    app.get('/community-posts',video.community);
    app.get('/videos/:videoIdx',video.watch);


    //test api
    //app.get('/watch',video.watch);
    app.get('/login',video.signin);

};