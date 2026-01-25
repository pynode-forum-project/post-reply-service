const History = require('../models/History');
const postClient = require('../services/postClient');
const logger = require('../utils/logger');

/**
 * Record a post view
 */
exports.recordView = async (req, res, next) => {
  try {
    const userId = parseInt(req.headers['x-user-id']);
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    // Check if there's a recent view (within last minute) to avoid duplicates
    const recentView = await History.findOne({
      userId,
      postId,
      viewDate: { $gte: new Date(Date.now() - 60000) }
    });

    if (recentView) {
      // Update the view date instead of creating new record
      recentView.viewDate = new Date();
      await recentView.save();
      return res.json({ message: 'View updated', history: recentView.toJSON() });
    }

    const history = new History({
      userId,
      postId,
      viewDate: new Date()
    });

    await history.save();

    logger.info(`View recorded: user ${userId} viewed post ${postId}`);

    res.status(201).json({
      message: 'View recorded',
      history: history.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's view history
 */
exports.getUserHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = parseInt(req.headers['x-user-id']);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Users can only view their own history
    if (parseInt(userId) !== currentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch histories with pagination
    const [histories, total] = await Promise.all([
      History.find({ userId: parseInt(userId) })
        .sort({ viewDate: -1 })
        .skip(skip)
        .limit(limit),
      History.countDocuments({ userId: parseInt(userId) })
    ]);

    // Fetch post details for each history entry
    const historiesWithPosts = await Promise.all(
      histories.map(async (history) => {
        const post = await postClient.getPostById(history.postId);
        return {
          ...history.toJSON(),
          post: post ? {
            postId: post.postId || post._id,
            title: post.title,
            status: post.status,
            dateCreated: post.dateCreated
          } : null
        };
      })
    );

    // Filter out histories where post is not available (deleted/hidden)
    const filteredHistories = historiesWithPosts.filter(
      h => h.post && h.post.status === 'published'
    );

    res.json({
      histories: filteredHistories,
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
 * Search user's history (Bonus feature)
 */
exports.searchHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = parseInt(req.headers['x-user-id']);
    const { keyword, date } = req.query;

    if (parseInt(userId) !== currentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all history for user, sorted by viewDate descending (most recent first)
    const histories = await History.find({ userId: parseInt(userId) })
      .sort({ viewDate: -1 });

    // Fetch posts and filter
    const results = [];
    
    for (const history of histories) {
      const post = await postClient.getPostById(history.postId);
      
      // Only include published posts
      if (!post || post.status !== 'published') continue;

      // Filter by date if specified (check viewDate)
      if (date) {
        const viewDate = new Date(history.viewDate).toISOString().split('T')[0];
        if (viewDate !== date) continue;
      }

      // Filter by keyword if specified (search in title and content)
      if (keyword) {
        const searchKeyword = keyword.toLowerCase();
        const titleMatch = post.title && post.title.toLowerCase().includes(searchKeyword);
        const contentMatch = post.content && post.content.toLowerCase().includes(searchKeyword);
        if (!titleMatch && !contentMatch) continue;
      }

      results.push({
        ...history.toJSON(),
        post: {
          postId: post.postId || post._id,
          title: post.title,
          status: post.status,
          dateCreated: post.dateCreated
        }
      });
    }

    // Results are already sorted by viewDate descending from the query
    res.json({ histories: results });
  } catch (error) {
    next(error);
  }
};
