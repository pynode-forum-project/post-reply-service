const mongoose = require('mongoose');

// Sub-reply schema (for bonus feature) - supports nested replies recursively
const subReplySchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true
  },
  comment: {
    type: String,
    required: true
  },
  attachments: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  dateCreated: {
    type: Date,
    default: Date.now
  },
  // Support nested replies recursively - reference itself
  replies: [{
    type: mongoose.Schema.Types.Mixed
  }]
}, { _id: false });

const replySchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
  comment: {
    type: String,
    required: true
  },
  attachments: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  dateCreated: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Bonus: Nested replies
  replies: [subReplySchema]
}, {
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.replyId = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
replySchema.index({ postId: 1, dateCreated: -1 });
replySchema.index({ postId: 1, isActive: 1 });

const Reply = mongoose.model('Reply', replySchema);

module.exports = Reply;
