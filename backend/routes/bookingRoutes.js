import express from 'express';
import {
  getBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  getBookingTrends,
  getDashboardKPIs,
  getPayments,
  releasePayment,
  bulkUpdateBookings
} from '../controllers/bookingController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getBookings);
router.post('/', protect, createBooking);
router.put('/:id', protect, updateBooking);
router.delete('/:id', protect, deleteBooking);
router.post('/bulk-update', protect, bulkUpdateBookings);
router.get('/payments', protect, getPayments);
router.put('/payments/:id/release', protect, admin, releasePayment); // admin only
router.get('/analytics/trends', protect, getBookingTrends);
router.get('/analytics/kpis', protect, getDashboardKPIs);

export default router;
