import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    }
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['customer', 'logistics_manager'],
    default: 'customer'
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LogisticsCompany',
    default: null,
    index: true
  },
  carrierId: {
    type: String,
    trim: true
  },
  licenseNumber: {
    type: String,
    trim: true,
    default: ''
  },
  licenseExpiry: {
    type: String,
    trim: true,
    default: ''
  },
  driverStatus: {
    type: String,
    enum: ['AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'INACTIVE'],
    default: 'AVAILABLE'
  },
  profilePicture: {
    type: String,
    default: ''
  },
  profileCompleted: {
    type: Boolean,
    default: false
  },
  companyName: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  baseLocation: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);
export default User;
