const mongoose = require('mongoose');

// Sub-reply schema (supports nested replies)
const subReplySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  comment: {
    type: String,
    required: true
  },
  attachments: [{ type: String }],
  isActive: { type: Boolean, default: true },
  dateCreated: { type: Date, default: Date.now },
  replies: [{ type: mongoose.Schema.Types.Mixed }]
}, { _id: false });

const replySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  postId: { type: String, required: true, index: true },
  comment: { type: String, required: true },
  attachments: [{ type: String }],
  isActive: { type: Boolean, default: true },
  dateCreated: { type: Date, default: Date.now, index: true },
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

replySchema.index({ postId: 1, dateCreated: -1 });
replySchema.index({ postId: 1, isActive: 1 });

module.exports = mongoose.model('Reply', replySchema);
