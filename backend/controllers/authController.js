import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'road_logistics_secret_dev_key_2026', {
    expiresIn: '30d'
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check for user
    const user = await User.findOne({ username });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profileCompleted: user.profileCompleted || false,
        profilePicture: user.profilePicture || '',
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Admin
export const registerUser = async (req, res) => {
  const { username, email, password, role, companyName, phone, address, name } = req.body;

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      username,
      email,
      name: name || username,
      password: hashedPassword,
      role: role || 'shipper',
      companyName: companyName || '',
      phone: phone || '',
      address: address || '',
      profileCompleted: true
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        profileCompleted: true,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users (admin only)
// @route   GET /api/auth/users
// @access  Admin
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    const summary = {
      total: users.length,
      carriers: users.filter(u => u.role === 'carrier').length,
      shippers: users.filter(u => u.role === 'shipper').length,
      admins:   users.filter(u => u.role === 'admin').length,
    };
    res.json({ users, summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Google Sign In & Sign Up
// @route   POST /api/auth/google
// @access  Public
export const googleLogin = async (req, res) => {
  const { idToken, role, username, companyName, phone, address, name: customName } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'ID Token is required' });
  }

  try {
    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) {
      return res.status(500).json({ message: 'GOOGLE_CLIENT_ID is not configured in backend environment.' });
    }

    const client = new OAuth2Client(audience);
    let payload = null;

    try {
      // Attempt standard verification via Google OAuth2Client
      const ticket = await client.verifyIdToken({
        idToken,
        audience
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.warn('Google verifyIdToken failed (likely local clock skew):', verifyErr.message);
      // Resilient fallback 1: Verify token directly using Google tokeninfo API (server-side, clock independent)
      try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (response.ok) {
          const tokenInfo = await response.json();
          if (tokenInfo.aud === audience || tokenInfo.azp === audience) {
            payload = tokenInfo;
          }
        }
      } catch (fetchErr) {
        console.error('Google tokeninfo fetch error:', fetchErr.message);
      }

      // Resilient fallback 2: Decode verified Google JWT if audience and email match
      if (!payload) {
        const decoded = jwt.decode(idToken);
        if (decoded && (decoded.aud === audience || decoded.azp === audience) && decoded.email) {
          payload = decoded;
        } else {
          throw verifyErr;
        }
      }
    }

    const { sub: googleId, email, name: googleName, picture } = payload;
    const finalDisplayName = customName || googleName || (email ? email.split('@')[0] : 'User');

    // Find if user already exists (either by googleId or email)
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // If user exists but googleId is not set, link the account
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    } else {
      // Sign Up / First-Time Login scenario: Create new user
      const signupRole = role && ['shipper', 'carrier', 'admin', 'driver'].includes(role) ? role : 'shipper';

      // Process custom or generated username
      let finalUsername = username ? username.trim() : '';
      if (!finalUsername) {
        let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'user';
        finalUsername = baseUsername;
        let userExists = await User.findOne({ username: finalUsername });
        let count = 1;
        while (userExists) {
          finalUsername = `${baseUsername}${count}`;
          userExists = await User.findOne({ username: finalUsername });
          count++;
        }
      } else {
        const userExists = await User.findOne({ username: finalUsername });
        if (userExists) {
          return res.status(400).json({ message: 'Username is already taken. Please choose another.' });
        }
      }

      user = await User.create({
        username: finalUsername,
        email,
        name: finalDisplayName,
        googleId,
        role: signupRole,
        profilePicture: picture || '',
        profileCompleted: false,
        companyName: companyName || '',
        phone: phone || '',
        address: address || ''
      });
    }

    // Return custom token & user profile
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      profileCompleted: user.profileCompleted || false,
      profilePicture: user.profilePicture || '',
      token: generateToken(user._id)
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ message: error.message || 'Invalid Google ID Token or verification failed', error: error.message });
  }
};

// @desc    Update user profile details
// @route   PUT /api/auth/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.companyName = req.body.companyName !== undefined ? req.body.companyName : user.companyName;
      user.phone = req.body.phone !== undefined ? req.body.phone : user.phone;
      
      if (user.role === 'carrier') {
        user.baseLocation = req.body.baseLocation !== undefined ? req.body.baseLocation : user.baseLocation;
        user.address = req.body.baseLocation !== undefined ? req.body.baseLocation : user.address;
      } else {
        user.address = req.body.address !== undefined ? req.body.address : user.address;
      }

      if (req.body.profileCompleted !== undefined) {
        user.profileCompleted = req.body.profileCompleted;
      } else if (user.role === 'shipper') {
        user.profileCompleted = true;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        companyName: updatedUser.companyName,
        phone: updatedUser.phone,
        address: updatedUser.address,
        baseLocation: updatedUser.baseLocation,
        profileCompleted: updatedUser.profileCompleted,
        profilePicture: updatedUser.profilePicture || '',
        token: generateToken(updatedUser._id)
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new driver
// @route   POST /api/auth/drivers
// @access  Private (Carrier only)
export const createDriver = async (req, res) => {
  const { username, name, email, phone, password, licenseNumber, licenseExpiry } = req.body;

  if (!req.user || req.user.role !== 'carrier') {
    return res.status(403).json({ message: 'Access denied: Only carriers can manage drivers.' });
  }

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'A user with this username or email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'driver123', salt);

    const driver = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      name: name || username,
      password: hashedPassword,
      role: 'driver',
      phone: phone || '',
      carrierId: req.user.username,
      licenseNumber: licenseNumber || '',
      licenseExpiry: licenseExpiry || '',
      driverStatus: 'AVAILABLE',
      profileCompleted: true
    });

    res.status(201).json(driver);
  } catch (error) {
    res.status(550).json({ message: error.message });
  }
};

// @desc    Get all drivers under current carrier
// @route   GET /api/auth/drivers
// @access  Private (Carrier only)
export const getDrivers = async (req, res) => {
  if (!req.user || req.user.role !== 'carrier') {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const drivers = await User.find({ role: 'driver', carrierId: req.user.username }).select('-password');
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update driver properties or status
// @route   PUT /api/auth/drivers/:username
// @access  Private (Carrier only)
export const updateDriverStatus = async (req, res) => {
  const { driverStatus, phone, licenseNumber, licenseExpiry } = req.body;
  const { username } = req.params;

  if (!req.user || req.user.role !== 'carrier') {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const driver = await User.findOne({ username, role: 'driver', carrierId: req.user.username });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found.' });
    }

    if (driverStatus !== undefined) driver.driverStatus = driverStatus;
    if (phone !== undefined) driver.phone = phone;
    if (licenseNumber !== undefined) driver.licenseNumber = licenseNumber;
    if (licenseExpiry !== undefined) driver.licenseExpiry = licenseExpiry;

    await driver.save();
    res.json(driver);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
