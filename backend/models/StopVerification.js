import mongoose from 'mongoose';

const packageOperationSchema = new mongoose.Schema({
  bookingId: { type: String, required: true },
  volume: { type: Number, required: true },
  weight: { type: Number, required: true },
  shipperId: { type: String, default: '' },
  fromStop: { type: String, default: '' },
  toStop: { type: String, default: '' }
}, { _id: false });

const stopVerificationSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    index: true
  },
  routeId: {
    type: String,
    required: true
  },
  stopId: {
    type: String,
    required: true
  },
  locationName: {
    type: String,
    required: true
  },
  sequenceNumber: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  verificationMethod: {
    type: String,
    default: 'QR'
  },
  packagesUnloaded: [packageOperationSchema],
  packagesLoaded: [packageOperationSchema],
  volumeBefore: {
    type: Number,
    required: true
  },
  volumeAfter: {
    type: Number,
    required: true
  },
  weightBefore: {
    type: Number,
    required: true
  },
  weightAfter: {
    type: Number,
    required: true
  }
});

stopVerificationSchema.index({ vehicleId: 1, timestamp: -1 });

const StopVerification = mongoose.model('StopVerification', stopVerificationSchema);
export default StopVerification;
