const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const customerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required']
  },
  email: {
    type: String,
    // Email is optional based on your frontend validation
  },
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required']
  },

  loyaltyCoins: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true // This will automatically add createdAt and updatedAt fields
});

// ✅ Index for email for better query performance (keep this one)
customerSchema.index({ email: 1 });
// ✅ Index for contactNumber (common lookup field)
customerSchema.index({ contactNumber: 1 });

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;