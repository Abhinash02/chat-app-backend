import { describe, expect, it } from 'vitest';

import { MAX_PAGE_SIZE } from '#src/common/constants/index.js';
import { buildPaginationMeta, resolvePagination } from '#src/common/utils/pagination.util.js';

describe('resolvePagination', () => {
  it('should apply defaults when nothing is provided', () => {
    expect(resolvePagination()).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('should compute the skip offset from page and limit', () => {
    expect(resolvePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('should cap the page size so a client cannot request the whole table', () => {
    expect(resolvePagination({ limit: 5000 }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('should coerce a nonsensical page back to the first page', () => {
    expect(resolvePagination({ page: -4 }).page).toBe(1);
    expect(resolvePagination({ page: 'abc' }).page).toBe(1);
  });
});

describe('buildPaginationMeta', () => {
  it('should round the total page count up', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 101 }).totalPages).toBe(6);
  });

  it('should report zero pages for an empty result set', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 0 }).totalPages).toBe(0);
  });
});
