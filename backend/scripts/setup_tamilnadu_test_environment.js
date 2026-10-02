import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import User from '../models/User.js';
import LogisticsCompany from '../models/LogisticsCompany.js';
import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import Trip from '../models/Trip.js';

// -------------------------------------------------------------------
// 14 REALISTIC TAMIL NADU LOGISTICS LANES DEFINITION
// -------------------------------------------------------------------
const TN_LANES = [
  {
    routeId: 'TN-CHN-SPB',
    source: 'Chennai',
    destination: 'Sriperumbudur',
    distance: 42,
    baseRate: 120,
    stops: []
  },
  {
    routeId: 'TN-CHN-HSR',
    source: 'Chennai',
    destination: 'Hosur',
    distance: 310,
    baseRate: 160,
    stops: ['Sriperumbudur', 'Vellore', 'Ambur', 'Krishnagiri']
  },
  {
    routeId: 'TN-CHN-SLM',
    source: 'Chennai',
    destination: 'Salem',
    distance: 345,
    baseRate: 170,
    stops: ['Villupuram', 'Ulundurpet', 'Attur']
  },
  {
    routeId: 'TN-CHN-TRY',
    source: 'Chennai',
    destination: 'Tiruchirappalli',
    distance: 330,
    baseRate: 165,
    stops: ['Chengalpattu', 'Tindivanam', 'Villupuram', 'Perambalur']
  },
  {
    routeId: 'TN-CHN-CBE',
    source: 'Chennai',
    destination: 'Coimbatore',
    distance: 505,
    baseRate: 210,
    stops: ['Sriperumbudur', 'Vellore', 'Salem', 'Erode', 'Tiruppur']
  },
  {
    routeId: 'TN-SPB-CBE',
    source: 'Sriperumbudur',
    destination: 'Coimbatore',
    distance: 465,
    baseRate: 195,
    stops: ['Vellore', 'Salem', 'Erode', 'Tiruppur']
  },
  {
    routeId: 'TN-SLM-ERD',
    source: 'Salem',
    destination: 'Erode',
    distance: 65,
    baseRate: 125,
    stops: ['Sankagiri']
  },
  {
    routeId: 'TN-ERD-TPR',
    source: 'Erode',
    destination: 'Tiruppur',
    distance: 55,
    baseRate: 120,
    stops: ['Perundurai', 'Uthukuli']
  },
  {
    routeId: 'TN-CBE-MDU',
    source: 'Coimbatore',
    destination: 'Madurai',
    distance: 215,
    baseRate: 150,
    stops: ['Palladam', 'Dharapuram', 'Oddanchatram', 'Dindigul']
  },
  {
    routeId: 'TN-TRY-MDU',
    source: 'Tiruchirappalli',
    destination: 'Madurai',
    distance: 135,
    baseRate: 135,
    stops: ['Viralimalai', 'Dindigul']
  },
  {
    routeId: 'TN-MDU-TUT',
    source: 'Madurai',
    destination: 'Thoothukudi',
    distance: 145,
    baseRate: 140,
    stops: ['Virudhunagar', 'Kovilpatti']
  },
  {
    routeId: 'TN-TUT-TNV',
    source: 'Thoothukudi',
    destination: 'Tirunelveli',
    distance: 50,
    baseRate: 120,
    stops: ['Vagaikulam']
  },
  {
    routeId: 'TN-TNV-NGC',
    source: 'Tirunelveli',
    destination: 'Nagercoil',
    distance: 80,
    baseRate: 130,
    stops: ['Panagudi', 'Aralvaimozhi']
  },
  {
    routeId: 'TN-SLM-KRR',
    source: 'Salem',
    destination: 'Karur',
    distance: 100,
    baseRate: 135,
    stops: ['Namakkal', 'Paramathi Velur']
  }
];

// -------------------------------------------------------------------
// 14 REALISTIC TAMIL NADU TRUCKS WITH LOGICAL CORRIDOR ASSIGNMENTS
// -------------------------------------------------------------------
const TN_TRUCKS = [
  {
    vehicleId: 'TN-01-AB-4521',
    type: 'Medium Truck',
    dimensions: { length: 7.5, width: 2.3, height: 2.4 },
    capacityWeight: 10000,
    baseLocation: 'Chennai',
    routeLane: 'TN-CHN-SPB',
    ratePerCbm: 130,
    ratePerKg: 4.5
  },
  {
    vehicleId: 'TN-22-CD-7834',
    type: 'Container Truck',
    dimensions: { length: 12.0, width: 2.4, height: 2.6 },
    capacityWeight: 18000,
    baseLocation: 'Chennai',
    routeLane: 'TN-CHN-CBE',
    ratePerCbm: 160,
    ratePerKg: 5.5
  },
  {
    vehicleId: 'TN-38-EF-2190',
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityWeight: 20000,
    baseLocation: 'Coimbatore',
    routeLane: 'TN-CBE-MDU',
    ratePerCbm: 150,
    ratePerKg: 5.0
  },
  {
    vehicleId: 'TN-39-GH-6412',
    type: '17 ft Truck',
    dimensions: { length: 5.2, width: 2.0, height: 2.2 },
    capacityWeight: 6000,
    baseLocation: 'Tiruppur',
    routeLane: 'TN-ERD-TPR',
    ratePerCbm: 125,
    ratePerKg: 4.0
  },
  {
    vehicleId: 'TN-45-JK-8931',
    type: '20 ft Truck',
    dimensions: { length: 6.05, width: 2.44, height: 2.59 },
    capacityWeight: 12000,
    baseLocation: 'Tiruchirappalli',
    routeLane: 'TN-CHN-TRY',
    ratePerCbm: 145,
    ratePerKg: 4.8
  },
  {
    vehicleId: 'TN-47-LM-3256',
    type: '14 ft Truck',
    dimensions: { length: 4.3, width: 1.9, height: 2.1 },
    capacityWeight: 4500,
    baseLocation: 'Karur',
    routeLane: 'TN-SLM-KRR',
    ratePerCbm: 120,
    ratePerKg: 3.8
  },
  {
    vehicleId: 'TN-58-NP-7148',
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityWeight: 20000,
    baseLocation: 'Madurai',
    routeLane: 'TN-MDU-TUT',
    ratePerCbm: 155,
    ratePerKg: 5.2
  },
  {
    vehicleId: 'TN-59-QR-4627',
    type: 'Medium Truck',
    dimensions: { length: 7.5, width: 2.3, height: 2.4 },
    capacityWeight: 10000,
    baseLocation: 'Madurai',
    routeLane: 'TN-TRY-MDU',
    ratePerCbm: 135,
    ratePerKg: 4.5
  },
  {
    vehicleId: 'TN-66-ST-9083',
    type: '32 ft Truck',
    dimensions: { length: 9.75, width: 2.44, height: 2.74 },
    capacityWeight: 15000,
    baseLocation: 'Coimbatore',
    routeLane: 'TN-SPB-CBE',
    ratePerCbm: 170,
    ratePerKg: 5.8
  },
  {
    vehicleId: 'TN-72-UV-5319',
    type: 'Light Van',
    dimensions: { length: 3.2, width: 1.7, height: 1.8 },
    capacityWeight: 2000,
    baseLocation: 'Tirunelveli',
    routeLane: 'TN-TNV-NGC',
    ratePerCbm: 110,
    ratePerKg: 3.5
  },
  {
    vehicleId: 'TN-70-WX-1425',
    type: '20 ft Truck',
    dimensions: { length: 6.05, width: 2.44, height: 2.59 },
    capacityWeight: 12000,
    baseLocation: 'Hosur',
    routeLane: 'TN-CHN-HSR',
    ratePerCbm: 145,
    ratePerKg: 4.8
  },
  {
    vehicleId: 'TN-27-YZ-6830',
    type: 'Medium Truck',
    dimensions: { length: 7.5, width: 2.3, height: 2.4 },
    capacityWeight: 10000,
    baseLocation: 'Salem',
    routeLane: 'TN-SLM-ERD',
    ratePerCbm: 130,
    ratePerKg: 4.2
  },
  {
    vehicleId: 'TN-69-AB-3751',
    type: 'Container Truck',
    dimensions: { length: 12.0, width: 2.4, height: 2.6 },
    capacityWeight: 18000,
    baseLocation: 'Thoothukudi',
    routeLane: 'TN-TUT-TNV',
    ratePerCbm: 160,
    ratePerKg: 5.5
  },
  {
    vehicleId: 'TN-23-EF-5012',
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityWeight: 20000,
    baseLocation: 'Salem',
    routeLane: 'TN-CHN-SLM',
    ratePerCbm: 150,
    ratePerKg: 5.0
  }
];

export async function setupEnvironment() {
  console.log('===============================================================');
  console.log('🚀 SETTING UP REALISTIC LOGISTICS MANAGER TEST ENVIRONMENT');
  console.log('===============================================================');

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is missing in .env');

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB Atlas.');

  // -----------------------------------------------------------------
  // 1. Ensure Logistics Company exists
  // -----------------------------------------------------------------
  const companyName = 'Tamil Nadu Freight Logistics Ltd';
  let company = await LogisticsCompany.findOne({ name: companyName });
  if (!company) {
    company = await LogisticsCompany.create({
      name: companyName,
      registrationNumber: 'TN-LOG-GST33AABCT9821Z1',
      email: 'ops@tnfreightlogistics.com',
      phone: '+91 44 2250 8899',
      address: 'Guindy Industrial Estate, Chennai, Tamil Nadu',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      operatingRegion: 'Tamil Nadu & Southern Corridors',
      serviceCorridors: TN_LANES.map(l => `${l.source} - ${l.destination}`),
      yearsInOperation: 12,
      status: 'active'
    });
    console.log(`✓ Created Logistics Company: ${company.name} (${company._id})`);
  } else {
    console.log(`✓ Using existing Logistics Company: ${company.name} (${company._id})`);
  }

  // -----------------------------------------------------------------
  // 2. Create or verify Logistics Manager user: nataraj@gmail.com
  // -----------------------------------------------------------------
  const email = 'nataraj@gmail.com';
  const username = 'nataraj';
  const plainPassword = 'abcd1234';

  let managerUser = await User.findOne({ email });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(plainPassword, salt);

  if (!managerUser) {
    managerUser = await User.create({
      username,
      email,
      name: 'Nataraj (Logistics Manager)',
      password: hashedPassword,
      role: 'logistics_manager',
      organizationId: company._id,
      companyName: company.name,
      phone: '+91 94440 12345',
      address: 'Guindy Industrial Estate, Chennai, Tamil Nadu',
      baseLocation: 'Chennai',
      profileCompleted: true
    });
    console.log(`✓ Created new Logistics Manager: ${managerUser.email} (Role: ${managerUser.role})`);
  } else {
    // Ensure correct role, password, and organization
    managerUser.role = 'logistics_manager';
    managerUser.organizationId = company._id;
    managerUser.companyName = company.name;
    managerUser.password = hashedPassword;
    managerUser.profileCompleted = true;
    await managerUser.save();
    console.log(`✓ Verified existing user ${managerUser.email}: Role confirmed as 'logistics_manager', password reset to requested '${plainPassword}'.`);
  }

  // -----------------------------------------------------------------
  // 3. Create or update 14 Tamil Nadu Logistics Lanes
  // -----------------------------------------------------------------
  console.log('\n--- CREATING / VERIFYING 14 TAMIL NADU LOGISTICS LANES ---');
  const createdLanes = [];

  for (const laneData of TN_LANES) {
    let route = await Route.findOne({ routeId: laneData.routeId });

    const allStops = [laneData.source, ...(laneData.stops || []), laneData.destination];
    const stopsDetails = allStops.map((stopName, idx) => {
      const isOrigin = idx === 0;
      const isDest = idx === allStops.length - 1;
      return {
        stopId: `STP-${laneData.routeId}-${idx + 1}`,
        sequenceNumber: idx + 1,
        locationName: stopName,
        qrToken: `STPTKN-${crypto.randomBytes(8).toString('hex')}`,
        stopType: isOrigin ? 'ORIGIN' : isDest ? 'FINAL_DESTINATION' : 'INTERMEDIATE',
        status: isOrigin ? 'Ready' : 'Upcoming'
      };
    });

    if (!route) {
      route = await Route.create({
        routeId: laneData.routeId,
        source: laneData.source,
        destination: laneData.destination,
        distance: laneData.distance,
        baseRate: laneData.baseRate,
        stops: laneData.stops,
        stopsDetails,
        active: true,
        carrierId: managerUser.username
      });
      console.log(`  + Created Route: ${route.routeId} (${route.source} → ${route.destination}, ${route.distance} km, ${stopsDetails.length} stops)`);
    } else {
      route.source = laneData.source;
      route.destination = laneData.destination;
      route.distance = laneData.distance;
      route.baseRate = laneData.baseRate;
      route.stops = laneData.stops;
      if (!route.stopsDetails || route.stopsDetails.length === 0) {
        route.stopsDetails = stopsDetails;
      }
      route.active = true;
      await route.save();
      console.log(`  ✓ Route confirmed: ${route.routeId} (${route.source} → ${route.destination}, ${route.distance} km)`);
    }
    createdLanes.push(route);
  }

  // -----------------------------------------------------------------
  // 4. Create or update 14 Realistic Tamil Nadu Trucks
  // -----------------------------------------------------------------
  console.log('\n--- CREATING / VERIFYING 14 TAMIL NADU TRUCKS ---');
  const createdTrucks = [];

  for (const truckData of TN_TRUCKS) {
    let vehicle = await Vehicle.findOne({ vehicleId: truckData.vehicleId });

    const len = truckData.dimensions.length;
    const wid = truckData.dimensions.width;
    const hgt = truckData.dimensions.height;
    const volume = parseFloat((len * wid * hgt).toFixed(2));

    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleId: truckData.vehicleId,
        type: truckData.type,
        capacityVolume: volume,
        capacityWeight: truckData.capacityWeight,
        dimensions: { length: len, width: wid, height: hgt },
        status: 'AVAILABLE',
        transitStatus: 'AVAILABLE',
        baseLocation: truckData.baseLocation,
        routeLane: truckData.routeLane,
        ratePerCbm: truckData.ratePerCbm,
        ratePerKg: truckData.ratePerKg,
        organizationId: company._id,
        logisticsCompanyName: company.name,
        carrierId: managerUser.username
      });
      console.log(`  + Created Truck: ${vehicle.vehicleId} [${vehicle.type}] (${len}×${wid}×${hgt}m, ${volume} m³, ${vehicle.capacityWeight} kg) → Assigned to: ${vehicle.routeLane}`);
    } else {
      vehicle.type = truckData.type;
      vehicle.dimensions = { length: len, width: wid, height: hgt };
      vehicle.capacityVolume = volume;
      vehicle.capacityWeight = truckData.capacityWeight;
      vehicle.baseLocation = truckData.baseLocation;
      vehicle.routeLane = truckData.routeLane;
      vehicle.ratePerCbm = truckData.ratePerCbm;
      vehicle.ratePerKg = truckData.ratePerKg;
      vehicle.organizationId = company._id;
      vehicle.logisticsCompanyName = company.name;
      vehicle.carrierId = managerUser.username;
      await vehicle.save();
      console.log(`  ✓ Truck confirmed: ${vehicle.vehicleId} [${vehicle.type}] → Assigned to: ${vehicle.routeLane}`);
    }
    createdTrucks.push(vehicle);
  }

  // -----------------------------------------------------------------
  // 5. Seed Planned Demonstration Trips for Key Corridors
  // -----------------------------------------------------------------
  console.log('\n--- ENSURING DEMO PLANNED TRIPS EXIST FOR LOGISTICS MANAGER ---');
  const keyTripsToSeed = [
    { vehicleId: 'TN-01-AB-4521', routeId: 'TN-CHN-SPB' },
    { vehicleId: 'TN-22-CD-7834', routeId: 'TN-CHN-CBE' },
    { vehicleId: 'TN-38-EF-2190', routeId: 'TN-CBE-MDU' },
    { vehicleId: 'TN-58-NP-7148', routeId: 'TN-MDU-TUT' }
  ];

  for (const kt of keyTripsToSeed) {
    const existingTrip = await Trip.findOne({
      vehicleId: kt.vehicleId,
      routeId: kt.routeId,
      status: { $in: ['PLANNED', 'DRAFT', 'READY_FOR_DISPATCH'] }
    });

    if (!existingTrip) {
      const v = await Vehicle.findOne({ vehicleId: kt.vehicleId });
      const r = await Route.findOne({ routeId: kt.routeId });
      const depDate = new Date();
      depDate.setDate(depDate.getDate() + 1);

      const tripDoc = await Trip.create({
        tripId: `TRIP-${kt.vehicleId}-${Date.now().toString().slice(-6)}`,
        vehicleId: kt.vehicleId,
        vehicle: v._id,
        routeId: kt.routeId,
        route: r._id,
        plannedDeparture: depDate,
        status: 'PLANNED',
        organizationId: company._id,
        logisticsCompanyName: company.name,
        carrierId: managerUser.username,
        vehicleSnapshot: {
          interiorLength: v.dimensions.length,
          interiorWidth: v.dimensions.width,
          interiorHeight: v.dimensions.height,
          capacityVolume: v.capacityVolume,
          capacityWeight: v.capacityWeight,
          dimensions: v.dimensions,
          ratePerCbm: v.ratePerCbm,
          ratePerKg: v.ratePerKg,
          type: v.type
        }
      });
      console.log(`  + Created Demonstration Trip: ${tripDoc.tripId} (${kt.vehicleId} on ${kt.routeId})`);
    } else {
      console.log(`  ✓ Demonstration Trip already exists: ${existingTrip.tripId} (${kt.vehicleId} on ${kt.routeId})`);
    }
  }

  await mongoose.disconnect();
  console.log('\n===============================================================');
  console.log('✅ ENVIRONMENT SETUP COMPLETED SUCCESSFULLY');
  console.log('===============================================================');
}

setupEnvironment().catch(err => {
  console.error('❌ Environment Setup Failed:', err);
  process.exit(1);
});
