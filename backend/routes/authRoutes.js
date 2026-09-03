import express from 'express';
import { 
  loginUser, 
  registerUser, 
  registerLogisticsCompany,
  verifyGoogleManager,
  bootstrapManager,
  getMe, 
  getAllUsers, 
  googleLogin, 
  updateUserProfile,
  createDriver,
  getDrivers,
  updateDriverStatus
} from '../controllers/authController.js';
import { protect, logisticsManagerOnly } from '../middleware/auth.js';

const router = express.Router();

router.post('/login',                      loginUser);
router.post('/register',                   registerUser);
router.post('/register-company',           registerLogisticsCompany);
router.post('/register-logistics-company', registerLogisticsCompany);
router.post('/verify-google-manager',      verifyGoogleManager);
router.post('/bootstrap-manager',          bootstrapManager);
router.post('/google',             googleLogin);
router.put('/profile',             protect, updateUserProfile);
router.get('/me',                  protect, getMe);
router.get('/users',               protect, logisticsManagerOnly, getAllUsers);

// Driver management routes
router.post('/drivers',           protect, createDriver);
router.get('/drivers',            protect, getDrivers);
router.put('/drivers/:username',  protect, updateDriverStatus);

export default router;
