import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';

const NOW = new Date();
const dateOffset = (days) => {
  const d = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
};

const NEW_PENDING_SHIPMENTS = [
  {
    code: 'CHN-CBE-DIECAST',
    cargoDescription: 'Die-cast Aluminum Automotive Clutch Casings',
    cargoCategory: 'AUTOMOTIVE',
    packageCount: 10,
    length: 1.10,
    width: 0.70,
    height: 0.60,
    volume: 4.62,
    weight: 780,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1400,
    priority: 'URGENT',
    routeId: 'TN-CHN-CBE',
    fromStop: 'Chennai',
    toStop: 'Coimbatore',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(1),
    invoiceNumber: 'INV-PND-001',
    invoiceValue: 125000,
    status: 'PENDING'
  },
  {
    code: 'CHN-TRY-MED',
    cargoDescription: 'Diagnostic Ultrasound Transducer Assemblies',
    cargoCategory: 'ELECTRONICS',
    packageCount: 12,
    length: 0.60,
    width: 0.50,
    height: 0.40,
    volume: 1.44,
    weight: 210,
    fragile: true,
    stackable: false,
    allowRotation: false,
    maxStackWeight: 0,
    priority: 'EXPRESS',
    routeId: 'TN-CHN-TRY',
    fromStop: 'Chennai',
    toStop: 'Tiruchirappalli',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(2),
    invoiceNumber: 'INV-PND-002',
    invoiceValue: 280000,
    status: 'PENDING'
  },
  {
    code: 'ERD-TPR-SPOOL',
    cargoDescription: 'Mercerized Hosiery Cotton Yarn Spools',
    cargoCategory: 'TEXTILE',
    packageCount: 20,
    length: 0.80,
    width: 0.50,
    height: 0.40,
    volume: 3.20,
    weight: 480,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 900,
    priority: 'STANDARD',
    routeId: 'TN-ERD-TPR',
    fromStop: 'Erode',
    toStop: 'Tiruppur',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(1),
    invoiceNumber: 'INV-PND-003',
    invoiceValue: 64000,
    status: 'PENDING'
  },
  {
    code: 'SLM-CHN-STEEL',
    cargoDescription: 'Cold-Rolled Stainless Steel Sheet Metal Coils',
    cargoCategory: 'GENERAL',
    packageCount: 6,
    length: 1.20,
    width: 0.80,
    height: 0.70,
    volume: 4.03,
    weight: 1620,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 2500,
    priority: 'URGENT',
    routeId: 'TN-CHN-SLM',
    fromStop: 'Salem',
    toStop: 'Chennai',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(3),
    invoiceNumber: 'INV-PND-004',
    invoiceValue: 175000,
    status: 'PENDING'
  },
  {
    code: 'MDU-TUT-VALVE',
    cargoDescription: 'High-Pressure Hydraulic Butterfly Valves & Actuators',
    cargoCategory: 'GENERAL',
    packageCount: 8,
    length: 0.90,
    width: 0.60,
    height: 0.50,
    volume: 2.16,
    weight: 560,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1200,
    priority: 'EXPRESS',
    routeId: 'TN-MDU-TUT',
    fromStop: 'Madurai',
    toStop: 'Thoothukudi',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(2),
    invoiceNumber: 'INV-PND-005',
    invoiceValue: 92000,
    status: 'PENDING'
  },
  {
    code: 'SLM-KRR-JACQ',
    cargoDescription: 'Woven Jacquard Home Furnishing & Upholstery Rolls',
    cargoCategory: 'TEXTILE',
    packageCount: 15,
    length: 1.50,
    width: 0.60,
    height: 0.50,
    volume: 6.75,
    weight: 820,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1100,
    priority: 'STANDARD',
    routeId: 'TN-SLM-KRR',
    fromStop: 'Salem',
    toStop: 'Karur',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(4),
    invoiceNumber: 'INV-PND-006',
    invoiceValue: 88000,
    status: 'PENDING'
  },
  {
    code: 'CBE-MDU-DAIRY',
    cargoDescription: 'Cold-Chain Fresh Farm Dairy Whey Crates',
    cargoCategory: 'PERISHABLE',
    packageCount: 30,
    length: 0.50,
    width: 0.40,
    height: 0.35,
    volume: 2.10,
    weight: 630,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1000,
    priority: 'STANDARD',
    routeId: 'TN-CBE-MDU',
    fromStop: 'Coimbatore',
    toStop: 'Madurai',
    vehicleId: 'UNASSIGNED',
    date: dateOffset(2),
    invoiceNumber: 'INV-PND-007',
    invoiceValue: 46000,
    status: 'PENDING'
  }
];

async function addPendingShipments() {
  console.log('===============================================================');
  console.log(' CREATING 7 NEW PENDING SHIPMENTS FOR NATARAJ');
  console.log('===============================================================\n');

  // Authenticate as nataraj
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nataraj@gmail.com', password: 'abcd1234' })
  });

  if (!loginRes.ok) throw new Error('Authentication failed');
  const { token } = await loginRes.json();
  const authHeader = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  for (let i = 0; i < NEW_PENDING_SHIPMENTS.length; i++) {
    const item = NEW_PENDING_SHIPMENTS[i];
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify(item)
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(`✗ Failed to create ${item.code}:`, err.message || err);
      continue;
    }

    const created = await res.json();
    console.log(`✓ Created Pending Consignment [${i + 1}/7]: ${created.bookingId} (${created.shipmentId}) | ${item.fromStop} -> ${item.toStop} | ${item.cargoCategory} | Status: ${created.status}`);
  }

  // Fetch updated status breakdown
  const bRes = await fetch(`${API_BASE}/bookings`, { headers: authHeader });
  const allBookings = await bRes.json();

  const statusCounts = {};
  allBookings.forEach(b => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });

  console.log('\n===============================================================');
  console.log(`Total Bookings in Nataraj Ledger: ${allBookings.length}`);
  console.log('Updated Status Distribution:', JSON.stringify(statusCounts, null, 2));
  console.log('===============================================================');
}

addPendingShipments().catch(err => {
  console.error('Error adding pending shipments:', err);
  process.exit(1);
});
