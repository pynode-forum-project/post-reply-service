const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const eventService = require('../services/event.service');

const POST_SERVICE_URL = process.env.POST_SERVICE_URL || process.env.POST_SERVICE_HOST || 'http://post-service:5002';

// Create a new comment/reply for a post
async function createComment(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });

    const { comment, parentReplyId: bodyParentReplyId, images, attachments, userFirstName, userLastName, userProfileImageURL } = req.body;
    const parentReplyId = bodyParentReplyId || req.query.parentId || null;
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ success: false, error: { message: 'comment is required' } });
    }

    if (!req.user || !req.user.userId) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    // Load post
    const post = await Post.findOne({ postId });
    if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });

    // If parentReplyId provided, validate it exists within the post
    if (parentReplyId) {
      const parent = post.replies.find(r => r.replyId === parentReplyId);
      if (!parent) return res.status(400).json({ success: false, error: { message: 'parentReplyId does not exist on this post' } });
      if (!parent.isActive || parent.isDeleted) return res.status(400).json({ success: false, error: { message: 'parent reply is not active' } });
    }

    const newReply = {
      replyId: uuidv4(),
      userId: req.user.userId,
      parentReplyId: parentReplyId || null,
      comment: comment.trim(),
      images: Array.isArray(images) ? images : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      userFirstName: userFirstName || undefined,
      userLastName: userLastName || undefined,
      userProfileImageURL: userProfileImageURL || undefined,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      replies: []
    };

    // Append reply and update parent (if any) then save post
    post.replies.push(newReply);
    if (parentReplyId) {
      const parent = post.replies.find(r => r.replyId === parentReplyId);
      if (parent) parent.replies.push(newReply.replyId);
    }

    await post.save();

    try {
      await eventService.publishEvent('reply.created', {
        replyId: newReply.replyId,
        postId: postId,
        userId: newReply.userId,
        createdAt: newReply.createdAt
      });
    } catch (e) { console.debug('Event publish failed:', e.message); }

    return res.status(201).json({ success: true, data: newReply });
  } catch (err) {
    next(err);
  }
}

// Soft-delete a reply: allowed if requester is reply author or post owner
async function deleteComment(req, res, next) {
  try {
    const postId = req.params.postId || req.params.id;
    const replyId = req.params.replyId;
    if (!postId || !replyId) return res.status(400).json({ success: false, error: { message: 'postId and replyId are required in path' } });

    if (!req.user || !req.user.userId) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const post = await Post.findOne({ postId });
    if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });

    const reply = post.replies.find(r => r.replyId === replyId);
    if (!reply) return res.status(404).json({ success: false, error: { message: 'Reply not found' } });

    if (reply.isDeleted) return res.status(200).json({ success: true, data: reply });

    const requesterId = req.user.userId;
    let allowed = false;
    if (reply.userId === requesterId) allowed = true;
    else if (req.user.userType && ['admin', 'superadmin'].includes(req.user.userType)) allowed = true;
    else {
      // fetch post owner from post service as fallback
      try {
        const resp = await axios.get(`${POST_SERVICE_URL}/api/posts/${postId}`);
        const body = resp.data;
        const postPayload = body && (body.data || body.post || body);
        const postOwner = postPayload && (
          postPayload.userId || postPayload.ownerId || (postPayload.user && (postPayload.user.userId || postPayload.user.id))
        );
        if (postOwner && postOwner === requesterId) allowed = true;
      } catch (e) {
        console.warn('Unable to fetch post info for ownership check:', e.message);
      }
    }

    if (!allowed) return res.status(403).json({ success: false, error: { message: 'Forbidden: not allowed to delete this reply' } });

    // Soft-delete reply and remove reference from parent
    reply.isDeleted = true;
    reply.deletedAt = new Date();
    reply.deletedBy = requesterId;
    reply.isActive = false;
    reply.comment = '[deleted]';

    if (reply.parentReplyId) {
      const parent = post.replies.find(r => r.replyId === reply.parentReplyId);
      if (parent) parent.replies = parent.replies.filter(id => id !== replyId);
    }

    await post.save();
    return res.status(200).json({ success: true, data: reply });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createComment,
  deleteComment
};



// Export new function
// Return nested replies for a post assembled into a tree (from embedded array)
async function getRepliesTree(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });
    const post = await Post.findOne({ postId }).lean();
    if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });

    const all = (post.replies || []).filter(r => r.isActive && !r.isDeleted).map(r => ({ ...r }));
    const map = Object.create(null);
    all.forEach(d => { d.children = []; map[d.replyId] = d; });
    const roots = [];
    all.forEach(d => {
      if (d.parentReplyId) {
        const p = map[d.parentReplyId];
        if (p) p.children.push(d);
        else roots.push(d);
      } else roots.push(d);
    });

    const sortRec = (nodes) => {
      nodes.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
      nodes.forEach(n => { if (n.children && n.children.length) sortRec(n.children); });
    };
    sortRec(roots);
    return res.status(200).json({ success: true, data: roots });
  } catch (err) {
    next(err);
  }
}

module.exports.getRepliesTree = getRepliesTree;

// Return flat list of replies for a post (paginated)
async function listReplies(req, res, next) {
  try {
    const postId = req.params.id || req.query.postId;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required (path or query)' } });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const post = await Post.findOne({ postId }).lean();
    if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });

    const itemsAll = (post.replies || []).filter(r => r.isActive && !r.isDeleted).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = itemsAll.length;
    const items = itemsAll.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        replies: items,
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports.listReplies = listReplies;

// GET /api/replies/count?postIds=comma,separated,list
async function getReplyCounts(req, res, next) {
  try {
    const postIdsParam = req.query.postIds || req.query.postId;
    if (!postIdsParam) return res.status(400).json({ success: false, error: { message: 'postIds query parameter is required' } });
    const postIds = String(postIdsParam).split(',').map(s => s.trim()).filter(Boolean);
    if (postIds.length === 0) return res.status(400).json({ success: false, error: { message: 'postIds must contain at least one id' } });

    const posts = await Post.find({ postId: { $in: postIds } }).select('postId replies').lean();
    const counts = {};
    postIds.forEach(pid => { counts[pid] = 0; });
    posts.forEach(p => {
      const c = (p.replies || []).filter(r => r.isActive && !r.isDeleted).length;
      counts[p.postId] = c;
    });

    return res.status(200).json({ success: true, data: { counts }, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

module.exports.getReplyCounts = getReplyCounts;

// Return paginated top-level replies (parentReplyId == null) with children count
async function topLevelReplies(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const post = await Post.findOne({ postId }).lean();
    if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });

    const top = (post.replies || []).filter(r => r.parentReplyId == null && r.isActive && !r.isDeleted).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = top.length;
    const pageItems = top.slice(skip, skip + limit).map(t => {
      const childCount = (post.replies || []).filter(r => r.parentReplyId === t.replyId && r.isActive && !r.isDeleted).length;
      return Object.assign({}, t, { replyCount: childCount, hasChildren: childCount > 0 });
    });

    const totalPages = Math.ceil(total / limit) || 1;
    return res.status(200).json({
      success: true,
      data: {
        replies: pageItems,
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports.topLevelReplies = topLevelReplies;

// Return direct children of a parent reply (paginated)
async function listChildren(req, res, next) {
  try {
    const postId = req.params.id;
    const parentId = req.query.parentId;
    if (!postId || !parentId) return res.status(400).json({ success: false, error: { message: 'postId and parentId are required' } });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const post = await Post.findOne({ postId }).lean();
    if (!post) return res.status(404).json({ success: false, error: { message: 'Post not found' } });

    const itemsAll = (post.replies || []).filter(r => r.parentReplyId === parentId && r.isActive && !r.isDeleted).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    const total = itemsAll.length;
    const items = itemsAll.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        replies: items,
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports.listChildren = listChildren;

