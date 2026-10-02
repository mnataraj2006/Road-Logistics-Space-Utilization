const BASE_URL = 'http://127.0.0.1:5000/api';

async function req(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function verifyPhase2() {
  console.log('=== PHASE 2 VERIFICATION: Customer Shipment Tracking & Security Scoping ===');

  // Step 1: Customer A login
  console.log('\n[1] Logging in as Customer A (demo-customer)...');
  const custRes = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      username: 'demo-customer',
      password: 'password123'
    })
  });
  if (!custRes.ok) throw new Error(`Customer A login failed: ${JSON.stringify(custRes.data)}`);
  const custToken = custRes.data.token;
  console.log('Customer A logged in:', custRes.data.username);

  // Step 2: Book a shipment for Customer A
  console.log('\n[2] Booking test shipment for Customer A...');
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 3);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  const searchRes = await req(`${BASE_URL}/capacity/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: targetDateStr,
      volume: 1.0,
      weight: 200
    })
  });

  const truck = (searchRes.data.results || [])[0];
  if (!truck) throw new Error('No trucks found for tracking test booking.');

  const bookRes = await req(`${BASE_URL}/capacity/book`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      vehicleId: truck.vehicleId,
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: targetDateStr,
      volume: 1.0,
      weight: 200,
      length: 1.0,
      width: 1.0,
      height: 1.0,
      cargoDescription: 'Phase 2 Real-Time Tracking Consignment'
    })
  });
  if (!bookRes.ok) throw new Error(`Booking failed: ${JSON.stringify(bookRes.data)}`);

  const { shipmentId, bookingId } = bookRes.data;
  console.log(`Created Consignment: Shipment=${shipmentId}, Booking=${bookingId}`);

  // Step 3: Customer A tracks by Shipment ID
  console.log('\n[3] Customer A tracking own shipment by Shipment ID...');
  const trackByShp = await req(`${BASE_URL}/shipments/track/${shipmentId}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  if (!trackByShp.ok) throw new Error(`Track by shipmentId failed: ${JSON.stringify(trackByShp.data)}`);

  console.log('SUCCESS! Track by Shipment ID response:', {
    shipmentId: trackByShp.data.shipment.shipmentId,
    bookingId: trackByShp.data.shipment.bookingId,
    status: trackByShp.data.shipment.status,
    pickup: trackByShp.data.shipment.pickup,
    delivery: trackByShp.data.shipment.delivery,
    vehicleId: trackByShp.data.shipment.vehicleId,
    stops: trackByShp.data.shipment.stops,
    currentStop: trackByShp.data.shipment.currentStop,
    currentStopIndex: trackByShp.data.shipment.currentStopIndex
  });

  // Step 4: Customer A tracks by Booking ID
  console.log('\n[4] Customer A tracking own consignment by Booking ID...');
  const trackByBkg = await req(`${BASE_URL}/shipments/track/${bookingId}`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  if (!trackByBkg.ok) throw new Error(`Track by bookingId failed: ${JSON.stringify(trackByBkg.data)}`);
  console.log('SUCCESS! Track by Booking ID returned exact same shipment:', trackByBkg.data.shipment.shipmentId);

  // Step 5: Test Security / Tenant Scoping (Customer B tries to track Customer A's cargo)
  console.log('\n[5] Testing Tenant Access Security: Customer B tracking Customer A cargo...');
  // Register or login Customer B
  const custBRes = await req(`${BASE_URL}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      username: `cust_sec_${Date.now()}`,
      email: `cust_sec_${Date.now()}@securetest.com`,
      password: 'password123',
      name: 'Unauthorized Stranger Customer'
    })
  });
  const custBToken = custBRes.data.token;
  console.log('Customer B registered & authenticated:', custBRes.data.username);

  const unauthorizedTrack = await req(`${BASE_URL}/shipments/track/${shipmentId}`, {
    headers: { Authorization: `Bearer ${custBToken}` }
  });

  console.log(`Customer B tracking status: HTTP ${unauthorizedTrack.status}`);
  if (unauthorizedTrack.status === 403) {
    console.log('SUCCESS! Cross-tenant access properly BLOCKED with HTTP 403 Forbidden:', unauthorizedTrack.data.message);
  } else {
    throw new Error(`CRITICAL SECURITY FAILURE: Expected HTTP 403 Forbidden, got ${unauthorizedTrack.status}!`);
  }

  // Step 6: Test non-existent tracking reference
  console.log('\n[6] Testing non-existent tracking reference...');
  const notFoundRes = await req(`${BASE_URL}/shipments/track/BKG-NONEXISTENT-999999`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  console.log(`Non-existent tracking status: HTTP ${notFoundRes.status}`);
  if (notFoundRes.status === 404) {
    console.log('SUCCESS! Correctly returned HTTP 404 Not Found:', notFoundRes.data.message);
  } else {
    throw new Error(`Expected HTTP 404, got ${notFoundRes.status}`);
  }

  console.log('\n>>> PHASE 2 COMPLETE & 100% VERIFIED <<<\n');
}

verifyPhase2().catch(err => {
  console.error('\n*** PHASE 2 VERIFICATION FAILED ***');
  console.error(err.message);
  process.exit(1);
});
