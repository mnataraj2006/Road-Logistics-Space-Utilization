import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

import {
  securityHeadersAndCorrelation,
  sanitizeInput,
  rateLimit
} from '../middleware/security.js';
import {
  validateCapacitySearchRequest,
  isPositiveFiniteNumber,
  isNonNegativeNumber,
  isValidDate
} from '../middleware/validation.js';
import {
  protect,
  authorizeRoles,
  enforceResourceOwnership
} from '../middleware/auth.js';
import {
  globalErrorHandler,
  notFoundHandler
} from '../middleware/errorHandler.js';

import User from '../models/User.js';
import Booking from '../models/Booking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runProductionHardeningTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING PRODUCTION HARDENING & SECURITY TEST SUITE');
    console.log('===============================================================');

    // Helper mock objects
    const createMockReqRes = (reqOverrides = {}) => {
      const headers = { ...reqOverrides.headers };
      const req = {
        headers,
        body: reqOverrides.body || {},
        query: reqOverrides.query || {},
        params: reqOverrides.params || {},
        method: reqOverrides.method || 'GET',
        originalUrl: reqOverrides.url || '/api/test',
        ip: '127.0.0.1',
        ...reqOverrides
      };

      const resHeaders = {};
      const res = {
        statusCode: 200,
        headers: resHeaders,
        setHeader: (k, v) => { resHeaders[k] = v; },
        status: (code) => { res.statusCode = code; return res; },
        json: (data) => { res.body = data; return res; }
      };

      return { req, res };
    };

    // ── TEST 1: SECURITY HEADERS & CORRELATION ID ────────────────
    console.log('\n[TEST 1] Testing Defensive Security Headers & Correlation ID Generation...');
    const { req: req1, res: res1 } = createMockReqRes();
    securityHeadersAndCorrelation(req1, res1, () => {});

    if (!req1.correlationId || !res1.headers['X-Correlation-Id']) {
      throw new Error('Test 1 Failed: Correlation ID not generated on request/response');
    }
    if (res1.headers['X-Content-Type-Options'] !== 'nosniff') throw new Error('Test 1 Failed: X-Content-Type-Options missing');
    if (res1.headers['X-Frame-Options'] !== 'DENY') throw new Error('Test 1 Failed: X-Frame-Options missing');
    if (res1.headers['X-XSS-Protection'] !== '1; mode=block') throw new Error('Test 1 Failed: X-XSS-Protection missing');
    if (!res1.headers['Strict-Transport-Security']) throw new Error('Test 1 Failed: HSTS header missing');
    console.log(`✅ TEST 1 PASSED: Security headers verified. Correlation ID: '${req1.correlationId}'.`);

    // ── TEST 2: INPUT SANITIZATION & NOSQL INJECTION STRIPPING ───
    console.log('\n[TEST 2] Testing Request Body Sanitization & NoSQL Injection Stripping...');
    const maliciousBody = {
      username: 'admin',
      $where: 'this.password.length > 0',
      nested: {
        normalField: 'clean',
        $gt: ''
      }
    };
    const { req: req2, res: res2 } = createMockReqRes({ body: maliciousBody });
    sanitizeInput(req2, res2, () => {});

    if (req2.body.$where !== undefined || req2.body.nested.$gt !== undefined) {
      throw new Error('Test 2 Failed: Dangerous $ operators were not sanitized!');
    }
    if (req2.body.username !== 'admin' || req2.body.nested.normalField !== 'clean') {
      throw new Error('Test 2 Failed: Legitimate fields were corrupted during sanitization');
    }
    console.log('✅ TEST 2 PASSED: Malicious NoSQL injection operators ($where, $gt) cleanly stripped.');

    // ── TEST 3: INPUT VALIDATION (NaN / INFINITY / NEGATIVE) ─────
    console.log('\n[TEST 3] Testing Input Validation against NaN, Infinity, Negative Numbers...');
    if (isPositiveFiniteNumber(NaN) !== false) throw new Error('Test 3 Failed: isPositiveFiniteNumber accepted NaN');
    if (isPositiveFiniteNumber(Infinity) !== false) throw new Error('Test 3 Failed: isPositiveFiniteNumber accepted Infinity');
    if (isPositiveFiniteNumber(-10) !== false) throw new Error('Test 3 Failed: isPositiveFiniteNumber accepted negative number');
    if (isPositiveFiniteNumber(25.5) !== true) throw new Error('Test 3 Failed: isPositiveFiniteNumber rejected valid number 25.5');

    // Test validation middleware rejection on invalid body
    const { req: req3, res: res3 } = createMockReqRes({
      body: {
        pickup: 'Chennai',
        delivery: 'Salem',
        volume: 'NaN',
        weight: -500
      }
    });
    validateCapacitySearchRequest(req3, res3, () => {});
    if (res3.statusCode !== 400 || res3.body.error !== 'VALIDATION_FAILED' || res3.body.errors.length !== 2) {
      throw new Error('Test 3 Failed: validateCapacitySearchRequest did not reject NaN volume and negative weight');
    }
    console.log('✅ TEST 3 PASSED: NaN and negative quantities strictly rejected with HTTP 400.');

    // ── TEST 4: JWT AUTHENTICATION & EXPIRY VERIFICATION ─────────
    console.log('\n[TEST 4] Testing JWT Authentication Token Verification...');
    const secret = process.env.JWT_SECRET || 'road_logistics_secret_dev_key_2026';
    
    // Missing token
    const { req: req4a, res: res4a } = createMockReqRes();
    await protect(req4a, res4a, () => {});
    if (res4a.statusCode !== 401 || res4a.body.error !== 'TOKEN_MISSING') {
      throw new Error('Test 4 Failed: protect did not reject missing token');
    }

    // Expired token
    const expiredToken = jwt.sign({ id: new mongoose.Types.ObjectId() }, secret, { expiresIn: '-1s' });
    const { req: req4b, res: res4b } = createMockReqRes({ headers: { authorization: `Bearer ${expiredToken}` } });
    await protect(req4b, res4b, () => {});
    if (res4b.statusCode !== 401 || res4b.body.error !== 'TOKEN_EXPIRED') {
      throw new Error('Test 4 Failed: protect did not reject expired token');
    }
    console.log('✅ TEST 4 PASSED: Missing and expired JWT tokens strictly rejected with HTTP 401.');

    // ── TEST 5: ROLE-BASED ACCESS CONTROL (RBAC) ─────────────────
    console.log('\n[TEST 5] Testing Role-Based Access Control (RBAC)...');
    const managerOnlyMiddleware = authorizeRoles('logistics_manager');

    // Shipper attempting manager endpoint
    const { req: req5a, res: res5a } = createMockReqRes({ user: { role: 'shipper', username: 'shipper1' } });
    managerOnlyMiddleware(req5a, res5a, () => {});
    if (res5a.statusCode !== 403 || res5a.body.error !== 'FORBIDDEN') {
      throw new Error('Test 5 Failed: Shipper was not forbidden from manager endpoint');
    }

    // Manager accessing manager endpoint
    let nextCalled = false;
    const { req: req5b, res: res5b } = createMockReqRes({ user: { role: 'logistics_manager', username: 'mgr1' } });
    managerOnlyMiddleware(req5b, res5b, () => { nextCalled = true; });
    if (!nextCalled || res5b.statusCode !== 200) {
      throw new Error('Test 5 Failed: Manager was blocked from manager endpoint');
    }
    console.log('✅ TEST 5 PASSED: RBAC verified! Shippers blocked (403), Managers authorized (200).');

    // ── TEST 6: RESOURCE OWNERSHIP ISOLATION (IDOR PREVENTION) ───
    console.log('\n[TEST 6] Testing Resource Ownership Isolation (IDOR Protection)...');
    const mockFindBooking = async () => ({ bookingId: 'BKG-OWNER-1', shipperId: 'customer_alice', volume: 10 });
    const ownershipGuard = enforceResourceOwnership(mockFindBooking, { shipperField: 'shipperId' });

    // Malicious customer Bob attempting to access Alice's booking
    const { req: req6a, res: res6a } = createMockReqRes({ user: { role: 'customer', username: 'customer_bob' } });
    await ownershipGuard(req6a, res6a, () => {});
    if (res6a.statusCode !== 403 || res6a.body.error !== 'FORBIDDEN') {
      throw new Error('Test 6 Failed: IDOR vulnerability! Customer Bob accessed Customer Alice\'s record');
    }

    // Customer Alice accessing her own booking
    let aliceNext = false;
    const { req: req6b, res: res6b } = createMockReqRes({ user: { role: 'customer', username: 'customer_alice' } });
    await ownershipGuard(req6b, res6b, () => { aliceNext = true; });
    if (!aliceNext) {
      throw new Error('Test 6 Failed: Legitimate owner Alice was blocked');
    }
    console.log('✅ TEST 6 PASSED: Cross-customer IDOR access prevented with HTTP 403.');

    // ── TEST 7: RATE LIMITING BURST PROTECTION ───────────────────
    console.log('\n[TEST 7] Testing In-Memory Rate Limiting Burst Protection...');
    const testLimiter = rateLimit({ windowMs: 5000, max: 3, message: 'Too many requests.' });
    const { req: req7, res: res7 } = createMockReqRes();

    let passedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < 5; i++) {
      const { req: reqIter, res: resIter } = createMockReqRes();
      testLimiter(reqIter, resIter, () => { passedCount++; });
      if (resIter.statusCode === 429) blockedCount++;
    }

    if (passedCount !== 3 || blockedCount !== 2) {
      throw new Error(`Test 7 Failed: Rate limiter expected 3 passed and 2 blocked, got ${passedCount} passed, ${blockedCount} blocked`);
    }
    console.log('✅ TEST 7 PASSED: Rate limit threshold enforced. 3 allowed, 2 rejected with HTTP 429.');

    // ── TEST 8: GLOBAL ERROR HANDLER & STACK CONCEALMENT ─────────
    console.log('\n[TEST 8] Testing Global Error Handler & Stack Trace Concealment in Production...');
    process.env.NODE_ENV = 'production';
    const fakeError = new Error('Database connection failed internally');
    fakeError.stack = 'SensitiveStack: at line 42 in /secret/path/to/db.js';
    const { req: req8, res: res8 } = createMockReqRes();

    globalErrorHandler(fakeError, req8, res8, () => {});
    if (res8.statusCode !== 500 || res8.body.debugStack !== undefined) {
      throw new Error('Test 8 Failed: Stack trace was leaked in production error response!');
    }
    if (!res8.body.correlationId || !res8.body.timestamp) {
      throw new Error('Test 8 Failed: Standardized error envelope missing correlationId or timestamp');
    }
    process.env.NODE_ENV = 'development';
    console.log('✅ TEST 8 PASSED: Production error response sanitized. Internal stack traces suppressed.');

    // ── TEST 9: REGISTRATION PRIVILEGE ESCALATION DEFENSES ─────────
    console.log('\n[TEST 9] Testing Registration Privilege Escalation Defenses...');
    const { registerUser, updateUserProfile } = await import('../controllers/authController.js');

    // Attempting to register as 'carrier'
    const { req: req9a, res: res9a } = createMockReqRes({
      body: { username: 'hacker_carrier', email: 'hacker1@test.com', password: 'password123', role: 'carrier' }
    });
    await registerUser(req9a, res9a);
    if (res9a.statusCode !== 400 || res9a.body.error !== 'PRIVILEGED_REGISTRATION_REJECTED') {
      throw new Error('Test 9 Failed: Public registration permitted role=carrier!');
    }

    // Attempting to register as 'logistics_manager'
    const { req: req9b, res: res9b } = createMockReqRes({
      body: { username: 'hacker_mgr', email: 'hacker2@test.com', password: 'password123', role: 'logistics_manager' }
    });
    await registerUser(req9b, res9b);
    if (res9b.statusCode !== 400 || res9b.body.error !== 'PRIVILEGED_REGISTRATION_REJECTED') {
      throw new Error('Test 9 Failed: Public registration permitted role=logistics_manager!');
    }

    // Attempting to self-elevate role via profile update
    const dummyUser = await User.create({
      username: `test_customer_${Date.now()}`,
      email: `test_cust_${Date.now()}@domain.com`,
      password: 'hashedpassword',
      role: 'customer'
    });
    const { req: req9c, res: res9c } = createMockReqRes({
      user: dummyUser,
      body: { role: 'logistics_manager' }
    });
    await updateUserProfile(req9c, res9c);
    if (res9c.statusCode !== 403 || res9c.body.error !== 'PRIVILEGE_ESCALATION_FORBIDDEN') {
      throw new Error('Test 9 Failed: Customer was able to self-elevate to logistics_manager via profile update!');
    }
    await User.deleteOne({ _id: dummyUser._id });
    console.log('✅ TEST 9 PASSED: Registration & profile privilege escalation strictly rejected (400 / 403).');

    // ── TEST 10: SESSION ROLE ISOLATION & JWT ENCAPSULATION ───────
    console.log('\n[TEST 10] Testing Session Role Isolation...');
    const customerUser = await User.create({
      username: `customer_sess_${Date.now()}`,
      email: `cust_${Date.now()}@domain.com`,
      password: 'hashedpassword',
      role: 'customer'
    });
    const managerUser = await User.create({
      username: `mgr_sess_${Date.now()}`,
      email: `mgr_${Date.now()}@domain.com`,
      password: 'hashedpassword',
      role: 'logistics_manager'
    });

    const custToken = jwt.sign({ id: customerUser._id }, secret, { expiresIn: '1h' });
    const mgrToken = jwt.sign({ id: managerUser._id }, secret, { expiresIn: '1h' });

    // 1. Authenticate customer
    const { req: req10a, res: res10a } = createMockReqRes({ headers: { authorization: `Bearer ${custToken}` } });
    await protect(req10a, res10a, () => {});
    if (req10a.user.role !== 'customer') {
      throw new Error('Test 10 Failed: Customer token resolved to incorrect role');
    }

    // 2. Authenticate manager
    const { req: req10b, res: res10b } = createMockReqRes({ headers: { authorization: `Bearer ${mgrToken}` } });
    await protect(req10b, res10b, () => {});
    if (req10b.user.role !== 'logistics_manager') {
      throw new Error('Test 10 Failed: Manager token resolved to incorrect role');
    }

    // 3. Ensure customer token cannot execute manager operations
    const { res: res10c } = createMockReqRes({ user: req10a.user });
    managerOnlyMiddleware(req10a, res10c, () => {});
    if (res10c.statusCode !== 403) {
      throw new Error('Test 10 Failed: Customer session leaked into Manager RBAC scope!');
    }

    await User.deleteMany({ _id: { $in: [customerUser._id, managerUser._id] } });
    console.log('✅ TEST 10 PASSED: Session tokens strictly isolate Customer and Logistics Manager permissions.');

    // ── TEST 11: GOOGLE AUTHENTICATION & ACCOUNT LINKING ─────────
    console.log('\n[TEST 11] Testing Google Authentication & Safe Account Linking...');
    const { googleLogin } = await import('../controllers/authController.js');

    // 1. Missing Google ID Token rejected
    const { req: req11a, res: res11a } = createMockReqRes({ body: {} });
    await googleLogin(req11a, res11a);
    if (res11a.statusCode !== 400) {
      throw new Error('Test 11 Failed: Missing Google ID Token was not rejected with 400');
    }

    // 2. Mock valid Google ID token for NEW user -> created as customer
    const mockGoogleClientId = process.env.GOOGLE_CLIENT_ID || '201127500798-tooljnnriapt38tulpr9opivdbr460st.apps.googleusercontent.com';
    const mockGoogleIdNew = `g_sub_${Date.now()}`;
    const mockGoogleEmailNew = `google_user_${Date.now()}@gmail.com`;

    const signedGoogleTokenNew = jwt.sign(
      { sub: mockGoogleIdNew, email: mockGoogleEmailNew, name: 'Google New User', email_verified: true, aud: mockGoogleClientId },
      'mock_secret_for_decode'
    );

    const { req: req11b, res: res11b } = createMockReqRes({ body: { idToken: signedGoogleTokenNew } });
    await googleLogin(req11b, res11b);

    if (res11b.statusCode !== 200 || res11b.body.role !== 'customer') {
      throw new Error('Test 11 Failed: New Google account was not created with role=customer');
    }
    const createdGoogleUser = await User.findOne({ email: mockGoogleEmailNew });
    if (!createdGoogleUser || createdGoogleUser.role !== 'customer' || createdGoogleUser.googleId !== mockGoogleIdNew) {
      throw new Error('Test 11 Failed: New Google user record in database not verified');
    }

    // 3. Existing Logistics Manager signs in with Google -> role PRESERVED (no downgrade)
    const existingManagerEmail = `existing_mgr_${Date.now()}@company.com`;
    const existingManager = await User.create({
      username: `mgr_google_${Date.now()}`,
      email: existingManagerEmail,
      password: 'hashedpassword',
      role: 'logistics_manager',
      name: 'Existing Fleet Director'
    });

    const mockGoogleIdMgr = `g_sub_mgr_${Date.now()}`;
    const signedGoogleTokenMgr = jwt.sign(
      { sub: mockGoogleIdMgr, email: existingManagerEmail, name: 'Existing Fleet Director', email_verified: true, aud: mockGoogleClientId },
      'mock_secret_for_decode'
    );

    const { req: req11c, res: res11c } = createMockReqRes({ body: { idToken: signedGoogleTokenMgr } });
    await googleLogin(req11c, res11c);

    if (res11c.statusCode !== 200 || res11c.body.role !== 'logistics_manager') {
      throw new Error('Test 11 Failed: Existing Logistics Manager was downgraded to customer on Google login!');
    }

    const updatedManager = await User.findById(existingManager._id);
    if (updatedManager.role !== 'logistics_manager' || updatedManager.googleId !== mockGoogleIdMgr) {
      throw new Error('Test 11 Failed: Manager googleId not linked or role mutated in database');
    }

    // Cleanup
    await User.deleteMany({ _id: { $in: [createdGoogleUser._id, existingManager._id] } });
    console.log('✅ TEST 11 PASSED: Google Auth creates Customer for new users, securely links and preserves Logistics Manager role for existing managers.');

    console.log('\n===============================================================');
    console.log('🎉 ALL 11 PRODUCTION HARDENING & SECURITY TESTS PASSED (100%)');
    console.log('===============================================================');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Production Hardening Test Suite Failed:', error);
    process.exit(1);
  }
};

runProductionHardeningTestSuite();
