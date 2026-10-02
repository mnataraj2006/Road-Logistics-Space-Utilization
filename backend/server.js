import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import connectDB from './config/db.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import transitRoutes from './routes/transitRoutes.js';
import capacityRoutes from './routes/capacityRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import {
  securityHeadersAndCorrelation,
  sanitizeInput,
  rateLimit
} from './middleware/security.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';

// Connect to MongoDB
connectDB();

const app = express();

// Security & Production Hardening Middlewares
app.use(securityHeadersAndCorrelation);
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key', 'x-correlation-id', 'x-expected-version']
}));
app.use(express.json({ limit: '2mb' }));
app.use(sanitizeInput);

// Rate Limiters
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many authentication attempts. Please try again in 1 minute.' });
const verifyStopLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many stop verification attempts.' });
const generalApiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, message: 'Too many API requests. Please try again later.' });

app.use('/api/', generalApiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/transit/verify-stop', verifyStopLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/transit', transitRoutes);
app.use('/api/capacity', capacityRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/shipments', shipmentRoutes);

// Predictions Bridge (Gateway routing to Python FastAPI)
// ML service must not become a dependency for core logistics operations.
// All bridge calls use a 10-second timeout so Node never hangs on a down Python service.
const ML_SERVICE_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8000';
const ML_TIMEOUT_MS  = 10000;

function mlFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  return fetch(`${ML_SERVICE_URL}${path}`, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

app.get('/api/predictions/health', async (req, res) => {
  try {
    const response = await mlFetch('/');
    const data = await response.json();
    const isUp = response.ok && data.status === 'UP';
    res.status(isUp ? 200 : 503).json({
      status: isUp ? 'healthy' : 'degraded',
      message: isUp
        ? 'Python ML analytics engine is online.'
        : 'Python ML analytics engine returned non-OK status.',
      upstreamStatus: data.status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    res.status(503).json({
      status: 'unhealthy',
      message: isTimeout
        ? 'ML service did not respond within timeout.'
        : 'ML service is unreachable.',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/predictions/demand', async (req, res) => {
  try {
    const response = await mlFetch('/predict/demand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const code = isTimeout ? 504 : 503;
    const msg  = isTimeout ? 'ML demand forecast timed out.' : 'ML service unreachable for demand forecast.';
    console.error('FastAPI demand prediction bridge error:', error);
    res.status(code).json({ message: msg, error: error.message });
  }
});

app.post('/api/predictions/occupancy', async (req, res) => {
  try {
    const response = await mlFetch('/predict/occupancy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const code = isTimeout ? 504 : 503;
    const msg  = isTimeout ? 'ML occupancy prediction timed out.' : 'ML service unreachable for occupancy prediction.';
    console.error('FastAPI occupancy prediction bridge error:', error);
    res.status(code).json({ message: msg, error: error.message });
  }
});

app.post('/api/predictions/delay', async (req, res) => {
  try {
    const response = await mlFetch('/predict/delay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const code = isTimeout ? 504 : 503;
    const msg  = isTimeout ? 'ML delay prediction timed out.' : 'ML service unreachable for delay prediction.';
    console.error('FastAPI delay prediction bridge error:', error);
    res.status(code).json({ message: msg, error: error.message });
  }
});

app.post('/api/predictions/price', async (req, res) => {
  try {
    const response = await mlFetch('/predict/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const code = isTimeout ? 504 : 503;
    const msg  = isTimeout ? 'ML price prediction timed out.' : 'ML service unreachable for price prediction.';
    console.error('FastAPI price prediction bridge error:', error);
    res.status(code).json({ message: msg, error: error.message });
  }
});

app.post('/api/predictions/optimize', async (req, res) => {
  try {
    const response = await mlFetch('/optimize/consolidation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    const code = isTimeout ? 504 : 503;
    const msg  = isTimeout ? 'ML consolidation optimization timed out.' : 'ML service unreachable for optimization.';
    console.error('FastAPI optimization bridge error:', error);
    res.status(code).json({ message: msg, error: error.message });
  }
});

app.post('/api/predictions/train', async (req, res) => {
  // Training can take a long time — extend timeout to 120 seconds
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(`${ML_SERVICE_URL}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (error) {
    clearTimeout(timer);
    const isTimeout = error.name === 'AbortError';
    const code = isTimeout ? 504 : 503;
    const msg  = isTimeout ? 'Model retraining timed out (120s).' : 'ML service unreachable for retraining.';
    console.error('FastAPI train bridge error:', error);
    res.status(code).json({ message: msg, error: error.message });
  }
});

// Root check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'Road Logistics Space Optimization Express Backend',
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId
  });
});

// 404 & Global Standardized Error Handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Express Gateway Server running on port ${PORT}`);
});
