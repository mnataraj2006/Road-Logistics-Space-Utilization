import mongoose from 'mongoose';

const tripStopSchema = new mongoose.Schema({
  trip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: false
  },
  tripId: {
    type: String,
    required: true,
    index: true
  },
  stopId: {
    type: String,
    required: true
  },
  sequence: {
    type: Number,
    required: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  plannedArrival: {
    type: Date
  },
  actualArrival: {
    type: Date,
    default: null
  },
  verificationStatus: {
    type: String,
    enum: ['UPCOMING', 'READY', 'ARRIVED', 'VERIFIED', 'OPERATIONS_IN_PROGRESS', 'COMPLETED', 'SKIPPED'],
    default: 'UPCOMING',
    index: true
  },
  completionTimestamp: {
    type: Date,
    default: null
  },
  qrToken: {
    type: String,
    required: true,
    index: true
  },
  secureToken: {
    type: String,
    default: '',
    index: true
  },
  verificationMethod: {
    type: String,
    enum: ['SECURE_QR', 'MANUAL_DISPATCHER_OVERRIDE', 'GATE_KIOSK', 'QR'],
    default: 'SECURE_QR'
  }
}, {
  timestamps: true
});

tripStopSchema.index({ tripId: 1, stopId: 1 }, { unique: true });
tripStopSchema.index({ tripId: 1, sequence: 1 });

const TripStop = mongoose.model('TripStop', tripStopSchema);
export default TripStop;
