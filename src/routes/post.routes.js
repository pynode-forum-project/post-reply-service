const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
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

// DELETE /posts/:id - Delete post (soft delete via archive) (owner or admin only)
router.delete('/:id', isOwnerOrAdmin, postController.deletePost);

// PATCH /posts/:id/archive - Archive a post (admin only)
router.patch('/:id/archive', isAdmin, postController.archivePost);

// PATCH /posts/:id/unarchive - Unarchive a post (admin only)
router.patch('/:id/unarchive', isAdmin, postController.unarchivePost);

module.exports = router;