const Reply = require('../models/Reply');
const Post = require('../models/Post');
const userClient = require('../services/userClient');
const logger = require('../utils/logger');

// Helper: recursively count nested replies
const countNested = (replies) => {
  if (!replies || !Array.isArray(replies)) return 0;
  let c = 0;
  replies.forEach(r => {
    if (r.isActive !== false) {
      c += 1;
      if (r.replies && Array.isArray(r.replies)) c += countNested(r.replies);
    }
  });
  return c;
};

// GET /replies/post/:postId
exports.getRepliesByPost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const post = await Post.findOne({ postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const [replies, topLevelCount] = await Promise.all([
      Reply.find({ postId, isActive: true }).sort({ dateCreated: -1 }).skip(skip).limit(limit),
      Reply.countDocuments({ postId, isActive: true })
    ]);

    // total including nested
    let totalNested = 0;
    const allActive = await Reply.find({ postId, isActive: true });
    for (const r of allActive) totalNested += countNested(r.replies);
    const total = topLevelCount + totalNested;

    // enrich users (best-effort)
    const enriched = await Promise.all(replies.map(async (r) => {
      const user = await userClient.getUserById(r.userId).catch(() => null);
      return {
        ...r.toJSON(),
        user: user ? {
          userId: user.user_id || user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          profileImageUrl: user.profile_image_url
        } : null
      };
    }));

    res.json({ replies: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// POST /replies/post/:postId
exports.createReply = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.userId || req.headers['x-user-id'] || req.body.userId;
    const { comment, attachments } = req.body;

    if (!userId || !comment) return res.status(400).json({ error: 'Missing userId or comment' });

    const post = await Post.findOne({ postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'published' || post.isArchived) return res.status(403).json({ error: 'Cannot reply to this post' });

    const reply = new Reply({ userId: String(userId), postId, comment, attachments: attachments || [] });
    await reply.save();
    await Post.findOneAndUpdate({ postId }, { $inc: { replyCount: 1 } }).catch(()=>{});

    const user = await userClient.getUserById(userId).catch(() => null);

    res.status(201).json({ message: 'Reply created successfully', reply: { ...reply.toJSON(), user: user ? { userId: user.user_id || user.id, firstName: user.first_name } : null } });
  } catch (err) {
    next(err);
  }
};

// POST /replies/:replyId/sub
exports.createSubReply = async (req, res, next) => {
  try {
    const { replyId } = req.params;
    const userId = req.user?.userId || req.headers['x-user-id'] || req.body.userId;
    const { comment, attachments, parentReplyId, postId } = req.body;

    if (!userId || !comment) return res.status(400).json({ error: 'Missing userId or comment' });

    // Find top-level reply (may be nested)
    let top = null;
    if (parentReplyId) top = await Reply.findById(parentReplyId);
    if (!top) top = await Reply.findById(replyId);
    if (!top && postId) {
      const all = await Reply.find({ postId });
      for (const r of all) {
        if (r._id && r._id.toString() === replyId.toString()) { top = r; break; }
        // no deep search here for brevity
      }
    }
    if (!top) return res.status(404).json({ error: 'Reply not found' });

    // ensure parent post allows replies
    const post = await Post.findOne({ postId: top.postId });
    if (!post || post.status !== 'published' || post.isArchived) return res.status(403).json({ error: 'Cannot reply to this post' });

    const newSub = { userId: String(userId), comment, attachments: attachments || [], isActive: true, dateCreated: new Date(), replies: [] };

    if (!top.replies) top.replies = [];
    top.replies.push(newSub);
    await top.save();
    await Post.findOneAndUpdate({ postId: top.postId }, { $inc: { replyCount: 1 } }).catch(()=>{});

    logger.info(`Sub-reply created on ${replyId} by ${userId}`);
    res.status(201).json({ message: 'Sub-reply created successfully', reply: top.toJSON() });
  } catch (err) {
    next(err);
  }
};

// DELETE /replies/:parentReplyId/nested
exports.deleteNestedReply = async (req, res, next) => {
  try {
    const { parentReplyId } = req.params;
    const { targetPath } = req.body;
    const userId = req.user?.userId || req.headers['x-user-id'];
    const userType = req.user?.userType || req.headers['x-user-type'];

    if (!targetPath || !Array.isArray(targetPath) || targetPath.length === 0) return res.status(400).json({ error: 'Invalid target path' });

    const parent = await Reply.findById(parentReplyId);
    if (!parent) return res.status(404).json({ error: 'Parent reply not found' });

    const post = await Post.findOne({ postId: parent.postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    let current = parent;
    for (let i = 0; i < targetPath.length - 1; i++) {
      const idx = targetPath[i];
      if (current.replies && current.replies[idx]) current = current.replies[idx]; else return res.status(404).json({ error: 'Target reply not found' });
    }
    const targetIndex = targetPath[targetPath.length - 1];
    if (!current.replies || !current.replies[targetIndex]) return res.status(404).json({ error: 'Target reply not found' });

    const target = current.replies[targetIndex];
    const isReplyOwner = target.userId === userId;
    const isPostOwner = post.userId === userId;
    const isAdmin = ['admin', 'superadmin'].includes(userType);
    if (!isReplyOwner && !isPostOwner && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    current.replies[targetIndex].isActive = false;
    await parent.save();
    await Post.findOneAndUpdate({ postId: post.postId }, { $inc: { replyCount: -1 } }).catch(()=>{});

    logger.info(`Nested reply deleted at path ${targetPath.join('.')} by ${userId}`);
    res.json({ message: 'Reply deleted' });
  } catch (err) { next(err); }
};

// DELETE /replies/:id
exports.deleteReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || req.headers['x-user-id'];
    const userType = req.user?.userType || req.headers['x-user-type'];

    const reply = await Reply.findById(id);
    if (!reply) return res.status(404).json({ error: 'Reply not found' });

    const post = await Post.findOne({ postId: reply.postId });
    const isReplyOwner = reply.userId === userId;
    const isPostOwner = post && post.userId === userId;
    const isAdmin = ['admin', 'superadmin'].includes(userType);
    if (!isReplyOwner && !isPostOwner && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    reply.isActive = false;
    await reply.save();

    const nestedCount = countNested(reply.replies);
    await Post.findOneAndUpdate({ postId: reply.postId }, { $inc: { replyCount: -(1 + nestedCount) } }).catch(()=>{});

    logger.info(`Reply deleted: ${id} by user ${userId}`);
    res.json({ message: 'Reply deleted' });
  } catch (err) { next(err); }
};
