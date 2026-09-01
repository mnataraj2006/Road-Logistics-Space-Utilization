import AuditEvent from '../models/AuditEvent.js';

/**
 * Appends a new operational audit event to the tamper-proof ledger.
 *
 * @param {Object} eventData
 * @param {string} eventData.eventType
 * @param {string} eventData.entityType
 * @param {string} eventData.entityId
 * @param {string} [eventData.tripId]
 * @param {string} [eventData.actor]
 * @param {string} [eventData.previousState]
 * @param {string} [eventData.resultingState]
 * @param {Object} [eventData.metadata]
 * @param {string} [eventData.correlationId]
 * @param {Object} [options.session]
 * @returns {Promise<Object>} Created AuditEvent document
 */
export const recordAuditEvent = async (eventData, { session } = {}) => {
  try {
    const doc = new AuditEvent({
      ...eventData,
      timestamp: eventData.timestamp || new Date()
    });

    if (session) {
      await doc.save({ session });
    } else {
      await doc.save();
    }

    return doc;
  } catch (error) {
    console.error('Failed to record audit event:', error);
    // Return null rather than crashing critical operations, but log alert
    return null;
  }
};

/**
 * Answers: "What happened to shipment BKG-123?"
 * Retrieves the complete chronological lifecycle audit trace for a shipment or booking.
 *
 * @param {string} identifier - Shipment ID or Booking ID
 * @returns {Promise<Array>} Chronological list of events
 */
export const getShipmentLifecycleTrace = async (identifier) => {
  if (!identifier) return [];

  const cleanId = String(identifier).trim();
  const events = await AuditEvent.find({
    $or: [
      { entityId: cleanId },
      { 'metadata.shipmentId': cleanId },
      { 'metadata.bookingId': cleanId },
      { 'metadata.assignedShipmentIds': cleanId }
    ]
  }).sort({ timestamp: 1 });

  return events;
};

/**
 * Answers: "Why was this shipment not allocated?"
 * Retrieves allocation rejection events and optimizer constraint violation reasons.
 *
 * @param {Object} [filters]
 * @param {string} [filters.shipmentId]
 * @param {string} [filters.tripId]
 * @returns {Promise<Array>} Unallocated cargo audit records
 */
export const getUnallocatedCargoExplanations = async ({ shipmentId, tripId } = {}) => {
  const query = {
    eventType: 'ALLOCATION_REJECTED'
  };

  if (shipmentId) query.entityId = shipmentId;
  if (tripId) query.tripId = tripId;

  const events = await AuditEvent.find(query)
    .sort({ timestamp: -1 })
    .limit(50);

  return events.map(e => ({
    eventId: e.eventId,
    shipmentId: e.entityId,
    tripId: e.tripId,
    reason: e.metadata?.reason || 'Segment capacity overflow',
    violatedConstraints: e.metadata?.violatedConstraints || [],
    requestedVolume: e.metadata?.volume,
    requestedWeight: e.metadata?.weight,
    routeSegment: e.metadata?.routeSegment,
    timestamp: e.timestamp
  }));
};

/**
 * Filterable query engine for manager audit ledger.
 */
export const queryAuditLedger = async ({
  entityType,
  eventType,
  tripId,
  entityId,
  startDate,
  endDate,
  limit = 100,
  page = 1
} = {}) => {
  const query = {};

  if (entityType) query.entityType = entityType;
  if (eventType) query.eventType = eventType;
  if (tripId) query.tripId = tripId;
  if (entityId) query.entityId = entityId;

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;
  const [total, events] = await Promise.all([
    AuditEvent.countDocuments(query),
    AuditEvent.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit)
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    events
  };
};
