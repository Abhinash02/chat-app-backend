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

/**
 * MIME type -> extension.
 *
 * The extension is always derived from the declared type, never from the
 * client's filename — a filename is attacker-controlled text and has no
 * business deciding what a stored object is called.
 */
export const EXTENSION_BY_MIME_TYPE = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',

  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/3gpp': '3gp',

  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
});

export function extensionFor(mimeType) {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) throw new Error(`Unsupported mime type: ${mimeType}`);
  return extension;
}
