const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const postStatusController = require('../controllers/post.status.controller');
const replyController = require('../controllers/reply.controller');
const { authenticateToken, isOwnerOrAdmin, isAdmin } = require('../middleware/auth.middleware');
const { uploadPostFiles, handleMulterError } = require('../middleware/upload.middleware');

// All routes require authentication
router.use(authenticateToken);

// GET /posts - List posts with pagination
router.get('/', postController.listPosts);

// GET /posts/user/me/drafts - Get current user's drafts
router.get('/user/me/drafts', postController.getUserDrafts);

// GET /posts/user/me/top - Get current user's top posts
router.get('/user/me/top', postController.getUserTopPosts);

// GET /posts/:id - Get single post with replies
router.get('/:id', postController.getPostById);

// GET /posts/:id/replies - get replies for a post (proxy to reply controller)
router.get('/:id/replies', (req, res, next) => {
  req.params.postId = req.params.id;
  return replyController.getRepliesByPost(req, res, next);
});

// POST /posts - Create new post with file uploads
router.post(
  '/',
  uploadPostFiles,
  handleMulterError,
  postController.createPost
);

// POST /posts/:id/replies - create a reply for a post (proxy to reply controller)
router.post('/:id/replies', (req, res, next) => {
  req.params.postId = req.params.id;
  return replyController.createReply(req, res, next);
});

// PUT /posts/:id - Update existing post (owner or admin only)
router.put(
  '/:id',
  isOwnerOrAdmin,
  uploadPostFiles,
  handleMulterError,
  postController.updatePost
);

// DELETE /posts/:id - Delete post (soft delete) (owner or admin only)
router.delete('/:id', isOwnerOrAdmin, postController.deletePost);

// Status transition routes
router.patch('/:id/publish', isOwnerOrAdmin, postStatusController.publishPost);
router.patch('/:id/hide', isOwnerOrAdmin, postStatusController.hidePost);
router.patch('/:id/unhide', isOwnerOrAdmin, postStatusController.unhidePost);
router.patch('/:id/ban', isAdmin, postStatusController.banPost);
router.patch('/:id/unban', isAdmin, postStatusController.unbanPost);
router.patch('/:id/recover', isAdmin, postStatusController.recoverPost);
router.patch('/:id/disable-replies', isOwnerOrAdmin, postStatusController.disableReplies);
router.patch('/:id/enable-replies', isOwnerOrAdmin, postStatusController.enableReplies);

module.exports = router;