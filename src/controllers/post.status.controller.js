const Post = require('../models/Post');
const { validateStatusTransition } = require('../utils/postFilters');

/**
 * PATCH /posts/:id/publish
 * Publish an unpublished post (owner only)
 */
const publishPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

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

    // Check ownership
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to publish this post',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate transition
    const transition = validateStatusTransition(post.status, 'published', req.user.userType);
    if (!transition.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          message: transition.reason,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate required fields for publishing
    if (!post.title || !post.content) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Title and content are required to publish',
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update status
    post.status = 'published';
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/hide
 * Hide a published post (owner only)
 */
const hidePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

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

    // Check ownership
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to hide this post',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate transition
    const transition = validateStatusTransition(post.status, 'hidden', req.user.userType);
    if (!transition.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          message: transition.reason,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update status
    post.status = 'hidden';
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/unhide
 * Unhide a hidden post (owner only)
 */
const unhidePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

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

    // Check ownership
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to unhide this post',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate transition
    const transition = validateStatusTransition(post.status, 'published', req.user.userType);
    if (!transition.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          message: transition.reason,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update status
    post.status = 'published';
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/ban
 * Ban a post (admin only)
 */
const banPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const { reason } = req.body;

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

    // Validate transition
    const transition = validateStatusTransition(post.status, 'banned', req.user.userType);
    if (!transition.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          message: transition.reason,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update status
    post.status = 'banned';
    post.dateBanned = new Date();
    post.bannedBy = adminId;
    if (reason) {
      post.bannedReason = reason;
    }
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/unban
 * Unban a post (admin only)
 */
const unbanPost = async (req, res, next) => {
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

    // Validate transition
    const transition = validateStatusTransition(post.status, 'published', req.user.userType);
    if (!transition.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          message: transition.reason,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update status
    post.status = 'published';
    post.dateBanned = undefined;
    post.bannedBy = undefined;
    post.bannedReason = undefined;
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/recover
 * Recover a deleted post (admin only)
 */
const recoverPost = async (req, res, next) => {
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

    // Validate transition
    const transition = validateStatusTransition(post.status, 'published', req.user.userType);
    if (!transition.allowed) {
      return res.status(400).json({
        success: false,
        error: {
          message: transition.reason,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update status
    post.status = 'published';
    post.dateDeleted = undefined;
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/disable-replies
 * Disable replies for a post (owner only)
 */
const disableReplies = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

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

    // Check ownership
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to disable replies for this post',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Can only disable replies on published posts
    if (post.status !== 'published') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Can only disable replies on published posts',
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update repliesDisabled
    post.repliesDisabled = true;
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /posts/:id/enable-replies
 * Enable replies for a post (owner only)
 */
const enableReplies = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

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

    // Check ownership
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to enable replies for this post',
          statusCode: 403,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Can only enable replies on published posts
    if (post.status !== 'published') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Can only enable replies on published posts',
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update repliesDisabled
    post.repliesDisabled = false;
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  publishPost,
  hidePost,
  unhidePost,
  banPost,
  unbanPost,
  recoverPost,
  disableReplies,
  enableReplies
};
