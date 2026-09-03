import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import User from '../models/User.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import Trip from '../models/Trip.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import TripStop from '../models/TripStop.js';
import LoadOperation from '../models/LoadOperation.js';
import StopVerification from '../models/StopVerification.js';
import AuditEvent from '../models/AuditEvent.js';
import Payment from '../models/Payment.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';

async function cleanDatabaseExceptUsers() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/road_logistics_space_utilization';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB successfully.');

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const userCount = await User.countDocuments();
    console.log(`Preserving ${userCount} User account(s)...`);

    console.log('\n--- Database Cleanup Summary ---');
    for (const col of collections) {
      const colName = col.name;
      // Skip users collection and system collections
      if (colName === 'users' || colName.startsWith('system.')) {
        console.log(`- Skipped (Preserved):       ${colName}`);
        continue;
      }

      const res = await db.collection(colName).deleteMany({});
      console.log(`- Cleared Collection:        ${colName.padEnd(24)} (${res.deletedCount} documents deleted)`);
    }

    console.log(`\n✓ All operational collections wiped clean.`);
    console.log(`✓ Preserved ${userCount} User account(s) intact.`);

    const users = await User.find({}, 'username email role name');
    console.log('\nActive User Accounts:');
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. [${u.role}] ${u.username} (${u.email})`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error during database cleanup:', err);
    process.exit(1);
  }
}

cleanDatabaseExceptUsers();
