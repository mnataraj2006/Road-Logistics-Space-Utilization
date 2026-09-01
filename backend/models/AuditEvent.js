import mongoose from 'mongoose';
import crypto from 'crypto';

const auditEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'SHIPMENT_CREATED',
      'BOOKING_CREATED',
      'BOOKING_CANCELLED',
      'ALLOCATION_GENERATED',
      'ALLOCATION_REJECTED',
      'LOAD_PLAN_GENERATED',
      'LOAD_PLAN_APPROVED',
      'LOAD_PLAN_SUPERSEDED',
      'TRIP_CREATED',
      'TRIP_DISPATCHED',
      'STOP_ARRIVAL_VERIFIED',
      'PACKAGE_LOADED',
      'PACKAGE_UNLOADED',
      'SHIPMENT_DELIVERED',
      'REOPTIMIZATION_GENERATED',
      'TRIP_COMPLETED',
      'SECURITY_VIOLATION'
    ],
    index: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['Shipment', 'Booking', 'LoadPlan', 'Trip', 'Stop', 'Vehicle', 'Security'],
    index: true
  },
  entityId: {
    type: String,
    required: true,
    index: true
  },
  tripId: {
    type: String,
    index: true,
    default: ''
  },
  actor: {
    type: String,
    required: true,
    default: 'system'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  previousState: {
    type: String,
    default: ''
  },
  resultingState: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  correlationId: {
    type: String,
    default: ''
  }
}, {
  timestamps: false,
  versionKey: false
});

// Append-only invariant enforcement from application perspective
auditEventSchema.pre('updateOne', function() {
  throw new Error('AuditEvent is strictly append-only. Mutation is prohibited.');
});
auditEventSchema.pre('updateMany', function() {
  throw new Error('AuditEvent is strictly append-only. Mutation is prohibited.');
});
auditEventSchema.pre('deleteOne', function() {
  throw new Error('AuditEvent is strictly append-only. Deletion is prohibited.');
});
auditEventSchema.pre('deleteMany', function() {
  throw new Error('AuditEvent is strictly append-only. Deletion is prohibited.');
});

const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
export default AuditEvent;
