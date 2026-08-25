import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: false,
    default: null
  },
  vehicleId: {
    type: String,
    required: false,
    trim: true,
    default: 'UNASSIGNED'
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
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: false,
    default: null
  },
  routeId: {
    type: String,
    required: false,
    trim: true,
    default: 'UNASSIGNED'
  },
  weight: {
    type: Number, // in kg
    required: true
  },
  volume: {
    type: Number, // in m³ (occupied space)
    required: true
  },
  revenue: {
    type: Number, // in INR
    required: true
  },
  delayHours: {
    type: Number,
    default: 0
  },
  fromStop: {
    type: String,
    trim: true,
    default: ''
  },
  toStop: {
    type: String,
    trim: true,
    default: ''
  },
  cargoDescription: {
    type: String,
    trim: true,
    default: ''
  },
  invoiceNumber: {
    type: String,
    trim: true,
    default: ''
  },
  invoiceValue: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'In Transit', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  loadedAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index on vehicle and date for easy lookup of daily loads
bookingSchema.index({ vehicleId: 1, date: 1 });
// Compound index on route and date for demand forecasting query optimization
bookingSchema.index({ routeId: 1, date: 1 });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
