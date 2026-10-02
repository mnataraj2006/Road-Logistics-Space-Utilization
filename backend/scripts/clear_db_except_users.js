import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics_space_utilization';

async function clearDatabaseExceptUsers() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const collections = await mongoose.connection.db.listCollections().toArray();
  const preservedCollections = new Set(['users', 'Users']);

  console.log('\n--- SCANNING COLLECTIONS ---');
  let totalDeleted = 0;

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith('system.')) continue;

    const collection = mongoose.connection.db.collection(colName);
    const count = await collection.countDocuments();

    if (preservedCollections.has(colName)) {
      console.log(`  [PRESERVED] ${colName}: ${count} document(s) retained.`);
    } else {
      const res = await collection.deleteMany({});
      console.log(`  [CLEARED]   ${colName}: deleted ${res.deletedCount} document(s) (was ${count}).`);
      totalDeleted += res.deletedCount;
    }
  }

  console.log('-----------------------------');
  console.log(`Successfully cleared ${totalDeleted} document(s) across non-user collections.`);
  console.log('Database state refreshed. User credentials remain intact.\n');

  await mongoose.disconnect();
  process.exit(0);
}

clearDatabaseExceptUsers().catch((err) => {
  console.error('Error clearing database:', err);
  process.exit(1);
});
