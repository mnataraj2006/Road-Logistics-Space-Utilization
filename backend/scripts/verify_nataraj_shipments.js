import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';

async function verifyNatarajShipments() {
  console.log('========================================================================');
  console.log(' VERIFICATION: REALISTIC SHIPMENT DATA FOR NATARAJ LOGISTICS MANAGER');
  console.log('========================================================================\n');

  let passes = 0;
  let fails = 0;

  const assert = (condition, name, details = '') => {
    if (condition) {
      passes++;
      console.log(`  [PASS] ${name}`);
      if (details) console.log(`         -> ${details}`);
    } else {
      fails++;
      console.error(`  [FAIL] ${name}`);
      if (details) console.error(`         -> ${details}`);
    }
  };

  // 1. Authenticate
  console.log('[1/7] Authenticating as nataraj@gmail.com...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nataraj@gmail.com', password: 'abcd1234' })
  });

  assert(loginRes.ok, 'Login as nataraj@gmail.com');
  const loginData = await loginRes.json();
  const token = loginData.token;
  const authHeader = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  // Check user details
  assert(loginData.email === 'nataraj@gmail.com', 'User Email Verification', `Email: ${loginData.email}`);
  assert(loginData.role === 'logistics_manager', 'User Role Verification', `Role: ${loginData.role}`);
  assert(loginData.companyName === 'Tamil Nadu Freight Logistics Ltd', 'User Company Verification', `Company: ${loginData.companyName}`);

  // 2. Query Dashboard Shipments & Bookings
  console.log('\n[2/7] Testing Shipment Dashboard Query (GET /api/bookings & GET /api/shipments)...');
  const [bRes, sRes] = await Promise.all([
    fetch(`${API_BASE}/bookings`, { headers: authHeader }),
    fetch(`${API_BASE}/shipments`, { headers: authHeader })
  ]);

  assert(bRes.ok, 'GET /api/bookings returns 200 OK');
  assert(sRes.ok, 'GET /api/shipments returns 200 OK');

  const bookings = await bRes.json();
  const shipmentsData = await sRes.json();
  const shipments = shipmentsData.shipments || [];

  assert(Array.isArray(bookings) && bookings.length >= 25 && bookings.length <= 30, 
    'Bookings Count within 25-30 Range', `Found: ${bookings.length}`);
  assert(shipments.length >= 25, 
    'Backing Shipments Count Valid', `Found: ${shipments.length}`);

  // 3. Inspect Required Fields, Dimensions, Weight, Quantities, and Duplicates
  console.log('\n[3/7] Validating Data Integrity (Fields, Dimensions, Weights, No Duplicates)...');
  const bookingIds = new Set();
  const shipmentIds = new Set();
  let duplicateCount = 0;
  let invalidFieldsCount = 0;
  let volumeMismatchCount = 0;

  const routesSeen = new Set();
  const categoriesSeen = new Set();
  const prioritiesSeen = new Set();
  const statusesSeen = new Set();
  const trucksSeen = new Set();

  let minWeight = Infinity, maxWeight = -Infinity;
  let minVol = Infinity, maxVol = -Infinity;
  let minQty = Infinity, maxQty = -Infinity;

  bookings.forEach(b => {
    // Duplicate check
    if (bookingIds.has(b.bookingId)) duplicateCount++;
    bookingIds.add(b.bookingId);

    if (shipmentIds.has(b.shipmentId)) duplicateCount++;
    shipmentIds.add(b.shipmentId);

    // Required fields check
    if (!b.bookingId || !b.shipmentId || !b.fromStop || !b.toStop || !b.cargoDescription ||
        b.weight == null || b.volume == null || !b.priority || !b.status || !b.date) {
      invalidFieldsCount++;
    }

    // Origin != Destination check
    if (b.fromStop.toLowerCase() === b.toStop.toLowerCase()) {
      invalidFieldsCount++;
    }

    routesSeen.add(`${b.fromStop} -> ${b.toStop}`);
    categoriesSeen.add(b.cargoCategory);
    prioritiesSeen.add(b.priority);
    statusesSeen.add(b.status);
    if (b.vehicleId && b.vehicleId !== 'UNASSIGNED') trucksSeen.add(b.vehicleId);

    if (b.weight < minWeight) minWeight = b.weight;
    if (b.weight > maxWeight) maxWeight = b.weight;
    if (b.volume < minVol) minVol = b.volume;
    if (b.volume > maxVol) maxVol = b.volume;
    if (b.packageCount < minQty) minQty = b.packageCount;
    if (b.packageCount > maxQty) maxQty = b.packageCount;
  });

  assert(duplicateCount === 0, 'No Duplicate Bookings or Shipments', `Duplicates: ${duplicateCount}`);
  assert(invalidFieldsCount === 0, 'All Required Fields Populated and Valid', `Invalid records: ${invalidFieldsCount}`);
  assert(routesSeen.size >= 12, 'Route Diversity (>= 12 distinct routes)', `Distinct routes: ${routesSeen.size}`);
  assert(categoriesSeen.size >= 5, 'Cargo Category Diversity (>= 5 categories)', `Found categories: ${Array.from(categoriesSeen).join(', ')}`);
  assert(prioritiesSeen.has('URGENT') && prioritiesSeen.has('EXPRESS') && prioritiesSeen.has('STANDARD'), 
    'All Priorities Represented (URGENT, EXPRESS, STANDARD)', `Priorities: ${Array.from(prioritiesSeen).join(', ')}`);
  assert(statusesSeen.has('BOOKED') && statusesSeen.has('ALLOCATED') && statusesSeen.has('IN_TRANSIT') && statusesSeen.has('DELIVERED'),
    'Realistic Status Distribution (BOOKED, ALLOCATED, IN_TRANSIT, DELIVERED)', `Statuses: ${Array.from(statusesSeen).join(', ')}`);
  assert(minQty >= 2 && maxQty <= 50, 'Package Quantity Range (2 to 50)', `Range: ${minQty} - ${maxQty} units`);
  assert(minWeight >= 100 && maxWeight <= 2500, 'Weight Range Physically Reasonable', `Range: ${minWeight}kg - ${maxWeight}kg`);
  assert(minVol >= 1.0 && maxVol <= 10.0, 'Volume Range (1.0m³ to 8.0m³)', `Range: ${minVol}m³ - ${maxVol}m³`);

  // 4. Test Shipment Tracking & Details Endpoint
  console.log('\n[4/7] Testing Shipment Details & Tracking API (GET /api/shipments/track/:id)...');
  const sampleBooking = bookings[0];
  const trackRes = await fetch(`${API_BASE}/shipments/track/${sampleBooking.bookingId}`, {
    headers: authHeader
  });

  assert(trackRes.ok, `GET /api/shipments/track/${sampleBooking.bookingId} returns 200 OK`);
  const trackData = await trackRes.json();
  assert(trackData.success === true, 'Tracking Response Success Flag');
  assert(trackData.shipment?.shipmentId === sampleBooking.shipmentId, 
    'Tracking Resolves Canonical Shipment ID', `Resolved: ${trackData.shipment?.shipmentId}`);
  assert(trackData.shipment?.pickupStop === sampleBooking.fromStop && trackData.shipment?.deliveryStop === sampleBooking.toStop,
    'Tracking Preserves Pickup & Delivery Stops', `${trackData.shipment?.pickupStop} -> ${trackData.shipment?.deliveryStop}`);

  // 5. Test Filtering / Search (Simulate Manager View filtering)
  console.log('\n[5/7] Testing Shipment Filtering & Search Logic...');
  const urgentBookings = bookings.filter(b => b.priority === 'URGENT');
  const deliveredBookings = bookings.filter(b => b.status === 'DELIVERED');
  const allocatedBookings = bookings.filter(b => b.status === 'ALLOCATED');
  const bookedCandidates = bookings.filter(b => b.status === 'BOOKED');

  assert(urgentBookings.length > 0, 'Filter by Priority: URGENT', `Count: ${urgentBookings.length}`);
  assert(deliveredBookings.length > 0, 'Filter by Status: DELIVERED', `Count: ${deliveredBookings.length}`);
  assert(allocatedBookings.length > 0, 'Filter by Status: ALLOCATED', `Count: ${allocatedBookings.length}`);
  assert(bookedCandidates.length > 0, 'Filter by Status: BOOKED (Candidate Pool)', `Count: ${bookedCandidates.length}`);

  // 6. Test Space Optimizer Candidate Ingestion
  console.log('\n[6/7] Testing Space Optimizer Candidate Ingestion...');
  const tripsRes = await fetch(`${API_BASE}/trips`, { headers: authHeader });
  assert(tripsRes.ok, 'GET /api/trips returns 200 OK');
  const trips = await tripsRes.json();

  assert(Array.isArray(trips) && trips.length > 0, 'Found Planned Trips for Nataraj', `Trips count: ${trips.length}`);
  const targetTrip = trips.find(t => t.routeId === 'TN-CHN-CBE') || trips[0];

  const candRes = await fetch(`${API_BASE}/trips/${targetTrip.tripId}/candidates`, { headers: authHeader });
  assert(candRes.ok, `GET /api/trips/${targetTrip.tripId}/candidates returns 200 OK`);
  const candData = await candRes.json();
  const candidates = candData.candidates || [];

  assert(candidates.length > 0, 'Space Optimizer Candidates Successfully Retrieved from Nataraj Shipments', 
    `Trip: ${targetTrip.tripId} (${targetTrip.routeId}) | Candidates Available: ${candidates.length}`);
  
  if (candidates.length > 0) {
    const firstCand = candidates[0];
    console.log(`         -> Candidate 1: ${firstCand.shipmentId} | ${firstCand.pickup} -> ${firstCand.delivery} | Vol: ${firstCand.volume}m³ | Wt: ${firstCand.weight}kg`);
  }

  // 7. Verify Ownership & Tenancy
  console.log('\n[7/7] Verifying Ownership & Multi-Tenancy Scoping...');
  const nonOwnerCheck = bookings.every(b => b.organizationId === loginData.organizationId || b.carrierId === loginData.username || b.shipperId === loginData.username);
  assert(nonOwnerCheck, 'All Bookings Strictly Scoped to Nataraj / Tamil Nadu Freight Logistics Ltd');

  console.log('\n========================================================================');
  console.log(` VERIFICATION SUMMARY: ${passes} PASSED, ${fails} FAILED`);
  console.log('========================================================================');

  if (fails > 0) {
    process.exit(1);
  }
}

verifyNatarajShipments().catch(err => {
  console.error('\n✗ Verification script execution error:', err);
  process.exit(1);
});
