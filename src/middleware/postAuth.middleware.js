const Post = require('../models/Post');
const { canViewPost, canModifyPost } = require('../utils/postFilters');

/**
 * Middleware to check if user can view a post
 * Attaches post to req.post if access is granted
 */
const canViewPostMiddleware = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the post
    const post = await Post.findOne({ postId: id });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Post not found',
          statusCode: 404,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check if user can view this post
    if (!canViewPost(post, req.user.userId, req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to view this post',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Attach post to request for use in controller
    req.post = post;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user can modify a post
 * Attaches post to req.post if modification is allowed
 */
const canModifyPostMiddleware = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the post
    const post = await Post.findOne({ postId: id });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Post not found',
          statusCode: 404,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check if user can modify this post
    if (!canModifyPost(post, req.user.userId, req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Cannot modify post with current status',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Attach post to request for use in controller
    req.post = post;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  canViewPostMiddleware,
  canModifyPostMiddleware
};
