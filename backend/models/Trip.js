import mongoose from 'mongoose';

const tripTimelineEventSchema = new mongoose.Schema({
  event: {
    type: String,
    enum: [
      'TRIP_CREATED',
      'LOAD_PLAN_APPROVED',
      'DISPATCHED',
      'ARRIVED_AT_STOP',
      'UNLOAD_COMPLETED',
      'LOAD_COMPLETED',
      'STOP_COMPLETED',
      'TRIP_COMPLETED',
      'TRIP_CANCELLED'
    ],
    required: true
  },
  stopId: String,
  location: String,
  timestamp: { type: Date, default: Date.now },
  performedBy: String,
  details: mongoose.Schema.Types.Mixed
}, { _id: false });

const tripSchema = new mongoose.Schema({
  tripId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: false
  },
  vehicleId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: false
  },
  routeId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  driverId: {
    type: String,
    trim: true,
    default: ''
  },
  carrierId: {
    type: String,
    trim: true,
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
  activeLoadPlanId: {
    type: String,
    trim: true,
    default: ''
  },
  plannedDeparture: {
    type: Date,
    default: Date.now
  },
  actualDeparture: {
    type: Date,
    default: null
  },
  currentStopIndex: {
    type: Number,
    default: 0
  },
  currentStop: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    required: true,
    enum: [
      'PLANNED',
      'READY_FOR_DISPATCH',
      'DISPATCHED',
      'IN_TRANSIT',
      'AT_STOP',
      'OPERATIONS_IN_PROGRESS',
      'STOP_COMPLETED',
      'COMPLETED',
      'CANCELLED'
    ],
    default: 'PLANNED',
    index: true
  },
  actualLoadSnapshot: {
    usedVolume: { type: Number, default: 0 },
    usedWeight: { type: Number, default: 0 },
    packagesCount: { type: Number, default: 0 },
    loadedShipmentIds: [{ type: String }]
  },
  processedIdempotencyKeys: [{
    type: String,
    index: true
  }],
  usedStopTokens: [{
    type: String,
    index: true
  }],
  timelineAudit: [tripTimelineEventSchema],
  vehicleSnapshot: {
    vehicleId: { type: String, default: '' },
    type: { type: String, default: '' },
    interiorLength: { type: Number, default: 0 },
    interiorWidth: { type: Number, default: 0 },
    interiorHeight: { type: Number, default: 0 },
    capacityVolume: { type: Number, default: 0 },
    capacityWeight: { type: Number, default: 0 },
    dimensions: {
      length: { type: Number, default: 0 },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 }
    },
    ratePerCbm: { type: Number, default: 150 },
    ratePerKg: { type: Number, default: 5 },
    capturedAt: { type: Date, default: Date.now }
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

tripSchema.index({ vehicleId: 1, status: 1 });
tripSchema.index({ routeId: 1, plannedDeparture: -1 });

const Trip = mongoose.model('Trip', tripSchema);
export default Trip;
