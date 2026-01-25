const axios = require('axios');
const logger = require('../utils/logger');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:5001';

// Cache for user data (simple in-memory cache)
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get user by ID from User Service
 */
async function getUserById(userId) {
  try {
    // Check cache first
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const response = await axios.get(`${USER_SERVICE_URL}/internal/users/${userId}`, {
      timeout: 5000
    });

    if (response.status === 200) {
      // Cache the result
      userCache.set(userId, {
        data: response.data,
        timestamp: Date.now()
      });
      return response.data;
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    logger.error(`Error fetching user ${userId}: ${error.message}`);
    return null;
  }
}

/**
 * Clear user from cache
 */
function clearUserCache(userId) {
  userCache.delete(userId);
}

/**
 * Clear all cached users
 */
function clearAllCache() {
  userCache.clear();
}

module.exports = {
  getUserById,
  clearUserCache,
  clearAllCache
};
