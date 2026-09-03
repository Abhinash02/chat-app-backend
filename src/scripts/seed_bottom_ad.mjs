import '../config/env.js';
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);

const existingAd = await mongoose.connection.collection('banners').findOne({ placement: 'home_bottom_ad' });

if (!existingAd) {
  await mongoose.connection.collection('banners').insertOne({
    title: 'Special Coins Offer - 50% Extra!',
    note: 'Limited time bonus coins on all packages',
    imageUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=1200&auto=format&fit=crop&q=80',
    imageStorageKey: '',
    placement: 'home_bottom_ad',
    animation: 'shimmer',
    action: 'screen',
    actionTarget: 'coins',
    isActive: true,
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
    impressions: 0,
    taps: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log('Created default home_bottom_ad banner.');
} else {
  console.log('Existing home_bottom_ad found:', existingAd.title);
}

const allBanners = await mongoose.connection.collection('banners').find({}).toArray();
console.log('Total Banners in DB:', allBanners.length);

await mongoose.disconnect();
process.exit(0);
