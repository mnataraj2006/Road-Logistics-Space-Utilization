import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import User from '../models/User.js';

async function listUsers() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users:`);
  users.forEach(u => {
    console.log(`- Username: ${u.username}, Role: ${u.role}, Email: ${u.email}`);
  });
  await mongoose.disconnect();
}

listUsers().catch(console.error);
