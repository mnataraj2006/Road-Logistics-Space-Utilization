import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import StopVerification from '../models/StopVerification.js';
import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Vehicle from '../models/Vehicle.js';
import Payment from '../models/Payment.js';
import Trip from '../models/Trip.js';
import User from '../models/User.js';

dotenv.config();

const fixDataQuality = async () => {
  try {
    await connectDB();
    console.log('=== FIXING DATA QUALITY & REFERENTIAL INTEGRITY ISSUES ===\n');

    // 1. Clean up orphaned StopVerification records referencing non-existent trips
    const trips = await Trip.find().lean();
    const validTripIds = new Set(trips.map(t => t.tripId));

    const orphanedVerifs = await StopVerification.find({ tripId: { $nin: Array.from(validTripIds) } });
    console.log(`Found ${orphanedVerifs.length} orphaned StopVerification records referencing non-existent trips.`);
    if (orphanedVerifs.length > 0) {
      const res = await StopVerification.deleteMany({ tripId: { $nin: Array.from(validTripIds) } });
      console.log(`✓ Deleted ${res.deletedCount} orphaned StopVerification records.`);
    }

    // 2. Fix broken shipment references in bookings
    const shipments = await Shipment.find().lean();
    const validShipmentIds = new Set(shipments.map(s => s.shipmentId));
    const brokenBookings = await Booking.find({ shipmentId: { $nin: Array.from(validShipmentIds) } });
    console.log(`\nFound ${brokenBookings.length} bookings referencing non-existent shipments.`);

    // Find default customer for backing shipments if needed
    const defaultCustomer = await User.findOne({ role: 'customer' });

    for (const b of brokenBookings) {
      console.log(`Creating backing shipment for booking ${b.bookingId} (shipmentId: ${b.shipmentId})...`);
      const newShipment = await Shipment.create({
        shipmentId: b.shipmentId,
        customer: b.customer || defaultCustomer?._id,
        customerId: b.shipperId || 'customer-apex',
        shipperId: b.shipperId || 'customer-apex',
        organizationId: b.organizationId,
        cargoDescription: b.cargoDescription || 'Standard Cargo',
        packageCount: b.packageCount || 1,
        length: b.length || 1,
        width: b.width || 1,
        height: b.height || 1,
        volume: b.volume || 1,
        weight: b.weight || 100,
        fragile: b.fragile || false,
        stackable: b.stackable !== undefined ? b.stackable : true,
        pickupStop: b.fromStop || 'Origin',
        deliveryStop: b.toStop || 'Destination',
        requestedDate: b.date || new Date(),
        status: b.status === 'DELIVERED' ? 'DELIVERED' : (b.status === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'BOOKED'),
        allocationStatus: b.allocatedTripId ? 'ALLOCATED' : 'AVAILABLE_FOR_OPTIMIZATION',
        allocatedTripId: b.allocatedTripId || null,
        allocatedVehicleId: b.vehicleId || null
      });

      b.shipment = newShipment._id;
      await b.save();
      console.log(`✓ Created backing shipment ${newShipment.shipmentId} for booking ${b.bookingId}`);
    }

    // 3. Normalize Vehicle status ('Active' -> 'AVAILABLE')
    const activeVehicles = await Vehicle.find({ status: 'Active' });
    console.log(`\nFound ${activeVehicles.length} vehicles with legacy status 'Active'.`);
    if (activeVehicles.length > 0) {
      const res = await Vehicle.updateMany({ status: 'Active' }, { $set: { status: 'AVAILABLE' } });
      console.log(`✓ Normalized ${res.modifiedCount} vehicles to status 'AVAILABLE'.`);
    }

    // 4. Normalize Payment status ('Escrow' -> 'ESCROW')
    const escrowPayments = await Payment.find({ status: 'Escrow' });
    console.log(`\nFound ${escrowPayments.length} payments with legacy status 'Escrow'.`);
    if (escrowPayments.length > 0) {
      const res = await Payment.updateMany({ status: 'Escrow' }, { $set: { status: 'ESCROW' } });
      console.log(`✓ Normalized ${res.modifiedCount} payments to status 'ESCROW'.`);
    }

    console.log('\n=== DATA QUALITY HYGIENE COMPLETED SUCCESSFULLY ===');
    process.exit(0);
  } catch (err) {
    console.error('Data quality cleanup failed:', err);
    process.exit(1);
  }
};

fixDataQuality();
