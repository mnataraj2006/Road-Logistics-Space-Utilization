import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Booking from './models/Booking.js';
import User from './models/User.js';
import Payment from './models/Payment.js';

dotenv.config();

const seed5MaduraiShipments = async () => {
  await connectDB();

  // Find shipper
  const shipperUser = await User.findOne({ username: 'shipper-apex', role: 'shipper' });
  if (!shipperUser) {
    console.error('Shipper user shipper-apex not found.');
    process.exit(1);
  }

  const dateToSeed = new Date('2026-08-18T10:00:00.000Z');

  const shipments = [
    { fromStop: 'Kovilpatti', toStop: 'Madurai', volume: 8, weight: 1200, revenue: 12500 },
    { fromStop: 'Thoothukudi', toStop: 'Madurai', volume: 12, weight: 2000, revenue: 18000 },
    { fromStop: 'Tirunelveli', toStop: 'Madurai', volume: 5, weight: 800, revenue: 8500 },
    { fromStop: 'Virudhunagar', toStop: 'Madurai', volume: 10, weight: 1500, revenue: 14000 },
    { fromStop: 'Chengalpattu', toStop: 'Madurai', volume: 18, weight: 3000, revenue: 26000 }
  ];

  console.log('Seeding 5 shipments to Madurai for 18-08-2026...');

  for (let i = 0; i < shipments.length; i++) {
    const s = shipments[i];
    const bookingCount = await Booking.countDocuments({});
    const bookingId = `BKG-${String(bookingCount + 1).padStart(6, '0')}`;

    const newBooking = new Booking({
      bookingId,
      date: dateToSeed,
      vehicleId: 'UNASSIGNED',
      shipper: shipperUser._id,
      shipperId: shipperUser.username,
      carrierId: 'UNASSIGNED',
      routeId: 'UNASSIGNED',
      weight: s.weight,
      volume: s.volume,
      revenue: s.revenue,
      fromStop: s.fromStop,
      toStop: s.toStop,
      cargoDescription: `Industrial components consignment to Madurai from ${s.fromStop}`,
      status: 'Pending'
    });

    const saved = await newBooking.save();

    // Create Escrow Payment record
    const payment = new Payment({
      booking: saved._id,
      bookingId: saved.bookingId,
      shipper: shipperUser._id,
      shipperId: shipperUser.username,
      amount: s.revenue,
      platformFee: Math.round(s.revenue * 0.05),
      carrierPayout: Math.round(s.revenue * 0.95),
      status: 'Escrow',
      transactionId: 'ch_seeded_' + Math.random().toString(36).substring(2, 10),
      createdAt: dateToSeed
    });
    await payment.save();

    console.log(`Created Booking: ${saved.bookingId} | From: ${saved.fromStop} | Vol: ${saved.volume} m³ | Wt: ${saved.weight} kg`);
  }

  console.log('Seeding completed successfully!');
  process.exit(0);
};

seed5MaduraiShipments();
