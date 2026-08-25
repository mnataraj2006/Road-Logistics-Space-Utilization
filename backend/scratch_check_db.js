import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import User from './models/User.js';
import Route from './models/Route.js';

dotenv.config();

const checkDb = async () => {
  await connectDB();
  const users = await User.find({});
  console.log('--- USERS ---');
  users.forEach(u => console.log(`Username: ${u.username}, Role: ${u.role}, Email: ${u.email}`));

  const routes = await Route.find({});
  console.log('\n--- ROUTES ---');
  routes.forEach(r => console.log(`RouteId: ${r.routeId}, Source: ${r.source}, Destination: ${r.destination}, CarrierId: ${r.carrierId}`));
  
  process.exit(0);
};

checkDb();
