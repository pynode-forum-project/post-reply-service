const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['unpublished', 'published', 'hidden', 'banned', 'deleted'],
    default: 'unpublished',
    index: true
  },
  dateCreated: {
    type: Date,
    default: Date.now,
    index: true
  },
  dateModified: {
    type: Date,
    default: null
  },
  images: [{
    type: String
  }],
  attachments: [{
    type: String
  }],
  replyCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.postId = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for efficient querying
postSchema.index({ status: 1, dateCreated: -1 });
postSchema.index({ userId: 1, status: 1 });
postSchema.index({ title: 'text', content: 'text' });

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
