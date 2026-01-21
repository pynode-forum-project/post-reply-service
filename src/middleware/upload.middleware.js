const multer = require('multer');

// Configure multer for memory storage (files will be forwarded to file-service)
const storage = multer.memoryStorage();

// File filter for security - validate file types
const fileFilter = (req, file, cb) => {
  // Define allowed MIME types
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedAttachmentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'text/plain'
  ];

  const allAllowedTypes = [...allowedImageTypes, ...allowedAttachmentTypes];

  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

// Configure multer with limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
    files: 10 // Maximum 10 files per request
  }
});

// Middleware for handling post creation/update with files
const uploadPostFiles = upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'attachments', maxCount: 5 }
]);

// Error handling middleware for multer errors
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE || 10485760} bytes`,
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Too many files. Maximum is 10 files per request',
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Unexpected field in upload',
          statusCode: 400,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  if (err.message && err.message.includes('File type not allowed')) {
    return res.status(400).json({
      success: false,
      error: {
        message: err.message,
        statusCode: 400,
        timestamp: new Date().toISOString()
      }
    });
  }

  next(err);
};

module.exports = {
  uploadPostFiles,
  handleMulterError
};