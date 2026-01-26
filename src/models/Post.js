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
  status: {
    type: String,
    enum: ['unpublished', 'published', 'hidden', 'banned', 'deleted'],
    default: 'published',
    index: true,
    required: true
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true  // For filtering archived posts (deprecated, kept for migration)
  },
  title: {
    type: String,
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
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
  repliesDisabled: {
    type: Boolean,
    default: false
  },
  // Embedded replies (subdocuments). Kept small because replies per-post expected to be low.
  replies: [{
    replyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    parentReplyId: { type: String, default: null, index: true },
    comment: { type: String, required: true },
    images: { type: [String], default: [] },
    attachments: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    userFirstName: { type: String },
    userLastName: { type: String },
    userProfileImageURL: { type: String },
    replies: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null }
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
  },
  dateDeleted: Date,
  dateBanned: Date,
  bannedBy: String,  // Admin userId
  bannedReason: String
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

// Compound indexes for pagination and filtering
postSchema.index({ status: 1, dateCreated: -1 });
postSchema.index({ userId: 1, status: 1, dateCreated: -1 });
postSchema.index({ isArchived: 1, dateCreated: -1 });  // Keep for backwards compatibility

// Transform output to exclude MongoDB internal fields
postSchema.set('toJSON', {
  transform: function(doc, ret) {
    // keep DB internal fields out
    delete ret._id;
    delete ret.__v;
    // provide common API aliases to match typical createdAt/updatedAt naming
    if (ret.dateCreated && !ret.createdAt) ret.createdAt = ret.dateCreated;
    if (ret.dateModified && !ret.updatedAt) ret.updatedAt = ret.dateModified;
    if (ret.dateDeleted && !ret.deletedAt) ret.deletedAt = ret.dateDeleted;
    return ret;
  }
});

module.exports = mongoose.model('Post', postSchema);