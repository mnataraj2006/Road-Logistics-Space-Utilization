import mongoose from 'mongoose';

const logisticsCompanySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  registrationNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    trim: true,
    default: ''
  },
  country: {
    type: String,
    trim: true,
    default: 'India'
  },
  operatingRegion: {
    type: String,
    trim: true,
    default: ''
  },
  serviceCorridors: {
    type: [String],
    default: []
  },
  yearsInOperation: {
    type: Number,
    default: 1
  },
  website: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  operationsContact: {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' }
  },
  billingEmail: {
    type: String,
    trim: true,
    default: ''
  },
  supportContact: {
    type: String,
    trim: true,
    default: ''
  },
  isDocumentVerified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'suspended'],
    default: 'active',
    index: true
  },
  fleetCount: {
    type: Number,
    default: 0
  },
  activeTripsCount: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 4.8,
    min: 1,
    max: 5
  }
}, {
  timestamps: true
});

const LogisticsCompany = mongoose.model('LogisticsCompany', logisticsCompanySchema);
export default LogisticsCompany;
