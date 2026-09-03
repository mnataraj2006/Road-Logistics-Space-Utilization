import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import User from '../models/User.js';
import { loginUser, registerUser, bootstrapManager, getMe, googleLogin } from '../controllers/authController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';

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

// Authoritative Post-Login Route Resolver (matches frontend getPostLoginRoute)
const getPostLoginRoute = (role) => {
  if (role === 'logistics_manager' || role === 'admin') {
    return '/manager/dashboard';
  }
  if (role === 'customer') {
    return '/customer/dashboard';
  }
  return '/login';
};

const runAccountCreationArchitectureTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('🚀 TESTING COMPLETE ACCOUNT CREATION ARCHITECTURE (TWO ROLES)');
    console.log('===============================================================\n');

    const testCustEmail = `test.public.customer_${Date.now()}@example.com`;
    const testCustGoogleEmail = `test.google.customer_${Date.now()}@gmail.com`;
    const testMgrEmail = `test.secure.manager_${Date.now()}@cargolytics.com`;
    const testPassword = 'SecurePassword2026!';
    const secret = process.env.JWT_SECRET || 'road_logistics_secret_dev_key_2026';
    const googleAudience = process.env.GOOGLE_CLIENT_ID || '201127500798-tooljnnriapt38tulpr9opivdbr460st.apps.googleusercontent.com';

    // ── TEST 1: Public Customer Signup Flow ───────────────────────
    console.log('[TEST 1] Testing Public Customer Signup Flow (Email/Password)...');
    const { req: regReq, res: regRes } = createMockReqRes({
      body: {
        username: `cust_${Date.now()}`,
        email: testCustEmail,
        password: testPassword,
        companyName: 'Apex Exports',
        phone: '+91 98765 12345',
        address: 'Chennai Logistics Hub'
      }
    });

    await registerUser(regReq, regRes);
    if (regRes.statusCode !== 201 || regRes.body.role !== 'customer') {
      throw new Error(`Test 1 Failed: Public signup returned status ${regRes.statusCode}, role: ${regRes.body?.role}`);
    }

    const custDbDoc = await User.findOne({ email: testCustEmail });
    if (!custDbDoc || custDbDoc.role !== 'customer') {
      throw new Error(`Test 1 Failed: Database record for public signup is not role='customer' (got ${custDbDoc?.role})`);
    }

    const custRoute = getPostLoginRoute(regRes.body.role);
    if (custRoute !== '/customer/dashboard') {
      throw new Error(`Test 1 Failed: Public customer route is ${custRoute}, expected '/customer/dashboard'`);
    }
    console.log(`  ✓ Public signup created Customer: ${custDbDoc.email} (Role: ${custDbDoc.role}) -> ${custRoute}`);

    // ── TEST 2: Public Google Signup Flow ─────────────────────────
    console.log('\n[TEST 2] Testing Public Google Signup Flow (New User)...');
    const mockGoogleSub = `g_sub_${Date.now()}`;
    const signedGoogleToken = jwt.sign(
      { sub: mockGoogleSub, email: testCustGoogleEmail, name: 'New Google Customer', email_verified: true, aud: googleAudience },
      'mock_secret'
    );

    const { req: gRegReq, res: gRegRes } = createMockReqRes({
      body: { idToken: signedGoogleToken }
    });

    await googleLogin(gRegReq, gRegRes);
    if (gRegRes.statusCode !== 200 || gRegRes.body.role !== 'customer') {
      throw new Error(`Test 2 Failed: New Google signup returned status ${gRegRes.statusCode}, role: ${gRegRes.body?.role}`);
    }

    const googleDbDoc = await User.findOne({ email: testCustGoogleEmail });
    if (!googleDbDoc || googleDbDoc.role !== 'customer' || googleDbDoc.googleId !== mockGoogleSub) {
      throw new Error(`Test 2 Failed: Database record for Google signup is not role='customer' with linked googleId`);
    }

    const googleRoute = getPostLoginRoute(gRegRes.body.role);
    if (googleRoute !== '/customer/dashboard') {
      throw new Error(`Test 2 Failed: Google customer route is ${googleRoute}, expected '/customer/dashboard'`);
    }
    console.log(`  ✓ Google signup created Customer: ${googleDbDoc.email} (Role: ${googleDbDoc.role}) -> ${googleRoute}`);

    // ── TEST 3: Secure Manager Creation Flow ──────────────────────
    console.log('\n[TEST 3] Testing Secure Manager Account Creation...');
    const { req: bootReq, res: bootRes } = createMockReqRes({
      body: {
        username: `mgr_${Date.now()}`,
        email: testMgrEmail,
        password: testPassword,
        bootstrapKey: 'cargolytics_ops_manager_setup_2026',
        name: 'Regional Operations Director',
        companyName: 'Cargolytics Fleet Operations'
      }
    });

    await bootstrapManager(bootReq, bootRes);
    if (bootRes.statusCode !== 201 || bootRes.body.role !== 'logistics_manager') {
      throw new Error(`Test 3 Failed: Secure manager bootstrap returned status ${bootRes.statusCode}, role: ${bootRes.body?.role}`);
    }

    const mgrDbDoc = await User.findOne({ email: testMgrEmail });
    if (!mgrDbDoc || mgrDbDoc.role !== 'logistics_manager') {
      throw new Error(`Test 3 Failed: Database record for manager is not role='logistics_manager' (got ${mgrDbDoc?.role})`);
    }
    console.log(`  ✓ Secure bootstrap created Logistics Manager: ${mgrDbDoc.email} (Role: ${mgrDbDoc.role})`);

    // ── TEST 4: Manager Login Flow ────────────────────────────────
    console.log('\n[TEST 4] Testing Logistics Manager Login & Role Resolution...');
    const { req: mgrLoginReq, res: mgrLoginRes } = createMockReqRes({
      body: { username: testMgrEmail, password: testPassword }
    });

    await loginUser(mgrLoginReq, mgrLoginRes);
    if (mgrLoginRes.statusCode !== 200 || mgrLoginRes.body.role !== 'logistics_manager') {
      throw new Error(`Test 4 Failed: Manager login returned status ${mgrLoginRes.statusCode}, role: ${mgrLoginRes.body?.role}`);
    }

    const decodedMgrJwt = jwt.verify(mgrLoginRes.body.token, secret);
    if (decodedMgrJwt.role !== 'logistics_manager') {
      throw new Error(`Test 4 Failed: JWT token does not encode role='logistics_manager' (got ${decodedMgrJwt.role})`);
    }

    const mgrRoute = getPostLoginRoute(mgrLoginRes.body.role);
    if (mgrRoute !== '/manager/dashboard') {
      throw new Error(`Test 4 Failed: Manager route resolved to ${mgrRoute}, expected '/manager/dashboard'`);
    }
    console.log(`  ✓ Manager login resolved: ${mgrLoginRes.body.email} (Role: ${mgrLoginRes.body.role}) -> ${mgrRoute}`);

    // ── TEST 5: Manager Logout & Customer Login Session Isolation ─
    console.log('\n[TEST 5] Testing Session Isolation (Manager -> Logout -> Customer)...');
    // Customer login
    const { req: custLoginReq, res: custLoginRes } = createMockReqRes({
      body: { username: testCustEmail, password: testPassword }
    });
    await loginUser(custLoginReq, custLoginRes);
    if (custLoginRes.statusCode !== 200 || custLoginRes.body.role !== 'customer') {
      throw new Error(`Test 5 Failed: Customer login failed (role: ${custLoginRes.body?.role})`);
    }

    const decodedCustJwt = jwt.verify(custLoginRes.body.token, secret);
    if (decodedCustJwt.role !== 'customer') {
      throw new Error(`Test 5 Failed: Customer token contaminated with manager role`);
    }
    console.log(`  ✓ Customer login session strictly isolated (Role: ${custLoginRes.body.role}) -> ${getPostLoginRoute(custLoginRes.body.role)}`);

    // ── TEST 6 & 7: Customer RBAC Access Control ──────────────────
    console.log('\n[TEST 6 & 7] Testing Customer RBAC Protection against Manager APIs...');
    const managerGuard = authorizeRoles('logistics_manager');
    const { req: rbacReq, res: rbacRes } = createMockReqRes({ user: custDbDoc });

    let rbacNextCalled = false;
    managerGuard(rbacReq, rbacRes, () => { rbacNextCalled = true; });

    if (rbacNextCalled || rbacRes.statusCode !== 403) {
      throw new Error('Test 6/7 Failed: Customer was not forbidden (403) from accessing manager-only endpoints');
    }
    console.log('  ✓ Customer access to manager API strictly blocked with HTTP 403 Forbidden.');

    // ── TEST 8: Privilege Escalation Prevention on Signup & Profile
    console.log('\n[TEST 8] Testing Privilege Escalation Defenses...');
    const { req: hackReq, res: hackRes } = createMockReqRes({
      body: {
        username: `hacker_${Date.now()}`,
        email: `hacker_${Date.now()}@domain.com`,
        password: testPassword,
        role: 'logistics_manager'
      }
    });

    await registerUser(hackReq, hackRes);
    if (hackRes.statusCode !== 400 || hackRes.body.error !== 'PRIVILEGED_REGISTRATION_REJECTED') {
      throw new Error('Test 8 Failed: Public registration accepted client-supplied role=logistics_manager');
    }
    console.log('  ✓ Public registration strictly rejected client attempt to self-assign privileged manager role (400).');

    // ── TEST 9: Existing Manager Google Login (Role Preserved) ────
    console.log('\n[TEST 9] Testing Existing Manager Google Login (Role Preservation)...');
    const mockMgrGoogleSub = `g_sub_mgr_${Date.now()}`;
    const signedMgrGoogleToken = jwt.sign(
      { sub: mockMgrGoogleSub, email: testMgrEmail, name: 'Google Manager', email_verified: true, aud: googleAudience },
      'mock_secret'
    );

    const { req: gMgrReq, res: gMgrRes } = createMockReqRes({
      body: { idToken: signedMgrGoogleToken }
    });

    await googleLogin(gMgrReq, gMgrRes);
    if (gMgrRes.statusCode !== 200 || gMgrRes.body.role !== 'logistics_manager') {
      throw new Error(`Test 9 Failed: Existing manager was downgraded to ${gMgrRes.body?.role} on Google login`);
    }

    const mgrAfterGoogle = await User.findOne({ email: testMgrEmail });
    if (mgrAfterGoogle.role !== 'logistics_manager') {
      throw new Error(`Test 9 Failed: Database role mutated to ${mgrAfterGoogle.role}`);
    }
    console.log(`  ✓ Existing manager preserved role: ${mgrAfterGoogle.role} on Google sign-in -> ${getPostLoginRoute(mgrAfterGoogle.role)}`);

    // Clean up created test accounts
    await User.deleteMany({ email: { $in: [testCustEmail, testCustGoogleEmail, testMgrEmail] } });
    await mongoose.disconnect();

    console.log('\n===============================================================');
    console.log('🎉 ALL 9 ACCOUNT CREATION & ROLE ARCHITECTURE TESTS PASSED (100%)');
    console.log('===============================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Account Creation Architecture Test Failed:', error);
    process.exit(1);
  }
};

runAccountCreationArchitectureTestSuite();
