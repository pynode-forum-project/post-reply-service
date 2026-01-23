const axios = require('axios');

// Prefer a container address by default when running in compose
const REPLY_SERVICE_URL = process.env.REPLY_SERVICE_URL || 'http://reply-service:5003';
const REQUEST_TIMEOUT = 5000; // 5 seconds

/**
 * Fetch replies for a specific post
 * Gracefully handles service being down
 * @param {String} postId - Post ID to fetch replies for
 * @returns {Promise<Array>} Array of replies or empty array if service unavailable
 */
const getRepliesForPost = async (postId) => {
  try {
    const response = await axios.get(`${REPLY_SERVICE_URL}/replies/post/${postId}`, {
      timeout: REQUEST_TIMEOUT
    });

    if (response.data && response.data.success) {
      return response.data.data.replies || [];
    }

    return [];
  } catch (error) {
    // Log error but don't throw - graceful degradation
    console.error(`Failed to fetch replies for post ${postId}:`, error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('Reply service is unavailable');
    }

    // Return empty array instead of throwing
    return [];
  }
};

module.exports = {
  getRepliesForPost
};