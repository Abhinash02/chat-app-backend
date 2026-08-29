# Vibe Chat — Backend

Node.js + Express + MongoDB API for a gendered matching chat app: boys and girls
discover each other, chat with text and emoji, pay for messages with coins, join
free voice rooms, and compete on a games leaderboard. An admin panel controls
pricing, colours and moderation at runtime.

- **API reference** — [`docs/API.md`](docs/API.md)
- **Realtime events** — [`docs/SOCKETS.md`](docs/SOCKETS.md)

---

## Running it

```bash
npm install
cp .env.example .env      # fill in MONGODB_URI and the two JWT secrets

npm run db                # terminal 1 — a local MongoDB (see below)
npm run seed              # terminal 2 — settings, themes, coin packs, admin
npm run dev               # terminal 2 — the API
```

### Getting a database

Any MongoDB works. In order of least effort:

| Option | Command | Notes |
| --- | --- | --- |
| **Bundled** | `npm run db` | Runs the real `mongod` that the test suite already downloads. Data persists in `.mongodb-data/`. Nothing to install. |
| Docker | `docker run -d -p 27017:27017 -v vibe-mongo:/data/db --name vibe-mongo mongo:7` | If you already have Docker running. |
| Atlas | — | Free tier. Paste the connection string into `MONGODB_URI`. Use this in production. |

`npm run db` exists because getting a database up is the one step between a
fresh clone and a working app, and both usual answers — installing MongoDB, or
pulling a 700MB image — fail on a slow or restricted network. It is for local
development only.

The API is then on `http://localhost:5000/api/v1`.
`npm run seed` prints the bootstrap admin credentials — change that password
before any real deployment.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode |
| `npm start` | Production |
| `npm test` | Full suite against an in-memory MongoDB |
| `npm run lint` | ESLint |
| `npm run db` | A local MongoDB for development |
| `npm run seed` | Idempotent baseline data |
| `npm run sync-indexes` | Deploy step — see *Deploying* below |

### What you need to configure

Only three things are required: `MONGODB_URI` and the two JWT secrets. Everything
else degrades gracefully:

- **No SMTP** → OTP codes are written to the log instead of emailed, so the whole
  signup flow works offline in development.
- **No Razorpay keys** → card/UPI checkout reports itself as unavailable rather
  than failing at the payment sheet; manual UPI still works.
- **No Supabase/Cloudinary** → uploads fall back to local disk.

---

## The business rules, and where they live

Everything below is stored in one settings document and editable from the admin
panel at runtime. The defaults are in
[`modules/settings/settings.constants.js`](src/modules/settings/settings.constants.js);
the engine that applies them is
[`modules/coins/coins.service.js`](src/modules/coins/coins.service.js).

| Rule | Default | Setting |
| --- | --- | --- |
| Girls chat free, unlimited | – | `coins.chargedGenders` |
| Introductory free chat | 30 minutes | `coins.freeTalkMinutes` |
| Message pricing | 7 messages = 10 coins | `coins.messagesPerBlock` / `coinsPerBlock` |
| Daily bonus | 25 coins every 24 h | `coins.dailyBonusCoins` / `dailyBonusIntervalHours` |
| Auto-greeting on a new chat | "Hi" | `chat.autoGreetingText` |
| Coin packs | ₹30→40, ₹50→60, ₹100→140, ₹250→370 | Admin → pricing |
| Rooms | free | `rooms.entryCoinCost` |
| Promotional email opt-out | on by default | `preferences.marketingEmails` per user |

### How a message gets billed

1. A gender absent from `chargedGenders` is never billed.
2. Otherwise the free-talk allowance is spent first — burned by chat heartbeats
   while a chat screen is open, not by wall-clock time.
3. Then an already-paid message credit is consumed.
4. Then a block is bought: 10 coins buys 7 messages.
5. Otherwise the send is refused with **402 `INSUFFICIENT_COINS`**.

Steps 3 and 4 are single conditional atomic updates (`findOneAndUpdate` with the
balance in the filter), so two devices sending at the same instant cannot spend
the same coins twice. There is a test for exactly that race.

Billing happens **before** the message is written, so the ledger and the thread
can never disagree.

---

## Layout

```
src/
├── app.js · server.js        Express wiring · lifecycle and graceful shutdown
├── config/                   env (validated at boot), logger, database
├── common/                   errors, middleware, utils, shared validators
├── modules/                  one folder per business domain
│   ├── auth/                 register, email OTP, login, refresh rotation
│   ├── users/                profiles, discovery, presence, blocking
│   ├── chat/                 conversations and messages
│   ├── coins/                wallet, ledger, billing engine, packages
│   ├── payments/             Razorpay and manual UPI
│   ├── rooms/                group text + voice rooms
│   ├── games/                mini games and leaderboard
│   ├── reports/              user safety reports
│   ├── notifications/        push tokens, email campaigns, templates
│   ├── theme/                runtime colour themes
│   ├── settings/             runtime business rules
│   └── admin/                dashboard, moderation, audit log
├── integrations/             email, push (Expo), storage, payments
├── realtime/                 Socket.IO gateway and handlers
├── jobs/                     background schedulers
└── database/                 model registry, index sync, seeders
```

Each module owns its own controller, service, repository, routes, schema and
constants, and exposes a public API through its `index.js`. HTTP logic stays in
controllers, business rules in services, database access in repositories.

### Two deliberate indirections

**`realtime/emitter.js`** — services push socket events through this rather than
importing the gateway, which would create a cycle (gateway → service → gateway).
Realtime delivery is always an enhancement: every event has a REST equivalent
the client can refetch.

**`integrations/storage`** and **`integrations/payments`** — business code
depends on a provider-shaped interface, never on Supabase or Razorpay directly,
so swapping a provider is a config change rather than a rewrite.

---

## Security

- Passwords are bcrypt hashed; OTPs and refresh tokens are stored as SHA-256
  digests, never in clear text.
- Refresh tokens rotate. Presenting a revoked one is treated as theft and drops
  every session for that account.
- A password change or admin action bumps `tokensValidFrom`, which invalidates
  access tokens already issued — suspension takes effect immediately rather than
  at token expiry.
- Login, `/forgot-password` and `/resend-code` never reveal whether an address is
  registered.
- Every request body, query and route param is validated by Zod before any
  business logic runs; unknown fields are rejected rather than ignored.
- The Razorpay webhook is verified by HMAC over the raw body, which is why it is
  mounted before the JSON parser.
- Only `AppError` instances describe themselves to clients; anything else becomes
  a generic 500, so database and stack details never escape.
- Rate limits are tightest on credential and OTP endpoints.

---

## Testing

```bash
npm test
```

176 tests run against a real MongoDB started in memory — not a mocked driver,
because most of what is worth testing here (conditional atomic updates, unique
indexes, geo queries) only behaves correctly against the real engine.

| Suite | Covers |
| --- | --- |
| `tests/unit` | Pure logic: text handling, durations, pagination, wallet snapshots |
| `tests/integration` | The billing engine, payment idempotency and campaign targeting, including concurrency |
| `tests/e2e` | Full HTTP journeys: auth, discovery and chat, admin, games and rooms |

Three production bugs were found by these tests and fixed: a Mongoose 8 option
rename that silently disabled the auto-greeting, a dotted-path upsert that left
new settings documents with half-empty nested groups, and a daily-bonus claim
that failed for any account whose wallet row did not already exist.

---

## Deploying

1. Set `NODE_ENV=production` and real secrets. `src/config/env.js` validates
   everything at boot and refuses to start on a bad value, so a missing secret is
   a startup failure rather than a runtime surprise.
2. Set `CORS_ORIGINS` to your actual origins — never `*`.
3. Run **`npm run sync-indexes`** before the new version serves traffic.
   `autoIndex` is disabled in production because building indexes on every boot
   can lock a large collection during a deploy. A query missing its index is a
   slow scan, not an error, so it will not announce itself.
4. Point Razorpay's webhook at `POST /webhooks/razorpay` and set
   `RAZORPAY_WEBHOOK_SECRET`. This is the authoritative credit path: it still
   credits the order when the app is killed before its callback runs.
5. Run behind a proxy — `trust proxy` is on so rate limiting sees real client IPs.

`SIGTERM` triggers a graceful shutdown: stop accepting connections, finish
in-flight requests, close sockets and the database, with a hard 15-second
timeout so the process always exits.

---

## Known limitations

- **Background jobs are in-process interval timers**, not a queue. Both are
  idempotent sweeps, so running them on several instances is harmless. If they
  ever need retries or backoff, `jobs/index.js` is the seam to replace.
- **Socket state is per-process.** Running more than one instance needs the
  Socket.IO Redis adapter; nothing else in the design assumes a single process.
- **Game scores are client-reported.** The server bounds score, duration and
  daily volume rather than simulating the games. This is a deliberate trade-off
  documented in `modules/games/game.constants.js`.
- **The profanity filter is a simple whole-word mask.** The report-and-block flow
  is the real moderation tool.
- **Campaign email has no open or click tracking.** Delivery is counted from the
  SMTP result only. Adding tracking pixels or link rewriting would mean a
  privacy decision the product has not made.
- **Push goes through Expo's service**, which forwards to APNs and FCM. That
  keeps Apple and Google credentials off this server, at the cost of depending
  on Expo's uptime.
