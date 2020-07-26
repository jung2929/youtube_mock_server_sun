module.exports = function(app){
    const video = require('../controllers/videoController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');

    // app.route('/app/signUp').post(user.signUp);
    // app.route('/app/signIn').post(user.signIn);

    app.get('/videos',video.getVideo);
    app.get('/story-videos',video.getStory);
    app.get('/community-posts',video.getCommunity);
    app.get('/videos/:videoIdx',video.getWatch);
    app.patch('/videos/:videoIdx/likes',video.updateLikes);

    //test api
    //app.get('/watch',video.watch);
    app.get('/login',video.signin);

};