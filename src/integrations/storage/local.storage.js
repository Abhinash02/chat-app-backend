import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { logger } from '#src/config/logger.js';
import { extensionFor } from '#src/integrations/storage/storage.provider.js';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

/**
 * Development-only fallback so the app runs with no cloud credentials.
 * Files land under ./uploads and are served by the static route in app.js.
 * Not suitable for production: a restarted container loses every file.
 */
export const localStorageProvider = {
  name: 'local',

  async upload({ buffer, mimeType, folder, fileName }) {
    const safeFolder = String(folder).replace(/[^a-z0-9-]/gi, '');
    const key = `${safeFolder}/${fileName}-${crypto.randomBytes(8).toString('hex')}.${extensionFor(mimeType)}`;
    const destination = path.join(UPLOAD_ROOT, key);

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);

    return { url: `/uploads/${key}`, key, provider: 'local' };
  },

  async remove(key) {
    if (!key) return false;

    // Resolve then verify containment: a crafted key must not escape the root.
    const destination = path.resolve(UPLOAD_ROOT, key);
    if (!destination.startsWith(UPLOAD_ROOT + path.sep)) {
      logger.warn({ key }, 'Rejected storage key outside the upload root');
      return false;
    }

    try {
      await fs.unlink(destination);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') logger.warn({ err: error, key }, 'Local delete failed');
      return false;
    }
  },
};

export { UPLOAD_ROOT };
