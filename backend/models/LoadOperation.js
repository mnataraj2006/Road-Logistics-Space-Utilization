import mongoose from 'mongoose';

const loadOperationSchema = new mongoose.Schema({
  operationId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
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
  location: {
    type: String,
    default: ''
  },
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    required: false
  },
  shipmentId: {
    type: String,
    required: true,
    index: true
  },
  bookingId: {
    type: String,
    index: true
  },
  operationType: {
    type: String,
    required: true,
    enum: ['LOADED', 'UNLOADED', 'MOVED', 'REJECTED', 'DAMAGED'],
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  performedBy: {
    type: String,
    default: 'system'
  },
  previousState: {
    type: String,
    default: ''
  },
  resultingState: {
    type: String,
    default: ''
  },
  volume: {
    type: Number,
    default: 0
  },
  weight: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

loadOperationSchema.index({ tripId: 1, timestamp: -1 });

const LoadOperation = mongoose.model('LoadOperation', loadOperationSchema);
export default LoadOperation;
