import { BadRequestError, ForbiddenError, NotFoundError } from '#src/common/errors/index.js';
import { GENDER } from '#src/common/constants/index.js';
import { mediaKindOf } from '#src/common/middleware/upload.middleware.js';
import { maskBlockedWords, normalizeMessageText } from '#src/common/utils/text.util.js';
import { getStorageProvider } from '#src/integrations/storage/index.js';
import { settingsService } from '#src/modules/settings/settings.service.js';
import { statusRepository } from '#src/modules/status/status.repository.js';
import {
  MAX_VIDEO_SECONDS,
  STATUS_TTL_HOURS,
  STATUS_TYPE,
  TEXT_BACKGROUNDS,
} from '#src/modules/status/status.constants.js';
import { emitToUsers } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';

/**
 * How many live statuses one account may hold.
 *
 * Generous enough that nobody bumps into it in normal use, low enough that a
 * script cannot fill the free storage tier overnight. Old entries expire on
 * their own, so this is a burst limit rather than a quota.
 */
const MAX_LIVE_PER_USER = 20;

/**
 * A little slack on the video limit.
 *
 * Phone recorders overshoot: asking for 15 seconds routinely produces 15.4.
 * Rejecting those would make the camera button feel broken, so the check
 * allows a second of rounding and refuses anything genuinely longer.
 */
const VIDEO_SECONDS_TOLERANCE = 1;

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

function toStatusDto(status, viewerId) {
  const author = toAuthorDto(status.userId);
  const authorId = author ? author.userId : String(status.userId);
  const isOwn = String(authorId) === String(viewerId);

  return {
    id: String(status._id),
    type: status.type,
    text: status.text ?? '',
    background: status.background ?? null,
    media: status.media
      ? {
          url: status.media.url,
          mimeType: status.media.mimeType ?? null,
          durationSeconds: status.media.durationSeconds ?? null,
          width: status.media.width ?? null,
          height: status.media.height ?? null,
        }
      : null,
    author,
    isOwn,
    /*
     * Who saw it is the author's business only. Publishing the viewer list to
     * everyone would turn a story into a record of who was looking at whom,
     * which is exactly the thing people expect it not to be.
     */
    viewCount: isOwn ? status.viewCount : undefined,
    viewers: isOwn ? (status.viewers ?? []).map(toViewerDto).filter(Boolean) : undefined,
    hasViewed: isOwn ? undefined : (status.viewers ?? []).some((entry) => String(entry.userId?._id ?? entry.userId) === String(viewerId)),
    createdAt: status.createdAt,
    expiresAt: status.expiresAt,
  };
}

function toViewerDto(entry) {
  const author = toAuthorDto(entry.userId);
  if (!author) return null;
  return { ...author, viewedAt: entry.viewedAt };
}

/**
 * Groups statuses into one ring per author, newest ring first.
 *
 * The feed is drawn as a row of avatars, not a list of statuses, so the
 * grouping belongs here rather than in every client that renders it. Rings
 * with something unseen sort ahead of ones already watched through — the same
 * ordering people are used to, and it puts the reason to tap first.
 */
function groupIntoRings(statuses, viewerId) {
  const rings = new Map();

  for (const status of statuses) {
    const dto = toStatusDto(status, viewerId);
    const key = dto.author?.userId ?? String(status.userId);

    if (!rings.has(key)) {
      rings.set(key, { author: dto.author, items: [], hasUnseen: false, latestAt: dto.createdAt });
    }

    const ring = rings.get(key);
    ring.items.push(dto);
    if (dto.hasViewed === false) ring.hasUnseen = true;
    if (dto.createdAt > ring.latestAt) ring.latestAt = dto.createdAt;
  }

  return [...rings.values()].sort((a, b) => {
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return new Date(b.latestAt) - new Date(a.latestAt);
  });
}

async function cleanText(text) {
  const normalized = normalizeMessageText(text ?? '');
  if (!normalized) return '';

  const settings = await settingsService.getSettings();
  return settings.moderation.profanityFilterEnabled
    ? maskBlockedWords(normalized, settings.moderation.blockedWords).text
    : normalized;
}

async function assertUnderLimit(userId) {
  const live = await statusRepository.countLiveByUser(userId);
  if (live >= MAX_LIVE_PER_USER) {
    throw new BadRequestError(
      `You can have ${MAX_LIVE_PER_USER} statuses at a time. Older ones disappear on their own.`,
      'STATUS_LIMIT_REACHED',
    );
  }
}

/**
 * Tells everyone who can see this author that there is something new.
 *
 * Only the ring's owner and gender-visible accounts are notified, so the
 * socket fan-out matches what the feed query would have returned anyway.
 */
async function announce(status, author) {
  const audience = await statusRepository.findVisibleAuthorIds({
    gender: author.gender,
    excludeUserIds: [],
  });

  if (!audience.length) return;

  emitToUsers(
    audience.map(String),
    SOCKET_EVENT.STATUS_NEW,
    { authorId: String(author.id), statusId: String(status._id) },
  );
}

export async function postTextStatus({ user, text, background }) {
  await assertUnderLimit(user.id);

  const clean = await cleanText(text);
  if (!clean) throw new BadRequestError('Write something first', 'STATUS_TEXT_REQUIRED');

  const created = await statusRepository.create({
    userId: user.id,
    type: STATUS_TYPE.TEXT,
    text: clean,
    background: background ?? TEXT_BACKGROUNDS[0].id,
  });

  const populated = await statusRepository.findByIdPopulated(created._id);
  await announce(created, user);

  return toStatusDto(populated, user.id);
}

export async function postMediaStatus({ user, file, caption, background }) {
  await assertUnderLimit(user.id);

  if (!file) throw new BadRequestError('Choose a photo or video', 'FILE_REQUIRED');

  const kind = mediaKindOf(file.mimetype);
  if (kind !== 'image' && kind !== 'video') {
    throw new BadRequestError('A status can be a photo or a short video', 'UNSUPPORTED_FILE_TYPE');
  }

  const storage = getStorageProvider();
  const uploaded = await storage.upload({
    buffer: file.buffer,
    mimeType: file.mimetype,
    folder: `status/${user.id}`,
    fileName: kind,
  });

  const duration = uploaded.durationSeconds ?? null;

  /*
   * The length check happens after the upload because only the provider can
   * measure it — a client-declared duration is a request, not a fact. The cost
   * of one over-long upload is a file we delete immediately; the cost of
   * trusting the client is a fifteen-second limit that anyone can ignore.
   */
  if (kind === 'video' && duration !== null && duration > MAX_VIDEO_SECONDS + VIDEO_SECONDS_TOLERANCE) {
    await storage.remove(uploaded.key, { resourceType: uploaded.resourceType ?? 'video' });
    throw new BadRequestError(
      `Keep it to ${MAX_VIDEO_SECONDS} seconds — that one is ${Math.round(duration)}.`,
      'STATUS_VIDEO_TOO_LONG',
    );
  }

  const created = await statusRepository.create({
    userId: user.id,
    type: kind === 'image' ? STATUS_TYPE.IMAGE : STATUS_TYPE.VIDEO,
    text: await cleanText(caption),
    background: background ?? null,
    media: {
      url: uploaded.url,
      storageKey: uploaded.key,
      resourceType: uploaded.resourceType ?? null,
      mimeType: file.mimetype,
      durationSeconds: duration,
    },
  });

  const populated = await statusRepository.findByIdPopulated(created._id);
  await announce(created, user);

  return toStatusDto(populated, user.id);
}

/**
 * The status feed: your own ring first, then everyone you can see.
 *
 * Your own ring is always present even when empty, because that is the button
 * that lets you post one.
 */
export async function listFeed({ user }) {
  const visibleGender = user.gender === GENDER.MALE ? GENDER.FEMALE : GENDER.MALE;

  const [own, authorIds] = await Promise.all([
    statusRepository.listOwn(user.id),
    statusRepository.findVisibleAuthorIds({ gender: visibleGender, excludeUserIds: [user.id] }),
  ]);

  const others = await statusRepository.listLiveByAuthors(authorIds);

  return {
    own: {
      author: {
        userId: String(user.id),
        nickname: user.nickname,
        avatarUrl: user.avatarUrl ?? null,
        avatarEmoji: user.avatarEmoji ?? null,
        avatarColor: user.avatarColor ?? null,
        gender: user.gender,
        isOnline: true,
      },
      items: own.map((status) => toStatusDto(status, user.id)),
      hasUnseen: false,
    },
    rings: groupIntoRings(others, user.id),
    backgrounds: TEXT_BACKGROUNDS,
    ttlHours: STATUS_TTL_HOURS,
  };
}

/** Everything one author has live, for playing their ring end to end. */
export async function listByUser({ user, authorId }) {
  if (String(authorId) === String(user.id)) {
    const own = await statusRepository.listOwn(user.id);
    return own.map((status) => toStatusDto(status, user.id));
  }

  const visibleGender = user.gender === GENDER.MALE ? GENDER.FEMALE : GENDER.MALE;
  const allowed = await statusRepository.findVisibleAuthorIds({
    gender: visibleGender,
    excludeUserIds: [user.id],
  });

  if (!allowed.some((id) => String(id) === String(authorId))) {
    throw new ForbiddenError('You cannot see this status', 'STATUS_NOT_VISIBLE');
  }

  const items = await statusRepository.listLiveByAuthors([authorId]);
  return items.map((status) => toStatusDto(status, user.id));
}

/**
 * Marks a status seen and tells its author.
 *
 * The author gets the update over their socket, so the viewer list on a story
 * they are already looking at fills in as people watch it.
 */
export async function markViewed({ user, statusId }) {
  const status = await statusRepository.findById(statusId);
  if (!status || status.expiresAt <= new Date()) {
    throw new NotFoundError('That status has expired', 'STATUS_NOT_FOUND');
  }

  // Looking at your own status is not a view; the author is not an audience.
  if (String(status.userId) === String(user.id)) {
    return { viewCount: status.viewCount, alreadyViewed: true };
  }

  const updated = await statusRepository.addViewer({ statusId, viewerId: user.id });

  // A null means the filter matched nothing: this account had already viewed it.
  if (!updated) return { viewCount: status.viewCount, alreadyViewed: true };

  emitToUsers([String(status.userId)], SOCKET_EVENT.STATUS_VIEWED, {
    statusId: String(statusId),
    viewCount: updated.viewCount,
    viewer: {
      userId: String(user.id),
      nickname: user.nickname,
      avatarUrl: user.avatarUrl ?? null,
      avatarEmoji: user.avatarEmoji ?? null,
      avatarColor: user.avatarColor ?? null,
    },
  });

  return { viewCount: updated.viewCount, alreadyViewed: false };
}

/** The author's own list of who watched, newest first. */
export async function listViewers({ user, statusId }) {
  const status = await statusRepository.findByIdPopulated(statusId);
  if (!status) throw new NotFoundError('That status has expired', 'STATUS_NOT_FOUND');

  const authorId = status.userId?._id ?? status.userId;
  if (String(authorId) !== String(user.id)) {
    throw new ForbiddenError('Only the author can see who viewed this', 'NOT_STATUS_AUTHOR');
  }

  const viewers = (status.viewers ?? []).map(toViewerDto).filter(Boolean);
  viewers.sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));

  return { viewCount: status.viewCount, viewers };
}

export async function deleteStatus({ user, statusId }) {
  const removed = await statusRepository.deleteOwn({ statusId, userId: user.id });
  if (!removed) throw new NotFoundError('Status not found', 'STATUS_NOT_FOUND');

  /*
   * The stored file goes with it. Deleting the row alone would leave the media
   * reachable by URL for anyone who still had the link, which is not what
   * "delete" means to the person who tapped it.
   */
  if (removed.media?.storageKey) {
    const storage = getStorageProvider();
    await storage.remove(removed.media.storageKey, {
      resourceType: removed.media.resourceType ?? 'image',
    });
  }

  return { deleted: true };
}

export const statusService = {
  postTextStatus,
  postMediaStatus,
  listFeed,
  listByUser,
  markViewed,
  listViewers,
  deleteStatus,
};
