import { describe, expect, it } from 'vitest';

import { isEmojiOnly, maskBlockedWords, normalizeMessageText, truncate } from '#src/common/utils/text.util.js';

describe('normalizeMessageText', () => {
  it('should trim surrounding whitespace', () => {
    expect(normalizeMessageText('  hello  ')).toBe('hello');
  });

  it('should strip control characters a client could smuggle in', () => {
    expect(normalizeMessageText(`he${String.fromCharCode(0)}llo`)).toBe('hello');
  });

  it('should keep newlines but collapse long runs of them', () => {
    expect(normalizeMessageText('a\n\n\n\n\n\nb')).toBe('a\n\n\nb');
  });

  it('should return an empty string for a message of only whitespace', () => {
    expect(normalizeMessageText('   \n  ')).toBe('');
  });
});

describe('isEmojiOnly', () => {
  it('should detect a message made only of emoji', () => {
    expect(isEmojiOnly(String.fromCodePoint(0x1f600, 0x1f389))).toBe(true);
  });

  it('should not treat text mixed with emoji as emoji-only', () => {
    expect(isEmojiOnly(`hi ${String.fromCodePoint(0x1f600)}`)).toBe(false);
  });

  it('should not treat plain text as emoji-only', () => {
    expect(isEmojiOnly('hello')).toBe(false);
  });

  it('should return false for an empty message', () => {
    expect(isEmojiOnly('   ')).toBe(false);
  });
});

describe('maskBlockedWords', () => {
  it('should mask a configured word while preserving length', () => {
    const result = maskBlockedWords('you are bad', ['bad']);
    expect(result.text).toBe('you are ***');
    expect(result.masked).toBe(true);
  });

  it('should only match whole words', () => {
    const result = maskBlockedWords('badminton is fun', ['bad']);
    expect(result.text).toBe('badminton is fun');
    expect(result.masked).toBe(false);
  });

  it('should leave the text untouched when no words are configured', () => {
    const result = maskBlockedWords('anything goes', []);
    expect(result.text).toBe('anything goes');
    expect(result.masked).toBe(false);
  });

  it('should treat regex metacharacters in a blocked word literally', () => {
    const result = maskBlockedWords('a.b is fine', ['a.b']);
    expect(result.text).toBe('*** is fine');
  });
});

describe('truncate', () => {
  it('should leave a short string unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should not split a surrogate pair when cutting', () => {
    const emoji = String.fromCodePoint(0x1f600);
    expect(truncate(`${emoji}${emoji}${emoji}`, 2)).toBe(`${emoji}${emoji}...`);
  });
});
