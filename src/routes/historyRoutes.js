const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

// Record a view
router.post('/', historyController.recordView);

// Get user's history
router.get('/:userId/history', historyController.getUserHistory);

// Search user's history (Bonus)
router.get('/:userId/history/search', historyController.searchHistory);

module.exports = router;
