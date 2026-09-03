import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Idempotent Role Architecture Migration Utility
 *
 * Migrates Cargolytics from legacy roles ('carrier', 'shipper', 'admin') to the strict
 * TWO-ROLE ARCHITECTURE:
 * 1. 'customer' (Shippers / Exporters / Consignors)
 * 2. 'logistics_manager' (Fleet operators, Dispatchers, Space managers)
 *
 * Driver operational records are preserved and not blindly converted.
 * All user identity fields, credentials, vehicle assignments, trips, shipments,
 * bookings, load plans, and audit histories are 100% preserved.
 */
export const migrateUserRoles = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics_space_utilization';

  console.log('\n===============================================================');
  console.log('🔄 CARGOLYTICS USER ROLE CONSOLIDATION MIGRATION');
  console.log('===============================================================');
  console.log(`Connecting to MongoDB URI: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;

    console.log(`Target Database: ${dbName}`);

    // 1. Safety check
    const SYSTEM_DATABASES = ['admin', 'local', 'config'];
    if (SYSTEM_DATABASES.includes(dbName.toLowerCase())) {
      throw new Error(`SAFETY REJECTED: Attempted migration on system database '${dbName}'.`);
    }

    const usersCollection = db.collection('users');

    // 2. Pre-migration Inspection & Counts
    const totalUsers = await usersCollection.countDocuments();
    const carrierCountBefore = await usersCollection.countDocuments({ role: 'carrier' });
    const shipperCountBefore = await usersCollection.countDocuments({ role: 'shipper' });
    const driverCountBefore = await usersCollection.countDocuments({ role: 'driver' });
    const customerCountBefore = await usersCollection.countDocuments({ role: 'customer' });
    const managerCountBefore = await usersCollection.countDocuments({ role: 'logistics_manager' });
    const adminCountBefore = await usersCollection.countDocuments({ role: 'admin' });

    console.log('\n[PRE-MIGRATION USER AUDIT]');
    console.log(`  Total Users in DB:          ${totalUsers}`);
    console.log(`  - 'carrier' Users:          ${carrierCountBefore}`);
    console.log(`  - 'shipper' Users:          ${shipperCountBefore}`);
    console.log(`  - 'admin' Users:            ${adminCountBefore}`);
    console.log(`  - 'driver' Records:         ${driverCountBefore}`);
    console.log(`  - 'customer' Users:         ${customerCountBefore}`);
    console.log(`  - 'logistics_manager' Users:${managerCountBefore}`);

    // 3. Operational Collections Pre-check
    const collectionsToVerify = ['vehicles', 'trips', 'shipments', 'bookings', 'loadplans', 'auditevents'];
    const colCountsBefore = {};
    for (const colName of collectionsToVerify) {
      try {
        colCountsBefore[colName] = await db.collection(colName).countDocuments();
      } catch {
        colCountsBefore[colName] = 0;
      }
    }

    // 4. Perform Migrations
    // A. Migrate 'carrier' and 'admin' -> 'logistics_manager'
    const carrierMigrationResult = await usersCollection.updateMany(
      { role: { $in: ['carrier', 'admin'] } },
      { $set: { role: 'logistics_manager' } }
    );
    console.log(`\n  ✓ Migrated ${carrierMigrationResult.modifiedCount} carrier/admin account(s) to 'logistics_manager'.`);

    // B. Migrate legacy 'shipper' -> canonical 'customer'
    const shipperMigrationResult = await usersCollection.updateMany(
      { role: 'shipper' },
      { $set: { role: 'customer' } }
    );
    console.log(`  ✓ Canonicalized ${shipperMigrationResult.modifiedCount} legacy 'shipper' account(s) to 'customer'.`);

    // Drivers remain as operational driver records (User rule 3)
    console.log(`  ✓ Preserved ${driverCountBefore} operational driver record(s) intact.`);

    // 5. Post-migration Verification
    const carrierCountAfter = await usersCollection.countDocuments({ role: 'carrier' });
    const shipperCountAfter = await usersCollection.countDocuments({ role: 'shipper' });
    const adminCountAfter = await usersCollection.countDocuments({ role: 'admin' });
    const customerCountAfter = await usersCollection.countDocuments({ role: 'customer' });
    const managerCountAfter = await usersCollection.countDocuments({ role: 'logistics_manager' });
    const driverCountAfter = await usersCollection.countDocuments({ role: 'driver' });
    const totalUsersAfter = await usersCollection.countDocuments();

    console.log('\n[POST-MIGRATION USER AUDIT]');
    console.log(`  Total Users in DB:          ${totalUsersAfter} (Preserved: ${totalUsersAfter === totalUsers})`);
    console.log(`  - 'carrier' Users:          ${carrierCountAfter} (Target: 0)`);
    console.log(`  - 'shipper' Users:          ${shipperCountAfter} (Target: 0)`);
    console.log(`  - 'admin' Users:            ${adminCountAfter} (Target: 0)`);
    console.log(`  - 'customer' Users:         ${customerCountAfter}`);
    console.log(`  - 'logistics_manager' Users:${managerCountAfter}`);
    console.log(`  - 'driver' Records:         ${driverCountAfter}`);

    // Verify operational collections were completely untouched
    console.log('\n[OPERATIONAL DATA INTEGRITY CHECK]');
    for (const colName of collectionsToVerify) {
      let countAfter = 0;
      try {
        countAfter = await db.collection(colName).countDocuments();
      } catch {
        countAfter = 0;
      }
      const match = countAfter === colCountsBefore[colName];
      console.log(`  - Collection [${colName}]: ${countAfter} documents (Integrity: ${match ? 'VERIFIED' : 'MISMATCH'})`);
    }

    if (carrierCountAfter !== 0 || shipperCountAfter !== 0 || adminCountAfter !== 0) {
      throw new Error('Migration verification failed: Non-canonical roles still remain in database.');
    }

    console.log('\n===============================================================');
    console.log('✨ MIGRATION SUCCESSFUL: Two-Role Architecture Enforced!');
    console.log('===============================================================\n');

    await mongoose.disconnect();
    return {
      success: true,
      migratedCarriers: carrierMigrationResult.modifiedCount,
      canonicalizedShippers: shipperMigrationResult.modifiedCount,
      finalRoles: {
        customer: customerCountAfter,
        logistics_manager: managerCountAfter,
        driver: driverCountAfter
      }
    };
  } catch (error) {
    console.error('\n❌ Migration Failed:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    throw error;
  }
};

// Execute if run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('migrateCarrierRole.js')) {
  migrateUserRoles()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
