/**
 * Converts `{ coins: { coinsPerBlock: 12 } }` into `{ 'coins.coinsPerBlock': 12 }`
 * so a partial `$set` never wipes sibling keys of a nested document.
 * Arrays are treated as leaf values — a partial array update is a replacement.
 */
export function flattenToDotPaths(source, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined) continue;

    const path = prefix ? `${prefix}.${key}` : key;
    const isPlainObject =
      value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

    if (isPlainObject) {
      Object.assign(result, flattenToDotPaths(value, path));
    } else {
      result[path] = value;
    }
  }

  return result;
}

/** Drops keys whose value is `undefined`, keeping explicit `null`s intact. */
export function omitUndefined(source) {
  return Object.fromEntries(Object.entries(source ?? {}).filter(([, value]) => value !== undefined));
}
