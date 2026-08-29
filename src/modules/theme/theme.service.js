import { ConflictError, NotFoundError, BadRequestError } from '#src/common/errors/index.js';
import { flattenToDotPaths } from '#src/common/utils/object.util.js';
import { logger } from '#src/config/logger.js';
import { emitToAll } from '#src/realtime/emitter.js';
import { SOCKET_EVENT } from '#src/realtime/events.js';
import { themeRepository } from '#src/modules/theme/theme.repository.js';
import {
  DEFAULT_BRANDING,
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_SLUG,
  THEME_PRESETS,
} from '#src/modules/theme/theme.constants.js';

/**
 * The active theme is requested on every cold app start.
 *
 * Cache key      : process-local (single active theme)
 * TTL            : 60s
 * Invalidation   : any activate/update/delete clears it and pushes
 *                  `theme:updated` so live clients re-skin without a restart
 * Source of truth: MongoDB `themes` collection
 * On failure     : falls back to the bundled preset, because a missing theme
 *                  must never block sign-in.
 */
const CACHE_TTL_MS = 60_000;

let cachedTheme = null;
let cachedAt = 0;

function fallbackTheme() {
  return {
    slug: DEFAULT_THEME_SLUG,
    name: 'Blush',
    isDark: false,
    colors: DEFAULT_THEME_COLORS,
    branding: DEFAULT_BRANDING,
  };
}

function toPublicTheme(theme) {
  if (!theme) return fallbackTheme();
  return {
    id: theme._id ? String(theme._id) : undefined,
    slug: theme.slug,
    name: theme.name,
    isDark: theme.isDark,
    colors: theme.colors,
    branding: theme.branding,
    updatedAt: theme.updatedAt,
  };
}

export function invalidateThemeCache() {
  cachedTheme = null;
  cachedAt = 0;
}

export async function getActiveTheme() {
  if (cachedTheme && Date.now() - cachedAt < CACHE_TTL_MS) return cachedTheme;

  try {
    const active = (await themeRepository.findActive()) ?? (await themeRepository.findBySlug(DEFAULT_THEME_SLUG));
    cachedTheme = toPublicTheme(active);
    cachedAt = Date.now();
    return cachedTheme;
  } catch (error) {
    logger.error({ err: error }, 'Failed to load active theme; serving bundled default');
    return fallbackTheme();
  }
}

/** Idempotent: run at boot so a fresh database always has the presets available. */
export async function ensurePresetsSeeded() {
  for (const preset of THEME_PRESETS) {
    await themeRepository.upsertPreset(preset);
  }

  const active = await themeRepository.findActive();
  if (!active) {
    const fallback = await themeRepository.findBySlug(DEFAULT_THEME_SLUG);
    if (fallback) await themeRepository.updateById(fallback._id, { $set: { isActive: true } });
  }

  invalidateThemeCache();
}

export async function listThemes() {
  return themeRepository.list();
}

async function broadcastActiveTheme() {
  invalidateThemeCache();
  const theme = await getActiveTheme();
  emitToAll(SOCKET_EVENT.THEME_UPDATED, theme);
  return theme;
}

/** The "recolour the whole app in one click" operation. */
export async function activateTheme(themeId, adminId) {
  const theme = await themeRepository.findById(themeId);
  if (!theme) throw new NotFoundError('Theme not found', 'THEME_NOT_FOUND');

  await themeRepository.updateById(theme._id, { $set: { isActive: true, updatedByAdminId: adminId } });
  await themeRepository.deactivateAllExcept(theme._id);

  logger.info({ themeSlug: theme.slug, adminId }, 'Active theme changed');
  return broadcastActiveTheme();
}

export async function createTheme(payload, adminId) {
  const existing = await themeRepository.findBySlug(payload.slug);
  if (existing) throw new ConflictError('A theme with this slug already exists', 'THEME_SLUG_TAKEN');

  const created = await themeRepository.create({
    ...payload,
    // Custom themes inherit any colour the admin did not override.
    colors: { ...DEFAULT_THEME_COLORS, ...(payload.colors ?? {}) },
    branding: { ...DEFAULT_BRANDING, ...(payload.branding ?? {}) },
    isPreset: false,
    isActive: false,
    updatedByAdminId: adminId,
  });

  return created;
}

export async function updateTheme(themeId, patch, adminId) {
  const theme = await themeRepository.findById(themeId);
  if (!theme) throw new NotFoundError('Theme not found', 'THEME_NOT_FOUND');

  const update = flattenToDotPaths({ ...patch, updatedByAdminId: adminId });
  const updated = await themeRepository.updateById(theme._id, { $set: update });

  if (updated.isActive) await broadcastActiveTheme();
  return updated;
}

export async function deleteTheme(themeId) {
  const theme = await themeRepository.findById(themeId);
  if (!theme) throw new NotFoundError('Theme not found', 'THEME_NOT_FOUND');
  if (theme.isPreset) throw new BadRequestError('Built-in themes cannot be deleted', 'THEME_IS_PRESET');
  if (theme.isActive) {
    throw new BadRequestError('Activate another theme before deleting this one', 'THEME_IS_ACTIVE');
  }

  await themeRepository.deleteById(theme._id);
  return { deleted: true };
}

export const themeService = {
  getActiveTheme,
  listThemes,
  activateTheme,
  createTheme,
  updateTheme,
  deleteTheme,
  ensurePresetsSeeded,
  invalidateThemeCache,
};
