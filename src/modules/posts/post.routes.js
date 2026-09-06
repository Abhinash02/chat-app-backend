import { Router } from 'express';

import {
  authenticate,
  requireVerifiedAccount,
  uploadPostImages,
  validate,
} from '#src/common/middleware/index.js';
import { MAX_POST_IMAGES } from '#src/modules/posts/post.constants.js';
import { postController } from '#src/modules/posts/post.controller.js';
import {
  commentIdParamSchema,
  createCommentSchema,
  createPostSchema,
  likePostSchema,
  postAuthorParamSchema,
  postFeedQuerySchema,
  postIdParamSchema,
  postListQuerySchema,
  updateCommentSchema,
  updatePostSchema,
} from '#src/modules/posts/post.schema.js';

const router = Router();

router.use(authenticate, requireVerifiedAccount);

router.get('/', validate({ query: postFeedQuerySchema }), postController.listFeed);

/** Multipart: multer parses the form before `req.body` exists to validate. */
router.post(
  '/',
  uploadPostImages.array('images', MAX_POST_IMAGES),
  validate({ body: createPostSchema }),
  postController.create,
);

router.get(
  '/user/:userId',
  validate({ params: postAuthorParamSchema, query: postListQuerySchema }),
  postController.listByAuthor,
);

/*
 * Comment routes are declared before `/:postId` so `comments` is never
 * mistaken for a post id. Express matches in order, and `/:postId` would
 * otherwise swallow anything one segment deep.
 */
router.delete(
  '/comments/:commentId',
  validate({ params: commentIdParamSchema }),
  postController.removeComment,
);
router.patch(
  '/comments/:commentId',
  validate({ params: commentIdParamSchema, body: updateCommentSchema }),
  postController.updateComment,
);

router.get(
  '/:postId/comments',
  validate({ params: postIdParamSchema, query: postListQuerySchema }),
  postController.listComments,
);
router.post(
  '/:postId/comments',
  validate({ params: postIdParamSchema, body: createCommentSchema }),
  postController.addComment,
);
router.post(
  '/:postId/like',
  validate({ params: postIdParamSchema, body: likePostSchema }),
  postController.like,
);

router.get('/:postId', validate({ params: postIdParamSchema }), postController.getOne);
router.patch(
  '/:postId',
  validate({ params: postIdParamSchema, body: updatePostSchema }),
  postController.update,
);
router.delete('/:postId', validate({ params: postIdParamSchema }), postController.remove);

export const postRoutes = router;
