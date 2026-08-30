import crypto from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { BadRequestError } from '#src/common/errors/index.js';
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
      logger.error({ err: error, key, bucket: env.SUPABASE_STORAGE_BUCKET }, 'Supabase upload failed');

      /*
       * A misconfigured provider is an operator problem, not a server fault, so
       * it gets a message that names the fix rather than collapsing into a
       * generic 500. Getting this wrong costs someone an afternoon reading
       * stack traces to discover they never made the bucket.
       */
      if (error.message?.includes('Bucket not found') || error.statusCode === '404') {
        throw new BadRequestError(
          `The Supabase bucket "${env.SUPABASE_STORAGE_BUCKET}" does not exist. Create it in Storage and mark it public, or change SUPABASE_STORAGE_BUCKET.`,
          'STORAGE_BUCKET_MISSING',
        );
      }

      if (error.statusCode === '403' || error.message?.toLowerCase().includes('unauthorized')) {
        throw new BadRequestError(
          'Supabase rejected the upload. Check SUPABASE_SERVICE_ROLE_KEY is the service role key, not the anon key.',
          'STORAGE_UNAUTHORISED',
        );
      }

      throw new BadRequestError(`Upload failed: ${error.message}`, 'STORAGE_UPLOAD_FAILED');
    }

    const { data } = bucket.getPublicUrl(key);

    /*
     * Supabase storage is a plain object store: it never decodes what it
     * holds, so there is no duration or size to report. The nulls are
     * deliberate rather than missing — a caller must not read "no dimensions"
     * as "square".
     */
    return {
      url: data.publicUrl,
      key,
      provider: 'supabase',
      durationSeconds: null,
      width: null,
      height: null,
    };
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
