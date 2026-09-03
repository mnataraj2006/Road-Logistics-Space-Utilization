import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vehicle from '../models/Vehicle.js';
import Trip from '../models/Trip.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/road_logistics_db';

const syncStandardData = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Update TN-001 to standard heavy truck dimensions
  const v = await Vehicle.findOneAndUpdate(
    { vehicleId: 'TN-001' },
    {
      dimensions: { length: 13.6, width: 2.45, height: 2.8 },
      capacityVolume: 93.3,
      capacityWeight: 20000
    },
    { new: true }
  );
  console.log('Updated Vehicle TN-001:', v?.dimensions, 'Volume:', v?.capacityVolume);

  // Sync Trip snapshot
  const t = await Trip.updateMany(
    { vehicleId: 'TN-001' },
    {
      'vehicleSnapshot.interiorLength': 13.6,
      'vehicleSnapshot.interiorWidth': 2.45,
      'vehicleSnapshot.interiorHeight': 2.8,
      'vehicleSnapshot.capacityVolume': 93.3,
      'vehicleSnapshot.capacityWeight': 20000,
      'vehicleSnapshot.dimensions': { length: 13.6, width: 2.45, height: 2.8 }
    }
  );
  console.log('Updated Trips for TN-001:', t.modifiedCount);

  // Update Peanut Candy to realistic standard freight dimensions
  const s = await Shipment.updateOne(
    { shipmentId: 'SHP-BKG-000001' },
    {
      cargoDescription: 'Peanut Candy (2 Pallets)',
      packageCount: 2,
      length: 1.2,
      width: 1.0,
      height: 1.5,
      volume: 3.6,
      weight: 800
    }
  );
  console.log('Updated Shipment SHP-BKG-000001:', s.modifiedCount);

  await Booking.updateOne(
    { bookingId: 'BKG-000001' },
    {
      volume: 3.6,
      weight: 800
    }
  );

  console.log('Standard demo dimensions successfully synced!');
  process.exit(0);
};

syncStandardData();
