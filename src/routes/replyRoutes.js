const express = require('express');
const router = express.Router();
const replyController = require('../controllers/replyController');
const { validateReply } = require('../middleware/validators');

// Get replies for a post
router.get('/post/:postId', replyController.getRepliesByPost);

// Create reply
router.post('/post/:postId', validateReply, replyController.createReply);

// Create sub-reply (Bonus)
router.post('/:replyId/sub', validateReply, replyController.createSubReply);

// Delete nested reply
router.delete('/:parentReplyId/nested', replyController.deleteNestedReply);

// Delete reply
router.delete('/:id', replyController.deleteReply);

module.exports = router;
