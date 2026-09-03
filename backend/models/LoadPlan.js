import mongoose from 'mongoose';

const auditEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['GENERATED', 'MODIFIED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'ACTIVE', 'CANCELLED'],
    required: true
  },
  performedBy: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  version: {
    type: Number,
    default: 1
  }
}, { _id: false });

const loadPlanSchema = new mongoose.Schema({
  loadPlanId: {
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
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LogisticsCompany',
    required: false,
    index: true
  },
  logisticsCompanyName: {
    type: String,
    trim: true,
    default: ''
  },
  vehicleId: {
    type: String,
    required: true,
    index: true
  },
  routeId: {
    type: String,
    required: true,
    index: true
  },
  version: {
    type: Number,
    default: 1,
    required: true
  },
  optimizerVersion: {
    type: String,
    default: '2.4.0-deterministic-multistop'
  },
  strategyUsed: {
    type: String,
    default: 'Priority-LIFO-Density'
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  objectiveScore: {
    type: Number,
    default: 0
  },
  scoreBreakdown: {
    volumeScore: { type: Number, default: 0 },
    weightScore: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 0 },
    accessibilityScore: { type: Number, default: 0 },
    wastedPenalty: { type: Number, default: 0 },
    totalObstructions: { type: Number, default: 0 }
  },
  volumeUtilization: {
    type: Number, // Percentage 0 - 100
    default: 0
  },
  weightUtilization: {
    type: Number, // Percentage 0 - 100
    default: 0
  },
  peakUtilization: {
    volume: { type: Number, default: 0 },
    weight: { type: Number, default: 0 }
  },
  segmentUtilization: [{
    segmentIndex: Number,
    fromStop: String,
    toStop: String,
    usedVolume: Number,
    usedWeight: Number,
    remainingVolume: Number,
    remainingWeight: Number,
    volumeUtilization: Number,
    weightUtilization: Number
  }],
  unassignedShipments: [{
    shipmentId: String,
    bookingId: String,
    volume: Number,
    weight: Number,
    pickup: String,
    delivery: String,
    priority: String,
    reason: String,
    bottleneck: Object
  }],
  warnings: [{
    type: String
  }],
  explanation: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    required: true,
    enum: ['DRAFT', 'GENERATED', 'UNDER_REVIEW', 'APPROVED', 'LOCKED', 'ACTIVE', 'SUPERSEDED', 'COMPLETED', 'CANCELLED', 'REJECTED'],
    default: 'GENERATED',
    index: true
  },
  isImmutable: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  approvedByUsername: {
    type: String,
    default: ''
  },
  approvedAt: {
    type: Date,
    default: null
  },
  lockedAt: {
    type: Date,
    default: null
  },
  auditLog: [auditEntrySchema]
}, {
  timestamps: true
});

loadPlanSchema.index({ tripId: 1, version: -1 });
loadPlanSchema.index({ tripId: 1, status: 1 });

const LoadPlan = mongoose.model('LoadPlan', loadPlanSchema);
export default LoadPlan;
