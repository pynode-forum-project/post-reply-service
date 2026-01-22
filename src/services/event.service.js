const axios = require('axios');

const HISTORY_SERVICE_URL = process.env.HISTORY_SERVICE_URL || process.env.EVENT_BUS_URL || 'http://history-service:5005';
const REQUEST_TIMEOUT = 5000;

/**
 * Publish a simple event to history/event service via HTTP POST.
 * Best-effort: errors are thrown to caller who may log and continue.
 * @param {String} eventName
 * @param {Object} payload
 */
const publishEvent = async (eventName, payload) => {
  const event = {
    event: eventName,
    version: '1.0',
    payload,
    meta: {
      source: 'post-reply-service',
      timestamp: new Date().toISOString()
    }
  };

  const url = `${HISTORY_SERVICE_URL.replace(/\/$/, '')}/events`;
  try {
    await axios.post(url, event, { timeout: REQUEST_TIMEOUT });
  } catch (err) {
    // bubble up the error so callers can choose to ignore or log
    throw new Error(`Event publish failed: ${err.message}`);
  }
};

module.exports = { publishEvent };
