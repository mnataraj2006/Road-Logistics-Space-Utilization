import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import connectDB from './config/db.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';

// Load Env variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/bookings', bookingRoutes);

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
  res.json({ status: 'UP', message: 'Road Logistics Space Optimization Backend is healthy.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Express Gateway Server running on port ${PORT}`);
});
