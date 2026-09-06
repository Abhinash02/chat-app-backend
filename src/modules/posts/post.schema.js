import { z } from 'zod';

import { objectIdSchema, paginationSchema } from '#src/common/validators/common.schema.js';
import {
  MAX_CAPTION_LENGTH,
  MAX_COMMENT_LENGTH,
  POST_SORT,
} from '#src/modules/posts/post.constants.js';

/**
 * The caption arrives as a multipart field, so it is always a string — an
 * empty one when the author wrote nothing. Optional rather than required: a
 * photo post does not need words.
 */
export const createPostSchema = z
  .object({
    caption: z.string().trim().max(MAX_CAPTION_LENGTH).optional().default(''),
  })
  .strict();

export const updatePostSchema = z
  .object({
    caption: z.string().trim().max(MAX_CAPTION_LENGTH),
  })
  .strict();

export const postFeedQuerySchema = paginationSchema.extend({
  sort: z.nativeEnum(POST_SORT).optional().default(POST_SORT.NEWEST),
});

export const postListQuerySchema = paginationSchema;

export const postIdParamSchema = z.object({ postId: objectIdSchema });

export const postAuthorParamSchema = z.object({ userId: objectIdSchema });

export const commentIdParamSchema = z.object({ commentId: objectIdSchema });

export const createCommentSchema = z
  .object({
    text: z.string().trim().min(1, 'Write something first').max(MAX_COMMENT_LENGTH),
  })
  .strict();

export const updateCommentSchema = createCommentSchema;

/**
 * Like is a set, not a toggle, when the client says so.
 *
 * Sending the desired state makes a retried request idempotent; omitting it
 * falls back to flipping whatever is stored, which is what a plain tap wants.
 */
export const likePostSchema = z
  .object({
    like: z.boolean().optional(),
  })
  .strict();
