const Post = require('../models/Post');
const Reply = require('../models/Reply');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const userClient = require('../services/userClient');
const logger = require('../utils/logger');

/**
 * Get published posts with pagination
 */
exports.getPublishedPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'dateCreated';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const query = { status: 'published' };

    // Filter by user if specified
    if (req.query.userId) {
      query.userId = parseInt(req.query.userId);
    }

    // If sorting by replyCount, we need to calculate it from Reply collection
    let posts, total;
    if (sortBy === 'replyCount') {
      // Use aggregation to get posts with actual reply counts
      const aggregation = [
        { $match: query },
        {
          $lookup: {
            from: 'replies',
            let: { postId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$postId', '$$postId'] },
                      { $eq: ['$isActive', true] }
                    ]
                  }
                }
              }
            ],
            as: 'replies'
          }
        },
        {
          $addFields: {
            // Count all replies including nested ones
            actualReplyCount: {
              $add: [
                { $size: '$replies' },
                {
                  $sum: {
                    $map: {
                      input: '$replies',
                      as: 'reply',
                      in: {
                        $cond: {
                          if: { $isArray: '$$reply.replies' },
                          then: { $size: '$$reply.replies' },
                          else: 0
                        }
                      }
                    }
                  }
                }
              ]
            }
          }
        },
        { $sort: { actualReplyCount: sortOrder, dateCreated: -1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const [postsResult, totalResult] = await Promise.all([
        Post.aggregate(aggregation),
        Post.countDocuments(query)
      ]);

      // Convert aggregation results to Post documents
      posts = postsResult.map(doc => {
        const post = new Post();
        Object.assign(post, doc);
        post._id = new mongoose.Types.ObjectId(doc._id);
        post.isNew = false;
        post.replyCount = doc.actualReplyCount || 0;
        return post;
      });
      total = totalResult;
    } else {
      // Normal query for other sort fields
      [posts, total] = await Promise.all([
        Post.find(query)
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit),
        Post.countDocuments(query)
      ]);
    }

    // Helper function to count all replies including nested ones
    const countAllReplies = async (postId) => {
      const topLevelReplies = await Reply.find({ postId: postId.toString(), isActive: true });
      let totalCount = topLevelReplies.length;
      
      // Count nested replies recursively
      for (const reply of topLevelReplies) {
        const countNested = (replies) => {
          if (!replies || !Array.isArray(replies)) return 0;
          let count = 0;
          replies.forEach(r => {
            if (r.isActive !== false) {
              count += 1;
              if (r.replies && Array.isArray(r.replies)) {
                count += countNested(r.replies);
              }
            }
          });
          return count;
        };
        totalCount += countNested(reply.replies);
      }
      
      return totalCount;
    };

    // Fetch user info and calculate reply count for each post
    const postsWithUsers = await Promise.all(
      posts.map(async (post) => {
        const user = await userClient.getUserById(post.userId);
        // Calculate actual reply count if not already calculated
        let replyCount = post.replyCount;
        if (sortBy !== 'replyCount') {
          // Count all replies including nested ones
          replyCount = await countAllReplies(post._id);
        } else {
          // For replyCount sort, we need to recalculate including nested
          replyCount = await countAllReplies(post._id);
        }
        return {
          ...post.toJSON(),
          replyCount,
          user: user ? {
            userId: user.user_id,
            firstName: user.first_name,
            lastName: user.last_name,
            profileImageUrl: user.profile_image_url
          } : null
        };
      })
    );

    res.json({
      posts: postsWithUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's draft posts
 */
exports.getUserDrafts = async (req, res, next) => {
  try {
    const userId = parseInt(req.headers['x-user-id']);
    
    const posts = await Post.find({ 
      userId, 
      status: 'unpublished' 
    }).sort({ dateCreated: -1 });

    res.json({ posts });
  } catch (error) {
    next(error);
  }
};

/**
 * Get banned posts (Admin only)
 */
exports.getBannedPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find({ status: 'banned' })
        .sort({ dateCreated: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments({ status: 'banned' })
    ]);

    res.json({ posts, total, page, limit });
  } catch (error) {
    next(error);
  }
};

/**
 * Get deleted posts (Admin only)
 */
exports.getDeletedPosts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find({ status: 'deleted' })
        .sort({ dateCreated: -1 })
        .skip(skip)
        .limit(limit),
      Post.countDocuments({ status: 'deleted' })
    ]);

    res.json({ posts, total, page, limit });
  } catch (error) {
    next(error);
  }
};

/**
 * Get post by ID
 */
exports.getPostById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(req.headers['x-user-id']);
    const userType = req.headers['x-user-type'];

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check access permissions
    const isOwner = post.userId === userId;
    const isAdmin = ['admin', 'super_admin'].includes(userType);

    // Log for debugging
    logger.info(`getPostById: postId=${id}, postStatus=${post.status}, userId=${userId}, userType=${userType}, isOwner=${isOwner}, isAdmin=${isAdmin}`);

    // For unpublished posts: only owner can view (admin cannot view unpublished posts)
    if (post.status === 'unpublished' && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // For hidden posts: only owner can view (admin cannot view hidden posts)
    if (post.status === 'hidden' && !isOwner) {
      return res.status(403).json({ error: 'This post is hidden' });
    }

    // For banned posts: owner or admin can view
    if (post.status === 'banned' && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'This post has been banned' });
    }

    // For deleted posts: owner or admin can view
    if (post.status === 'deleted' && !isOwner && !isAdmin) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // For published posts: everyone can view (no restrictions)

    // Get user info
    const user = await userClient.getUserById(post.userId);

    // Get reply count including nested replies
    const topLevelReplies = await Reply.find({ postId: id, isActive: true });
    let replyCount = topLevelReplies.length;
    
    // Count nested replies recursively
    const countNested = (replies) => {
      if (!replies || !Array.isArray(replies)) return 0;
      let count = 0;
      replies.forEach(r => {
        if (r.isActive !== false) {
          count += 1;
          if (r.replies && Array.isArray(r.replies)) {
            count += countNested(r.replies);
          }
        }
      });
      return count;
    };
    
    for (const reply of topLevelReplies) {
      replyCount += countNested(reply.replies);
    }

    res.json({
      post: {
        ...post.toJSON(),
        replyCount,
        user: user ? {
          userId: user.user_id,
          firstName: user.first_name,
          lastName: user.last_name,
          profileImageUrl: user.profile_image_url
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's top posts by reply count
 */
exports.getUserTopPosts = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 3;

    const posts = await Post.find({ 
      userId: parseInt(userId), 
      status: 'published' 
    })
      .sort({ replyCount: -1 })
      .limit(limit);

    res.json({ posts });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new post
 */
exports.createPost = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = parseInt(req.headers['x-user-id']);
    const { title, content, status, images, attachments } = req.body;

    const post = new Post({
      userId,
      title,
      content,
      status: status || 'unpublished',
      images: images || [],
      attachments: attachments || []
    });

    await post.save();

    logger.info(`Post created: ${post._id} by user ${userId}`);

    res.status(201).json({
      message: 'Post created successfully',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a post
 */
exports.updatePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(req.headers['x-user-id']);
    const { title, content, images, attachments } = req.body;

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Only owner can update
    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Cannot update banned or deleted posts
    if (['banned', 'deleted'].includes(post.status)) {
      return res.status(403).json({ error: 'Cannot update this post' });
    }

    // Update fields
    if (title) post.title = title;
    if (content) post.content = content;
    if (images) post.images = images;
    if (attachments) post.attachments = attachments;
    post.dateModified = new Date();

    await post.save();

    res.json({
      message: 'Post updated successfully',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update post status (publish/hide)
 */
exports.updatePostStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(req.headers['x-user-id']);
    const { status } = req.body;

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status transition
    const allowedStatuses = ['unpublished', 'published', 'hidden'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (post.status === 'banned' || post.status === 'deleted') {
      return res.status(403).json({ error: 'Cannot change status of this post' });
    }

    post.status = status;
    await post.save();

    res.json({
      message: 'Post status updated',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle archive status
 */
exports.toggleArchive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(req.headers['x-user-id']);

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    post.isArchived = !post.isArchived;
    await post.save();

    res.json({
      message: post.isArchived ? 'Post archived' : 'Post unarchived',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Ban a post (Admin only)
 */
exports.banPost = async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'published') {
      return res.status(400).json({ error: 'Can only ban published posts' });
    }

    post.status = 'banned';
    await post.save();

    res.json({
      message: 'Post banned',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unban a post (Admin only)
 */
exports.unbanPost = async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'banned') {
      return res.status(400).json({ error: 'Post is not banned' });
    }

    post.status = 'published';
    await post.save();

    res.json({
      message: 'Post unbanned',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recover a deleted post (Admin only)
 */
exports.recoverPost = async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'deleted') {
      return res.status(400).json({ error: 'Post is not deleted' });
    }

    post.status = 'published';
    await post.save();

    res.json({
      message: 'Post recovered',
      post: post.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a post (soft delete)
 */
exports.deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(req.headers['x-user-id']);

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    post.status = 'deleted';
    await post.save();

    res.json({ message: 'Post deleted' });
  } catch (error) {
    next(error);
  }
};
