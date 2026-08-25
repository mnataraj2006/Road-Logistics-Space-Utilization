import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics_space_utilization';
    
    console.log(`Attempting to connect to MongoDB: ${mongoUri}`);
    
    // Connect directly without a tight 3-second timeout
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Critical: MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
