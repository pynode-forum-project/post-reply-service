const { body } = require('express-validator');

const validatePost = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title must not exceed 200 characters'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required'),
  body('status')
    .optional()
    .isIn(['unpublished', 'published'])
    .withMessage('Invalid status'),
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array')
];

const validatePostUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('content')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Content cannot be empty'),
  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array')
];

const validateReply = [
  body('comment')
    .trim()
    .notEmpty()
    .withMessage('Comment is required')
    .isLength({ max: 5000 })
    .withMessage('Comment must not exceed 5000 characters')
];

module.exports = {
  validatePost,
  validatePostUpdate,
  validateReply
};
