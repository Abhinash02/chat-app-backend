/**
 * The starter list the profanity filter ships with.
 *
 * The filter was enabled by default but seeded with an empty list, which meant
 * it ran on every message and masked nothing — while the Terms of Use told
 * people their chats were being screened. This is that claim made true.
 *
 * Scope, deliberately: slurs, sexual solicitation, and the abuse that actually
 * shows up in Indian dating apps — English alongside the romanised Hindi and
 * Punjabi people actually type, since a filter that only knows English is
 * trivially sidestepped. It is a floor, not a moderation strategy. Reporting
 * and blocking still do the heavy lifting, because a word list cannot read
 * intent and will never catch everything.
 *
 * Matching is whole-word and case-insensitive (see `maskBlockedWords`), so
 * entries here will not fire inside innocent longer words. Keep it that way:
 * adding a short fragment like "ass" would mask "class" and "passport".
 *
 * Admin can edit this list at Settings → Moderation without a deploy. Treat
 * this file as the default for a fresh install, not as the live list.
 */
export const DEFAULT_BLOCKED_WORDS = Object.freeze([
  // ── English profanity and slurs ──
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'shit',
  'bullshit',
  'bitch',
  'bastard',
  'asshole',
  'dickhead',
  'cunt',
  'slut',
  'whore',
  'retard',
  'faggot',
  'nigger',

  // ── Sexual solicitation and explicit talk ──
  'sex',
  'sexy',
  'sexting',
  'nude',
  'nudes',
  'naked',
  'horny',
  'porn',
  'porno',
  'pornhub',
  'xxx',
  'boobs',
  'tits',
  'penis',
  'vagina',
  'dick',
  'cock',
  'pussy',
  'masturbate',
  'orgasm',
  'condom',
  'escort',
  'callgirl',
  'prostitute',
  'hookup',
  'onenightstand',
  'nudepic',
  'videocallsex',
  'sexchat',
  'sexvideo',

  // ── Romanised Hindi / Punjabi abuse ──
  'madarchod',
  'behenchod',
  'bhenchod',
  'bhosdike',
  'bhosdi',
  'chutiya',
  'chutiye',
  'gandu',
  'gaand',
  'lauda',
  'lund',
  'randi',
  'rand',
  'harami',
  'kutta',
  'kutti',
  'kamina',
  'kamini',
  'chinal',
  'saala',
  'saali',
  'bakchod',
  'jhatu',
  'tatti',
  'chod',
  'chodna',
  'chudai',
  'chut',
  'boobsdikhao',
  'nangi',
  'nanga',
]);

export default DEFAULT_BLOCKED_WORDS;
