import { beforeEach, describe, expect, it } from 'vitest';

import { themeService } from '#src/modules/theme/theme.service.js';
import { themeRepository } from '#src/modules/theme/theme.repository.js';
import { resetDatabase } from '../helpers/factories.js';

const HOUR = 60 * 60 * 1000;

async function activeSlug() {
  const theme = await themeService.getActiveTheme();
  return theme.slug;
}

describe('scheduled festival themes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await themeService.ensurePresetsSeeded();
  });

  it('should seed the festival palettes alongside the everyday ones', async () => {
    const themes = await themeService.listThemes();
    const slugs = themes.map((theme) => theme.slug);

    expect(slugs).toEqual(expect.arrayContaining(['diwali', 'holi', 'new-year', 'eid', 'christmas']));
  });

  it('should not go live before its window opens', async () => {
    const diwali = await themeRepository.findBySlug('diwali');

    await themeService.scheduleTheme({
      themeId: diwali._id,
      scheduledFrom: new Date(Date.now() + HOUR),
      scheduledUntil: new Date(Date.now() + 48 * HOUR),
    });

    expect(await activeSlug()).toBe('blush');
  });

  it('should go live by itself once the window has opened', async () => {
    const diwali = await themeRepository.findBySlug('diwali');

    await themeService.scheduleTheme({
      themeId: diwali._id,
      scheduledFrom: new Date(Date.now() - HOUR),
      scheduledUntil: new Date(Date.now() + 48 * HOUR),
    });

    // Scheduling applies immediately when the window is already open, rather
    // than leaving the app on the old theme until the next sweep.
    expect(await activeSlug()).toBe('diwali');
  });

  it('should revert when the window closes', async () => {
    const holi = await themeRepository.findBySlug('holi');

    await themeService.scheduleTheme({
      themeId: holi._id,
      scheduledFrom: new Date(Date.now() - 2 * HOUR),
      scheduledUntil: new Date(Date.now() + HOUR),
    });
    expect(await activeSlug()).toBe('holi');

    // Move the end into the past, as the clock would.
    await themeRepository.updateById(holi._id, {
      $set: { scheduledUntil: new Date(Date.now() - HOUR) },
    });

    await themeService.applyScheduledThemes();
    expect(await activeSlug()).toBe('blush');
  });

  it('should revert to the theme the admin chose, not the default', async () => {
    const christmas = await themeRepository.findBySlug('christmas');

    await themeService.scheduleTheme({
      themeId: christmas._id,
      scheduledFrom: new Date(Date.now() - HOUR),
      scheduledUntil: new Date(Date.now() + HOUR),
      revertToSlug: 'ocean',
    });
    expect(await activeSlug()).toBe('christmas');

    await themeRepository.updateById(christmas._id, {
      $set: { scheduledUntil: new Date(Date.now() - HOUR) },
    });
    await themeService.applyScheduledThemes();

    expect(await activeSlug()).toBe('ocean');
  });

  it('should never activate a window that is already entirely in the past', async () => {
    const eid = await themeRepository.findBySlug('eid');

    await themeService.scheduleTheme({
      themeId: eid._id,
      scheduledFrom: new Date(Date.now() - 2 * HOUR),
      scheduledUntil: new Date(Date.now() - HOUR),
    });

    // A run that was booked and missed should stay missed rather than firing
    // late — an admin scheduling last week's festival by mistake must not
    // suddenly repaint the live app.
    expect(await activeSlug()).toBe('blush');

    await themeService.applyScheduledThemes();
    expect(await activeSlug()).toBe('blush');
  });

  it('should clear the window once a run has ended, so it fires only once', async () => {
    const holi = await themeRepository.findBySlug('holi');

    await themeService.scheduleTheme({
      themeId: holi._id,
      scheduledFrom: new Date(Date.now() - HOUR),
      scheduledUntil: new Date(Date.now() + HOUR),
    });

    await themeRepository.updateById(holi._id, {
      $set: { scheduledUntil: new Date(Date.now() - 60_000) },
    });

    await themeService.applyScheduledThemes();
    await themeService.applyScheduledThemes();

    const cleared = await themeRepository.findBySlug('holi');
    expect(cleared.scheduledFrom).toBeNull();
    expect(cleared.isActive).toBe(false);
    expect(await activeSlug()).toBe('blush');
  });

  it('should reject a window that ends before it starts', async () => {
    const holi = await themeRepository.findBySlug('holi');

    await expect(
      themeService.scheduleTheme({
        themeId: holi._id,
        scheduledFrom: new Date(Date.now() + 48 * HOUR),
        scheduledUntil: new Date(Date.now() + HOUR),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SCHEDULE' });
  });
});
