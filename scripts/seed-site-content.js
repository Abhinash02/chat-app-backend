/**
 * Publishes the app's policies and an opening FAQ to the website.
 *
 *   npm run seed:site
 *
 * The wording is lifted from the app's own Privacy, Terms and Refund screens so
 * the two never disagree — a website that states a different refund window from
 * the app is worse than one with no policy page at all.
 *
 * Idempotent: policies are upserted by slug, and questions are matched on their
 * text, so re-running edits in place rather than duplicating. Anything an admin
 * has since reworded in the panel is left alone unless --force is passed.
 */
import { connectDatabase, disconnectDatabase } from '#src/config/database.js';
import { logger } from '#src/config/logger.js';
import { FaqModel } from '#src/modules/site/faq.model.js';
import { TestimonialModel } from '#src/modules/site/testimonial.model.js';
import { BlogPostModel } from '#src/modules/site/blog-post.model.js';
import { EventModel } from '#src/modules/events/event.model.js';
import { LegalDocModel } from '#src/modules/site/legal-doc.model.js';
import { BLOG_STATUS, LEGAL_DOC_SLUG } from '#src/modules/site/site.constants.js';

const force = process.argv.includes('--force');
const clearTestimonials = process.argv.includes('--clear-testimonials');
const clearSamples = process.argv.includes('--clear-samples');

const PRIVACY = `Your privacy and security are the core foundations of Vibe Chat. This policy explains how your information is protected across our one-to-one chats, random calls, voice rooms, arcade games, and coin wallet.

## 1. Screenshot and screen recording protection

Screen recording and screenshot capture are actively blocked inside private one-to-one chats, random video and voice calls, and voice rooms.

Images, voice notes, live camera feeds, and messages cannot be recorded or saved to other users' galleries without authorisation.

## 2. Information we collect

Account details: email address and securely salted, hashed passwords. Your email is strictly private and is never shown to other users.

Public profile: nickname, gender, bio, age bracket, zodiac sign, avatar, and active status.

Messages and media: encrypted text messages, voice clips, emoji reactions, and photos shared between accounts.

## 3. Nearby random calls and proximity

Random video and audio calls use encrypted peer-to-peer WebRTC channels. We do not record, store, or monitor your private video or audio calls.

When location is enabled, GPS is used only to compute straight-line approximate distances, such as "3 km away". Your exact street address, GPS coordinates, and real-time location tracks are never exposed.

## 4. Voice rooms, arcade games and points

Voice room audio is streamed in real time to connected participants and is not archived.

Arcade game scores and points are tied to your account for leaderboard rankings, and can be converted into spendable coins within the platform's exchange limits.

## 5. Coin wallet and payment security

Payments are processed through RBI-compliant, PCI-DSS certified gateways. We never store debit or credit card numbers, or CVVs.

Coins purchased, or earned through daily bonuses and game conversions, are non-transferable outside the app.

## 6. Safety, reporting and content moderation

Automatic word filtering: messages, photo captions, and voice-room chat pass through an automated filter that masks abusive and sexual terms in English, Hindi and Punjabi. It runs on our servers as the message is sent. This is pattern matching against a word list, not a person reading your chats — no human sees a message because of it.

What gets stored: the filtered version is what is saved and delivered. Masked words are replaced before the message is written, so the original wording is not kept.

Block and report: you can block or report any user at any time from the chat or call menu.

What a report captures: filing a report saves a snapshot of recent messages in that conversation so our team can review what happened. That snapshot is kept even if either person later deletes those messages. This is the one case where a person reads part of a conversation, and only after somebody reports it.

Message deletion: "Delete for Everyone" removes messages from both participants' history. It does not remove them from a report already filed.

Permanent account deletion: you may request permanent deletion of your account at any time in App Settings. Requests are reviewed by our team, usually within 24 hours, and your account stays open until then — you can cancel the request before it is approved. Once approved, your account is closed and all active sessions are signed out. Reports filed against an account may be retained for safety and legal purposes after deletion.

## 7. What is not allowed

Vibe Chat is a place to meet people and talk. It is not an adult platform. These rules apply in chats, voice rooms, photo posts, captions, status updates and profiles.

No abusive or vulgar language — swearing, insults and gaali in any language, including Roman script.

No sexual talk — sexual conversation, propositions or explicit descriptions, even where both people appear willing.

No nudity or sexual media — sending, posting or requesting nude or sexual photos, videos or voice notes. Asking is a violation on its own.

No sexual solicitation — offering or asking for paid sexual services or content, for coins or for money.

No harassment — messaging someone who has asked you to stop, or intimidating, stalking, threatening or impersonating anyone.

No hate speech — attacks based on religion, caste, region, gender, sexuality, disability or ethnicity.

Nothing involving minors — the service is 18+. Sexual content involving a minor, or any attempt to contact one, is reported to the authorities.

Violations lead to content removal, suspension or permanent termination depending on severity. The most serious result in immediate permanent termination with no warning, and coins on a terminated account are forfeited. Full detail is in the Terms of Use.

## 8. Contact our privacy and grievance team

For privacy queries, data deletion requests or security grievances, contact our compliance officer at privacy@vibechat.app.`;

const TERMS = `Welcome to Vibe Chat. By creating an account, accessing or using our mobile application and associated services, you agree to be bound by these Terms of Use.

## 1. Eligibility and account creation

Age requirement: you must be at least 18 years old to use Vibe Chat.

Account identity: you choose a public nickname, age bracket and optional zodiac sign. Your real name and verified email remain private.

Opposite-gender pairing: the discovery feed connects opposite genders. The gender selected at registration cannot be modified.

## 2. Virtual coins, free talk and billing

Free talk allowance: paying male accounts receive 30 minutes of introductory free chat. Female accounts enjoy free messaging.

Message billing: after the free allowance, messaging consumes 10 coins per 7-message prepaid block.

Daily bonus: active accounts may claim daily bonus coins every 24 hours.

Virtual goods: coins purchased through our payment providers are virtual tokens with no real-world monetary value. Once spent they cannot be refunded. The limited cases where a refund is possible — failed payments, duplicate charges and unspent coins — are set out in the Refund Policy.

Earnings are not refunds: female accounts may convert earned coins to rupees and request a payout. That is a separate process from refunds and is described in the Refund Policy.

## 3. Language and respectful conduct

Vibe Chat is a place to meet people and talk. It is not an adult platform. The following are not allowed anywhere on the service — in one-to-one chats, voice rooms, photo posts, captions, status updates or your profile.

No abusive or vulgar language. Swearing, insults and gaali directed at another person are prohibited, in every language. Writing abuse in Hindi, Punjabi or Roman script is treated exactly the same as writing it in English.

No sexual talk. Sexual conversation, propositions, explicit descriptions, and asking someone what they are wearing or to describe themselves sexually are prohibited — including where both people appear willing.

No nudity or sexual media. Do not send, request or post nude or sexual photos, videos or voice notes. Requesting them is a violation on its own, whether or not anything is sent.

No sexual solicitation. Offering or asking for paid sexual services, escort services, or sexual content in exchange for coins or money is prohibited and will be reported where the law requires it.

No harassment. Do not continue messaging someone who has asked you to stop, and do not intimidate, stalk, threaten or impersonate anyone.

No hate speech. Attacks based on religion, caste, region, gender, sexuality, disability or ethnicity are prohibited.

Nothing involving minors. The service is 18+. Any sexual content involving a minor, or any attempt to contact a minor, is reported to the authorities and the account is permanently banned.

## 4. How these rules are enforced

Automatic word filtering: messages, captions and room chat are screened against a list of abusive and sexual terms in English, Hindi and Punjabi. Matching words are masked before anyone sees them. The filter is a floor, not a guarantee — it cannot read intent, and it will not catch everything.

Reporting: anyone can report a conversation. A report captures a snapshot of recent messages for review, so deleting a message afterwards does not remove it from the report.

Blocking: blocking stops all messaging immediately and removes you both from each other's discovery feed.

Consequences: depending on severity, a violation may lead to a warning, removal of the content, suspension or permanent termination. Serious violations — sexual content involving minors, threats of violence, or non-consensual intimate images — result in immediate permanent termination without warning.

No refunds on termination: coins remaining on a terminated account are forfeited and are not refundable.

## 5. Safety: contacts, OTPs and money

Do not share contact details. Phone numbers, WhatsApp, social media handles, personal email and home addresses should stay off the platform.

Never share or ask for an OTP. Vibe Chat staff will never request your OTP, password, UPI PIN or banking details. Anyone who asks is attempting fraud — report them.

Do not send money to other users. Requests for money, gift cards or payment links are the most common scam on apps like this one.

Fraud, commercial solicitation, and automated or bot traffic are prohibited.

## 6. Live rooms and voice interactions

Audio and text rooms are community spaces for respectful live conversation.

Room hosts and administrators reserve the right to remove or moderate participants who disrupt community guidelines.

## 7. Blocking, reporting and account suspension

Blocking an account prevents all further messaging and removes mutual feed visibility immediately.

Filing a report captures recent chat snapshots for administrative review.

Accounts that accumulate three or more distinct user reports are subject to prompt administrative review and permanent suspension.

## 8. Account deletion and termination

You may request permanent deletion of your account at any time through Settings. Requests are reviewed by our team, usually within 24 hours; once approved, your profile is deactivated and all active sessions are revoked.

Vibe Chat reserves the right to terminate accounts that violate safety guidelines or these terms.

## 9. Contact and support

If you have questions about these Terms of Use or require assistance, submit feedback from the Profile page in the app, or email support@vibechat.app.`;

const REFUND = `Thank you for purchasing coin packs on Vibe Chat. We aim to provide transparent billing and prompt resolution for any payment issue.

## 1. Failed payments with bank deductions (auto-refund)

Automatic bank reversal: if money is debited from your bank account or UPI app but the payment was marked failed due to a network timeout, the payment gateway automatically reverses the full amount to your original payment method.

Timeline: auto-refunds typically reflect within 2 to 24 hours, and at most 2 to 3 business days under banking guidelines. No manual request is required.

## 2. Network drops and webhook auto-recovery

If you completed a payment successfully but your app closed or lost internet before confirmation, our backend webhook automatically captures the payment and credits the purchased coins to your wallet within minutes.

## 3. Duplicate payments and accidental purchases

Duplicate orders: if a technical fault causes duplicate charges for the same coin pack, we refund the duplicate transaction in full.

Unused coins: if you made an accidental purchase and have not spent any of the coins from it, you may request a full refund within 7 days of purchase. Coins are spent in the order they were bought, so sending even one message after a purchase may mean the pack no longer qualifies.

## 4. Non-refundable items

Coins already spent on chat messages, free talk extensions or virtual room features cannot be refunded.

Daily bonus coins, promotional tokens and gift balances are granted at no cost and cannot be refunded.

Suspended or terminated accounts: if an account is terminated for breaking the conduct rules in the Terms of Use, any remaining coin balance is forfeited and is not refundable.

Deleted accounts: deleting your account is voluntary and does not entitle you to a refund of unspent coins. Spend or withdraw your balance before you delete.

## 5. Manual UPI verification and rejection

For manual UPI transfers, an administrator verifies bank records by hand.

If a transfer reference cannot be verified, or an incorrect amount was sent, the order is rejected with an explanatory note, and funds sent in error are reversed to your UPI ID.

## 6. Withdrawals and earnings (not a refund)

Converting earned coins to rupees is a payout, not a refund, and follows different rules.

Who can withdraw: coin-to-rupee conversion is available to female accounts only. It is paid from your coin balance, which is built mainly from chat earnings.

Limits: withdrawals are subject to a minimum amount and a daily cap, both set by the admin and shown on the Earnings screen before you confirm.

Processing: coins are deducted when you submit the request and held while it is reviewed. Approved payouts are credited within 5 to 7 working days.

If rejected: coins are returned to your wallet in full, with a note explaining why. Common reasons are an incorrect UPI ID, or bank details that do not match your account.

## 7. How to request a refund or assistance

Raise a support ticket — it reaches the team directly and keeps your order details attached to the conversation.

In the app (fastest): Profile, then Help & Customer Support, then "Coins & Payment Issue". You can attach a screenshot of the payment.

By email: support@vibechat.app

Please include your registered email, the Order ID or UPI UTR reference, the amount and the date. Without a reference we cannot match the payment to your account.

Response time: we aim to reply within 48 hours. Approved refunds are returned to the original payment method — we cannot refund to a different account, card or UPI ID.`;

const DOCS = [
  { slug: LEGAL_DOC_SLUG.PRIVACY, title: 'Privacy & Safety Policy', body: PRIVACY },
  { slug: LEGAL_DOC_SLUG.TERMS, title: 'Terms of Use', body: TERMS },
  { slug: LEGAL_DOC_SLUG.REFUND, title: 'Refund Policy', body: REFUND },
];

const FAQS = [
  { category: 'general', order: 1, question: 'What is Vibe Chat?', answer: 'An app for talking to people who are free to talk right now — one-to-one chats, voice rooms and quick games. There is no feed to scroll and no waiting days for a reply.' },
  { category: 'general', order: 2, question: 'Which languages can I use it in?', answer: 'The interface is available in eleven languages including English, Hindi, Hinglish, Punjabi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada and Malayalam. You can also tell us which languages you speak, so discovery can match you with people who speak them too.' },
  { category: 'general', order: 3, question: 'Do I need to be 18?', answer: 'Yes. Vibe Chat is strictly 18+. Any attempt to contact a minor, or any sexual content involving one, is reported to the authorities and the account is permanently banned.' },
  { category: 'account', order: 1, question: 'How do I create an account?', answer: 'Accounts are created in the app. Install it, enter your email, and verify the code we send you. You choose a public nickname — your real name and email stay private.' },
  { category: 'account', order: 2, question: 'Can I sign in on the website?', answer: 'You can sign in here with an account you already created in the app, but chats, coins and voice rooms all live on your phone. There is no way to register from the website.' },
  { category: 'account', order: 3, question: 'Can I change my gender after signing up?', answer: 'No. The discovery feed pairs opposite genders, so the gender chosen at registration cannot be modified afterwards.' },
  { category: 'account', order: 4, question: 'How do I delete my account?', answer: 'In the app, go to Settings and choose to delete your account. You will be asked why, and the request goes to our team for review — usually answered within 24 hours. Your account stays open and fully usable until it is approved, and you can cancel any time before then.' },
  { category: 'coins', order: 1, question: 'How much does it cost?', answer: 'Joining is free, and every paying account gets 30 minutes of free chat to start. After that, messaging costs 10 coins per block of 7 messages. Female accounts message for free.' },
  { category: 'coins', order: 2, question: 'How do I get free coins?', answer: 'Claim the daily bonus every 24 hours, earn points in the arcade games and convert them, or refer a friend — you both receive coins when they join with your code.' },
  { category: 'coins', order: 3, question: 'Can I get a refund?', answer: 'Yes, in specific cases: a failed payment where your bank was still debited, a duplicate charge, or an accidental purchase where none of the coins have been spent, within 7 days. Coins already spent, bonus coins and balances on terminated accounts are not refundable. The full Refund Policy is on this site.' },
  { category: 'coins', order: 4, question: 'How do withdrawals work?', answer: 'Converting earned coins to rupees is available to female accounts. Coins are deducted when you submit the request and held while it is reviewed; approved payouts are credited within 5 to 7 working days. If a request is rejected, the coins are returned in full with a reason.' },
  { category: 'safety', order: 1, question: 'Will anyone ask me for an OTP?', answer: 'Never. Vibe Chat staff will never ask for your OTP, password, UPI PIN or banking details. Anyone who does is attempting fraud — report them immediately.' },
  { category: 'safety', order: 2, question: 'Should I share my phone number?', answer: 'No. Keep phone numbers, WhatsApp, social handles, personal email and home addresses off the platform. Soliciting contact details breaches the Community Guidelines and can result in permanent termination.' },
  { category: 'safety', order: 3, question: 'Can people screenshot my chats?', answer: 'Screenshots and screen recording are blocked inside private one-to-one chats, random calls and voice rooms.' },
  { category: 'safety', order: 4, question: 'What happens when I report someone?', answer: 'A report saves a snapshot of recent messages in that conversation for our team to review — and that snapshot is kept even if either person deletes the messages afterwards. This is the only situation in which a person reads part of a conversation.' },
  { category: 'technical', order: 1, question: 'Which devices are supported?', answer: 'Vibe Chat is available for Android. You can install it from Google Play.' },
  { category: 'technical', order: 2, question: 'Are my calls recorded?', answer: 'No. Random video and audio calls run peer-to-peer over encrypted WebRTC channels. We do not record, store or monitor them, and voice room audio is not archived.' },
  { category: 'technical', order: 3, question: 'Something is broken. How do I report it?', answer: 'Use the feedback form on this site, or in the app go to Profile, then Help & Customer Support, where you can attach a screenshot and keep the conversation in one place.' },
];

/*
 * Starter blog posts.
 *
 * Unlike the testimonials below, these are not placeholders pretending to be
 * something they are not — they are first-party posts about how the product
 * actually works, and every fact in them matches the FAQ above and the app's
 * own behaviour. They can go live as they are, and they are written to be
 * edited rather than deleted.
 *
 * The body format is what `PostBody` on the website renders: blank lines
 * separate paragraphs and a leading `## ` makes a subheading. There is
 * deliberately no HTML — the renderer does not trust any, because the blog
 * editor would otherwise be an XSS vector into every visitor's browser.
 *
 *   npm run seed:site -- --clear-samples
 *
 * removes these by slug, along with the sample testimonials and announcements.
 */
const SAMPLE_POSTS = [
  {
    slug: 'staying-safe-on-vibe-chat',
    title: 'Staying safe on Vibe Chat',
    tags: ['safety', 'guides'],
    excerpt:
      'The handful of habits that keep a good conversation from turning into a problem — and the one request that is always a scam.',
    content: `Most conversations on Vibe Chat are exactly what they look like: two people who happened to be free at the same time. A few are not. These are the habits that tell the difference early.

## Nobody from Vibe Chat will ever ask for an OTP

Not support, not moderation, not anyone claiming to be staff. The same goes for your password, your UPI PIN and your banking details. There is no situation in which we need any of them, so anybody asking is attempting fraud — end the conversation and report them.

An OTP is the last thing standing between someone and your account. Reading one out loud is the whole attack.

## Keep contact details off the platform

Phone numbers, WhatsApp, Instagram and Snapchat handles, personal email, your home address or the name of your office. Once a conversation moves somewhere without reporting, blocking or moderation, none of the protections here apply to it any more.

Asking someone else for their contact details breaches the Community Guidelines, and repeatedly doing it ends an account permanently.

## What we do at our end

Screenshots and screen recording are blocked inside private one-to-one chats, random calls and voice rooms. Random video and audio calls run peer-to-peer over encrypted WebRTC channels — we do not record, store or monitor them, and voice room audio is not archived.

Reporting someone saves a snapshot of the recent messages in that conversation for our team to review, and that snapshot survives even if either person deletes the messages afterwards. It is the only situation in which anybody reads part of a conversation.

## If something feels off

Trust it. Block first and report after — you do not owe anyone an explanation, and a report with a real conversation behind it is far more useful to us than a polite exit.

Vibe Chat is strictly 18+. Any attempt to contact a minor, or any sexual content involving one, is reported to the authorities and ends the account permanently.`,
  },
  {
    slug: 'how-coins-work',
    title: 'How coins work, and how to spend fewer of them',
    tags: ['coins', 'guides'],
    excerpt:
      'Thirty free minutes, ten coins per seven messages, and four ways to top up without paying. The whole pricing model on one page.',
    content: `Joining Vibe Chat is free and always has been. What follows is everything that is not.

## Your first thirty minutes

Every new paying account starts with thirty minutes of free chat. No card, nothing to cancel, and nothing to claim — it is simply there when you arrive, and it runs down only while you are actually talking.

## After that

Messaging costs ten coins per block of seven messages. You are charged per block rather than per message, so a long back-and-forth costs the same as seven one-word replies.

Female accounts message for free, with no block and no balance to keep an eye on.

## Four ways to get coins without paying

Claim the daily bonus. It unlocks every twenty-four hours and the app shows a live countdown to the next one, so there is no guessing.

Play the arcade games and convert the points you earn.

Refer a friend. When somebody joins with your code, you both receive coins — your code is on your profile, on the website and in the app.

Watch for announcements. Offers and free-chat promotions show up under News, and some of them carry coins or extra free minutes.

## Buying coins

Packs are listed on the coins screen in both the app and the website, with the total including any bonus coins shown before you pay. Card, UPI, netbanking and wallet payments are all supported, depending on what is switched on for your region.

Coins do not expire.

## Refunds

Refunds are available for a failed payment where your bank was still debited, a duplicate charge, or an accidental purchase where none of the coins have been spent, within seven days. Coins already spent, bonus coins, and balances on terminated accounts are not refundable. The full Refund Policy is on this site.`,
  },
  {
    slug: 'talk-in-your-own-language',
    title: 'Talk in your own language',
    tags: ['product', 'languages'],
    excerpt:
      'Eleven languages in the interface, and a way to tell us which ones you actually speak so discovery can act on it.',
    content: `A conversation in your second language is a different conversation. It is slower, more careful, and a lot less like you. So Vibe Chat works in eleven of them.

## The interface

English, Hindi, Hinglish, Punjabi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada and Malayalam. You can change it at any time from Settings in the app, or from the switcher at the bottom of this site, and the choice sticks to your account rather than to the device.

## The part that matters more

Separately from the interface, you can tell us which languages you speak. Up to five of them, chosen on your profile.

Discovery uses that. Somebody who reads Tamil comfortably and English slowly should not be spending their evening in English, and telling us so is the difference between a list of strangers and a list of people you can actually talk to.

## Changing your mind

Languages are editable whenever you like, in the app under your profile or from the Edit details button on the website. It is exactly the kind of thing that changes once you have used the app for a week and noticed who you actually enjoy talking to.`,
  },
  {
    slug: 'what-to-say-first',
    title: 'What to say first',
    tags: ['guides'],
    excerpt:
      'Openers that get a reply, openers that get a block, and why the first ninety seconds decide the rest of it.',
    content: `Everybody on Vibe Chat is there for the same reason: they are free right now and would rather be talking to somebody. That is a much easier starting position than most apps give you. It still gets wasted constantly.

## "Hi" is not an opener

It transfers all of the work to the other person. They now have to invent a conversation from nothing, and most of the time they will not bother.

Give them something to answer. A question about something on their profile, an opinion they can disagree with, anything with a hook in it.

## Read the profile first

Languages, interests, the line they wrote about themselves. Ten seconds of reading turns a generic opener into a specific one, and specific openers get replies.

## Say why you are here

"Long day, want to talk about anything that is not work" is a perfectly good opening message. It sets the tone, it is honest, and it gives the other person permission to be equally direct.

## What ends a conversation

Asking for contact details. Asking for photos. Anything sexual in the first few messages. Pushing after somebody has changed the subject once.

These are not just rude — the first one breaches the Community Guidelines, and people report it.

## If it is not working

Leave. Nobody is obliged to carry a conversation that is not going anywhere, and there is a whole list of other people who are free right now. Silence after three good-faith messages is an answer.`,
  },
];

/*
 * Placeholder testimonials, so the "Our users love us" row can be seen working
 * before anyone real has said anything.
 *
 * These are NOT reviews. Nobody said them. They exist to prove the layout and
 * must be deleted before the site is public — publishing them as-is would be
 * putting invented quotes, attributed to invented people, in front of users.
 *
 *   npm run seed:site -- --clear-testimonials
 *
 * removes exactly these rows and nothing an admin has since written, which is
 * why the names are matched individually rather than the collection dropped.
 */
const SAMPLE_TESTIMONIALS = [
  { name: 'Sample — Aarti', role: 'Placeholder, delete before launch', rating: 5, order: 1, quote: 'Replace this with something a real person said. Until you do, this row is a layout preview and nothing more.' },
  { name: 'Sample — Rohit', role: 'Placeholder, delete before launch', rating: 5, order: 2, quote: 'A second placeholder, so the marquee has enough to scroll and you can see how two cards sit beside each other.' },
  { name: 'Sample — Neha', role: 'Placeholder, delete before launch', rating: 4, order: 3, quote: 'A four-star one, so you can check that a shorter star row still lines up with the rest of the card.' },
  { name: 'Sample — Imran', role: 'Placeholder, delete before launch', rating: 5, order: 4, quote: 'A deliberately longer placeholder, written to run past three lines, so the card grows the way a real quote of this length would and the tail stays under the middle of it.' },
  { name: 'Sample — Divya', role: 'Placeholder, delete before launch', rating: 5, order: 5, quote: 'The last of the samples. Delete all five from Website & Blog, Testimonials, once you have real ones.' },
];

/*
 * Placeholder announcements, written into the events collection the admin
 * panel already manages under Events & Offers.
 *
 * `bannerUrl` is deliberately null. Seeding a URL would either hotlink a
 * third-party image service that can disappear, or ship a broken image — the
 * card falls back to the brand gradient, which looks intentional, and a real
 * banner is one field away in the admin panel.
 *
 *   npm run seed:site -- --clear-samples
 *
 * removes these and the sample testimonials together.
 */
const SAMPLE_ANNOUNCEMENTS = [
  {
    title: 'Sample — Voice rooms are live',
    description:
      'Rooms are open to everyone now. Drop into one, listen for a while, and take the mic whenever you feel like it. Replace this placeholder with a real announcement before launch.',
    type: 'announcement',
    badgeText: 'SAMPLE',
    rewardCoins: 0,
  },
  {
    title: 'Sample — Double coins this weekend',
    description:
      'Every coin pack bought between Friday and Sunday lands with a bonus on top. This is placeholder copy showing how an offer with a reward reads on the card.',
    type: 'bonus_coins',
    badgeText: 'SAMPLE',
    rewardCoins: 50,
  },
  {
    title: 'Sample — Eleven languages, no barriers',
    description:
      'The app now speaks eleven languages, and discovery can match you with people who speak yours. A placeholder announcement, here to prove the layout.',
    type: 'announcement',
    badgeText: 'SAMPLE',
    rewardCoins: 0,
  },
  {
    title: 'Sample — Thirty minutes free to start',
    description:
      'Every new account begins with thirty minutes of free chat, no card and nothing to cancel. Delete this sample once you have a real announcement to make.',
    type: 'free_chat',
    badgeText: 'SAMPLE',
    rewardFreeMinutes: 30,
  },
];

async function run() {
  await connectDatabase();

  let docsWritten = 0;
  for (const doc of DOCS) {
    const existing = await LegalDocModel.findOne({ slug: doc.slug }).lean().exec();

    // An admin who has reworded a policy should not have it silently reverted
    // by a re-run. `--force` is the explicit way to say "yes, overwrite it".
    if (existing && !force) {
      logger.info({ slug: doc.slug }, 'Policy already published, leaving it alone');
      continue;
    }

    await LegalDocModel.findOneAndUpdate(
      { slug: doc.slug },
      { $set: { ...doc, effectiveFrom: existing?.effectiveFrom ?? new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    ).exec();
    docsWritten += 1;
  }

  /*
   * The same protection the policies above get, for the same reason.
   *
   * These upsert on the question, so an admin who reworded an *answer* and kept
   * the question had that answer silently reverted by the next re-run — and a
   * re-run is the documented way to add a new FAQ, so it was easy to trigger
   * without meaning to. Matching rows are now left alone unless `--force`.
   */
  let faqsWritten = 0;
  let faqsSkipped = 0;
  for (const faq of FAQS) {
    if (!force) {
      const existing = await FaqModel.exists({ question: faq.question });
      if (existing) {
        faqsSkipped += 1;
        continue;
      }
    }

    const result = await FaqModel.updateOne(
      { question: faq.question },
      { $set: { ...faq, isActive: true } },
      { upsert: true, runValidators: true },
    ).exec();
    if (result.upsertedCount || result.modifiedCount) faqsWritten += 1;
  }

  if (faqsSkipped > 0) {
    logger.info({ faqsSkipped }, 'FAQs already present, left as the admin has them');
  }

  if (clearTestimonials || clearSamples) {
    const names = SAMPLE_TESTIMONIALS.map((item) => item.name);
    const removed = await TestimonialModel.deleteMany({ name: { $in: names } }).exec();
    const titles = SAMPLE_ANNOUNCEMENTS.map((item) => item.title);
    const removedEvents = await EventModel.deleteMany({ title: { $in: titles } }).exec();
    const slugs = SAMPLE_POSTS.map((item) => item.slug);
    const removedPosts = await BlogPostModel.deleteMany({ slug: { $in: slugs } }).exec();
    logger.info(
      {
        testimonials: removed.deletedCount,
        announcements: removedEvents.deletedCount,
        posts: removedPosts.deletedCount,
      },
      'Samples removed',
    );
    await disconnectDatabase();
    process.exit(0);
  }

  let samplesWritten = 0;
  for (const item of SAMPLE_TESTIMONIALS) {
    const result = await TestimonialModel.updateOne(
      { name: item.name },
      { $set: { ...item, isActive: true } },
      { upsert: true, runValidators: true },
    ).exec();
    if (result.upsertedCount || result.modifiedCount) samplesWritten += 1;
  }

  /*
   * Posts are matched on slug and skipped if present, so an edited post is never
   * reverted by a re-run — the same rule the policies and FAQs follow.
   *
   * `readMinutes` is computed here rather than stored by hand: the service does
   * the same thing on create, and two different numbers for the same body is the
   * kind of inconsistency nobody notices until a reader does.
   */
  let postsWritten = 0;
  for (const post of SAMPLE_POSTS) {
    if (!force && (await BlogPostModel.exists({ slug: post.slug }))) continue;

    const words = post.content.trim().split(/\s+/).filter(Boolean).length;

    await BlogPostModel.findOneAndUpdate(
      { slug: post.slug },
      {
        $set: {
          ...post,
          status: BLOG_STATUS.PUBLISHED,
          publishedAt: new Date(),
          authorName: 'Vibe Team',
          readMinutes: Math.max(1, Math.round(words / 200)),
          seoTitle: post.title,
          seoDescription: post.excerpt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    ).exec();
    postsWritten += 1;
  }

  let announcementsWritten = 0;
  for (const item of SAMPLE_ANNOUNCEMENTS) {
    const result = await EventModel.updateOne(
      { title: item.title },
      { $set: { ...item, isActive: true, bannerUrl: null, startsAt: new Date(), endsAt: null } },
      { upsert: true, runValidators: true },
    ).exec();
    if (result.upsertedCount || result.modifiedCount) announcementsWritten += 1;
  }

  logger.info(
    { docsWritten, faqsWritten, postsWritten, announcementsWritten, total: FAQS.length },
    'Site content seeded',
  );

  if (samplesWritten > 0) {
    logger.warn(
      { samples: SAMPLE_TESTIMONIALS.length },
      'PLACEHOLDER testimonials are now live on the website. Nobody said these. '
        + 'Replace them in Website & Blog > Testimonials, or remove them with: '
        + 'npm run seed:site -- --clear-samples',
    );
  }

  if (announcementsWritten > 0) {
    logger.warn(
      { samples: SAMPLE_ANNOUNCEMENTS.length },
      'PLACEHOLDER announcements are now live. Edit or delete them in Events & Offers, '
        + 'or remove them with: npm run seed:site -- --clear-samples',
    );
  }
  await disconnectDatabase();
  process.exit(0);
}

run().catch(async (error) => {
  logger.fatal({ err: error }, 'Site content seeding failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
