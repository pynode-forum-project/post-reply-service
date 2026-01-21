const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const postStatusController = require('../controllers/post.status.controller');
const { authenticateToken, isOwnerOrAdmin, isAdmin } = require('../middleware/auth.middleware');
const { uploadPostFiles, handleMulterError } = require('../middleware/upload.middleware');

// All routes require authentication
router.use(authenticateToken);

// GET /posts - List posts with pagination
router.get('/', postController.listPosts);

// GET /posts/:id - Get single post with replies
router.get('/:id', postController.getPostById);

// POST /posts - Create new post with file uploads
router.post(
  '/',
  uploadPostFiles,
  handleMulterError,
  postController.createPost
);

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