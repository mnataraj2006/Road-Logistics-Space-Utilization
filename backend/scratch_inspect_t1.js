import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Booking from './models/Booking.js';
import Vehicle from './models/Vehicle.js';

dotenv.config();

const inspectT1 = async () => {
  await connectDB();

  const vehicle = await Vehicle.findOne({ vehicleId: 'T1' });
  console.log('--- VEHICLE T1 ---');
  console.log(`VehicleId: ${vehicle.vehicleId}, Volume Cap: ${vehicle.capacityVolume} m³, Weight Cap: ${vehicle.capacityWeight} kg`);

  const bookings = await Booking.find({ vehicleId: 'T1', status: { $ne: 'Cancelled' } });
  console.log('\n--- BOOKINGS ON T1 ---');
  let totalVol = 0;
  let totalWt = 0;
  bookings.forEach(b => {
    console.log(`BookingId: ${b.bookingId}, Status: ${b.status}, Date: ${b.date.toISOString().split('T')[0]}, Vol: ${b.volume} m³, Wt: ${b.weight} kg, From: ${b.fromStop}, To: ${b.toStop}`);
    totalVol += b.volume;
    totalWt += b.weight;
  });

  console.log(`\nAggregated Total Volume: ${totalVol} m³ (${((totalVol / vehicle.capacityVolume) * 100).toFixed(1)}%)`);
  console.log(`Aggregated Total Weight: ${totalWt} kg (${((totalWt / vehicle.capacityWeight) * 100).toFixed(1)}%)`);

  process.exit(0);
};

inspectT1();
