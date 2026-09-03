import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Production Database Cleanup Utility for Cargolytics
 *
 * Safely wipes all application operational data (users, shipments, bookings,
 * vehicles, routes, trips, load plans, payments, audit events, stop verifications)
 * to leave a clean, fresh state for first-time account registration and live operations.
 */
export const cleanApplicationDatabase = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics_space_utilization';

  console.log('\n===============================================================');
  console.log('🧹 CARGOLYTICS APPLICATION DATABASE CLEANUP UTILITY');
  console.log('===============================================================');
  console.log(`Connecting to MongoDB URI: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;

    console.log(`Target Database: ${dbName}`);

    // Safety checks against system or unintended databases
    const SYSTEM_DATABASES = ['admin', 'local', 'config'];
    if (SYSTEM_DATABASES.includes(dbName.toLowerCase())) {
      throw new Error(`SAFETY REJECTED: Attempted to run cleanup on system database '${dbName}'.`);
    }

    const ALLOWED_DB_PATTERNS = [
      'road_logistics',
      'road_logistics_space_utilization',
      'cargolytics',
      'test'
    ];

    const isRecognizedDb = ALLOWED_DB_PATTERNS.some(p => dbName.toLowerCase().includes(p));
    if (!isRecognizedDb && process.env.ALLOW_UNSAFE_DB_CLEAN !== 'true') {
      throw new Error(
        `SAFETY REJECTED: Database '${dbName}' is not a recognized Cargolytics application database. ` +
        `Set ALLOW_UNSAFE_DB_CLEAN=true to override.`
      );
    }

    // Application collections to clean
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name).filter(n => !n.startsWith('system.'));

    console.log(`Found ${collectionNames.length} application collections to clean.`);
    console.log('---------------------------------------------------------------');

    let totalDeleted = 0;
    const summary = [];

    for (const colName of collectionNames) {
      const col = db.collection(colName);
      const countBefore = await col.countDocuments();
      const deleteResult = await col.deleteMany({});
      totalDeleted += deleteResult.deletedCount;
      summary.push({ collection: colName, deleted: deleteResult.deletedCount, countBefore });
      console.log(`  ✓ Cleared [${colName}]: ${deleteResult.deletedCount} documents removed.`);
    }

    console.log('---------------------------------------------------------------');
    console.log(`✨ Cleanup Complete! Removed ${totalDeleted} total documents across ${collectionNames.length} collections.`);
    console.log('The database is now 100% clean and ready for real user registration.\n');

    await mongoose.disconnect();
    return { success: true, totalDeleted, summary };
  } catch (error) {
    console.error('\n❌ Database Cleanup Failed:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
};

// Execute if run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('cleanDatabase.js')) {
  cleanApplicationDatabase();
}
