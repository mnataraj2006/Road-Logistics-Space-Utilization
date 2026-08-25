import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Booking from './models/Booking.js';

dotenv.config();

const resetBookings = async () => {
  await connectDB();

  const targetDateStart = new Date('2026-08-18T00:00:00.000Z');
  const targetDateEnd = new Date('2026-08-18T23:59:59.999Z');

  const result = await Booking.updateMany(
    {
      date: { $gte: targetDateStart, $lte: targetDateEnd }
    },
    {
      vehicleId: 'UNASSIGNED',
      routeId: 'UNASSIGNED',
      status: 'Pending',
      vehicle: null,
      route: null,
      loadedAt: null,
      deliveredAt: null
    }
  );

  console.log(`Successfully reset ${result.modifiedCount} bookings on 18-08-2026 to UNASSIGNED & Pending.`);
  process.exit(0);
};

resetBookings();
