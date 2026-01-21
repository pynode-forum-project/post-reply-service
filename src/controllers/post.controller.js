const Post = require("../models/Post");
const replyService = require("../services/reply.service");
const fileService = require("../services/file.service");
const crypto = require("crypto");
const { buildVisibilityFilter, canViewPost, canModifyPost } = require("../utils/postFilters");

/**
 * GET /posts
 * List posts with pagination
 * Query params: page (default: 1), limit (default: 10)
 */
const listPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const statusParam = req.query.status;

    // Build visibility filter based on user role
    const statusFilter = buildVisibilityFilter(
      req.user.userId,
      req.user.userType,
      { specificStatus: statusParam }
    );

    // Get total count for pagination
    const total = await Post.countDocuments(statusFilter);

    // Fetch posts sorted by dateCreated (newest first)
    const posts = await Post.find(statusFilter)
      .sort({ dateCreated: -1 })
      .skip(skip)
      .limit(limit)
      .select("-_id -__v")
      .lean();

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /posts/:id
 * Get single post by ID with replies
 */
const getPostById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find post by postId field
    const post = await Post.findOne({ postId: id }).select("-_id -__v").lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Post not found",
          statusCode: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if user can view this post
    if (!canViewPost(post, req.user.userId, req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "You do not have permission to view this post",
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Fetch replies from reply service (graceful degradation)
    let replies = [];
    try {
      replies = await replyService.getRepliesForPost(id);
    } catch (error) {
      console.warn(`Reply service unavailable: ${error.message}`);
      // Continue without replies rather than failing the entire request
    }

    res.status(200).json({
      success: true,
      data: {
        ...post,
        replies,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /posts
 * Create new post with file uploads
 */
const createPost = async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const userId = req.user.userId;
    const publish = req.body.publish !== 'false'; // Default true

    // Validate required fields for published posts
    if (publish && (!title || !content)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Title and content are required to publish",
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Generate new postId
    const postId = crypto.randomUUID();

    // Handle file uploads
    let imageUrls = [];
    let attachmentUrls = [];

    if (req.files) {
      // Upload images if present
      if (req.files.images && req.files.images.length > 0) {
        try {
          imageUrls = await fileService.uploadFiles(
            req.files.images,
            postId,
            "image"
          );
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: {
              message: `Failed to upload images: ${error.message}`,
              statusCode: 500,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Upload attachments if present
      if (req.files.attachments && req.files.attachments.length > 0) {
        try {
          attachmentUrls = await fileService.uploadFiles(
            req.files.attachments,
            postId,
            "attachment"
          );
        } catch (error) {
          // If attachments fail, try to clean up images
          if (imageUrls.length > 0) {
            await fileService.deleteFiles(imageUrls);
          }
          return res.status(500).json({
            success: false,
            error: {
              message: `Failed to upload attachments: ${error.message}`,
              statusCode: 500,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }

    // Create new post
    const newPost = new Post({
      postId,
      userId,
      title,
      content,
      images: imageUrls,
      attachments: attachmentUrls,
      status: publish ? 'published' : 'unpublished',
      isArchived: false,
    });

    await newPost.save();

    res.status(201).json({
      success: true,
      data: newPost.toJSON(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /posts/:id
 * Update existing post
 */
const updatePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, removeImages, removeAttachments } = req.body;

    // Find the post
    const post = await Post.findOne({ postId: id });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Post not found",
          statusCode: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if user can modify this post
    if (!canModifyPost(post, req.user.userId, req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "Cannot modify post with current status",
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Update title and content if provided
    if (title) post.title = title;
    if (content) post.content = content;

    // Handle file removals
    if (removeImages && Array.isArray(removeImages)) {
      const imagesToRemove = removeImages.filter((url) =>
        post.images.includes(url)
      );
      post.images = post.images.filter((url) => !imagesToRemove.includes(url));
      // Optionally delete from file service
      if (imagesToRemove.length > 0) {
        await fileService.deleteFiles(imagesToRemove);
      }
    }

    if (removeAttachments && Array.isArray(removeAttachments)) {
      const attachmentsToRemove = removeAttachments.filter((url) =>
        post.attachments.includes(url)
      );
      post.attachments = post.attachments.filter(
        (url) => !attachmentsToRemove.includes(url)
      );
      // Optionally delete from file service
      if (attachmentsToRemove.length > 0) {
        await fileService.deleteFiles(attachmentsToRemove);
      }
    }

    // Handle new file uploads
    if (req.files) {
      // Upload new images
      if (req.files.images && req.files.images.length > 0) {
        try {
          const newImageUrls = await fileService.uploadFiles(
            req.files.images,
            id,
            "image"
          );
          post.images = [...post.images, ...newImageUrls];
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: {
              message: `Failed to upload new images: ${error.message}`,
              statusCode: 500,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Upload new attachments
      if (req.files.attachments && req.files.attachments.length > 0) {
        try {
          const newAttachmentUrls = await fileService.uploadFiles(
            req.files.attachments,
            id,
            "attachment"
          );
          post.attachments = [...post.attachments, ...newAttachmentUrls];
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: {
              message: `Failed to upload new attachments: ${error.message}`,
              statusCode: 500,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }

    // Update dateModified
    post.dateModified = new Date();

    await post.save();

    res.status(200).json({
      success: true,
      data: post.toJSON(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /posts/:id
 * Delete post (soft delete via status change to 'deleted')
 */
const deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Find the post
    const post = await Post.findOne({ postId: id });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Post not found",
          statusCode: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check ownership (isOwnerOrAdmin middleware already checked this, but be explicit)
    if (post.userId !== userId && !['admin', 'superadmin'].includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "You do not have permission to delete this post",
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Soft delete: Set status to 'deleted' and keep files for recovery
    post.status = 'deleted';
    post.dateDeleted = new Date();
    post.dateModified = new Date();

    await post.save();

    // Don't delete files - keep them for recovery purposes
    // Files will be cleaned up by an admin cleanup job in the future

    res.status(200).json({
      success: true,
      data: {
        message: "Post deleted successfully",
        postId: id,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /posts/user/me/drafts
 * Get current user's drafts (unpublished posts)
 * Query params: page (default: 1), limit (default: 10)
 */
const getUserDrafts = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter: current user's unpublished posts
    const filter = {
      userId: userId,
      status: 'unpublished'
    };

    const total = await Post.countDocuments(filter);

    const drafts = await Post.find(filter)
      .sort({ dateModified: -1 })  // Most recently modified first
      .skip(skip)
      .limit(limit)
      .select("-_id -__v")
      .lean();

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        drafts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /posts/user/me/top
 * Get user's top posts sorted by reply count
 * Query params: limit (default: 3, max: 10)
 */
const getUserTopPosts = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 3, 10);

    // Get all user's published posts
    const posts = await Post.find({
      userId: userId,
      status: 'published'
    })
      .select("-_id -__v")
      .lean();

    // Fetch reply count for each post
    const postsWithReplyCount = await Promise.all(
      posts.map(async (post) => {
        const replies = await replyService.getRepliesForPost(post.postId);
        return {
          ...post,
          replyCount: replies.length
        };
      })
    );

    // Sort by reply count desc and take top N
    const topPosts = postsWithReplyCount
      .sort((a, b) => b.replyCount - a.replyCount)
      .slice(0, limit);

    res.status(200).json({
      success: true,
      data: {
        posts: topPosts,
        limit
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getUserDrafts,
  getUserTopPosts
};
