/**
 * Starts a real MongoDB for local development.
 *
 *   npm run db
 *
 * This exists because getting a database running is the one step between a
 * fresh clone and a working app, and the usual answers (install MongoDB, or
 * pull a 700MB Docker image) both fail on a slow or restricted network.
 *
 * It runs the genuine `mongod` binary that mongodb-memory-server already
 * downloads for the test suite — the only difference from a system install is
 * that this script owns the process lifetime.
 *
 * Data is written to `.mongodb-data/` and survives restarts. That is the whole
 * point: the in-memory database the tests use would lose your seeded admin and
 * every account every time you stopped the server.
 *
 * For production, use MongoDB Atlas or a managed instance — not this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MongoMemoryServer } from 'mongodb-memory-server';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(projectRoot, '.mongodb-data');

const PORT = Number(process.env.DEV_DB_PORT ?? 27017);

async function main() {
  fs.mkdirSync(dataDirectory, { recursive: true });

  console.log('Starting MongoDB…');

  const server = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbPath: dataDirectory,
      // Without this the data directory is wiped on shutdown, which would
      // defeat the entire purpose of this script.
      storageEngine: 'wiredTiger',
    },
  });

  const uri = `mongodb://127.0.0.1:${PORT}/vibechat`;

  console.log('');
  console.log('  MongoDB is running');
  console.log(`  URI   ${uri}`);
  console.log(`  Data  ${dataDirectory}`);
  console.log('');
  console.log('  Leave this running. Start the API in another terminal:');
  console.log('    npm run dev');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  async function shutdown() {
    console.log('\nStopping MongoDB…');
    // `false` keeps the data directory; `true` would delete it.
    await server.stop({ doCleanup: false });
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  if (error?.message?.includes('EADDRINUSE') || error?.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use — something is already listening there.`);
    console.error('If that is another MongoDB, you can just use it and skip this script.\n');
  } else {
    console.error('\nCould not start MongoDB:', error.message, '\n');
  }
  process.exit(1);
});
