module.exports = function(app){
    const video = require('../controllers/videoController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');

    // app.route('/app/signUp').post(user.signUp);
    // app.route('/app/signIn').post(user.signIn);

    app.get('/videos',video.list);
};