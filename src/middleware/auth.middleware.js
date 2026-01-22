const jwt = require('jsonwebtoken');
const Post = require('../models/Post');

/**
 * Middleware to validate JWT token from Authorization header
 * Extracts userId and userType from token payload
 */
const authenticateToken = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access token required',
          statusCode: 401,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Verify token
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);

    // Attach user info to request object
    req.user = {
      userId: decoded.userId || decoded.sub,
      userType: decoded.userType || decoded.type,
      email: decoded.email
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Token expired',
          statusCode: 401,
          timestamp: new Date().toISOString()
        }
      });
    }

    return res.status(403).json({
      success: false,
      error: {
        message: 'Invalid token',
        statusCode: 403,
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Check if user is admin
 */
const isAdmin = (req, res, next) => {
  const userType = req.user?.userType;
  if (userType === 'admin' || userType === 'superadmin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Admin access required',
        statusCode: 403,
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Check if user is the owner of the post or an admin
 * Used for update and delete operations
 */
const isOwnerOrAdmin = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const userId = req.user?.userId;
    const userType = req.user?.userType;

    // Admins can access any post
    if (userType === 'admin' || userType === 'superadmin') {
      return next();
    }

    // Find the post
    const post = await Post.findOne({ postId });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Post not found',
          statusCode: 404,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check if user is the owner
    if (post.userId === userId) {
      return next();
    }

    // User is neither owner nor admin
    return res.status(403).json({
      success: false,
      error: {
        message: 'You do not have permission to perform this action',
        statusCode: 403,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateToken,
  isAdmin,
  isOwnerOrAdmin
};