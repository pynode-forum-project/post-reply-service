const axios = require('axios');
const logger = require('../utils/logger');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:5001';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const userCache = new Map();

async function getUserById(userId) {
  try {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const res = await axios.get(`${USER_SERVICE_URL}/internal/users/${userId}`, { timeout: 5000 });
    if (res.status === 200) {
      userCache.set(userId, { data: res.data, timestamp: Date.now() });
      return res.data;
    }
    return null;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    logger.error(`Error fetching user ${userId}: ${err.message}`);
    return null;
  }
}

function clearUserCache(userId) { userCache.delete(userId); }
function clearAllCache() { userCache.clear(); }

module.exports = { getUserById, clearUserCache, clearAllCache };
