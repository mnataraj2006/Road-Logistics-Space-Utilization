import mongoose from 'mongoose';
import dotenv from 'dotenv';
import '../models/User.js';
import '../models/LogisticsCompany.js';
import '../models/Trip.js';
import '../models/TripStop.js';
import '../models/Shipment.js';
import '../models/Booking.js';
import '../models/LoadPlan.js';
import '../models/LoadAssignment.js';
import '../models/LoadOperation.js';
import '../models/StopVerification.js';
import '../models/Payment.js';
import '../models/AuditEvent.js';
import '../models/Vehicle.js';
import '../models/Route.js';

dotenv.config();

async function clearDatabaseExceptUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/road-logistics');
    console.log('Connected to MongoDB.\n');

    const collectionsToWipe = [
      'trips',
      'tripstops',
      'shipments',
      'bookings',
      'loadplans',
      'loadassignments',
      'loadoperations',
      'stopverifications',
      'payments',
      'auditevents'
    ];

    console.log('--- Clearing Operational & Transactional Data ---');
    for (const colName of collectionsToWipe) {
      const col = mongoose.connection.collection(colName);
      const res = await col.deleteMany({});
      console.log(`✓ Cleared ${colName}: ${res.deletedCount} documents deleted.`);
    }

    // Reset vehicle status to Idle
    const Vehicle = mongoose.model('Vehicle');
    const vRes = await Vehicle.updateMany(
      {},
      {
        $set: {
          transitStatus: 'Idle',
          activeTripId: '',
          currentStop: '',
          currentRouteIndex: 0
        }
      }
    );
    console.log(`✓ Reset ${vRes.modifiedCount} vehicles to status 'Idle'.`);

    // Reset routes to Active
    const Route = mongoose.model('Route');
    const rRes = await Route.updateMany(
      {},
      {
        $set: {
          status: 'Active',
          currentStopIndex: 0
        }
      }
    );
    console.log(`✓ Reset ${rRes.modifiedCount} routes to status 'Active'.`);

    console.log('\n--- Final Database Status ---');
    const User = mongoose.model('User');
    const userCount = await User.countDocuments();
    console.log(`  • Users preserved: ${userCount}`);

    const LogisticsCompany = mongoose.model('LogisticsCompany');
    const compCount = await LogisticsCompany.countDocuments();
    console.log(`  • Logistics Companies preserved: ${compCount}`);

    const vehCount = await Vehicle.countDocuments();
    console.log(`  • Vehicles available (Idle): ${vehCount}`);

    const routeCount = await Route.countDocuments();
    console.log(`  • Routes available: ${routeCount}`);

    const allCollections = [
      'trips', 'tripstops', 'shipments', 'bookings',
      'loadplans', 'loadassignments', 'loadoperations',
      'stopverifications', 'payments', 'auditevents'
    ];
    for (const c of allCollections) {
      const cnt = await mongoose.connection.collection(c).countDocuments();
      console.log(`  • ${c}: ${cnt}`);
    }

    console.log('\nAll operational database data cleared successfully!');
  } catch (err) {
    console.error('Error clearing database:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

clearDatabaseExceptUsers();
