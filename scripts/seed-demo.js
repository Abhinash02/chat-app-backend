/**
 * Creates sign-in-ready demo accounts.
 *
 *   npm run seed:demo
 *
 * Safe to run repeatedly. Development convenience only — never run this
 * against a production database.
 */
import { connectDatabase, disconnectDatabase } from '#src/config/database.js';
import { seedDemoUsers } from '#src/database/seeders/demo-users.seeder.js';

connectDatabase()
  .then(seedDemoUsers)
  .then(async ({ users, password, onlineCount }) => {
    const line = '─'.repeat(62);
    console.log(`\n${line}`);
    console.log('  DEMO ACCOUNTS — sign in with any of these');
    console.log(line);
    console.log(`  Password (all accounts):  ${password}\n`);

    for (const user of users) {
      const role = user.gender === 'male' ? 'boy ' : 'girl';
      const coins = user.coins > 0 ? `${user.coins} coins` : 'unlimited';
      console.log(
        `  ${role}  ${user.email.padEnd(18)} ${coins.padEnd(11)} ${user.existed ? '(already existed)' : '(created)'}`,
      );
    }

    console.log(`\n  ${users.filter((u) => u.gender === 'female').length} girls and ${users.filter((u) => u.gender === 'male').length} boys.`);
    console.log(`  Sign in as rahul to browse the girls, or priya to see the boys.`);

    if (onlineCount > 0) {
      console.log(`\n  ${onlineCount} accounts marked online so the feed looks alive.`);
      console.log('  Restarting the API clears that — run this again to restore it.');
    }
    console.log(`${line}\n`);

    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nCould not create demo accounts:', error.message, '\n');
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
