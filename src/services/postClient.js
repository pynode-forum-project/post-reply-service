const axios = require('axios');
const logger = require('../utils/logger');

const POST_SERVICE_URL = process.env.POST_SERVICE_URL || 'http://localhost:5002';

/**
 * Get post by ID from Post Service
 */
async function getPostById(postId) {
  try {
    const response = await axios.get(`${POST_SERVICE_URL}/posts/${postId}`, {
      timeout: 5000,
      headers: {
        'X-User-Type': 'service'
      }
    });

    if (response.status === 200) {
      return response.data.post || response.data;
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    logger.error(`Error fetching post ${postId}: ${error.message}`);
    return null;
  }
}

module.exports = {
  getPostById
};
