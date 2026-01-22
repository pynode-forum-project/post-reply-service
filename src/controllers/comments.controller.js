const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Reply = require('../models/comment.model');

const POST_SERVICE_URL = process.env.POST_SERVICE_URL || process.env.POST_SERVICE_HOST || 'http://post-service:5002';

// Create a new comment/reply for a post
async function createComment(req, res, next) {
  try {
    const postId = req.params.id;
    if (!postId) return res.status(400).json({ success: false, error: { message: 'postId is required in path' } });

    const { comment, parentReplyId, images, attachments, userFirstName, userLastName, userProfileImageURL } = req.body;
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ success: false, error: { message: 'comment is required' } });
    }

    // user from JWT (injected by middleware)
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const newReply = new Reply({
      replyId: uuidv4(),
      userId: req.user.id,
      postId,
      parentReplyId: parentReplyId || null,
      comment: comment.trim(),
      images: Array.isArray(images) ? images : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      userFirstName: userFirstName || undefined,
      userLastName: userLastName || undefined,
      userProfileImageURL: userProfileImageURL || undefined,
      isActive: true
    });

    await newReply.save();

    // If parentReplyId is provided, push this replyId into parent's replies array (simple nesting)
    if (parentReplyId) {
      try {
        await Reply.updateOne({ replyId: parentReplyId }, { $push: { replies: newReply.replyId } });
      } catch (e) {
        // non-fatal - parent may not exist
        console.warn('Failed to append to parent replies', e.message);
      }
    }

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

    if (!req.user || !req.user.id) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    const reply = await Reply.findOne({ replyId });
    if (!reply) return res.status(404).json({ success: false, error: { message: 'Reply not found' } });

    // If already deleted, return OK
    if (reply.isDeleted) return res.status(200).json({ success: true, data: reply });

    const requesterId = req.user.id;
    let allowed = false;

    if (reply.userId === requesterId) {
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

    await Reply.updateOne({ replyId }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: requesterId, isActive: false, comment: '[deleted]' } });
    const updated = await Reply.findOne({ replyId });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createComment,
  deleteComment
};

