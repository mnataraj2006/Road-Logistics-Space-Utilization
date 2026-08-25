import express from 'express';
import { 
  getRoutes, 
  getRouteById, 
  getRoutePerformance, 
  createRoute,
  updateRoute,
  deleteRoute
} from '../controllers/routeController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getRoutes);
router.post('/', protect, createRoute);
router.get('/analytics/performance', protect, getRoutePerformance);
router.get('/:id', protect, getRouteById);
router.put('/:id', protect, updateRoute);
router.delete('/:id', protect, deleteRoute);



export default router;
