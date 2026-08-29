import multer from 'multer';

import { BadRequestError } from '#src/common/errors/index.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Images are buffered in memory and handed to a storage provider — nothing the
 * client sends is used as a filesystem path. The declared MIME type is only a
 * first filter; the storage layer re-derives the extension from the allow-list.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new BadRequestError('Only JPEG, PNG or WebP images are allowed', 'UNSUPPORTED_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

export { MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME_TYPES };
