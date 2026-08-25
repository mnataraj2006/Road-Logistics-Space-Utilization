import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  customerType: {
    type: String,
    required: true,
    enum: ['Enterprise', 'SMB', 'Individual'],
    default: 'SMB'
  },
  bookingFrequency: {
    type: Number, // expected bookings per week
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
