# API Reference

Base URL: `{host}/api/v1`

All responses share one shape:

```jsonc
// success
{ "success": true, "data": { }, "meta": { } }   // meta only on paginated lists

// failure
{ "success": false, "error": { "code": "INSUFFICIENT_COINS", "message": "…", "details": { } } }
```

Clients should branch on `error.code`, never on the message text — messages are
user-facing copy and may change.

Authenticate with `Authorization: Bearer <accessToken>`.

---

## Status codes

| Code | Meaning in this API |
| --- | --- |
| 200 | Success |
| 201 | Resource created |
| 400 | Malformed or semantically invalid request |
| 401 | Not authenticated, or token expired/revoked |
| 402 | Out of coins — the client should open the buy-coins sheet |
| 403 | Authenticated but not permitted (unverified email, suspended, not an admin) |
| 404 | Not found |
| 409 | Conflict (duplicate email, bonus not ready, room full) |
| 422 | Validation failed; `error.details` lists `{ field, message, in }` |
| 429 | Rate limited |
| 500 | Unexpected server error |

---

## Auth — `/auth`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/register` | – | Creates a pending account and emails a 6-digit code. Returns no tokens. |
| POST | `/verify-email` | – | `{ email, code }` → activates the account and returns tokens. |
| POST | `/resend-code` | – | Always answers 200, whether or not the address exists. |
| POST | `/login` | – | 403 `EMAIL_NOT_VERIFIED` routes the app to the OTP screen. |
| POST | `/refresh` | – | Rotates the refresh token. Reusing an old one revokes every session. |
| POST | `/logout` | – | Revokes one session. |
| POST | `/logout-all` | user | Revokes every session and invalidates existing access tokens. |
| GET | `/me` | user | Current profile. |
| GET | `/sessions` | user | Signed-in devices. |
| POST | `/forgot-password` | – | Always answers 200 (no account enumeration). |
| POST | `/reset-password` | – | `{ email, code, newPassword }`. |
| POST | `/change-password` | user | Signs out every device on success. |

Registration requires **name, nickname, email, password and gender**. Gender is
immutable afterwards because the entire discovery model depends on it.

---

## Users — `/users`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/me` | Own profile including preferences and wallet-independent data. |
| PATCH | `/me` | name, nickname, bio, interests, preferences. |
| POST | `/me/avatar` | `multipart/form-data`, field `avatar`. JPEG/PNG/WebP, max 5 MB. |
| DELETE | `/me/avatar` | Removes the photo. |
| PUT | `/me/location` | `{ latitude, longitude, city?, country? }`. |
| GET | `/discover` | The feed. See below. |
| GET | `/online-count` | Live online totals by gender. |
| GET | `/:userId` | Public profile. |
| POST | `/:userId/block` · DELETE | Block / unblock. |
| GET | `/blocked` | Blocked list. |

**`GET /discover`** returns only **active accounts of the opposite gender**,
online first. Query: `page`, `limit`, `onlineOnly`, `search`, and optionally
`latitude` + `longitude` + `radiusKm` to switch to a distance-sorted feed
(`distanceKm` is then present on each row). Latitude and longitude must be sent
together. Blocking hides people in both directions.

---

## Chat — `/chat`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/conversations` | `{ userId }` — opens or reuses the thread, and auto-sends the greeting on a brand-new one. |
| GET | `/conversations` | Thread list with unread counts. |
| GET | `/conversations/:id` | One thread. |
| GET | `/conversations/:id/messages` | Cursor paginated: `limit`, `before`. |
| POST | `/conversations/:id/messages` | `{ text, type? }`. Text and emoji only. |
| POST | `/conversations/:id/read` | Clears unread, sends a read receipt. |
| POST | `/conversations/:id/close` | Closes the thread. |
| DELETE | `/messages/:messageId` | Soft-deletes your own message. Coins are not refunded. |
| GET | `/unread-count` | Total unread badge. |

Opening a profile never fails for lack of coins: if the greeting cannot be paid
for, the thread is still created and the response carries
`greetingSkippedReason: "INSUFFICIENT_COINS"` so the app can offer the coin sheet.

Every send returns `billing: { outcome, coinsCharged, wallet }` where `outcome`
is one of `free_gender`, `free_talk`, `prepaid_block`, `block_purchased`.

---

## Coins — `/coins`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/wallet` | Balance, message credits, free-talk seconds, daily-bonus countdown. |
| GET | `/transactions` | Ledger, paginated, optional `type`. |
| GET | `/packages` | Purchasable coin packs. |
| GET | `/daily-bonus` | `{ isAvailable, amount, nextAvailableAt, msRemaining }`. |
| POST | `/daily-bonus/claim` | 409 `DAILY_BONUS_NOT_READY` while the timer runs. |
| GET/POST/PATCH/DELETE | `/admin/packages…` | Admin pricing management. |

### Billing rules

1. A gender absent from `chargedGenders` is never billed (girls chat free, unlimited).
2. Otherwise the introductory free-talk allowance is spent first — burned by chat
   heartbeats while a chat screen is open, not by wall-clock time.
3. Then one already-paid message credit is consumed.
4. Then a block is bought: **10 coins buys 7 messages** (both numbers are admin-editable).
5. Otherwise the send is refused with **402 `INSUFFICIENT_COINS`**.

Steps 3 and 4 are single conditional atomic updates, so two devices sending at
the same instant cannot spend the same coins twice.

---

## Payments — `/payments`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/options` | Packs plus which methods are actually usable right now. |
| POST | `/orders/razorpay` | Creates a checkout order. |
| POST | `/orders/razorpay/verify` | `{ orderId, razorpayPaymentId, razorpaySignature }`. |
| POST | `/orders/upi` | Manual transfer; returns UPI id, QR URL and a `upi://pay` intent link. |
| POST | `/orders/:orderId/proof` | `{ utr, note? }` — submits the bank reference for review. |
| GET | `/orders` | Own order history. |
| GET | `/admin/orders` | Review queue. |
| POST | `/admin/orders/:orderId/approve` · `/reject` | Manual verification. |

`POST /webhooks/razorpay` (outside the API prefix) is the authoritative credit
path. It is verified by HMAC over the raw request body and is safe to replay:
coins are credited exactly once per order.

The UPI intent link opens GPay, PhonePe, Paytm or any other UPI app, and is the
same payload the displayed QR encodes.

---

## Rooms — `/rooms`

Group chat with optional voice. **Free** — no billing on this path.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create. One live room per host. |
| GET | `/` | Live rooms, busiest first. |
| GET | `/:roomId` | Room detail with participants. |
| POST | `/:roomId/join` · `/leave` · `/close` | Membership. Host leaving ends the room. |
| GET/POST | `/:roomId/messages` | Room chat. History self-deletes after 24 h. |
| PATCH | `/:roomId/voice` | Mute / connection state. |
| DELETE | `/:roomId/participants/:userId` | Host-only removal. |

Voice is a peer-to-peer WebRTC mesh. The server only relays offers, answers and
ICE candidates between participants — audio never passes through it.

---

## Games — `/games`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/` | Catalogue with each player's personal best. |
| POST | `/sessions` | `{ gameKey }` — starts a server-timed session. |
| POST | `/sessions/:sessionId/complete` | `{ score }` — awards points. |
| GET | `/leaderboard` | Global board plus the caller's own rank. |
| GET | `/sessions` | Own play history. |

Scores are reported by the client, which is unavoidable for mini games rendered
in the app. The server bounds them instead: per-game maximum score, minimum and
maximum plausible duration, and a per-day session cap. See
`modules/games/game.constants.js`.

---

## Reports — `/reports`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/` | user | Files a report and blocks the account by default. Snapshots the reported messages. |
| GET | `/` · `/:reportId` | admin | Moderation queue. |
| PATCH | `/:reportId` | admin | `reviewing` / `actioned` / `dismissed`. |

---

## Notifications & campaigns — `/notifications`

Push notifications and promotional email, sent from the admin panel.

### App endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/devices` | user | Registers an Expo push token. Upserts on the token, so reinstalling replaces the row. |
| DELETE | `/devices` | user | Retires a token on sign-out. |
| GET | `/unsubscribe?token=…` | **public** | Opened from an email client. Returns an HTML confirmation page, not JSON. |

The unsubscribe link is authorised by a signed `userId.signature` pair, so it
works with no session and never expires — someone who wants out of promotional
mail should not have to sign in first, and the signature stops one person
unsubscribing another.

### Admin endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/reach` | How many devices and opted-in mailboxes are actually reachable. |
| POST | `/audience/preview` | Counts an audience before you commit to it, and returns a sample. |
| GET/POST | `/campaigns` | List and create. Creating leaves it as a draft. |
| GET | `/campaigns/:id` | One campaign with live delivery counters. |
| POST | `/campaigns/:id/send` | Queues it. Optional `scheduledAt`. |
| POST | `/campaigns/:id/cancel` | Stops further batches; delivered messages cannot be recalled. |
| POST | `/campaigns/:id/test` | Sends to one address through the identical render path. |
| GET/POST/PATCH/DELETE | `/templates…` | Reusable HTML email templates. |

### Audiences

`preset` is one of `everyone`, `boys`, `girls`, `online_now`,
`inactive_7_days`, `never_purchased`, `paying_users`, `low_balance`. Explicit
`gender`, `onlineOnly`, `inactiveForDays` and `maxCoinBalance` filters layer on
top and win where they overlap.

Only **active, verified** accounts are ever included. A pending or suspended
account never receives a campaign.

### Sending guarantees

- **Batched** — 100 recipients per batch with a pause between them. A burst
  gets a sending domain rate-limited or blacklisted; slower delivery is
  recoverable, a blocked domain is not.
- **Resumable** — the cursor is written after every batch, so a restart mid-send
  resumes rather than mailing the first ten thousand people twice.
- **Single-sender** — the worker claims a campaign with a conditional update, so
  two instances cannot both send it.
- **Opt-out respected** — anyone with `preferences.marketingEmails === false` is
  skipped and counted under `stats.optedOut`. Transactional mail (OTP, password
  reset) ignores that flag, because a user who opted out of marketing must still
  receive the code that lets them sign in.
- **Escaped** — `{{name}}`-style placeholders are HTML-escaped. A nickname is
  user-authored text, and unescaped substitution is how one user's display name
  becomes markup in everyone else's inbox.

---

## Theme — `/theme`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/active` | – | Colours and branding. Fetched before the login screen renders. |
| GET | `/` | admin | All themes. |
| POST | `/` | admin | Create a custom theme; unspecified colours inherit defaults. |
| PATCH | `/:id` | admin | Edit. |
| POST | `/:id/activate` | admin | **Recolours the whole app in one click.** |
| DELETE | `/:id` | admin | Custom themes only. |

Activating a theme broadcasts `theme:updated` over the socket, so connected apps
re-skin without a restart.

---

## Settings — `/settings`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/public` | – | Pricing, chat and payment config the app needs. |
| GET | `/` | admin | Everything, including moderation. |
| PATCH | `/` | admin | Partial update; untouched groups are preserved. |

---

## Admin — `/admin`

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/login` | Same credential check as a user, then refuses non-admins. |
| GET | `/dashboard` | Users, chat volume, coins in circulation, revenue, rooms, games. |
| GET | `/users` · `/users/:userId` | Directory and full account detail. |
| POST | `/users/:userId/suspend` · `/reactivate` | Suspension takes effect immediately. |
| DELETE | `/users/:userId` | Soft delete — history and ledger stay intact. |
| POST | `/users/:userId/force-logout` | Drops every session. |
| POST | `/users/:userId/coins` | `{ amount, reason }`; negative debits. |
| POST | `/users/:userId/free-talk/reset` | Restores the introductory allowance. |
| GET | `/transactions` · `/audit-log` | Ledger and privileged-action history. |

---

## Health

| Path | Meaning |
| --- | --- |
| `GET /health` | Liveness — the process is up. Says nothing about dependencies. |
| `GET /ready` | Readiness — 503 when the database is unreachable. |
