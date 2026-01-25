const Reply = require('../models/Reply');
const Post = require('../models/Post');
const { validationResult } = require('express-validator');
const userClient = require('../services/userClient');
const logger = require('../utils/logger');

/**
 * Recursively count all nested replies
 */
const countNestedReplies = (replies) => {
  if (!replies || !Array.isArray(replies)) return 0;
  let count = 0;
  replies.forEach(reply => {
    if (reply.isActive !== false) {
      count += 1;
      if (reply.replies && Array.isArray(reply.replies)) {
        count += countNestedReplies(reply.replies);
      }
    }
  });
  return count;
};

/**
 * Recursively find a reply by ID in nested structure
 */
const findReplyById = (reply, targetId) => {
  if (reply._id && reply._id.toString() === targetId.toString()) {
    return reply;
  }
  if (reply.replies && Array.isArray(reply.replies)) {
    for (const subReply of reply.replies) {
      const found = findReplyById(subReply, targetId);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Get replies for a post
 */
exports.getRepliesByPost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Check if post exists and is accessible
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const [replies, topLevelCount] = await Promise.all([
      Reply.find({ postId, isActive: true })
        .sort({ dateCreated: -1 })
        .skip(skip)
        .limit(limit),
      Reply.countDocuments({ postId, isActive: true })
    ]);

    // Recursively count all nested replies
    const countNestedReplies = (replies) => {
      if (!replies || !Array.isArray(replies)) return 0;
      let count = 0;
      replies.forEach(reply => {
        if (reply.isActive !== false) {
          count += 1;
          if (reply.replies && Array.isArray(reply.replies)) {
            count += countNestedReplies(reply.replies);
          }
        }
      });
      return count;
    };

    // Calculate total count including nested replies
    let totalNestedCount = 0;
    const allReplies = await Reply.find({ postId, isActive: true });
    for (const reply of allReplies) {
      totalNestedCount += countNestedReplies(reply.replies);
    }
    const total = topLevelCount + totalNestedCount;

    // Fetch user info for each reply
    const repliesWithUsers = await Promise.all(
      replies.map(async (reply) => {
        const user = await userClient.getUserById(reply.userId);
        
        // Recursively fetch user info for nested replies
        const processNestedReplies = async (nestedReplies) => {
          if (!nestedReplies || !Array.isArray(nestedReplies)) return [];
          return Promise.all(
            nestedReplies.filter(r => r.isActive !== false).map(async (subReply) => {
              const subUser = await userClient.getUserById(subReply.userId);
              // Recursively process nested replies
              const processedNested = await processNestedReplies(subReply.replies || []);
              
              // Handle both Mongoose documents and plain objects
              let subReplyData;
              if (subReply.toObject && typeof subReply.toObject === 'function') {
                subReplyData = subReply.toObject();
              } else if (typeof subReply === 'object' && subReply !== null) {
                subReplyData = { ...subReply };
              } else {
                subReplyData = {};
              }
              
              // Ensure dateCreated is properly formatted
              if (subReplyData.dateCreated) {
                if (subReplyData.dateCreated instanceof Date) {
                  // Already a Date object, keep it
                } else if (typeof subReplyData.dateCreated === 'string') {
                  // Convert string to Date
                  subReplyData.dateCreated = new Date(subReplyData.dateCreated);
                } else if (subReplyData.dateCreated.$date) {
                  // MongoDB extended JSON format
                  subReplyData.dateCreated = new Date(subReplyData.dateCreated.$date);
                }
              }
              
              return {
                ...subReplyData,
                replies: processedNested,
                user: subUser ? {
                  userId: subUser.user_id,
                  firstName: subUser.first_name,
                  lastName: subUser.last_name,
                  profileImageUrl: subUser.profile_image_url
                } : null
              };
            })
          );
        };
        
        const subRepliesWithUsers = await processNestedReplies(reply.replies || []);

        return {
          ...reply.toJSON(),
          replies: subRepliesWithUsers,
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
      replies: repliesWithUsers,
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
 * Create a reply to a post
 */
exports.createReply = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { postId } = req.params;
    const userId = parseInt(req.headers['x-user-id']);
    const { comment, attachments } = req.body;

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if post is published and not archived
    if (post.status !== 'published') {
      return res.status(403).json({ error: 'Cannot reply to this post' });
    }

    if (post.isArchived) {
      return res.status(403).json({ error: 'This post is archived and not accepting replies' });
    }

    const reply = new Reply({
      userId,
      postId,
      comment,
      attachments: attachments || []
    });

    await reply.save();

    // Update post reply count
    await Post.findByIdAndUpdate(postId, { $inc: { replyCount: 1 } });

    logger.info(`Reply created: ${reply._id} on post ${postId} by user ${userId}`);

    // Get user info
    const user = await userClient.getUserById(userId);

    res.status(201).json({
      message: 'Reply created successfully',
      reply: {
        ...reply.toJSON(),
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
 * Recursively find and update a reply in nested structure
 */
const findAndAddSubReply = (reply, targetId, newSubReply) => {
  // Check if this is the target reply (compare as strings to handle ObjectId)
  const replyIdStr = reply._id ? reply._id.toString() : (reply.id ? reply.id.toString() : null);
  const targetIdStr = targetId.toString();
  
  if (replyIdStr === targetIdStr) {
    if (!reply.replies) {
      reply.replies = [];
    }
    reply.replies.push(newSubReply);
    return true;
  }
  
  // Search in nested replies
  if (reply.replies && Array.isArray(reply.replies)) {
    for (const subReply of reply.replies) {
      if (findAndAddSubReply(subReply, targetId, newSubReply)) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Create a sub-reply (Bonus feature) - supports nested replies recursively
 * Supports replying to nested replies by using parentReplyId
 */
exports.createSubReply = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { replyId } = req.params;
    const userId = parseInt(req.headers['x-user-id']);
    const { comment, attachments, postId, parentReplyId, targetPath } = req.body;

    // Find the top-level reply that contains the target
    let topLevelReply = null;
    
    if (parentReplyId) {
      // If parentReplyId is provided, use it to find the top-level reply
      topLevelReply = await Reply.findById(parentReplyId);
    } else {
      // Otherwise, try to find by replyId directly
      topLevelReply = await Reply.findById(replyId);
    }

    // If still not found and postId is provided, search all replies
    if (!topLevelReply && postId) {
      const allReplies = await Reply.find({ postId, isActive: true });
      for (const r of allReplies) {
        // Check if this reply contains the target (by ID or by path)
        if (r._id && r._id.toString() === replyId.toString()) {
          topLevelReply = r;
          break;
        }
        // Also check nested replies
        const found = findReplyById(r, replyId);
        if (found) {
          topLevelReply = r;
          break;
        }
      }
    }

    if (!topLevelReply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    // Get postId from the reply if not provided
    const actualPostId = postId || topLevelReply.postId;

    // Check if parent post is accessible
    const post = await Post.findById(actualPostId);
    if (!post || post.status !== 'published' || post.isArchived) {
      return res.status(403).json({ error: 'Cannot reply to this post' });
    }

    // Create new sub-reply
    const newSubReply = {
      userId,
      comment,
      attachments: attachments || [],
      isActive: true,
      dateCreated: new Date(),
      replies: [] // Initialize empty replies array for further nesting
    };

    // If targetPath is provided, use it to navigate to the target
    if (targetPath && Array.isArray(targetPath) && targetPath.length > 0) {
      let current = topLevelReply;
      for (let i = 0; i < targetPath.length - 1; i++) {
        const index = targetPath[i];
        if (current.replies && current.replies[index]) {
          current = current.replies[index];
        } else {
          return res.status(404).json({ error: 'Invalid target path' });
        }
      }
      if (!current.replies) {
        current.replies = [];
      }
      current.replies.push(newSubReply);
    } else {
      // Otherwise, use replyId to find the target
      // If replyId matches the top-level reply, add directly
      if (topLevelReply._id && topLevelReply._id.toString() === replyId.toString()) {
        if (!topLevelReply.replies) {
          topLevelReply.replies = [];
        }
        topLevelReply.replies.push(newSubReply);
      } else {
        // Otherwise, search recursively in nested replies
        const added = findAndAddSubReply(topLevelReply, replyId, newSubReply);
        if (!added) {
          return res.status(404).json({ error: 'Target reply not found in nested structure' });
        }
      }
    }

    await topLevelReply.save();

    // Update post reply count (includes nested replies)
    await Post.findByIdAndUpdate(actualPostId, { $inc: { replyCount: 1 } });

    logger.info(`Sub-reply created on reply ${replyId} by user ${userId}`);

    res.status(201).json({
      message: 'Sub-reply created successfully',
      reply: topLevelReply.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a nested reply (soft delete)
 */
exports.deleteNestedReply = async (req, res, next) => {
  try {
    const { parentReplyId } = req.params;
    const { targetPath } = req.body;
    const userId = parseInt(req.headers['x-user-id']);
    const userType = req.headers['x-user-type'];

    if (!targetPath || !Array.isArray(targetPath) || targetPath.length === 0) {
      return res.status(400).json({ error: 'Invalid target path' });
    }

    // Find the parent reply
    const parentReply = await Reply.findById(parentReplyId);
    if (!parentReply) {
      return res.status(404).json({ error: 'Parent reply not found' });
    }

    // Get the parent post
    const post = await Post.findById(parentReply.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Navigate to the target nested reply using the path
    let current = parentReply;
    for (let i = 0; i < targetPath.length - 1; i++) {
      const index = targetPath[i];
      if (current.replies && current.replies[index]) {
        current = current.replies[index];
      } else {
        return res.status(404).json({ error: 'Target reply not found' });
      }
    }

    // Get the target nested reply
    const targetIndex = targetPath[targetPath.length - 1];
    if (!current.replies || !current.replies[targetIndex]) {
      return res.status(404).json({ error: 'Target reply not found' });
    }

    const targetReply = current.replies[targetIndex];

    // Check permissions: reply owner, post owner, or admin can delete
    const isReplyOwner = targetReply.userId === userId;
    const isPostOwner = post.userId === userId;
    const isAdmin = ['admin', 'super_admin'].includes(userType);

    if (!isReplyOwner && !isPostOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Soft delete the nested reply
    current.replies[targetIndex].isActive = false;

    await parentReply.save();

    // Update post reply count
    await Post.findByIdAndUpdate(post._id, { $inc: { replyCount: -1 } });

    logger.info(`Nested reply deleted at path ${targetPath.join('.')} by user ${userId}`);

    res.json({ message: 'Reply deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a reply (soft delete)
 */
exports.deleteReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(req.headers['x-user-id']);
    const userType = req.headers['x-user-type'];

    const reply = await Reply.findById(id);
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    // Get the parent post
    const post = await Post.findById(reply.postId);

    // Check permissions: reply owner, post owner, or admin can delete
    const isReplyOwner = reply.userId === userId;
    const isPostOwner = post && post.userId === userId;
    const isAdmin = ['admin', 'super_admin'].includes(userType);

    if (!isReplyOwner && !isPostOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    reply.isActive = false;
    await reply.save();

    // Update post reply count (need to count nested replies too)
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
    const nestedCount = countNested(reply.replies);
    await Post.findByIdAndUpdate(reply.postId, { $inc: { replyCount: -(1 + nestedCount) } });

    logger.info(`Reply deleted: ${id} by user ${userId}`);

    res.json({ message: 'Reply deleted' });
  } catch (error) {
    next(error);
  }
};
