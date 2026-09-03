// Must be run from chat-app-backend directory: node src/scripts/check_real_users.mjs
import '../config/env.js';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);

const users = await mongoose.connection.collection('users')
  .find({ nickname: { $regex: /anu|prabh/i } })
  .toArray();

console.log(JSON.stringify(
  users.map(u => ({
    id: String(u._id),
    nickname: u.nickname,
    city: u.city ?? null,
    state: u.state ?? null,
    location: u.location ?? null,
    ageGroup: u.ageGroup ?? null,
    gender: u.gender,
  })),
  null, 2
));

await mongoose.disconnect();
process.exit(0);
