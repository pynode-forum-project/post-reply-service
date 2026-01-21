/**
 * Handle 404 Not Found errors
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.originalUrl} not found`,
      statusCode: 404,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        details: Object.values(err.errors).map(e => e.message),
        statusCode: 400,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Mongoose cast error (invalid ObjectId or type)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid data format',
        statusCode: 400,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: {
        message: 'Duplicate entry found',
        statusCode: 409,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal server error',
      statusCode,
      timestamp: new Date().toISOString()
    }
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};