const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const { createComment, deleteComment, getRepliesTree, listReplies, topLevelReplies, listChildren } = require('../controllers/comments.controller');

// POST /posts/:id/comments  -> mounted under /posts in server
router.post('/:id/comments', authenticateToken, createComment);

// DELETE /posts/:postId/comments/:replyId
router.delete('/:postId/comments/:replyId', authenticateToken, deleteComment);

// GET /posts/:id/replies
// - If ?tree=true -> return nested reply tree (limited by maxDepth)
// - Otherwise return top-level paginated replies (parentReplyId == null)
router.get('/:id/replies', authenticateToken, (req, res, next) => {
	if (req.query.tree === 'true') return getRepliesTree(req, res, next);
	return topLevelReplies(req, res, next);
});

// GET /posts/:id/comments - flat paginated list of replies for a post (legacy)
router.get('/:id/comments', authenticateToken, listReplies);

// GET /posts/:id/children?parentId=... - paginated direct children of a reply
router.get('/:id/children', authenticateToken, listChildren);

module.exports = router;
