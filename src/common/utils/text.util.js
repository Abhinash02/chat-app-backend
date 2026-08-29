const CONTROL_CODEPOINT_MAX = 0x1f;
const DELETE_CODEPOINT = 0x7f;
const VARIATION_SELECTOR = 0xfe0f;
const ZERO_WIDTH_JOINER = 0x200d;

const EXCESSIVE_NEWLINES = /\n{4,}/g;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const EMOJI_COMPONENT = /\p{Emoji_Component}/u;
const WHITESPACE = /\s/;

/**
 * Strips control characters a client could smuggle in to break rendering,
 * keeping newline and tab which are legitimate in a message body.
 */
function stripControlCharacters(value) {
  let output = '';

  for (const character of value) {
    const code = character.codePointAt(0);
    const isControl =
      (code <= CONTROL_CODEPOINT_MAX && character !== '\n' && character !== '\t') ||
      code === DELETE_CODEPOINT;

    if (!isControl) output += character;
  }

  return output;
}

export function normalizeMessageText(input) {
  return stripControlCharacters(String(input ?? ''))
    .replace(EXCESSIVE_NEWLINES, '\n\n\n')
    .trim();
}

/** True when the message is purely emoji, which the UI renders larger. */
export function isEmojiOnly(text) {
  const value = String(text ?? '').trim();
  if (!value) return false;

  let hasPictograph = false;

  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === VARIATION_SELECTOR || code === ZERO_WIDTH_JOINER) continue;
    if (WHITESPACE.test(character)) continue;

    if (PICTOGRAPH.test(character)) {
      hasPictograph = true;
      continue;
    }

    if (EMOJI_COMPONENT.test(character)) continue;

    return false;
  }

  return hasPictograph;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces admin-configured words with asterisks. Deliberately a simple
 * whole-word match: an aggressive filter mangles ordinary conversation, and the
 * report/block flow is the real moderation tool.
 */
export function maskBlockedWords(text, blockedWords = []) {
  if (!blockedWords || blockedWords.length === 0) return { text, masked: false };

  const pattern = new RegExp(`\\b(${blockedWords.map(escapeRegExp).join('|')})\\b`, 'gi');
  let masked = false;

  const result = text.replace(pattern, (match) => {
    masked = true;
    return '*'.repeat(match.length);
  });

  return { text: result, masked };
}

/** Truncates for previews without splitting a surrogate pair. */
export function truncate(text, maxLength) {
  const characters = Array.from(String(text ?? ''));
  if (characters.length <= maxLength) return characters.join('');
  return `${characters.slice(0, maxLength).join('')}...`;
}
