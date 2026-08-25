import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Booking from './models/Booking.js';
import Vehicle from './models/Vehicle.js';
import Route from './models/Route.js';

dotenv.config();

const fixBookings = async () => {
  await connectDB();
  
  const bookingsToFix = await Booking.find({
    vehicleId: { $ne: 'UNASSIGNED' },
    routeId: 'UNASSIGNED'
  });
  
  console.log(`Found ${bookingsToFix.length} bookings to fix.`);
  
  for (const booking of bookingsToFix) {
    const vehicle = await Vehicle.findOne({ vehicleId: booking.vehicleId });
    if (vehicle && vehicle.routeLane && vehicle.routeLane !== 'Inactive Lane') {
      const route = await Route.findOne({ routeId: vehicle.routeLane });
      if (route) {
        booking.route = route._id;
        booking.routeId = route.routeId;
        await booking.save();
        console.log(`Updated booking ${booking.bookingId} with route ${route.routeId}`);
      }
    }
  }
  
  process.exit(0);
};

fixBookings();
