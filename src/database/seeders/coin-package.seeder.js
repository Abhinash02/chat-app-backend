import { logger } from '#src/config/logger.js';
import { coinPackageRepository } from '#src/modules/coins/coin-package.repository.js';

/**
 * Launch pricing. The two packs the product specified are first; the rest give
 * the store a ladder. Every value is editable from the admin panel afterwards —
 * this only seeds an empty database.
 */
const DEFAULT_PACKAGES = [
  {
    name: 'Starter',
    description: 'Enough to keep a good conversation going.',
    priceInPaise: 3000,
    coins: 40,
    bonusCoins: 0,
    sortOrder: 1,
  },
  {
    name: 'Popular',
    description: 'Best value for everyday chatting.',
    priceInPaise: 5000,
    coins: 60,
    bonusCoins: 0,
    badge: 'Best value',
    isPopular: true,
    sortOrder: 2,
  },
  {
    name: 'Plus',
    description: 'A week of easy talking.',
    priceInPaise: 10000,
    coins: 125,
    bonusCoins: 15,
    sortOrder: 3,
  },
  {
    name: 'Pro',
    description: 'For people who never run out of things to say.',
    priceInPaise: 25000,
    coins: 320,
    bonusCoins: 50,
    badge: 'Most coins',
    sortOrder: 4,
  },
];

export async function seedCoinPackages() {
  const existing = await coinPackageRepository.count();

  if (existing > 0) {
    logger.info({ existing }, 'Coin packages already present; skipping');
    return 0;
  }

  await coinPackageRepository.insertMany(DEFAULT_PACKAGES);
  logger.info({ count: DEFAULT_PACKAGES.length }, 'Seeded coin packages');
  return DEFAULT_PACKAGES.length;
}
