import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });
import User from '../models/User.js';

await mongoose.connect(process.env.MONGO_URI);
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash('password123', salt);

await User.deleteOne({ username: 'demo-customer' });
const user = await User.create({
  username: 'demo-customer',
  email: 'demo.customer@roadlogistics.com',
  password: hashedPassword,
  role: 'customer',
  name: 'Demo Customer Shipper',
  companyName: 'Acme Commercial Goods'
});
console.log('Created customer user:', user.username, user.email, 'password: password123');
await mongoose.disconnect();
