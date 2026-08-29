import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll } from 'vitest';

/**
 * Tests run against a real MongoDB started in memory, not a mocked driver:
 * most of the logic worth testing here (conditional atomic updates, unique
 * indexes, geo queries) only behaves correctly against the real engine.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';
// Keep hashing cheap so the suite is not dominated by bcrypt.
process.env.BCRYPT_ROUNDS = '10';
process.env.STORAGE_PROVIDER = 'local';
process.env.SMTP_HOST = '';
process.env.CORS_ORIGINS = 'http://localhost:5173';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri('vibechat-test');

  const { connectDatabase } = await import('#src/config/database.js');
  await connectDatabase(process.env.MONGODB_URI);
});

afterAll(async () => {
  const { disconnectDatabase } = await import('#src/config/database.js');
  await disconnectDatabase();
  await mongoServer?.stop();
});
