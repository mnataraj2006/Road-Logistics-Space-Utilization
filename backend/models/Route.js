import mongoose from 'mongoose';

const stopDetailsSchema = new mongoose.Schema({
  stopId: { type: String, required: true },
  sequenceNumber: { type: Number, required: true },
  locationName: { type: String, required: true },
  qrToken: { type: String, required: true },
  stopType: {
    type: String,
    enum: ['ORIGIN', 'PICKUP', 'DELIVERY', 'PICKUP_AND_DELIVERY', 'INTERMEDIATE', 'FINAL_DESTINATION'],
    default: 'INTERMEDIATE'
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Ready', 'Verified', 'Processing', 'Completed'],
    default: 'Upcoming'
  },
  plannedArrival: { type: Date },
  actualArrival: { type: Date },
  completedAt: { type: Date }
});

const routeSchema = new mongoose.Schema({
  routeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  distance: {
    type: Number, // in kilometers (km)
    required: true
  },
  baseRate: {
    type: Number, // price per cubic meter (INR/m³)
    required: true
  },
  stops: {
    type: [String],
    default: []
  },
  stopsDetails: {
    type: [stopDetailsSchema],
    default: []
  },
  currentStopIndex: {
    type: Number,
    default: 0
  },
  carrierId: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Route = mongoose.model('Route', routeSchema);
export default Route;
