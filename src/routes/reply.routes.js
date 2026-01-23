const express = require('express');
const router = express.Router();
const replyController = require('../controllers/reply.controller');

// Get replies for a post
router.get('/post/:postId', replyController.getRepliesByPost);

// Create reply
router.post('/post/:postId', replyController.createReply);

// Create sub-reply
router.post('/:replyId/sub', replyController.createSubReply);

// Delete nested reply
router.delete('/:parentReplyId/nested', replyController.deleteNestedReply);

// Delete reply
router.delete('/:id', replyController.deleteReply);

module.exports = router;
