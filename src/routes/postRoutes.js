const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { validatePost, validatePostUpdate } = require('../middleware/validators');

// Public routes (still require auth from gateway)
router.get('/', postController.getPublishedPosts);
router.get('/drafts', postController.getUserDrafts);
router.get('/hidden', postController.getUserHidden);
router.get('/banned', postController.getBannedPosts);
router.get('/deleted', postController.getDeletedPosts);
router.get('/:id', postController.getPostById);

// User's top posts
router.get('/user/:userId/top', postController.getUserTopPosts);

// Create post
router.post('/', validatePost, postController.createPost);

// Update post
router.put('/:id', validatePostUpdate, postController.updatePost);

// Status changes
router.put('/:id/status', postController.updatePostStatus);
router.put('/:id/archive', postController.toggleArchive);
router.put('/:id/ban', postController.banPost);
router.put('/:id/unban', postController.unbanPost);
router.put('/:id/recover', postController.recoverPost);

// Delete post
router.delete('/:id', postController.deletePost);

module.exports = router;
