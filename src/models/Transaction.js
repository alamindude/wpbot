const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user_number: {
      type: String,
      required: true,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['credit', 'debit', 'refund'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balance_before: Number,
    balance_after: Number,
    description: String,
    order_id: String,
    performed_by: String, // admin who performed the action
  },
  { timestamps: true }
);

transactionSchema.index({ user_number: 1 });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
