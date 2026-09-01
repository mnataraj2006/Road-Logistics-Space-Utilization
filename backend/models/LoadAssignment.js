import mongoose from 'mongoose';

const loadAssignmentSchema = new mongoose.Schema({
  loadPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoadPlan',
    required: false
  },
  loadPlanId: {
    type: String,
    required: true,
    index: true
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
  customer: {
    type: String,
    default: ''
  },
  priority: {
    type: String,
    default: 'STANDARD'
  },
  fragile: {
    type: Boolean,
    default: false
  },
  stackable: {
    type: Boolean,
    default: true
  },
  maxStackWeight: {
    type: Number,
    default: 1000
  },
  segmentRange: {
    fromStop: { type: String, required: true },
    toStop: { type: String, required: true },
    fromIndex: { type: Number, default: 0 },
    toIndex: { type: Number, default: 1 }
  },
  loadingSequence: {
    type: Number,
    default: 0
  },
  unloadingSequence: {
    type: Number,
    default: 0
  },
  dimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },
  volume: {
    type: Number,
    required: true,
    default: 0
  },
  weight: {
    type: Number,
    required: true,
    default: 0
  },
  orientation: {
    type: String,
    default: 'ORIGINAL'
  },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  obstructionScore: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['PROPOSED', 'ASSIGNED', 'LOADED', 'IN_TRANSIT', 'UNLOADED', 'CANCELLED'],
    default: 'PROPOSED',
    index: true
  }
}, {
  timestamps: true
});

loadAssignmentSchema.index({ loadPlanId: 1, shipmentId: 1 }, { unique: true });
loadAssignmentSchema.index({ loadPlanId: 1, loadingSequence: 1 });

const LoadAssignment = mongoose.model('LoadAssignment', loadAssignmentSchema);
export default LoadAssignment;
