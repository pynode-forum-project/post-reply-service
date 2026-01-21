const mongoose = require('mongoose');
const crypto = require('crypto');

const postSchema = new mongoose.Schema({
  postId: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomUUID()
  },
  userId: {
    type: String,
    required: true,
    index: true  // For efficient queries by user
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true  // For filtering archived posts
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: [10000, 'Content cannot exceed 10000 characters']
  },
  images: [{
    type: String,  // URLs or file paths
    trim: true
  }],
  attachments: [{
    type: String,  // URLs or file paths
    trim: true
  }],
  dateCreated: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true  // For sorting by date
  },
  dateModified: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,  // We manage dates manually
  collection: 'posts'
});

// Update dateModified before save (only for updates, not new documents)
postSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.dateModified = new Date();
  }
  next();
});

// Compound index for pagination and filtering
postSchema.index({ isArchived: 1, dateCreated: -1 });

// Transform output to exclude MongoDB internal fields
postSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Post', postSchema);