import '../config/env.js';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);

const res = await mongoose.connection.collection('banners').updateMany(
  {},
  {
    $set: {
      isActive: true,
      endsAt: null,
      startsAt: null,
      action: 'screen',
      actionTarget: 'coins',
      animation: 'shimmer',
    },
  }
);

console.log('Updated banners:', res);
const banners = await mongoose.connection.collection('banners').find({}).toArray();
console.log('Current Banners:', JSON.stringify(banners, null, 2));

await mongoose.disconnect();
process.exit(0);
