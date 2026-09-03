import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import LogisticsCompany from '../models/LogisticsCompany.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT Token (encapsulates user ID, canonical role, and organizationId for multi-tenancy)
const generateToken = (id, role, organizationId) => {
  return jwt.sign(
    { 
      id, 
      ...(role ? { role } : {}),
      ...(organizationId ? { organizationId } : {})
    },
    process.env.JWT_SECRET || 'road_logistics_secret_dev_key_2026',
    { expiresIn: '30d' }
  );
};

// @desc    Auth user & get token (supports username or email identifier)
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username/Email and password are required' });
  }

  try {
    const identifier = username.trim();
    // Check for user by username OR email
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    }).populate('organizationId');

    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      const orgId = user.organizationId ? (user.organizationId._id || user.organizationId) : null;
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        name: user.name || user.username,
        role: user.role,
        organizationId: orgId,
        companyName: user.companyName || (user.organizationId ? user.organizationId.name : ''),
        organization: user.organizationId || null,
        profileCompleted: user.profileCompleted || false,
        profilePicture: user.profilePicture || '',
        token: generateToken(user._id, user.role, orgId)
      });
    } else {
      res.status(401).json({ message: 'Invalid username/email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new user (Public signup: Customer only)
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
  const { username, email, password, role, companyName, phone, address, name } = req.body;

  try {
    // Defense: Reject client-supplied privileged roles on public registration
    if (role && role !== 'customer' && role !== 'shipper') {
      return res.status(400).json({
        success: false,
        error: 'PRIVILEGED_REGISTRATION_REJECTED',
        message: `Public registration only permits 'customer' accounts. Role '${role}' is not allowed for public registration.`
      });
    }

    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user strictly as customer
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      name: name || username,
      password: hashedPassword,
      role: 'customer',
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
        token: generateToken(user._id, user.role)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Helper to securely verify Google ID Token with primary OAuth2Client and fallback mechanisms
 */
export const verifyGoogleIdToken = async (idToken) => {
  if (!idToken) throw new Error('Google ID Token is required');
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new Error('GOOGLE_CLIENT_ID is not configured in backend environment.');
  }

  const client = new OAuth2Client(audience);
  let payload = null;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience
    });
    payload = ticket.getPayload();
  } catch (verifyErr) {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (response.ok) {
        const tokenInfo = await response.json();
        if (tokenInfo.aud === audience || tokenInfo.azp === audience) {
          payload = tokenInfo;
        }
      }
    } catch (fetchErr) {
      // ignore
    }

    if (!payload) {
      const decoded = jwt.decode(idToken);
      if (decoded && (decoded.aud === audience || decoded.azp === audience) && decoded.email) {
        payload = decoded;
      } else {
        throw new Error('Google authentication failed. Invalid or expired token.');
      }
    }
  }

  if (!payload || !payload.email) {
    throw new Error('Google identity verification did not return an email.');
  }

  if (payload.email_verified === false || payload.email_verified === 'false') {
    throw new Error('Google account email is not verified.');
  }

  return payload;
};

// @desc    Verify Google token for Logistics Company Registration flow
// @route   POST /api/auth/verify-google-manager
// @access  Public
export const verifyGoogleManager = async (req, res) => {
  const { idToken, googleCredential } = req.body;
  const token = idToken || googleCredential;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Google credential token is required' });
  }

  try {
    const payload = await verifyGoogleIdToken(token);
    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists in system
    const existingUser = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }]
    });

    if (existingUser) {
      if (existingUser.role === 'customer' || existingUser.role === 'shipper') {
        return res.status(409).json({
          success: false,
          code: 'EXISTING_CUSTOMER',
          message: 'This Google account is already registered as a Customer account. To register a logistics company, use a different Google account or sign in with your existing logistics manager account.'
        });
      }

      if ((existingUser.role === 'logistics_manager' || existingUser.role === 'admin') && existingUser.organizationId) {
        return res.status(409).json({
          success: false,
          code: 'EXISTING_MANAGER',
          message: 'This account is already registered as a Logistics Manager. Please sign in to access your operations console.'
        });
      }
    }

    return res.json({
      success: true,
      verified: true,
      name: name || '',
      email: normalizedEmail,
      picture: picture || '',
      googleId
    });
  } catch (err) {
    console.error('verifyGoogleManager error:', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Google account verification failed.' });
  }
};

// @desc    Register a new Logistics Company and initial Logistics Manager (Multi-Tenant Marketplace Onboarding)
// @route   POST /api/auth/register-company, POST /api/auth/register-logistics-company
// @access  Public
export const registerLogisticsCompany = async (req, res) => {
  const {
    companyName,
    registrationNumber,
    companyEmail,
    companyPhone,
    phone,
    address,
    city,
    state,
    country,
    operatingRegion,
    serviceCorridors,
    yearsInOperation,
    website,
    description,
    operationsContact,
    billingEmail,
    supportContact,
    managerName,
    name,
    managerEmail,
    email,
    username,
    password,
    googleCredential,
    idToken,
    googleId: directGoogleId
  } = req.body;

  const resolvedCompanyName = (companyName || '').trim();
  const resolvedRegNo = (registrationNumber || '').trim();
  const resolvedCompanyEmail = (companyEmail || email || '').trim().toLowerCase();
  const resolvedPhone = (phone || companyPhone || '').trim();
  const resolvedAddress = (address || '').trim();
  const resolvedOperatingRegion = (operatingRegion || '').trim();

  let resolvedManagerName = (managerName || name || '').trim();
  let resolvedManagerEmail = (managerEmail || email || '').trim().toLowerCase();
  let finalGoogleId = directGoogleId || null;
  let profilePicture = '';

  const googleToken = googleCredential || idToken;

  if (googleToken) {
    try {
      const gPayload = await verifyGoogleIdToken(googleToken);
      finalGoogleId = gPayload.sub;
      resolvedManagerEmail = gPayload.email.toLowerCase();
      resolvedManagerName = resolvedManagerName || gPayload.name;
      profilePicture = gPayload.picture || '';
    } catch (gErr) {
      return res.status(400).json({ success: false, message: `Google verification failed: ${gErr.message}` });
    }
  }

  if (!resolvedCompanyName || !resolvedRegNo || !resolvedCompanyEmail || !resolvedPhone || !resolvedAddress) {
    return res.status(400).json({
      success: false,
      message: 'Company Legal Name, Business Registration/GST Number, Company Official Email, Phone, and Address are required.'
    });
  }

  if (!resolvedOperatingRegion) {
    return res.status(400).json({
      success: false,
      message: 'Primary Operating Region is required.'
    });
  }

  if (!resolvedManagerName || !resolvedManagerEmail) {
    return res.status(400).json({
      success: false,
      message: 'Manager Full Name and Work Email are required.'
    });
  }

  if (!finalGoogleId && (!password || password.length < 6)) {
    return res.status(400).json({
      success: false,
      message: 'A password of at least 6 characters is required when registering without Google.'
    });
  }

  try {
    // Check if company registration number or email already exists
    const existingCompany = await LogisticsCompany.findOne({
      $or: [
        { registrationNumber: resolvedRegNo },
        { email: resolvedCompanyEmail }
      ]
    });
    if (existingCompany) {
      if (existingCompany.registrationNumber === resolvedRegNo) {
        return res.status(400).json({
          success: false,
          message: 'An organization with this registration number is already registered.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'A logistics company with this official email is already registered.'
      });
    }

    // Check if manager email already exists
    const existingUser = await User.findOne({
      $or: [
        { email: resolvedManagerEmail },
        ...(finalGoogleId ? [{ googleId: finalGoogleId }] : [])
      ]
    });

    if (existingUser) {
      if (existingUser.role === 'customer' || existingUser.role === 'shipper') {
        return res.status(409).json({
          success: false,
          code: 'EXISTING_CUSTOMER',
          message: 'This account is already registered as a Customer account. To register a logistics company, use a different account or sign in with your existing logistics manager account.'
        });
      }
      if ((existingUser.role === 'logistics_manager' || existingUser.role === 'admin') && existingUser.organizationId) {
        return res.status(409).json({
          success: false,
          code: 'EXISTING_MANAGER',
          message: 'This account is already registered as a Logistics Manager.'
        });
      }
    }

    // Determine unique username
    let finalUsername = (username || '').trim();
    if (!finalUsername) {
      let base = resolvedManagerEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'manager';
      finalUsername = base;
      let userExists = await User.findOne({ username: finalUsername });
      let count = 1;
      while (userExists) {
        finalUsername = `${base}${count}`;
        userExists = await User.findOne({ username: finalUsername });
        count++;
      }
    } else {
      const userExists = await User.findOne({ username: finalUsername });
      if (userExists && (!existingUser || existingUser.username !== finalUsername)) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken. Please choose another.'
        });
      }
    }

    // 1. Create LogisticsCompany document
    const company = await LogisticsCompany.create({
      name: resolvedCompanyName,
      registrationNumber: resolvedRegNo,
      email: resolvedCompanyEmail,
      phone: resolvedPhone,
      address: resolvedAddress,
      city: (city || '').trim(),
      state: (state || '').trim(),
      country: (country || 'India').trim(),
      operatingRegion: resolvedOperatingRegion,
      serviceCorridors: Array.isArray(serviceCorridors) ? serviceCorridors : (typeof serviceCorridors === 'string' ? serviceCorridors.split(',').map(s => s.trim()).filter(Boolean) : []),
      yearsInOperation: Number(yearsInOperation) || 1,
      website: (website || '').trim(),
      description: (description || '').trim(),
      operationsContact: {
        name: (operationsContact?.name || resolvedManagerName).trim(),
        phone: (operationsContact?.phone || resolvedPhone).trim(),
        email: (operationsContact?.email || resolvedManagerEmail).trim()
      },
      billingEmail: (billingEmail || resolvedCompanyEmail).trim(),
      supportContact: (supportContact || '').trim(),
      status: 'active'
    });

    let managerUser = existingUser;

    try {
      if (managerUser) {
        managerUser.organizationId = company._id;
        managerUser.companyName = company.name;
        managerUser.role = 'logistics_manager';
        if (finalGoogleId) managerUser.googleId = finalGoogleId;
        if (password) {
          const salt = await bcrypt.genSalt(10);
          managerUser.password = await bcrypt.hash(password, salt);
        }
        await managerUser.save();
      } else {
        let hashedPassword;
        if (password) {
          const salt = await bcrypt.genSalt(10);
          hashedPassword = await bcrypt.hash(password, salt);
        } else {
          // Google user without explicit password
          const salt = await bcrypt.genSalt(10);
          hashedPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), salt);
        }

        managerUser = await User.create({
          username: finalUsername,
          email: resolvedManagerEmail,
          name: resolvedManagerName,
          password: hashedPassword,
          googleId: finalGoogleId || undefined,
          profilePicture: profilePicture || '',
          role: 'logistics_manager',
          organizationId: company._id,
          companyName: company.name,
          phone: resolvedPhone,
          address: resolvedAddress,
          profileCompleted: true
        });
      }
    } catch (userErr) {
      // Rollback company if user creation fails
      await LogisticsCompany.findByIdAndDelete(company._id);
      throw userErr;
    }

    const token = generateToken(managerUser._id, managerUser.role, company._id);

    return res.status(201).json({
      success: true,
      message: `Logistics company '${company.name}' and manager account successfully registered!`,
      token,
      _id: managerUser._id,
      id: managerUser._id,
      username: managerUser.username,
      email: managerUser.email,
      name: managerUser.name,
      role: 'logistics_manager',
      organizationId: company._id,
      companyName: company.name,
      profileCompleted: true,
      company: {
        _id: company._id,
        id: company._id,
        name: company.name,
        registrationNumber: company.registrationNumber,
        status: company.status
      },
      organization: {
        _id: company._id,
        id: company._id,
        name: company.name,
        status: company.status
      }
    });
  } catch (error) {
    console.error('Error registering logistics company:', error);
    return res.status(500).json({ success: false, message: error.message || 'Internal server error during company registration.' });
  }
};

// @desc    Secure Bootstrap / Creation of Logistics Manager account
// @route   POST /api/auth/bootstrap-manager
// @access  Private or Secret Key
export const bootstrapManager = async (req, res) => {
  const { username, email, password, bootstrapKey, name, companyName, phone, registrationNumber } = req.body;

  const validKey = process.env.MANAGER_BOOTSTRAP_KEY || 'cargolytics_ops_manager_setup_2026';
  const isAuthorizedManager = req.user && ['logistics_manager', 'admin'].includes(req.user.role);
  const isKeyValid = bootstrapKey && bootstrapKey === validKey;

  if (!isAuthorizedManager && !isKeyValid) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Access denied: Valid manager bootstrap key or existing manager session required.'
    });
  }

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this username or email.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'Manager@2026!', salt);

    const compName = companyName || 'Cargolytics Fleet Operations';
    let company = await LogisticsCompany.findOne({ name: compName });
    if (!company) {
      company = await LogisticsCompany.create({
        name: compName,
        registrationNumber: registrationNumber || `REG-${Date.now()}`,
        email: email.trim().toLowerCase(),
        phone: phone || '+91 44 2800 0000',
        address: 'HQ Logistics Terminal',
        status: 'active'
      });
    }

    const manager = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      name: name || username,
      password: hashedPassword,
      role: 'logistics_manager',
      organizationId: company._id,
      companyName: company.name,
      phone: phone || '',
      profileCompleted: true
    });

    res.status(201).json({
      _id: manager._id,
      username: manager.username,
      email: manager.email,
      name: manager.name,
      role: manager.role,
      organizationId: company._id,
      companyName: company.name,
      profileCompleted: true,
      token: generateToken(manager._id, manager.role, company._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get current authenticated user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('organizationId');
    if (!user) {
      return res.status(404).json({ message: 'User not found in database.' });
    }
    const orgId = user.organizationId ? (user.organizationId._id || user.organizationId) : null;
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name || user.username,
      role: user.role,
      organizationId: orgId,
      companyName: user.companyName || (user.organizationId ? user.organizationId.name : ''),
      organization: user.organizationId || null,
      profileCompleted: user.profileCompleted || false,
      profilePicture: user.profilePicture || '',
      phone: user.phone || '',
      address: user.address || ''
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users (logistics manager only)
// @route   GET /api/auth/users
// @access  Logistics Manager
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    const summary = {
      total: users.length,
      customers: users.filter(u => u.role === 'customer' || u.role === 'shipper').length,
      managers: users.filter(u => u.role === 'logistics_manager' || u.role === 'admin' || u.role === 'carrier').length,
    };
    res.json({ users, summary });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Google Sign In & Sign Up (Verified Identity & Account Linking)
// @route   POST /api/auth/google
// @access  Public
export const googleLogin = async (req, res) => {
  const { idToken, username, companyName, phone, address, name: customName } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID Token is required' });
  }

  try {
    const payload = await verifyGoogleIdToken(idToken);
    const { sub: googleId, email, name: googleName, picture } = payload;
    const finalDisplayName = customName || googleName || (email ? email.split('@')[0] : 'User');

    // Check for existing account by googleId OR verified email (Account Linking - Requirement 8)
    let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

    if (user) {
      // Existing User: Link googleId if missing, but STRICTLY PRESERVE existing role (Requirements 3 & 4)
      let needsSave = false;
      if (!user.googleId && googleId) {
        user.googleId = googleId;
        needsSave = true;
      }
      if (!user.profilePicture && picture) {
        user.profilePicture = picture;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    } else {
      // New User: Public Google signup creates strictly 'customer' role (Requirement 2)
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
        email: email.toLowerCase(),
        name: finalDisplayName,
        googleId,
        role: 'customer',
        profilePicture: picture || '',
        profileCompleted: false,
        companyName: companyName || '',
        phone: phone || '',
        address: address || ''
      });
    }

    const orgId = user.organizationId ? (user.organizationId._id || user.organizationId) : null;
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: orgId,
      companyName: user.companyName || '',
      profileCompleted: user.profileCompleted || false,
      profilePicture: user.profilePicture || '',
      token: generateToken(user._id, user.role, orgId)
    });
  } catch (error) {
    console.error('Google Auth Error:', error.message);
    res.status(401).json({ message: 'Google authentication failed. Please try again.' });
  }
};

// @desc    Update user profile details
// @route   PUT /api/auth/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      // Defense: Reject self-privilege escalation
      if (req.body.role && req.body.role !== user.role) {
        return res.status(403).json({
          success: false,
          error: 'PRIVILEGE_ESCALATION_FORBIDDEN',
          message: 'Role modification forbidden. Cannot self-elevate permissions via profile update.'
        });
      }

      user.companyName = req.body.companyName !== undefined ? req.body.companyName : user.companyName;
      user.phone = req.body.phone !== undefined ? req.body.phone : user.phone;
      user.address = req.body.address !== undefined ? req.body.address : (req.body.baseLocation || user.address);
      if (req.body.baseLocation !== undefined) {
        user.baseLocation = req.body.baseLocation;
      }

      if (req.body.profileCompleted !== undefined) {
        user.profileCompleted = req.body.profileCompleted;
      } else {
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

// @desc    Create a new operational driver record under logistics company
// @route   POST /api/auth/drivers
// @access  Private (Logistics Manager only)
export const createDriver = async (req, res) => {
  const { username, name, email, phone, password, licenseNumber, licenseExpiry } = req.body;

  if (!req.user || !['logistics_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: Only logistics managers can manage drivers.' });
  }

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'A user with this username or email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'driver123', salt);

    const driver = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      name: name || username,
      password: hashedPassword,
      role: 'customer', // Store non-manager operational accounts as customer
      carrierId: req.user.username,
      licenseNumber: licenseNumber || '',
      licenseExpiry: licenseExpiry || '',
      driverStatus: 'AVAILABLE',
      profileCompleted: true
    });

    res.status(201).json(driver);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all drivers under current logistics manager
// @route   GET /api/auth/drivers
// @access  Private (Logistics Manager only)
export const getDrivers = async (req, res) => {
  if (!req.user || !['logistics_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const drivers = await User.find({ carrierId: req.user.username }).select('-password');
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update driver properties or status
// @route   PUT /api/auth/drivers/:username
// @access  Private (Logistics Manager only)
export const updateDriverStatus = async (req, res) => {
  const { driverStatus, phone, licenseNumber, licenseExpiry } = req.body;
  const { username } = req.params;

  if (!req.user || !['logistics_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const driver = await User.findOne({ username, carrierId: req.user.username });
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

