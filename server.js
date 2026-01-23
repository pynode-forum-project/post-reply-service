require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/database');
const postRoutes = require('./src/routes/post.routes');
const replyRoutes = require('./src/routes/reply.routes');
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');

const app = express();
const PORT = process.env.PORT || 5002;

// Connect to MongoDB and start server after connection
(async () => {
  await connectDB();

  // Start server only after DB connected
  app.listen(PORT, () => {
    console.log(`\n  ========================================\n  Post Service is running\n  ========================================\n  Port: ${PORT}\n  Environment: ${process.env.NODE_ENV || 'development'}\n  MongoDB: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/forum_posts'}\n  ========================================\n  `);
  });
})();

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

// Mount routes under both root and the gateway's rewritten prefix
// Gateway may proxy requests with a /api/posts prefix; support both.
// Mount post routes and reply routes
app.use('/', postRoutes);
app.use('/api/posts', postRoutes);
app.use('/replies', replyRoutes);
app.use('/api/replies', replyRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// (server started after DB connect above)

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