const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const { createComment, deleteComment } = require('../controllers/comments.controller');

// POST /:id/comments
router.post('/:id/comments', auth, createComment);

// DELETE /:postId/comments/:replyId
router.delete('/:postId/comments/:replyId', auth, deleteComment);

module.exports = router;
