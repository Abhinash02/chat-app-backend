import { asyncHandler } from '#src/common/utils/async-handler.util.js';
import { sendCreated, sendSuccess } from '#src/common/utils/response.util.js';
import { postService } from '#src/modules/posts/post.service.js';

export const postController = {
  create: asyncHandler(async (req, res) => {
    const post = await postService.createPost({
      user: req.user,
      files: req.files,
      caption: req.body?.caption ?? '',
    });
    return sendCreated(res, post);
  }),

  listFeed: asyncHandler(async (req, res) => {
    const { items, meta } = await postService.listFeed({ user: req.user, ...req.query });
    return sendSuccess(res, items, { meta });
  }),

  listByAuthor: asyncHandler(async (req, res) => {
    const { items, meta } = await postService.listByAuthor({
      user: req.user,
      authorId: req.params.userId,
      ...req.query,
    });
    return sendSuccess(res, items, { meta });
  }),

  getOne: asyncHandler(async (req, res) => {
    const post = await postService.getPost({ user: req.user, postId: req.params.postId });
    return sendSuccess(res, post);
  }),

  update: asyncHandler(async (req, res) => {
    const post = await postService.updatePost({
      user: req.user,
      postId: req.params.postId,
      caption: req.body.caption,
    });
    return sendSuccess(res, post);
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await postService.deletePost({ user: req.user, postId: req.params.postId });
    return sendSuccess(res, result);
  }),

  like: asyncHandler(async (req, res) => {
    const result = await postService.toggleLike({
      user: req.user,
      postId: req.params.postId,
      like: req.body?.like,
    });
    return sendSuccess(res, result);
  }),

  listComments: asyncHandler(async (req, res) => {
    const { items, meta } = await postService.listComments({
      user: req.user,
      postId: req.params.postId,
      ...req.query,
    });
    return sendSuccess(res, items, { meta });
  }),

  addComment: asyncHandler(async (req, res) => {
    const comment = await postService.addComment({
      user: req.user,
      postId: req.params.postId,
      text: req.body.text,
    });
    return sendCreated(res, comment);
  }),

  updateComment: asyncHandler(async (req, res) => {
    const comment = await postService.updateComment({
      user: req.user,
      commentId: req.params.commentId,
      text: req.body.text,
    });
    return sendSuccess(res, comment);
  }),

  removeComment: asyncHandler(async (req, res) => {
    const result = await postService.deleteComment({
      user: req.user,
      commentId: req.params.commentId,
    });
    return sendSuccess(res, result);
  }),
};
