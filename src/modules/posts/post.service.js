import { BadRequestError, ForbiddenError, NotFoundError } from '#src/common/errors/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';
import { maskBlockedWords, normalizeMessageText } from '#src/common/utils/text.util.js';
import { logger } from '#src/config/logger.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { postRepository } from '#src/modules/posts/post.repository.js';
import {
  MAX_POST_IMAGES,
  POST_IMAGE_MAX_EDGE,
  POST_IMAGE_QUALITY,
} from '#src/modules/posts/post.constants.js';
import { emitToUser } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';

function toAuthorDto(user) {
  if (!user || typeof user !== 'object' || !user.nickname) return null;

  return {
    userId: String(user._id),
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    avatarEmoji: user.avatarEmoji ?? null,
    avatarColor: user.avatarColor ?? null,
    gender: user.gender,
    isOnline: Boolean(user.isOnline),
  };
}

function toPostDto(post, viewerId) {
  const author = toAuthorDto(post.userId);
  const authorId = author ? author.userId : String(post.userId);

  return {
    id: String(post._id),
    author,
    images: (post.images ?? []).map((image) => ({
      url: image.url,
      width: image.width ?? null,
      height: image.height ?? null,
    })),
    caption: post.caption ?? '',
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentCount ?? 0,
    /*
     * Whether *this* viewer liked it. The full list of who liked a post is
     * never sent: it is the same privacy question as a status viewer list, and
     * the UI only ever needs the count plus the state of one heart.
     */
    hasLiked: (post.likedBy ?? []).some((id) => String(id) === String(viewerId)),
    isOwn: String(authorId) === String(viewerId),
    editedAt: post.editedAt ?? null,
    createdAt: post.createdAt,
  };
}

function toCommentDto(comment, viewerId, postAuthorId) {
  const author = toAuthorDto(comment.userId);

  return {
    id: String(comment._id),
    author,
    text: comment.text,
    isOwn: String(author?.userId ?? comment.userId) === String(viewerId),
    /*
     * The post's author may remove any comment on their own post. Told to the
     * client so the delete affordance appears for them, rather than only
     * failing at the server when they try.
     */
    canDelete:
      String(author?.userId ?? comment.userId) === String(viewerId)
      || String(postAuthorId) === String(viewerId),
    editedAt: comment.editedAt ?? null,
    createdAt: comment.createdAt,
  };
}

/**
 * Same word list and the same switch the chat and stories use, so moderation
 * does not quietly differ by surface.
 *
 * `maskBlockedWords` returns `{ text, masked }` rather than a string — taking
 * `.text` is what keeps an object from reaching the model as a caption.
 */
async function cleanText(text) {
  const normalised = normalizeMessageText(text ?? '');
  if (!normalised) return '';

  const settings = await settingsService.getSettings();
  return settings.moderation?.profanityFilterEnabled
    ? maskBlockedWords(normalised, settings.moderation.blockedWords ?? []).text
    : normalised;
}

/** The viewer, everyone they blocked, and everyone who blocked them. */
async function buildExclusionList(viewerId) {
  const me = await userRepository.findById(viewerId);
  if (!me) throw new NotFoundError('Account not found', 'USER_NOT_FOUND');

  const blockedByOthers = await userRepository.findUserIdsBlocking(viewerId);
  return [...(me.blockedUserIds ?? []), ...blockedByOthers];
}

/**
 * Creates a post from the uploaded images.
 *
 * Uploads run in parallel and are all-or-nothing: if any one fails, the ones
 * that already landed are removed before the error propagates. A post with
 * three of five pictures is worse than no post — the author would have to
 * delete and redo it, and the orphans would bill quietly in the meantime.
 */
export async function createPost({ user, files, caption }) {
  const images = Array.isArray(files) ? files : [];

  if (!images.length) throw new BadRequestError('Add at least one photo', 'NO_IMAGES');
  if (images.length > MAX_POST_IMAGES) {
    throw new BadRequestError(`You can post up to ${MAX_POST_IMAGES} photos`, 'TOO_MANY_IMAGES');
  }

  const storage = getStorageProvider();
  const uploaded = [];

  try {
    const results = await Promise.all(
      images.map((file) =>
        storage.upload({
          buffer: file.buffer,
          mimeType: file.mimetype,
          folder: 'posts',
          fileName: `post-${user.id}`,
          // Stored smaller than chat media: see POST_IMAGE_* for why.
          maxEdge: POST_IMAGE_MAX_EDGE,
          quality: POST_IMAGE_QUALITY,
        }),
      ),
    );

    uploaded.push(...results);
  } catch (error) {
    await Promise.all(
      uploaded.map((item) => storage.remove(item.key, { resourceType: 'image' }).catch(() => undefined)),
    );
    logger.error({ err: error, userId: String(user.id) }, 'Post image upload failed');
    throw new BadRequestError('Could not upload those photos, try again', 'UPLOAD_FAILED');
  }

  const post = await postRepository.create({
    userId: user.id,
    images: uploaded.map((item) => ({
      url: item.url,
      storageKey: item.key,
      width: item.width ?? null,
      height: item.height ?? null,
    })),
    caption: await cleanText(caption),
  });

  return toPostDto(post, user.id);
}

export async function listFeed({ user, page, limit, sort }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const excludeUserIds = await buildExclusionList(user.id);

  const { items, total } = await postRepository.listFeed({ excludeUserIds, sort, skip, limit: safeLimit });

  return {
    items: items.map((post) => toPostDto(post, user.id)),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function listByAuthor({ user, authorId, page, limit }) {
  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });

  // Someone who blocked you, or whom you blocked, has no visible profile grid.
  if (String(authorId) !== String(user.id)) {
    const excluded = await buildExclusionList(user.id);
    if (excluded.some((id) => String(id) === String(authorId))) {
      return { items: [], meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total: 0 }) };
    }
  }

  const { items, total } = await postRepository.listByAuthor({ authorId, skip, limit: safeLimit });

  return {
    items: items.map((post) => toPostDto(post, user.id)),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function getPost({ user, postId }) {
  const post = await postRepository.findById(postId);
  if (!post) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');
  return toPostDto(post, user.id);
}

/**
 * Edits the caption.
 *
 * Images are deliberately not replaceable in place: swapping the picture under
 * a post that already carries likes and comments turns other people's replies
 * into a response to something they never saw. Changing the photos means
 * deleting and posting again, which is honest about what happened.
 */
export async function updatePost({ user, postId, caption }) {
  const existing = await postRepository.findRawById(postId);
  if (!existing) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  if (String(existing.userId) !== String(user.id)) {
    throw new ForbiddenError('You can only edit your own posts', 'NOT_POST_OWNER');
  }

  const post = await postRepository.updateCaption({ postId, caption: await cleanText(caption) });
  return toPostDto(post, user.id);
}

export async function deletePost({ user, postId }) {
  const existing = await postRepository.findRawById(postId);
  if (!existing) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  if (String(existing.userId) !== String(user.id)) {
    throw new ForbiddenError('You can only delete your own posts', 'NOT_POST_OWNER');
  }

  await postRepository.deleteById(postId);
  await postRepository.deleteCommentsForPost(postId);

  /*
   * The stored files go too. Deleting only the row would leave every picture
   * reachable by anyone holding the URL, and billed for indefinitely — not
   * what "delete" means to the person who tapped it.
   */
  const storage = getStorageProvider();
  await Promise.all(
    (existing.images ?? [])
      .filter((image) => image.storageKey)
      .map((image) =>
        storage.remove(image.storageKey, { resourceType: 'image' }).catch((error) => {
          logger.warn({ err: error, key: image.storageKey }, 'Post image delete failed');
        }),
      ),
  );

  return { deleted: true };
}

/**
 * Likes or unlikes, deciding from what is already stored.
 *
 * The client sends intent, not state: a double tap that arrives twice, or a
 * retry after a dropped response, settles on the same answer rather than
 * toggling back off.
 */
export async function toggleLike({ user, postId, like }) {
  const existing = await postRepository.findRawById(postId);
  if (!existing) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  const alreadyLiked = (existing.likedBy ?? []).some((id) => String(id) === String(user.id));
  const shouldLike = typeof like === 'boolean' ? like : !alreadyLiked;

  if (shouldLike === alreadyLiked) {
    return { liked: alreadyLiked, likeCount: existing.likeCount ?? 0 };
  }

  const updated = shouldLike
    ? await postRepository.like({ postId, userId: user.id })
    : await postRepository.unlike({ postId, userId: user.id });

  // A concurrent identical request won the race; its result is the truth.
  if (!updated) {
    const fresh = await postRepository.findRawById(postId);
    return {
      liked: (fresh?.likedBy ?? []).some((id) => String(id) === String(user.id)),
      likeCount: fresh?.likeCount ?? 0,
    };
  }

  // Tell the author someone liked their post, but never that it was unliked —
  // and never about their own tap.
  if (shouldLike && String(existing.userId) !== String(user.id)) {
    emitToUser(String(existing.userId), SOCKET_EVENT.POST_LIKED, {
      postId: String(postId),
      likeCount: updated.likeCount,
      actorNickname: user.nickname,
    });
  }

  return { liked: shouldLike, likeCount: updated.likeCount };
}

export async function addComment({ user, postId, text }) {
  const post = await postRepository.findRawById(postId);
  if (!post) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  const clean = await cleanText(text);
  if (!clean) throw new BadRequestError('Write something first', 'EMPTY_COMMENT');

  const comment = await postRepository.createComment({ postId, userId: user.id, text: clean });

  if (String(post.userId) !== String(user.id)) {
    emitToUser(String(post.userId), SOCKET_EVENT.POST_COMMENTED, {
      postId: String(postId),
      actorNickname: user.nickname,
      preview: clean.slice(0, 60),
    });
  }

  return toCommentDto(comment, user.id, post.userId);
}

export async function listComments({ user, postId, page, limit }) {
  const post = await postRepository.findRawById(postId);
  if (!post) throw new NotFoundError('Post not found', 'POST_NOT_FOUND');

  const { skip, page: safePage, limit: safeLimit } = resolvePagination({ page, limit });
  const { items, total } = await postRepository.listComments({ postId, skip, limit: safeLimit });

  return {
    items: items.map((comment) => toCommentDto(comment, user.id, post.userId)),
    meta: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
}

export async function updateComment({ user, commentId, text }) {
  const existing = await postRepository.findCommentById(commentId);
  if (!existing) throw new NotFoundError('Comment not found', 'COMMENT_NOT_FOUND');

  if (String(existing.userId) !== String(user.id)) {
    throw new ForbiddenError('You can only edit your own comments', 'NOT_COMMENT_OWNER');
  }

  const clean = await cleanText(text);
  if (!clean) throw new BadRequestError('Write something first', 'EMPTY_COMMENT');

  const comment = await postRepository.updateComment({ commentId, text: clean });
  const post = await postRepository.findRawById(existing.postId);

  return toCommentDto(comment, user.id, post?.userId);
}

/** The comment's author may delete it; so may the author of the post it is on. */
export async function deleteComment({ user, commentId }) {
  const existing = await postRepository.findCommentById(commentId);
  if (!existing) throw new NotFoundError('Comment not found', 'COMMENT_NOT_FOUND');

  const post = await postRepository.findRawById(existing.postId);
  const isCommentOwner = String(existing.userId) === String(user.id);
  const isPostOwner = post && String(post.userId) === String(user.id);

  if (!isCommentOwner && !isPostOwner) {
    throw new ForbiddenError('You cannot delete this comment', 'NOT_COMMENT_OWNER');
  }

  await postRepository.deleteComment(commentId);
  return { deleted: true };
}

export const postService = {
  createPost,
  listFeed,
  listByAuthor,
  getPost,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
  listComments,
  updateComment,
  deleteComment,
};
