module.exports = function(app){
    const comment = require('../controllers/commentController');
    const jwtMiddleware = require('../../../config/jwtMiddleware');


    app.route('/videos/:videoIdx/comments').post(comment.postComment);
    app.get('/videos/:videoIdx/comments',comment.getComment);
    app.patch('/videos/:videoIdx/comments',comment.updateComment);
    app.delete('/videos/:videoIdx/comments',comment.daleteComment);

    //app.get('/videos/:videoIdx/comments/:commentsIdx',comment.postReply);
    app.route('/videos/:videoIdx/comments/:commentsIdx').post(comment.postReply);
    app.get('/videos/:videoIdx/comments/:commentsIdx',comment.getReply);

};