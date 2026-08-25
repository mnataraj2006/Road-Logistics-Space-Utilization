import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  bookingId: {
    type: String,
    required: true,
    trim: true
  },
  shipper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  shipperId: {
    type: String,
    required: true,
    trim: true
  },
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  carrierId: {
    type: String,
    required: false,
    trim: true,
    default: 'UNASSIGNED'
  },
  amount: {
    type: Number, // total price paid by shipper in INR
    required: true
  },
  platformFee: {
    type: Number, // commission fee (e.g. 5%)
    required: true
  },
  carrierPayout: {
    type: Number, // carrier payout (e.g. 95%)
    required: true
  },
  status: {
    type: String,
    enum: ['Escrow', 'PaidOut', 'Refunded'],
    default: 'Escrow'
  },
  transactionId: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
