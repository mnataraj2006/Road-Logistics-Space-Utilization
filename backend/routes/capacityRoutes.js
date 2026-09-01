import express from 'express';
import { searchCapacity, bookCapacity } from '../controllers/capacityController.js';
import { protect } from '../middleware/auth.js';
import { validateCapacitySearchRequest } from '../middleware/validation.js';

const router = express.Router();

// Search capacity (can be called via GET or POST for flexibility)
router.get('/search', protect, validateCapacitySearchRequest, searchCapacity);
router.post('/search', protect, validateCapacitySearchRequest, searchCapacity);

// Transactional booking against selected capacity
router.post('/book', protect, bookCapacity);

export default router;
