/**
 * How many images one post may carry.
 *
 * Five is the product rule, but it is also what keeps a post cheap: the images
 * are uploaded in one request and deleted together, so the number bounds both
 * the memory a single request can occupy and the work a delete has to do.
 */
export const MAX_POST_IMAGES = 5;

/** Room for a real caption without turning a photo post into a blog entry. */
export const MAX_CAPTION_LENGTH = 500;

/** A comment is a reply, not an essay. */
export const MAX_COMMENT_LENGTH = 300;

/**
 * The longest edge an uploaded post image is stored at.
 *
 * Phone screens are ~1080px wide at 3x, so anything past this is detail nobody
 * sees on the device it was posted from — it only shows up on the storage
 * bill. The client shrinks to roughly this before uploading and the storage
 * layer enforces it again, because a client can always be an older build.
 */
export const POST_IMAGE_MAX_EDGE = 1080;

/**
 * Cloudinary quality for post images.
 *
 * `auto:eco` leans harder on compression than the `auto:good` used for chat
 * media. A feed photo is scrolled past, not studied, and the difference is
 * hard to see at phone size while the saving is roughly a third of the bytes.
 */
export const POST_IMAGE_QUALITY = 'auto:eco';

export const POST_SORT = Object.freeze({
  NEWEST: 'newest',
  POPULAR: 'popular',
});
