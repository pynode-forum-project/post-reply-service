const axios = require('axios');

const REPLY_SERVICE_URL = process.env.REPLY_SERVICE_URL || 'http://localhost:5003';
const REQUEST_TIMEOUT = 5000; // 5 seconds

/**
 * Fetch replies for a specific post.
 * Tries several candidate endpoints (backwards-compatible) and gracefully degrades.
 * @param {String} postId - Post ID to fetch replies for
 * @returns {Promise<Array>} Array of replies or empty array if service unavailable
 */
const getRepliesForPost = async (postId) => {
  const candidates = [
    `${REPLY_SERVICE_URL}/api/replies?postId=${postId}`,
    `${REPLY_SERVICE_URL}/posts/${postId}/replies`,
    `${REPLY_SERVICE_URL}/posts/${postId}/comments`,
    `${REPLY_SERVICE_URL}/replies/post/${postId}`,
    `${REPLY_SERVICE_URL}/api/posts/${postId}/replies`
  ];

  for (const url of candidates) {
    try {
      const response = await axios.get(url, { timeout: REQUEST_TIMEOUT });

      if (!response || !response.data) continue;

      // Support various shapes: { success: true, data: { replies: [...] } },
      // or direct array payload
      if (response.data.success && response.data.data) {
        const payload = response.data.data;
        if (Array.isArray(payload.replies)) return payload.replies;
        if (Array.isArray(payload)) return payload;
      }

      if (Array.isArray(response.data)) return response.data;

      // If the service returned a top-level `replies` field
      if (response.data.replies && Array.isArray(response.data.replies)) return response.data.replies;

    } catch (err) {
      // Try next candidate; only log at debug level to avoid noisy logs
      console.debug(`Reply fetch attempt failed for ${url}: ${err.message}`);
      // If it's a connection-level failure, keep trying other candidates
    }
  }

  // If none succeeded, return empty array (graceful degradation)
  return [];
};

module.exports = {
  getRepliesForPost
};