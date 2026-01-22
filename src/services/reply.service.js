const axios = require('axios');

const REPLY_SERVICE_URL = process.env.REPLY_SERVICE_URL || 'http://localhost:5003';
const REQUEST_TIMEOUT = 5000; // 5 seconds

/**
 * Fetch replies for a specific post using the unified API.
 * @param {String} postId
 * @returns {Promise<Array>} replies or empty array
 */
const getRepliesForPost = async (postId) => {
  try {
    const url = `${REPLY_SERVICE_URL}/api/replies?postId=${encodeURIComponent(postId)}`;
    const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });
    if (!response || !response.data) return [];
    if (response.data.success && response.data.data && Array.isArray(response.data.data.replies)) return response.data.data.replies;
    if (Array.isArray(response.data)) return response.data;
    if (response.data.replies && Array.isArray(response.data.replies)) return response.data.replies;
    return [];
  } catch (err) {
    console.debug(`Failed to fetch replies from ${REPLY_SERVICE_URL}: ${err.message}`);
    return [];
  }
};

/**
 * Fetch reply counts for multiple posts in a single call.
 * Expects the reply service to expose: GET /api/replies/count?postIds=csv
 * Returns an object mapping postId -> count (0 if missing).
 * @param {Array<String>} postIds
 */
const getReplyCountsForPosts = async (postIds) => {
  if (!Array.isArray(postIds) || postIds.length === 0) return {};
  try {
    const csv = postIds.map(encodeURIComponent).join(',');
    const url = `${REPLY_SERVICE_URL}/api/replies/count?postIds=${csv}`;
    const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });
    if (!response || !response.data) return {};
    // Support { success: true, data: { counts: { postId: count } } }
    if (response.data.success && response.data.data && response.data.data.counts) return response.data.data.counts;
    // Or direct payload { postId: count }
    if (response.data.counts) return response.data.counts;
    if (typeof response.data === 'object') return response.data;
    return {};
  } catch (err) {
    console.debug(`Failed to fetch reply counts from ${REPLY_SERVICE_URL}: ${err.message}`);
    // Graceful degradation: return zeros for requested posts
    const fallback = {};
    postIds.forEach((pid) => { fallback[pid] = 0; });
    return fallback;
  }
};

module.exports = {
  getRepliesForPost,
  getReplyCountsForPosts
};