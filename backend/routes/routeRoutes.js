import express from 'express';
import { 
  getRoutes, 
  getRouteById, 
  getRoutePerformance, 
  createRoute,
  updateRoute,
  deleteRoute
} from '../controllers/routeController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getRoutes);
router.post('/', protect, authorizeRoles('logistics_manager', 'admin'), createRoute);
router.get('/analytics/performance', protect, authorizeRoles('logistics_manager', 'admin'), getRoutePerformance);
router.get('/:id', protect, getRouteById);
router.put('/:id', protect, authorizeRoles('logistics_manager', 'admin'), updateRoute);
router.delete('/:id', protect, authorizeRoles('logistics_manager', 'admin'), deleteRoute);

export default router;
