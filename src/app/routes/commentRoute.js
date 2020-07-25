module.exports = function(app){
    const comment = require('../controllers/commentController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');


    app.route('/videos/:videoIdx/comments').post(comment.postComment);
    app.get('/videos/:videoIdx/comments',comment.commentList);
    app.patch('/videos/:videoIdx/comments',comment.updateComment);
};