const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  postId: {
    type: String,
    required: true,
    index: true
  },
  viewDate: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.historyId = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Compound index for efficient querying
historySchema.index({ userId: 1, viewDate: -1 });
historySchema.index({ userId: 1, postId: 1 });

const History = mongoose.model('History', historySchema);

module.exports = History;
