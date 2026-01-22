const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const mongoose = require('mongoose');
const Reply = require('../models/comment.model');

const POST_SERVICE_URL = process.env.POST_SERVICE_URL || process.env.POST_SERVICE_HOST || 'http://post-service:5002';

// Create a new comment/reply for a post
async function createComment(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });

    const { comment, parentReplyId: bodyParentReplyId, images, attachments, userFirstName, userLastName, userProfileImageURL } = req.body;
    // allow parent id from query as fallback (frontend may send parentId there)
    const parentReplyId = bodyParentReplyId || req.query.parentId || null;
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ success: false, error: { message: 'comment is required' } });
    }

    // user from JWT (injected by middleware)
    if (!req.user || !req.user.userId) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    // If parentReplyId provided, validate it exists and belongs to the same post
    if (parentReplyId) {
      const parent = await Reply.findOne({ replyId: parentReplyId }).lean();
      if (!parent) return res.status(400).json({ success: false, error: { message: 'parentReplyId does not exist' } });
      if (parent.postId !== postId) return res.status(400).json({ success: false, error: { message: 'parentReplyId does not belong to the same post' } });
      if (!parent.isActive || parent.isDeleted) return res.status(400).json({ success: false, error: { message: 'parent reply is not active' } });
    }

    const payload = {
      replyId: uuidv4(),
      userId: req.user.userId,
      postId,
      parentReplyId: parentReplyId || null,
      comment: comment.trim(),
      images: Array.isArray(images) ? images : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      userFirstName: userFirstName || undefined,
      userLastName: userLastName || undefined,
      userProfileImageURL: userProfileImageURL || undefined,
      isActive: true
    };

    // Try to perform creation + parent update in a transaction for atomicity
    let createdReply = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const r = new Reply(payload);
        await r.save({ session });
        createdReply = r;
        if (parentReplyId) {
          await Reply.updateOne({ replyId: parentReplyId }, { $push: { replies: r.replyId } }, { session });
        }
      });
      session.endSession();
      return res.status(201).json({ success: true, data: createdReply });
    } catch (txErr) {
      // Transaction may fail on non-replica-set dev envs. Fallback to best-effort.
      try {
        session.endSession();
      } catch (e) {}
      console.warn('Transaction failed for createComment, falling back to non-transactional save:', txErr.message);
      try {
        const r2 = new Reply(payload);
        await r2.save();
        if (parentReplyId) {
          try {
            await Reply.updateOne({ replyId: parentReplyId }, { $push: { replies: r2.replyId } });
          } catch (e) {
            console.warn('Failed to append to parent replies (fallback):', e.message);
          }
        }
        return res.status(201).json({ success: true, data: r2 });
      } catch (e) {
        return next(e);
      }
    }
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

    const reply = await Reply.findOne({ replyId });
    if (!reply) return res.status(404).json({ success: false, error: { message: 'Reply not found' } });

    // If already deleted, return OK
    if (reply.isDeleted) return res.status(200).json({ success: true, data: reply });

    const requesterId = req.user.userId;
    let allowed = false;
    if (reply.userId === requesterId) {
      allowed = true;
    } else if (req.user.userType && ['admin', 'superadmin'].includes(req.user.userType)) {
      // Admins allowed to delete
      allowed = true;
    } else {
      // fetch post to check owner
      try {
        const resp = await axios.get(`${POST_SERVICE_URL}/api/posts/${postId}`);
          // According to the API contract, GET /api/posts returns a post object containing `userId` as the owner.
          // We try common wrappers but prefer `userId`.
          const body = resp.data;
          const postPayload = body && (body.data || body.post || body);
          const postOwner = postPayload && (
            postPayload.userId ||
            postPayload.ownerId ||
            (postPayload.user && (postPayload.user.userId || postPayload.user.id))
          );
          if (postOwner && postOwner === requesterId) allowed = true;
      } catch (e) {
        console.warn('Unable to fetch post info for ownership check:', e.message);
      }
    }

    if (!allowed) return res.status(403).json({ success: false, error: { message: 'Forbidden: not allowed to delete this reply' } });

    // Perform soft-delete and remove reference from parent in a transaction if possible
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Reply.updateOne({ replyId }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: requesterId, isActive: false, comment: '[deleted]' } }, { session });
        if (reply.parentReplyId) {
          await Reply.updateOne({ replyId: reply.parentReplyId }, { $pull: { replies: replyId } }, { session });
        }
      });
      session.endSession();
      const updated = await Reply.findOne({ replyId });
      return res.status(200).json({ success: true, data: updated });
    } catch (txErr) {
      try { session.endSession(); } catch (e) {}
      console.warn('Transaction failed for deleteComment, falling back to non-transactional updates:', txErr.message);
      try {
        await Reply.updateOne({ replyId }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: requesterId, isActive: false, comment: '[deleted]' } });
        if (reply.parentReplyId) {
          try { await Reply.updateOne({ replyId: reply.parentReplyId }, { $pull: { replies: replyId } }); } catch (e) { console.warn('Failed to pull from parent replies (fallback):', e.message); }
        }
        const updated = await Reply.findOne({ replyId });
        return res.status(200).json({ success: true, data: updated });
      } catch (e) {
        next(e);
      }
    }
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createComment,
  deleteComment
};

// Return nested replies for a post assembled into a tree
async function getRepliesTree(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });
    // Use aggregation with $graphLookup to fetch roots and their descendants in one query
    // Then assemble nested trees per root in-memory (avoids N+1 queries)
    const rootsWithDesc = await Reply.aggregate([
      { $match: { postId: postId, isActive: true, parentReplyId: null } },
      { $sort: { createdAt: 1 } },
      {
        $graphLookup: {
          from: 'replies',
          startWith: '$replyId',
          connectFromField: 'replyId',
          connectToField: 'parentReplyId',
          as: 'descendants',
          depthField: 'depth'
        }
      }
    ]);

    // If no explicit roots found (all replies have parentReplyId), fallback to fetching all
    if (!rootsWithDesc || rootsWithDesc.length === 0) {
      const allDocs = await Reply.find({ postId, isActive: true }).lean();
      // Existing in-memory assembly fallback
      const map = Object.create(null);
      allDocs.forEach(d => { d.children = []; map[d.replyId] = d; });
      const roots = [];
      allDocs.forEach(d => {
        if (d.parentReplyId) {
          const p = map[d.parentReplyId];
          if (p) p.children.push(d);
          else roots.push(d);
        } else roots.push(d);
      });
      // sort recursively
      const sortRec = (nodes) => {
        nodes.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
        nodes.forEach(n => { if (n.children && n.children.length) sortRec(n.children); });
      };
      sortRec(roots);
      return res.status(200).json({ success: true, data: roots });
    }

    // Assemble trees: for each root, combine root + descendants, then link by parentReplyId
    const results = [];
    for (const root of rootsWithDesc) {
      // root contains fields from DB plus `descendants` array
      const items = [];
      // convert root to plain object
      const rootObj = Object.assign({}, root);
      delete rootObj.descendants; // we'll handle descendants separately
      items.push(rootObj);
      if (Array.isArray(root.descendants)) {
        for (const d of root.descendants) items.push(d);
      }

      // build map
      const map = Object.create(null);
      items.forEach(d => { d.children = []; map[d.replyId] = d; });

      let assembledRoot = map[rootObj.replyId] || null;
      // attach children
      items.forEach(d => {
        if (d.parentReplyId) {
          const parent = map[d.parentReplyId];
          if (parent) parent.children.push(d);
        }
      });

      if (assembledRoot) {
        // sort recursively
        const sortRec = (nodes) => {
          nodes.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
          nodes.forEach(n => { if (n.children && n.children.length) sortRec(n.children); });
        };
        sortRec([assembledRoot]);
        results.push(assembledRoot);
      }
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

// Export new function
module.exports.getRepliesTree = getRepliesTree;

// Return flat list of replies for a post (paginated)
async function listReplies(req, res, next) {
  try {
    const postId = req.params.id || req.query.postId;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required (path or query)' } });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const filter = { postId, isActive: true };
    const [total, items] = await Promise.all([
      Reply.countDocuments(filter),
      Reply.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
    ]);

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

// Return paginated top-level replies (parentReplyId == null) with children count
async function topLevelReplies(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const match = { postId, isActive: true, parentReplyId: null };
    const total = await Reply.countDocuments(match);

    const docs = await Reply.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'replies',
          let: { id: '$replyId' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$parentReplyId', '$$id'] }, { $eq: ['$isActive', true] } ] } } },
            { $count: 'count' }
          ],
          as: 'childCount'
        }
      },
      {
        $addFields: {
          replyCount: { $ifNull: [ { $arrayElemAt: ['$childCount.count', 0] }, 0 ] },
          hasChildren: { $gt: [ { $ifNull: [ { $arrayElemAt: ['$childCount.count', 0] }, 0 ] }, 0 ] }
        }
      },
      { $project: { childCount: 0, _id: 0, __v: 0 } }
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return res.status(200).json({
      success: true,
      data: {
        replies: docs,
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

    const filter = { postId, parentReplyId: parentId, isActive: true };
    const [total, items] = await Promise.all([
      Reply.countDocuments(filter),
      Reply.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).select('-_id -__v').lean()
    ]);

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

