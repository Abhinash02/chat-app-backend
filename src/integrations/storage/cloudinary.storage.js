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

    /*
     * Cloudinary calls both audio and video "video", which is not a typo —
     * they share one pipeline there. Getting this wrong stores an m4a as an
     * image and it comes back unplayable.
     */
    const isImage = mimeType.startsWith('image/');
    const resourceType = isImage ? 'image' : 'video';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
          public_id: publicId,
          resource_type: resourceType,
          overwrite: false,
          // Only images are resized here. Re-encoding audio would cost quality
          // for no gain, and video transformation is a paid feature.
          ...(isImage
            ? {
                transformation: [{ width: 1080, height: 1080, crop: 'limit', quality: 'auto:good' }],
              }
            : {}),
        },
        (error, uploadResult) => (error ? reject(error) : resolve(uploadResult)),
      );

      stream.end(buffer);
    }).catch((error) => {
      logger.error({ err: error, mimeType }, 'Cloudinary upload failed');
      throw new Error(`Cloudinary upload failed: ${error.message}`);
    });

    return {
      url: result.secure_url,
      key: result.public_id,
      provider: 'cloudinary',
      // Cloudinary reports the real duration, so the client does not have to
      // be trusted about how long a voice note is.
      durationSeconds: result.duration ? Math.round(result.duration) : null,
      // Needed at deletion time: a video cannot be destroyed as an image.
      resourceType,
      /*
       * The stored dimensions, after the resize above. `crop: 'limit'` scales
       * to fit inside the box without cropping, so a portrait stays portrait
       * and a landscape stays landscape — these are the real proportions, not
       * a square. Clients use them to reserve the right shape before the image
       * has loaded.
       */
      width: result.width ?? null,
      height: result.height ?? null,
    };
  },

  async remove(key, { resourceType = 'image' } = {}) {
    if (!key) return false;
    configure();

    try {
      await cloudinary.uploader.destroy(key, { resource_type: resourceType });
      return true;
    } catch (error) {
      logger.warn({ err: error, key }, 'Cloudinary delete failed');
      return false;
    }
  },
};
