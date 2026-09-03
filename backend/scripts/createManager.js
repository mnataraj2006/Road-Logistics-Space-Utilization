import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import LogisticsCompany from '../models/LogisticsCompany.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const createOrPromoteManager = async () => {
  const args = process.argv.slice(2);

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const promoteEmailOrUser = getArg('--promote') || getArg('-p');
  const inputUsername = getArg('--username') || getArg('-u');
  const inputEmail = getArg('--email') || getArg('-e');
  const inputPassword = getArg('--password') || 'Manager@2026!';
  const inputName = getArg('--name') || 'Logistics Operations Director';
  const inputCompany = getArg('--company') || 'Cargolytics Fleet Operations';
  const inputRegNo = getArg('--reg') || `REG-${Date.now()}`;

  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in backend/.env');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    // Ensure company exists
    let company = await LogisticsCompany.findOne({ name: inputCompany });
    if (!company) {
      company = await LogisticsCompany.create({
        name: inputCompany,
        registrationNumber: inputRegNo,
        email: (inputEmail || 'ops@company.com').toLowerCase(),
        phone: '+91 44 2800 0000',
        address: 'HQ Regional Logistics Terminal',
        status: 'active'
      });
    }

    // MODE 1: Promote existing account to logistics_manager
    if (promoteEmailOrUser) {
      const identifier = promoteEmailOrUser.trim();
      const user = await User.findOne({
        $or: [
          { username: identifier },
          { email: identifier.toLowerCase() }
        ]
      });

      if (!user) {
        console.error(`❌ User '${identifier}' not found in database.`);
        process.exit(1);
      }

      user.role = 'logistics_manager';
      user.organizationId = company._id;
      user.companyName = company.name;
      await user.save();

      console.log('\n===============================================================');
      console.log('🎉 USER PROMOTED TO LOGISTICS MANAGER SUCCESSFULLY');
      console.log('===============================================================');
      console.log(`User ID:      ${user._id}`);
      console.log(`Username:     ${user.username}`);
      console.log(`Email:        ${user.email}`);
      console.log(`Role:         ${user.role}`);
      console.log(`Organization: ${company.name} (${company._id})`);
      console.log('===============================================================\n');
      process.exit(0);
    }

    // MODE 2: Create a new logistics_manager account
    const username = inputUsername || 'ops_manager';
    const email = (inputEmail || 'ops.manager@cargolytics.com').toLowerCase();

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.role !== 'logistics_manager' || !existingUser.organizationId) {
        existingUser.role = 'logistics_manager';
        existingUser.organizationId = company._id;
        existingUser.companyName = company.name;
        await existingUser.save();
        console.log(`\n✓ Existing user '${existingUser.username}' updated with role: 'logistics_manager' & Organization: '${company.name}'.`);
      } else {
        console.log(`\n✓ User '${existingUser.username}' already exists as role: 'logistics_manager'.`);
      }
      console.log(`User ID: ${existingUser._id} | Role: ${existingUser.role} | Org: ${company.name}`);
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(inputPassword, salt);

    const manager = await User.create({
      username,
      email,
      name: inputName,
      password: hashedPassword,
      role: 'logistics_manager',
      organizationId: company._id,
      companyName: company.name,
      profileCompleted: true
    });

    console.log('\n===============================================================');
    console.log('🎉 LOGISTICS MANAGER ACCOUNT CREATED SUCCESSFULLY');
    console.log('===============================================================');
    console.log(`User ID:      ${manager._id}`);
    console.log(`Username:     ${manager.username}`);
    console.log(`Email:        ${manager.email}`);
    console.log(`Password:     ${inputPassword}`);
    console.log(`Role:         ${manager.role}`);
    console.log(`Organization: ${company.name} (${company._id})`);
    console.log('===============================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error managing logistics manager account:', error.message);
    process.exit(1);
  }
};

createOrPromoteManager();
