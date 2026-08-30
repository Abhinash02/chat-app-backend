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
  .then(async ({ users, password }) => {
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

    console.log(`\n  Sign in as rahul to see the girls and start a chat.`);
    console.log(`${line}\n`);

    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nCould not create demo accounts:', error.message, '\n');
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
