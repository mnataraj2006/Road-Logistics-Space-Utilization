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

// Predictions Bridge (Gateway routing to Python FastAPI)
app.post('/api/predictions/demand', async (req, res) => {
  try {
    const response = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/predict/demand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error('FastAPI demand prediction bridge error:', error);
    res.status(500).json({ message: 'Error communicating with Python prediction engine', error: error.message });
  }
});

app.post('/api/predictions/occupancy', async (req, res) => {
  try {
    const response = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/predict/occupancy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error('FastAPI occupancy prediction bridge error:', error);
    res.status(500).json({ message: 'Error communicating with Python prediction engine', error: error.message });
  }
});

app.post('/api/predictions/delay', async (req, res) => {
  try {
    const response = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/predict/delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error('FastAPI delay prediction bridge error:', error);
    res.status(500).json({ message: 'Error communicating with Python prediction engine', error: error.message });
  }
});

app.post('/api/predictions/price', async (req, res) => {
  try {
    const response = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/predict/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error('FastAPI price prediction bridge error:', error);
    res.status(500).json({ message: 'Error communicating with Python prediction engine', error: error.message });
  }
});

app.post('/api/predictions/optimize', async (req, res) => {
  try {
    const response = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/optimize/consolidation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error('FastAPI optimization bridge error:', error);
    res.status(500).json({ message: 'Error communicating with Python prediction engine', error: error.message });
  }
});

app.post('/api/predictions/train', async (req, res) => {
  try {
    const response = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (error) {
    console.error('FastAPI train bridge error:', error);
    res.status(500).json({ message: 'Error communicating with Python prediction engine', error: error.message });
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
