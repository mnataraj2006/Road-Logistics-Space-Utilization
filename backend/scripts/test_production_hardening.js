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

    console.log('\n===============================================================');
    console.log('🎉 ALL 8 PRODUCTION HARDENING & SECURITY TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Production Hardening Test Suite Failed:', error);
    process.exit(1);
  }
};

runProductionHardeningTestSuite();
