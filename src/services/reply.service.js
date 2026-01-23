const Reply = require('../models/Reply');

/**
 * Fetch replies for a specific post from local DB.
 * Returns top-level replies including nested replies.
 * @param {String} postId
 */
const getRepliesForPost = async (postId) => {
  try {
    const replies = await Reply.find({ postId, isActive: true }).sort({ dateCreated: -1 }).lean();
    return replies || [];
  } catch (err) {
    console.error(`Failed to fetch replies for post ${postId}:`, err.message);
    return [];
  }
};

module.exports = { getRepliesForPost };