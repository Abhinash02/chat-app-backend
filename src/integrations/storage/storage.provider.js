/**
 * Application-facing contract every storage backend implements.
 *
 * Business code depends only on this shape, so swapping Supabase for Cloudinary
 * (or an S3 bucket later) is a configuration change, not a rewrite.
 *
 * @typedef {object} UploadInput
 * @property {Buffer}  buffer      Raw file bytes.
 * @property {string}  mimeType    Validated MIME type.
 * @property {string}  folder      Logical folder, e.g. "avatars".
 * @property {string}  fileName    Base name without extension.
 *
 * @typedef {object} UploadResult
 * @property {string}  url         Publicly reachable URL.
 * @property {string}  key         Provider-scoped identifier used for deletion.
 * @property {string}  provider    Which implementation produced this object.
 *
 * @typedef {object} StorageProvider
 * @property {string} name
 * @property {(input: UploadInput) => Promise<UploadResult>} upload
 * @property {(key: string) => Promise<boolean>} remove
 */

/** MIME type -> extension. Never derive an extension from the client filename. */
export const EXTENSION_BY_MIME_TYPE = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

export function extensionFor(mimeType) {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) throw new Error(`Unsupported mime type: ${mimeType}`);
  return extension;
}
