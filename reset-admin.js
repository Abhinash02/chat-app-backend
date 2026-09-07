import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { userRepository } from './src/modules/users/user.repository.js';
import { hashPassword } from './src/common/utils/crypto.util.js';
import { env } from './src/config/env.js';

async function reset() {
  await connectDatabase();
  const email = env.SEED_ADMIN_EMAIL || 'admin@vibechat.app';
  const password = env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  
  let admin = await userRepository.findByEmail(email);
  if (admin) {
    console.log(`Admin found with email ${email}, updating password...`);
    admin.passwordHash = await hashPassword(password);
    await admin.save();
    console.log(`Password forcefully reset to: ${password}`);
  } else {
    console.log('Admin not found. Please run npm run seed first.');
  }
  await disconnectDatabase();
  process.exit(0);
}

reset().catch(console.error);
