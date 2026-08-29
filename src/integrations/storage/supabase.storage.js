import crypto from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { extensionFor } from '#src/integrations/storage/storage.provider.js';

let client = null;

function getClient() {
  if (client) return client;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase storage selected but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing');
  }

  // The service-role key bypasses row-level security, so it must never reach a
  // client bundle — this module is server-only by construction.
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

/** @type {import('#src/integrations/storage/storage.provider.js').StorageProvider} */
export const supabaseStorageProvider = {
  name: 'supabase',

  async upload({ buffer, mimeType, folder, fileName }) {
    const key = `${folder}/${fileName}-${crypto.randomBytes(8).toString('hex')}.${extensionFor(mimeType)}`;
    const bucket = getClient().storage.from(env.SUPABASE_STORAGE_BUCKET);

    const { error } = await bucket.upload(key, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '31536000',
    });

    if (error) {
      logger.error({ err: error, key }, 'Supabase upload failed');
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    const { data } = bucket.getPublicUrl(key);
    return { url: data.publicUrl, key, provider: 'supabase' };
  },

  async remove(key) {
    if (!key) return false;

    const { error } = await getClient().storage.from(env.SUPABASE_STORAGE_BUCKET).remove([key]);
    if (error) {
      // A failed cleanup leaves an orphan object but must not fail the request
      // that replaced the file.
      logger.warn({ err: error, key }, 'Supabase delete failed');
      return false;
    }

    return true;
  },
};
