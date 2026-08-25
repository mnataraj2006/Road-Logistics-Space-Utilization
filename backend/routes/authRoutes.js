import express from 'express';
import { 
  loginUser, 
  registerUser, 
  getMe, 
  getAllUsers, 
  googleLogin, 
  updateUserProfile,
  createDriver,
  getDrivers,
  updateDriverStatus
} from '../controllers/authController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

router.post('/login',    loginUser);
router.post('/register', registerUser);
router.post('/google',   googleLogin);
router.put('/profile',   protect, updateUserProfile);
router.get('/me',        protect, getMe);
router.get('/users',     protect, admin, getAllUsers);  // admin only

// Driver management routes
router.post('/drivers',           protect, createDriver);
router.get('/drivers',            protect, getDrivers);
router.put('/drivers/:username',  protect, updateDriverStatus);

export default router;
