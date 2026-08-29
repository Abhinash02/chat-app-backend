import crypto from 'node:crypto';

import { v2 as cloudinary } from 'cloudinary';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';

let configured = false;

function configure() {
  if (configured) return;

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary storage selected but CLOUDINARY_* credentials are missing');
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  configured = true;
}

/** @type {import('#src/integrations/storage/storage.provider.js').StorageProvider} */
export const cloudinaryStorageProvider = {
  name: 'cloudinary',

  async upload({ buffer, mimeType, folder, fileName }) {
    configure();

    const publicId = `${fileName}-${crypto.randomBytes(8).toString('hex')}`;

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
          public_id: publicId,
          resource_type: 'image',
          overwrite: false,
          // Cloudinary does the resizing so the app never downloads a 5MB avatar.
          transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto:good' }],
        },
        (error, uploadResult) => (error ? reject(error) : resolve(uploadResult)),
      );

      stream.end(buffer);
    }).catch((error) => {
      logger.error({ err: error, mimeType }, 'Cloudinary upload failed');
      throw new Error(`Cloudinary upload failed: ${error.message}`);
    });

    return { url: result.secure_url, key: result.public_id, provider: 'cloudinary' };
  },

  async remove(key) {
    if (!key) return false;
    configure();

    try {
      await cloudinary.uploader.destroy(key, { resource_type: 'image' });
      return true;
    } catch (error) {
      logger.warn({ err: error, key }, 'Cloudinary delete failed');
      return false;
    }
  },
};
