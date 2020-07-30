module.exports = function(app){
    const video = require('../controllers/videoController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');

    // app.route('/app/signUp').post(user.signUp);
    // app.route('/app/signIn').post(user.signIn);

    app.get('/videos',video.getVideo);
    app.route('/videos').post(video.postVideo);
    app.get('/story-videos',video.getStory);
    app.get('/community-posts',video.getCommunity);
    app.get('/videos/:videoIdx',video.getWatch);
    app.patch('/videos/:videoIdx/likes',video.updateLikes);
    app.route('/saved-videos/:videoIdx').post(video.postSaveVideo);
    app.get('/saved-videos',video.getSaveVideo)
    app.patch('/videos/:videoIdx/play-time',video.updatePlayTime)
};