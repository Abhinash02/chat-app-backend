import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { cloudinaryStorageProvider } from '#src/integrations/storage/cloudinary.storage.js';
import { localStorageProvider } from '#src/integrations/storage/local.storage.js';
import { supabaseStorageProvider } from '#src/integrations/storage/supabase.storage.js';

const PROVIDERS = {
  supabase: supabaseStorageProvider,
  cloudinary: cloudinaryStorageProvider,
  local: localStorageProvider,
};

/**
 * Resolves the configured provider. Credentials are only touched on the first
 * upload, so a misconfigured optional provider never blocks boot.
 */
export function getStorageProvider() {
  const provider = PROVIDERS[env.STORAGE_PROVIDER];

  if (!provider) {
    logger.warn({ configured: env.STORAGE_PROVIDER }, 'Unknown storage provider; falling back to local disk');
    return localStorageProvider;
  }

  return provider;
}

export { supabaseStorageProvider, cloudinaryStorageProvider, localStorageProvider };
