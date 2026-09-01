import multer from 'multer';

import { BadRequestError } from '#src/common/errors/index.js';

/**
 * Limits are per kind, because the cost of each is wildly different.
 *
 * A 1GB free storage tier holds roughly 4,000 half-minute voice notes but only
 * a few hundred short videos, so video gets the tightest cap and the shortest
 * duration. These are the ceiling, not the target — the client compresses
 * before it uploads.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
]);

/**
 * Recorder output differs by platform: iOS gives m4a, Android gives m4a or
 * 3gp, and browsers give webm. All four are accepted rather than forcing a
 * transcode the phone would have to do before it could send anything.
 */
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
  'audio/3gpp',
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
]);

function buildUploader({ allowed, maxBytes, description }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      // The declared type is only a first filter; the storage layer derives the
      // real extension from this same allow-list rather than the filename.
      if (!allowed.has(file.mimetype)) {
        cb(new BadRequestError(description, 'UNSUPPORTED_FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadImage = buildUploader({
  allowed: ALLOWED_IMAGE_MIME_TYPES,
  maxBytes: MAX_IMAGE_BYTES,
  description: 'Only JPEG, PNG or WebP images are allowed',
});

export const uploadAudio = buildUploader({
  allowed: ALLOWED_AUDIO_MIME_TYPES,
  maxBytes: MAX_AUDIO_BYTES,
  description: 'That audio format is not supported',
});

export const uploadVideo = buildUploader({
  allowed: ALLOWED_VIDEO_MIME_TYPES,
  maxBytes: MAX_VIDEO_BYTES,
  description: 'Only MP4, MOV, WebM or 3GP videos are allowed',
});

/**
 * Accepts any of the three, for endpoints where the sender chooses.
 * The service reads the mime type to decide what it received.
 */
export const uploadMedia = buildUploader({
  allowed: new Set([
    ...ALLOWED_IMAGE_MIME_TYPES,
    ...ALLOWED_AUDIO_MIME_TYPES,
    ...ALLOWED_VIDEO_MIME_TYPES,
  ]),
  maxBytes: MAX_VIDEO_BYTES,
  description: 'That file type is not supported',
});

export function mediaKindOf(mimeType) {
  if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) return 'audio';
  if (ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return 'video';
  return null;
}

export {
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
};
