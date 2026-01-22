const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
  replyId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  postId: { type: String, required: true, index: true },
  parentReplyId: { type: String, default: null },
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
});

ReplySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
// `replyId` already has `index: true` on the field definition; avoid duplicate index declaration.
ReplySchema.index({ parentReplyId: 1 });
ReplySchema.index({ postId: 1, parentReplyId: 1 });

const Reply = mongoose.model('Reply', ReplySchema, 'replies');
module.exports = Reply;
