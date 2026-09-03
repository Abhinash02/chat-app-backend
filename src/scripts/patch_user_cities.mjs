// Run from backend dir: node src/scripts/patch_user_cities.mjs
import '../config/env.js';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);

// prabh has coordinates: [76.7117131, 30.7132003] = Chandigarh area (Punjab/Haryana)
// anu has NO coordinates — we'll set Chandigarh (same device area) since no GPS data

const patchList = [
  {
    nickname: 'prabh',
    city: 'Mohali',
    country: 'India',
    // coordinates verified: [76.7117131, 30.7132003] → Mohali, Punjab
  },
  {
    nickname: 'anu',
    city: 'Mohali',
    country: 'India',
    // no GPS coords on file — using same device area as prabh (Mohali)
    coordinates: [76.7117131, 30.7132003],
  },
];

for (const patch of patchList) {
  const setData = {
    'location.city': patch.city,
    'location.country': patch.country,
    'location.updatedAt': new Date(),
  };

  if (patch.coordinates) {
    setData['location.type'] = 'Point';
    setData['location.coordinates'] = patch.coordinates;
  }

  const result = await mongoose.connection.collection('users').updateOne(
    { nickname: { $regex: new RegExp(`^${patch.nickname}$`, 'i') } },
    { $set: setData }
  );

  console.log(`${patch.nickname}: matched=${result.matchedCount} modified=${result.modifiedCount} → city set to "${patch.city}"`);
}

await mongoose.disconnect();
process.exit(0);
