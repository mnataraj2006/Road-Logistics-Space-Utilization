import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import User from '../models/User.js';
import LogisticsCompany from '../models/LogisticsCompany.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';

import { registerUser, registerLogisticsCompany, verifyGoogleManager, loginUser } from '../controllers/authController.js';
import { getVehicles, getVehicleById } from '../controllers/vehicleController.js';
import { getTrips } from '../controllers/tripController.js';
import { getBookings } from '../controllers/bookingController.js';
import { searchAvailableTruckSpace, bookTruckCapacity } from '../services/capacitySearchService.js';
import { authorizeRoles } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const createMockReqRes = (overrides = {}) => {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
  return { req, res };
};

const runMultiTenantTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('🚀 RUNNING COMPREHENSIVE LOGISTICS ONBOARDING & TENANT TEST SUITE');
    console.log('===============================================================\n');

    const testTimestamp = Date.now();
    const audience = process.env.GOOGLE_CLIENT_ID || 'dummy-google-client-id';

    // ── TEST 1: Customer Public Signup ────────────────────────────
    console.log('[TEST 1] Testing Public Customer Registration (Role = customer, org = null)...');
    const custEmail = `cust_market_${testTimestamp}@retailer.com`;
    const custUsername = `cust_market_${testTimestamp}`;
    const { req: req1, res: res1 } = createMockReqRes({
      body: {
        username: custUsername,
        email: custEmail,
        password: 'Password@2026!',
        name: 'Apex Retailer Ltd'
      }
    });
    await registerUser(req1, res1);
    if (res1.statusCode !== 201 || res1.body.role !== 'customer') {
      throw new Error(`Test 1 Failed: Customer signup status=${res1.statusCode}, role=${res1.body?.role}`);
    }
    const customerUser = await User.findOne({ email: custEmail });
    if (!customerUser || customerUser.role !== 'customer' || customerUser.organizationId !== null) {
      throw new Error('Test 1 Failed: Customer user record not correctly created with organizationId=null');
    }
    console.log(`  ✓ Customer Account Created: ${customerUser.email} (Role: ${customerUser.role}, Organization: null)`);

    // ── TEST 2: Logistics Company A Registration (Traditional) ────
    console.log('\n[TEST 2] Testing Logistics Company A Registration (Traditional Email/Password)...');
    const compAEmail = `ops_comp_a_${testTimestamp}@apexlogistics.com`;
    const compARegNo = `GST33AABCU${testTimestamp.toString().slice(-4)}R1ZM`;
    const { req: req2, res: res2 } = createMockReqRes({
      body: {
        companyName: 'Apex Freight Logistics',
        registrationNumber: compARegNo,
        companyEmail: compAEmail,
        phone: '+91 44 2800 1111',
        address: 'Terminal A, Chennai Port',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        operatingRegion: 'Tamil Nadu & Karnataka',
        serviceCorridors: 'Chennai → Bangalore, Chennai → Coimbatore',
        managerName: 'Rajesh Alpha',
        managerEmail: compAEmail,
        password: 'ManagerPasswordA@2026!'
      }
    });
    await registerLogisticsCompany(req2, res2);
    if (res2.statusCode !== 201 || res2.body.role !== 'logistics_manager') {
      throw new Error(`Test 2 Failed: Company A registration failed (${res2.statusCode})`);
    }
    const companyA = await LogisticsCompany.findOne({ registrationNumber: compARegNo });
    const managerA = await User.findOne({ email: compAEmail });
    if (!companyA || !managerA || String(managerA.organizationId) !== String(companyA._id)) {
      throw new Error('Test 2 Failed: Company A or Manager A link invalid');
    }
    console.log(`  ✓ Logistics Company A Registered: ${companyA.name} (ID: ${companyA._id}) | Manager: ${managerA.email}`);

    // ── TEST 3: Duplicate GST / Registration Number Prevention ────
    console.log('\n[TEST 3] Testing Duplicate GST / Registration Number Rejection...');
    const { req: dupRegReq, res: dupRegRes } = createMockReqRes({
      body: {
        companyName: 'Duplicate Entity Inc',
        registrationNumber: compARegNo, // Duplicate
        companyEmail: `dup_${testTimestamp}@entity.com`,
        phone: '+91 44 1111 2222',
        address: 'HQ Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        operatingRegion: 'Tamil Nadu',
        managerName: 'Dup Manager',
        managerEmail: `dup_${testTimestamp}@entity.com`,
        password: 'Password@2026!'
      }
    });
    await registerLogisticsCompany(dupRegReq, dupRegRes);
    if (dupRegRes.statusCode !== 400 || !dupRegRes.body?.message?.includes('registration number is already registered')) {
      throw new Error(`Test 3 Failed: Duplicate registration number was not rejected properly (status: ${dupRegRes.statusCode}, msg: ${dupRegRes.body?.message})`);
    }
    console.log(`  ✓ Duplicate registration number rejected with HTTP 400: "${dupRegRes.body?.message}"`);

    // ── TEST 4: Duplicate Company Official Email Prevention ───────
    console.log('\n[TEST 4] Testing Duplicate Company Email Rejection...');
    const { req: dupEmailReq, res: dupEmailRes } = createMockReqRes({
      body: {
        companyName: 'Another Entity Inc',
        registrationNumber: `REG-DIFF-${testTimestamp}`,
        companyEmail: compAEmail, // Duplicate
        phone: '+91 44 1111 3333',
        address: 'HQ Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        operatingRegion: 'Tamil Nadu',
        managerName: 'Another Manager',
        managerEmail: `another_${testTimestamp}@entity.com`,
        password: 'Password@2026!'
      }
    });
    await registerLogisticsCompany(dupEmailReq, dupEmailRes);
    if (dupEmailRes.statusCode !== 400 || !dupEmailRes.body?.message?.includes('official email is already registered')) {
      throw new Error(`Test 4 Failed: Duplicate company email was not rejected properly (status: ${dupEmailRes.statusCode}, msg: ${dupEmailRes.body?.message})`);
    }
    console.log(`  ✓ Duplicate company email rejected with HTTP 400: "${dupEmailRes.body?.message}"`);

    // ── TEST 4B: Missing Required Primary Operating Region ────────
    console.log('\n[TEST 4B] Testing Required Primary Operating Region Validation...');
    const { req: missingRegionReq, res: missingRegionRes } = createMockReqRes({
      body: {
        companyName: 'No Region Corp',
        registrationNumber: `REG-NO-REGION-${testTimestamp}`,
        companyEmail: `noregion_${testTimestamp}@test.com`,
        phone: '+91 44 9999 8888',
        address: 'HQ Address',
        city: 'Chennai',
        state: 'Tamil Nadu',
        operatingRegion: '', // Empty - Should fail
        managerName: 'No Region Manager',
        managerEmail: `noregion_${testTimestamp}@test.com`,
        password: 'Password@2026!'
      }
    });
    await registerLogisticsCompany(missingRegionReq, missingRegionRes);
    if (missingRegionRes.statusCode !== 400 || !missingRegionRes.body?.message?.includes('Primary Operating Region is required')) {
      throw new Error(`Test 4B Failed: Missing operatingRegion was not rejected (status: ${missingRegionRes.statusCode})`);
    }
    console.log(`  ✓ Missing operatingRegion rejected with HTTP 400: "${missingRegionRes.body?.message}"`);

    // ── TEST 5: Existing Customer Google Account Attempt ─────────
    console.log('\n[TEST 5] Testing Existing Customer Protection against Logistics Conversion...');
    // Create mock verified google payload for customer
    const mockCustomerGoogleToken = jwt.sign({
      sub: `google_cust_${testTimestamp}`,
      email: custEmail,
      email_verified: true,
      name: 'Existing Customer',
      aud: audience,
      azp: audience
    }, 'test_secret');

    const { req: custGoogleReq, res: custGoogleRes } = createMockReqRes({
      body: { idToken: mockCustomerGoogleToken }
    });
    await verifyGoogleManager(custGoogleReq, custGoogleRes);
    if (custGoogleRes.statusCode !== 409 || custGoogleRes.body?.code !== 'EXISTING_CUSTOMER') {
      throw new Error(`Test 5 Failed: Existing customer Google attempt was not rejected with 409 EXISTING_CUSTOMER (${custGoogleRes.statusCode})`);
    }
    console.log(`  ✓ Existing customer Google verification rejected with HTTP 409: "${custGoogleRes.body?.message}"`);

    // ── TEST 6: Existing Manager Google Account Attempt ──────────
    console.log('\n[TEST 6] Testing Existing Manager Google Account Protection...');
    const mockManagerGoogleToken = jwt.sign({
      sub: `google_mgr_${testTimestamp}`,
      email: compAEmail,
      email_verified: true,
      name: 'Existing Manager',
      aud: audience,
      azp: audience
    }, 'test_secret');

    const { req: mgrGoogleReq, res: mgrGoogleRes } = createMockReqRes({
      body: { idToken: mockManagerGoogleToken }
    });
    await verifyGoogleManager(mgrGoogleReq, mgrGoogleRes);
    if (mgrGoogleRes.statusCode !== 409 || mgrGoogleRes.body?.code !== 'EXISTING_MANAGER') {
      throw new Error(`Test 6 Failed: Existing manager Google attempt was not rejected with 409 EXISTING_MANAGER (${mgrGoogleRes.statusCode})`);
    }
    console.log(`  ✓ Existing manager Google verification rejected with HTTP 409: "${mgrGoogleRes.body?.message}"`);

    // ── TEST 7: New Manager Google Account Onboarding Verification ───
    console.log('\n[TEST 7] Testing New Manager Google Verification & Company Registration...');
    const newMgrGoogleEmail = `new_google_mgr_${testTimestamp}@expresslogistics.com`;
    const newMgrGoogleId = `google_sub_${testTimestamp}`;
    const mockNewGoogleToken = jwt.sign({
      sub: newMgrGoogleId,
      email: newMgrGoogleEmail,
      email_verified: true,
      name: 'Suresh Express Director',
      picture: 'https://example.com/avatar.jpg',
      aud: audience,
      azp: audience
    }, 'test_secret');

    const { req: newGVerifyReq, res: newGVerifyRes } = createMockReqRes({
      body: { idToken: mockNewGoogleToken }
    });
    await verifyGoogleManager(newGVerifyReq, newGVerifyRes);
    if (newGVerifyRes.statusCode !== 200 || !newGVerifyRes.body.verified) {
      throw new Error(`Test 7 Failed: New Google account verification failed (${newGVerifyRes.statusCode})`);
    }
    console.log(`  ✓ New Google account verified successfully: Name="${newGVerifyRes.body.name}", Email="${newGVerifyRes.body.email}"`);

    // Complete company registration with Google credentials
    const compBEmail = `ops_comp_b_${testTimestamp}@expresslogistics.com`;
    const compBRegNo = `GST29XYZW${testTimestamp.toString().slice(-4)}P1ZQ`;
    const { req: reqGoogleReg, res: resGoogleReg } = createMockReqRes({
      body: {
        companyName: 'Express Route Logistics',
        registrationNumber: compBRegNo,
        companyEmail: compBEmail,
        phone: '+91 80 4400 2222',
        address: 'Terminal B, Bangalore Logistics Park',
        city: 'Bangalore',
        state: 'Karnataka',
        country: 'India',
        operatingRegion: 'Karnataka & Tamil Nadu',
        managerName: newGVerifyRes.body.name,
        managerEmail: newGVerifyRes.body.email,
        googleCredential: mockNewGoogleToken,
        // Attempt frontend privilege injection: should be ignored/overwritten by backend
        role: 'customer',
        organizationId: '6a96fd464afc9ec26ba30000'
      }
    });
    await registerLogisticsCompany(reqGoogleReg, resGoogleReg);
    if (resGoogleReg.statusCode !== 201 || resGoogleReg.body.role !== 'logistics_manager') {
      throw new Error(`Test 7 Failed: Google company registration failed (${resGoogleReg.statusCode}, role=${resGoogleReg.body?.role})`);
    }
    const companyB = await LogisticsCompany.findOne({ registrationNumber: compBRegNo });
    const managerB = await User.findOne({ email: newMgrGoogleEmail });
    if (!companyB || !managerB || String(managerB.organizationId) !== String(companyB._id) || managerB.role !== 'logistics_manager') {
      throw new Error('Test 7 Failed: Company B or Manager B server-side role/org assignment invalid');
    }
    console.log(`  ✓ Logistics Company B Registered via Google: ${companyB.name} (ID: ${companyB._id}) | Role: ${managerB.role} (Injected 'customer' role strictly ignored)`);

    // ── TEST 8: Multi-Tenant Fleet Setup & Isolation ──────────────
    console.log('\n[TEST 8] Testing Fleet Operations Tenant Isolation...');
    let route = await Route.findOne({ routeId: 'CHN-BLR-EXP' });
    if (!route) {
      route = await Route.create({
        routeId: 'CHN-BLR-EXP',
        source: 'Chennai',
        destination: 'Bangalore',
        distance: 350,
        baseRate: 150,
        stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
        stopsDetails: [
          { stopId: 'STP-CHN', sequenceNumber: 0, locationName: 'Chennai', qrToken: 'QR-CHN-001', distanceFromSource: 0, stopType: 'ORIGIN' },
          { stopId: 'STP-KNC', sequenceNumber: 1, locationName: 'Kanchipuram', qrToken: 'QR-KNC-002', distanceFromSource: 75, stopType: 'INTERMEDIATE' },
          { stopId: 'STP-VEL', sequenceNumber: 2, locationName: 'Vellore', qrToken: 'QR-VEL-003', distanceFromSource: 140, stopType: 'INTERMEDIATE' },
          { stopId: 'STP-HOS', sequenceNumber: 3, locationName: 'Hosur', qrToken: 'QR-HOS-004', distanceFromSource: 300, stopType: 'INTERMEDIATE' },
          { stopId: 'STP-BLR', sequenceNumber: 4, locationName: 'Bangalore', qrToken: 'QR-BLR-005', distanceFromSource: 350, stopType: 'FINAL_DESTINATION' }
        ],
        active: true
      });
    }

    const vehIdA = `TRK-A-${testTimestamp}`;
    const vehIdB = `TRK-B-${testTimestamp}`;

    const vehicleA = await Vehicle.create({
      vehicleId: vehIdA,
      type: 'Heavy Truck',
      capacityVolume: 80,
      capacityWeight: 15000,
      organizationId: companyA._id,
      logisticsCompanyName: companyA.name,
      carrier: managerA._id,
      carrierId: String(companyA._id),
      routeLane: route.routeId,
      status: 'Active'
    });

    const vehicleB = await Vehicle.create({
      vehicleId: vehIdB,
      type: 'Medium Truck',
      capacityVolume: 50,
      capacityWeight: 9000,
      organizationId: companyB._id,
      logisticsCompanyName: companyB.name,
      carrier: managerB._id,
      carrierId: String(companyB._id),
      routeLane: route.routeId,
      status: 'Active'
    });

    // Manager A fetches fleet
    const { req: getVehAReq, res: getVehARes } = createMockReqRes({ user: managerA });
    await getVehicles(getVehAReq, getVehARes);
    const listA = getVehARes.body;
    const hasVehA = listA.some(v => v.vehicleId === vehIdA);
    const hasVehBInA = listA.some(v => v.vehicleId === vehIdB);

    if (!hasVehA || hasVehBInA) {
      throw new Error(`Test 8 Failed: Manager A saw vehicles outside Company A!`);
    }

    // Manager B fetches fleet
    const { req: getVehBReq, res: getVehBRes } = createMockReqRes({ user: managerB });
    await getVehicles(getVehBReq, getVehBRes);
    const listB = getVehBRes.body;
    const hasVehB = listB.some(v => v.vehicleId === vehIdB);
    const hasVehAInB = listB.some(v => v.vehicleId === vehIdA);

    if (!hasVehB || hasVehAInB) {
      throw new Error(`Test 8 Failed: Manager B saw vehicles outside Company B!`);
    }
    console.log(`  ✓ Fleet Isolation Verified: Manager A sees ONLY Company A (${listA.length}), Manager B sees ONLY Company B (${listB.length}).`);

    // ── TEST 9: Cross-Tenant Single Vehicle Direct Access Defense ──
    console.log('\n[TEST 9] Testing Direct Cross-Tenant Resource Defense...');
    const { req: crossReq, res: crossRes } = createMockReqRes({
      params: { id: vehIdB },
      user: managerA
    });
    await getVehicleById(crossReq, crossRes);
    if (crossRes.statusCode !== 404 && crossRes.statusCode !== 403) {
      throw new Error(`Test 9 Failed: Manager A was able to access Company B vehicle record (${crossRes.statusCode})`);
    }
    console.log(`  ✓ Manager A request for Company B vehicle rejected with HTTP ${crossRes.statusCode}.`);

    // ── TEST 10: Customer Platform-Wide Capacity Search ───────────
    console.log('\n[TEST 10] Testing Customer Marketplace Search Across All Companies...');
    const searchDate = new Date().toISOString().split('T')[0];
    const searchResults = await searchAvailableTruckSpace({
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: searchDate,
      volume: 12,
      weight: 2500
    });

    const foundCompATruck = searchResults.results.some(r => r.vehicleId === vehIdA && r.logisticsCompanyName === companyA.name);
    const foundCompBTruck = searchResults.results.some(r => r.vehicleId === vehIdB && r.logisticsCompanyName === companyB.name);

    if (!foundCompATruck || !foundCompBTruck) {
      throw new Error(`Test 10 Failed: Customer search did not return capacity from both Company A and Company B`);
    }
    console.log(`  ✓ Customer search returned multi-tenant capacity: Found Company A ('${companyA.name}') and Company B ('${companyB.name}').`);

    // ── TEST 11: Multi-Tenant Booking Ownership ───────────────────
    console.log('\n[TEST 11] Testing Multi-Tenant Booking Ownership & Board Isolation...');
    const bookingResult = await bookTruckCapacity({
      vehicleId: vehIdB,
      routeId: route.routeId,
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: searchDate,
      volume: 8,
      weight: 1200,
      customerUser: customerUser,
      cargoDescription: 'Electronics & Component Consignment'
    });

    if (!bookingResult || !bookingResult.booking) {
      throw new Error('Test 11 Failed: Capacity booking creation failed');
    }
    const createdBooking = await Booking.findById(bookingResult.booking._id);
    if (String(createdBooking.organizationId) !== String(companyB._id)) {
      throw new Error(`Test 11 Failed: Booking organizationId is ${createdBooking.organizationId}, expected Company B ID: ${companyB._id}`);
    }

    // Manager B fetches bookings
    const { req: mgrBBookReq, res: mgrBBookRes } = createMockReqRes({ user: managerB, query: {} });
    await getBookings(mgrBBookReq, mgrBBookRes);
    const mgrBBookings = mgrBBookRes.body;
    const mgrBSeesBooking = mgrBBookings.some(b => b.bookingId === createdBooking.bookingId);

    // Manager A fetches bookings
    const { req: mgrABookReq, res: mgrABookRes } = createMockReqRes({ user: managerA, query: {} });
    await getBookings(mgrABookReq, mgrABookRes);
    const mgrABookings = mgrABookRes.body;
    const mgrASeesBooking = mgrABookings.some(b => b.bookingId === createdBooking.bookingId);

    if (!mgrBSeesBooking || mgrASeesBooking) {
      throw new Error('Test 11 Failed: Booking isolation failed (Manager B sees: ' + mgrBSeesBooking + ', Manager A sees: ' + mgrASeesBooking + ')');
    }
    console.log(`  ✓ Booking Assigned to Organization '${companyB.name}' | Visible to Manager B: YES | Visible to Manager A: NO.`);

    // ── TEST 12: Customer Blocked from Manager Role ───────────────
    console.log('\n[TEST 12] Testing Customer Role RBAC Boundary...');
    const managerGuard = authorizeRoles('logistics_manager');
    const { req: custGuardReq, res: custGuardRes } = createMockReqRes({ user: customerUser });
    let nextCalled = false;
    managerGuard(custGuardReq, custGuardRes, () => { nextCalled = true; });

    if (nextCalled || custGuardRes.statusCode !== 403) {
      throw new Error('Test 12 Failed: Customer was not forbidden from manager operations (403)');
    }
    console.log('  ✓ Customer call to manager operations rejected with HTTP 403 Forbidden.');

    // Cleanup test artifacts
    await User.deleteMany({ _id: { $in: [customerUser._id, managerA._id, managerB._id] } });
    await LogisticsCompany.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    await Vehicle.deleteMany({ vehicleId: { $in: [vehIdA, vehIdB] } });
    await Booking.deleteMany({ bookingId: createdBooking.bookingId });
    await Shipment.deleteMany({ shipmentId: bookingResult.shipment.shipmentId });
    await mongoose.disconnect();

    console.log('\n===============================================================');
    console.log('🎉 ALL 12 MULTI-TENANT & GOOGLE ONBOARDING TESTS PASSED (100%)');
    console.log('===============================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test Suite Failed:', error);
    process.exit(1);
  }
};

runMultiTenantTestSuite();
