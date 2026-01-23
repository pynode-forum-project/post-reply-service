require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/database');
const postRoutes = require('./src/routes/post.routes');
const commentsRoutes = require('./src/routes/comments');
const { authenticateToken } = require('./src/middleware/auth.middleware');
const commentsController = require('./src/controllers/comments.controller');
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');

const app = express();
const PORT = process.env.PORT || 5002;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware (if needed for direct testing)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Post service is running',
    timestamp: new Date().toISOString(),
    service: 'post-service',
    version: '1.0.0'
  });
});

// Mount routes (no /posts prefix here - gateway handles that)
// Mount comments/replies under /replies to avoid conflicting with post-service's /posts prefix
app.use('/replies', commentsRoutes);
app.use('/', postRoutes);

// Expose a flat replies API for other services or clients: GET /api/replies?postId=...
app.get('/api/replies', authenticateToken, commentsController.listReplies);
// Expose batch counts: GET /api/replies/count?postIds=id1,id2
app.get('/api/replies/count', authenticateToken, commentsController.getReplyCounts);

// Legacy route compatibility: /replies/post/:postId
app.get('/replies/post/:postId', authenticateToken, (req, res, next) => {
  // map to listReplies which expects req.params.id or req.query.postId
  req.params.id = req.params.postId;
  return commentsController.listReplies(req, res, next);
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`
  ========================================
  Post Service is running
  ========================================
  Port: ${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  MongoDB: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/forum_posts'}
  Reply Service: ${process.env.REPLY_SERVICE_URL || 'http://localhost:5003'}
  File Service: ${process.env.FILE_SERVICE_URL || 'http://localhost:5004'}
  ========================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;