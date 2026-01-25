require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');

const postRoutes = require('./routes/postRoutes');
const replyRoutes = require('./routes/replyRoutes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(cors());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'post-reply-service' });
});

// Routes
app.use('/posts', postRoutes);
app.use('/replies', replyRoutes);

// Error handler
app.use(errorHandler);

// Connect to MongoDB and start server
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/post_db';

mongoose.connect(MONGODB_URI)
  .then(() => {
    logger.info('Connected to MongoDB');
    app.listen(PORT, () => {
      logger.info(`Post & Reply service running on port ${PORT}`);
    });
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
