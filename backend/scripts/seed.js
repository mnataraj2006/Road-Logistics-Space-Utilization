import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';

dotenv.config();

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing data
    console.log('Clearing database...');
    await User.deleteMany({});
    await Vehicle.deleteMany({});
    await Route.deleteMany({});
    await Booking.deleteMany({});
    await Payment.deleteMany({});

    // 1. Seed Users
    console.log('Seeding users (Customers and Logistics Managers)...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    
    const seededUsers = await User.create([
      // Logistics Managers (Fleet Operators)
      { username: 'manager-ops', email: 'ops@roadlogistics.com', password: hashedPassword, role: 'logistics_manager' },
      { username: 'carrier-safexpress', email: 'safexpress@roadlogistics.com', password: hashedPassword, role: 'logistics_manager', companyName: 'Safexpress Logistics' },
      { username: 'carrier-vrl', email: 'vrl@roadlogistics.com', password: hashedPassword, role: 'logistics_manager', companyName: 'VRL Logistics' },
      { username: 'carrier-bluedart', email: 'bluedart@roadlogistics.com', password: hashedPassword, role: 'logistics_manager', companyName: 'Blue Dart Freight' },
      
      // Customers (Shippers / Exporters)
      { username: 'customer-apex', email: 'apex@roadlogistics.com', password: hashedPassword, role: 'customer', companyName: 'Apex Exports' },
      { username: 'customer-global', email: 'global@roadlogistics.com', password: hashedPassword, role: 'customer', companyName: 'Global Freight' },
      { username: 'customer-local', email: 'local@roadlogistics.com', password: hashedPassword, role: 'customer', companyName: 'Local Traders' },

      // Drivers (Operational Accounts)
      { 
        username: 'driver-arun', 
        email: 'arun@roadlogistics.com', 
        password: hashedPassword, 
        role: 'customer', 
        name: 'Arun Kumar', 
        carrierId: 'carrier-safexpress', 
        phone: '+91 98765 43210', 
        licenseNumber: 'DL-58202612', 
        licenseExpiry: '25/12/2030', 
        driverStatus: 'AVAILABLE', 
        profileCompleted: true 
      }
    ]);

    const userMap = new Map(seededUsers.map(u => [u.username, u]));

    // 2. Seed Vehicles (and assign to carriers)
    console.log('Seeding vehicles associated with carriers...');
    const carrierSafe = userMap.get('carrier-safexpress');
    const carrierVrl = userMap.get('carrier-vrl');
    const carrierBlue = userMap.get('carrier-bluedart');

    const vehiclesData = [
      { vehicleId: 'TRK-003', type: 'Medium Truck', capacityVolume: 50, capacityWeight: 10000, status: 'Active', carrier: carrierSafe._id, carrierId: carrierSafe.username, assignedDriverId: 'driver-arun' },
      { vehicleId: 'TRK-004', type: 'Medium Truck', capacityVolume: 50, capacityWeight: 10000, status: 'Active', carrier: carrierSafe._id, carrierId: carrierSafe.username },
      { vehicleId: 'TRK-005', type: 'Light Van', capacityVolume: 15, capacityWeight: 3000, status: 'Active', carrier: carrierVrl._id, carrierId: carrierVrl.username },
      { vehicleId: 'TRK-006', type: 'Light Van', capacityVolume: 15, capacityWeight: 3000, status: 'Active', carrier: carrierBlue._id, carrierId: carrierBlue.username }
    ];
    const vehicles = await Vehicle.create(vehiclesData);
    const vehicleMap = new Map(vehicles.map(v => [v.vehicleId, v]));

    // 3. Seed Routes (Global lanes)
    console.log('Seeding routes...');
    const routesData = [
      { routeId: 'RTE-002', source: 'Bengaluru', destination: 'Chennai', distance: 346, baseRate: 48000 },
      { routeId: 'RTE-003', source: 'Delhi', destination: 'Jaipur', distance: 268, baseRate: 29500 },
      { routeId: 'RTE-005', source: 'Kolkata', destination: 'Patna', distance: 580, baseRate: 54000 }
    ];
    const routes = await Route.create(routesData);
    const routeMap = new Map(routes.map(r => [r.routeId, r]));

    // Weighted Shippers Selection list
    const shippersList = [
      { username: 'shipper-apex', type: 'Enterprise', weight: 5 },
      { username: 'shipper-global', type: 'Enterprise', weight: 4 },
      { username: 'shipper-local', type: 'SMB', weight: 2 }
    ];

    const selectWeightedShipper = () => {
      const totalWeight = shippersList.reduce((sum, s) => sum + s.weight, 0);
      let rand = Math.random() * totalWeight;
      for (const s of shippersList) {
        if (rand < s.weight) {
          return { user: userMap.get(s.username), type: s.type };
        }
        rand -= s.weight;
      }
      return { user: userMap.get('shipper-local'), type: 'SMB' };
    };

    // 4. Seed Bookings & Payments
    console.log('Generating bookings & payments ledger logs...');
    const bookings = [];
    const payments = [];
    const today = new Date();
    
    // Generate bookings from 180 days ago up to 14 days in the future
    const startDate = new Date();
    startDate.setDate(today.getDate() - 180);
    
    const endDate = new Date();
    endDate.setDate(today.getDate() + 14);

    let bookingCounter = 1;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const month = d.getMonth();
      
      let dayMultiplier = 1.0;
      if (dayOfWeek === 5) dayMultiplier = 1.25; 
      else if (dayOfWeek === 6) dayMultiplier = 0.5; 
      else if (dayOfWeek === 0) dayMultiplier = 0.25; 
      else if (dayOfWeek === 1) dayMultiplier = 1.1; 
      
      let seasonalMultiplier = 1.0;
      if (month === 10 || month === 11) seasonalMultiplier = 1.3; 
      else if (month === 0 || month === 1) seasonalMultiplier = 0.85; 
      else if (month >= 5 && month <= 7) seasonalMultiplier = 1.1; 

      // Daily Route schedules
      const dailySchedule = [];
      
      // TRK-003 & TRK-004 NY-BOS / CHI-DET Tue, Thu
      if ([2, 4].includes(dayOfWeek)) {
        dailySchedule.push({ vehicleId: 'TRK-003', routeId: 'RTE-002', targetLoad: 0.90 });
        dailySchedule.push({ vehicleId: 'TRK-004', routeId: 'RTE-003', targetLoad: 0.75 });
      }
      // TRK-005 Mon-Fri
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        dailySchedule.push({ vehicleId: 'TRK-005', routeId: 'RTE-005', targetLoad: 0.55 });
      }
      // TRK-006 Sat
      if (dayOfWeek === 6) {
        dailySchedule.push({ vehicleId: 'TRK-006', routeId: 'RTE-002', targetLoad: 0.65 });
      }

      for (const trip of dailySchedule) {
        const vehicle = vehicleMap.get(trip.vehicleId);
        const route = routeMap.get(trip.routeId);
        
        let currentVolume = 0;
        let currentWeight = 0;
        
        const targetFillRate = trip.targetLoad * dayMultiplier * seasonalMultiplier;
        const targetVolume = Math.min(vehicle.capacityVolume * targetFillRate, vehicle.capacityVolume * 0.98);
        
        while (currentVolume < targetVolume) {
          const shipperObj = selectWeightedShipper();
          
          let vol = 0;
          let wt = 0;
          
          if (shipperObj.type === 'Enterprise') {
            vol = parseFloat((Math.random() * 15 + 10).toFixed(1)); 
          } else if (shipperObj.type === 'SMB') {
            vol = parseFloat((Math.random() * 6 + 3).toFixed(1)); 
          } else {
            vol = parseFloat((Math.random() * 2 + 0.5).toFixed(1)); 
          }
          
          const density = Math.random() * 100 + 120;
          wt = Math.round(vol * density);
          
          if (currentVolume + vol > vehicle.capacityVolume || currentWeight + wt > vehicle.capacityWeight) {
            // Cancelled booking simulation
            if (Math.random() < 0.15) {
              const bookingObjectId = new mongoose.Types.ObjectId();
              const bkgId = `BKG-${String(bookingCounter++).padStart(6, '0')}`;
              const rev = Math.round(vol * (route.baseRate / 20) * (Math.random() * 0.2 + 0.9));
              
              bookings.push({
                _id: bookingObjectId,
                bookingId: bkgId,
                date: new Date(d),
                vehicle: vehicle._id,
                vehicleId: vehicle.vehicleId,
                shipper: shipperObj.user._id,
                shipperId: shipperObj.user.username,
                carrier: vehicle.carrier,
                carrierId: vehicle.carrierId,
                route: route._id,
                routeId: route.routeId,
                weight: wt,
                volume: vol,
                revenue: rev,
                delayHours: 0,
                status: 'Cancelled'
              });
            }
            break;
          }
          
          currentVolume += vol;
          currentWeight += wt;
          
          const bookingObjectId = new mongoose.Types.ObjectId();
          const bkgId = `BKG-${String(bookingCounter++).padStart(6, '0')}`;
          
          const pricingFactor = 1.0 + (route.distance / 1000);
          const rev = Math.round((vol * (route.baseRate / 15)) * pricingFactor * (Math.random() * 0.15 + 0.92));
          
          let status = 'Completed';
          if (d > today) {
            status = Math.random() < 0.85 ? 'Pending' : 'Completed';
          }

          let delay = 0;
          if (status === 'Completed') {
            const hasDelay = Math.random() < 0.3;
            if (hasDelay) {
              const distanceFactor = route.distance / 300; 
              delay = parseFloat((Math.random() * 2.5 * distanceFactor + 0.5).toFixed(1));
            }
          }

          bookings.push({
            _id: bookingObjectId,
            bookingId: bkgId,
            date: new Date(d),
            vehicle: vehicle._id,
            vehicleId: vehicle.vehicleId,
            shipper: shipperObj.user._id,
            shipperId: shipperObj.user.username,
            carrier: vehicle.carrier,
            carrierId: vehicle.carrierId,
            route: route._id,
            routeId: route.routeId,
            weight: wt,
            volume: parseFloat(vol.toFixed(1)),
            revenue: rev,
            delayHours: delay,
            status: status
          });

          // Seed payment transaction records corresponding to the booking
          payments.push({
            booking: bookingObjectId,
            bookingId: bkgId,
            shipper: shipperObj.user._id,
            shipperId: shipperObj.user.username,
            carrier: vehicle.carrier,
            carrierId: vehicle.carrierId,
            amount: rev,
            platformFee: Math.round(rev * 0.05),
            carrierPayout: Math.round(rev * 0.95),
            status: status === 'Completed' ? 'PaidOut' : 'Escrow',
            transactionId: 'ch_' + Math.random().toString(36).substring(2, 12),
            createdAt: new Date(d)
          });
        }
      }
    }

    console.log(`Inserting ${bookings.length} booking records...`);
    const batchSize = 500;
    for (let i = 0; i < bookings.length; i += batchSize) {
      const batch = bookings.slice(i, i + batchSize);
      await Booking.insertMany(batch);
    }

    console.log(`Inserting ${payments.length} payment ledger logs...`);
    for (let i = 0; i < payments.length; i += batchSize) {
      const batch = payments.slice(i, i + batchSize);
      await Payment.insertMany(batch);
    }

    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
