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

async function verifyPhase6() {
  console.log('=== PHASE 6 VERIFICATION: Customer Profile Persistence & Real Data ===');

  // Step 1: Customer login
  console.log('\n[1] Logging in as Customer (demo-customer)...');
  const custRes = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      username: 'demo-customer',
      password: 'password123'
    })
  });
  if (!custRes.ok) throw new Error('Customer login failed');
  const custToken = custRes.data.token;
  console.log('Customer logged in successfully.');

  // Step 2: Fetch current profile via GET /api/auth/me
  console.log('\n[2] Fetching initial profile via GET /api/auth/me...');
  const meRes = await req(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  if (!meRes.ok) throw new Error('GET /api/auth/me failed');
  console.log('Current profile in DB:', {
    username: meRes.data.username,
    email: meRes.data.email,
    companyName: meRes.data.companyName,
    phone: meRes.data.phone,
    address: meRes.data.address
  });

  // Step 3: Mutate profile via PUT /api/auth/profile
  const testCompany = `Phase 6 Verified Freight ${Date.now()}`;
  const testPhone = '+91 99440 98765';
  const testAddress = 'Plot 42, Ambattur Industrial Estate, Chennai, Tamil Nadu 600058';

  console.log('\n[3] Updating profile via PUT /api/auth/profile with new real values...');
  const updateRes = await req(`${BASE_URL}/auth/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({
      companyName: testCompany,
      phone: testPhone,
      address: testAddress
    })
  });

  if (!updateRes.ok) throw new Error(`PUT /api/auth/profile failed: ${JSON.stringify(updateRes.data)}`);
  console.log('SUCCESS! Profile update endpoint returned:', {
    companyName: updateRes.data.companyName,
    phone: updateRes.data.phone,
    address: updateRes.data.address
  });

  // Step 4: Re-query /api/auth/me to prove persistence in MongoDB
  console.log('\n[4] Re-fetching /api/auth/me to verify persistence in MongoDB...');
  const verifyRes = await req(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${custToken}` }
  });
  if (!verifyRes.ok) throw new Error('Verification GET /api/auth/me failed');

  const persisted = verifyRes.data;
  if (
    persisted.companyName !== testCompany ||
    persisted.phone !== testPhone ||
    persisted.address !== testAddress
  ) {
    throw new Error(`Profile fields do not match persisted values in DB! Expected: ${testCompany}, Got: ${persisted.companyName}`);
  }

  console.log('SUCCESS! Profile persisted and verified in database:', {
    username: persisted.username,
    companyName: persisted.companyName,
    phone: persisted.phone,
    address: persisted.address
  });

  console.log('\n>>> PHASE 6 COMPLETE & 100% VERIFIED <<<\n');
}

verifyPhase6().catch(err => {
  console.error('\n*** PHASE 6 VERIFICATION FAILED ***');
  console.error(err.message);
  process.exit(1);
});
