# Realtime Events

Socket.IO, same origin as the API. Authenticate in the handshake:

```js
io(API_URL, { auth: { token: accessToken } });
```

The token goes in `auth`, not a query string, so it never lands in proxy logs.
The account is re-read from the database on connect, so a suspended user is
disconnected without waiting for their token to expire.

Every device of one account joins a private room, so server-side pushes reach
all of them.

## Server → client

| Event | Payload | Purpose |
| --- | --- | --- |
| `connection:ready` | `{ userId, wallet, unreadCount, theme, serverTime }` | One round trip that fills the whole app header. |
| `presence:updated` | `{ userId, isOnline, lastSeenAt }` | Drives the green dot. |
| `message:new` | message DTO | Delivered to the thread and to the recipient directly, so a closed chat screen still updates its badge. |
| `message:read:receipt` | `{ conversationId, readerId, readAt, count }` | Read receipts. |
| `typing:update` | `{ conversationId, userId, isTyping }` | Typing indicator. |
| `wallet:updated` | wallet snapshot | **The live coin counter.** Emitted on every charge, credit and bonus. |
| `freetalk:tick` | `{ freeTalkSecondsRemaining, coinBalance }` | Live countdown of the free allowance. |
| `freetalk:exhausted` | `{ messagesPerBlock, coinsPerBlock, coinBalance }` | Free time is over; billing starts. |
| `coins:daily-bonus-ready` | `{ amount, isAvailable }` | The 24-hour timer has elapsed. |
| `room:message:new` | room message DTO | Room chat. |
| `room:participants` | `{ roomId, participants, participantCount }` | Someone joined, left or was removed. |
| `room:voice:signal` | `{ roomId, fromUserId, signalType, payload }` | Relayed WebRTC signalling. |
| `room:voice:state` | `{ roomId, userId, isMuted?, isVoiceConnected? }` | Mute state. |
| `room:closed` | `{ roomId, reason }` | The host ended it. |
| `leaderboard:updated` | `{ userId, nickname, totalPoints, rank }` | A score changed the board. |
| `theme:updated` | theme | Admin recoloured the app; re-skin live. |
| `account:suspended` / `account:force-logout` | `{ reason }` | Sign the user out. |
| `app:error` | `{ event, code, message, details }` | Something a client emitted failed. |

## Client → server

| Event | Payload | Notes |
| --- | --- | --- |
| `conversation:join` / `conversation:leave` | `{ conversationId }` | Membership is verified server-side. |
| `message:send` | `{ conversationId, text, type? }` | Acknowledged with `{ success, message, billing }`, or `{ success: false, code }` on 402. |
| `message:read` | `{ conversationId }` | Clears unread. |
| `chat:heartbeat` | `{ conversationId }` | See below. |
| `typing:start` / `typing:stop` | `{ conversationId }` | |
| `room:join` / `room:leave` | `{ roomId, passcode? }` | |
| `room:message:send` | `{ roomId, text }` | |
| `room:voice:signal` | `{ roomId, targetUserId, signalType, payload }` | `fromUserId` is stamped by the server, so a participant cannot impersonate another. |
| `room:voice:state` | `{ roomId, isMuted?, isVoiceConnected? }` | |

### The heartbeat, and why it exists

The introductory free-talk allowance should only run down while the user
actually has a chat open — not while the app sits in the background. So the
client emits `chat:heartbeat` on an interval (the server publishes the interval
as `chat.heartbeatIntervalSeconds` in public settings) and the server decides
how many seconds each tick is worth.

Ticks arriving faster than that interval are ignored, so a client cannot drain
or stretch the allowance by changing its own timer.

### Voice

Rooms use a peer-to-peer WebRTC mesh. The server relays offers, answers and ICE
candidates between participants and never carries audio — which is what keeps
rooms free to run, and why the participant cap is admin-configurable.


---

## Push notifications

Sockets cover people who have the app open. Push covers everyone else.

A new message triggers a push **only when the recipient is not connected** —
someone with the app open already received the socket event, and notifying them
twice is noise. Delivery is best effort and never blocks the message: a push
that fails must not fail a message that is already stored and delivered.

The app registers its Expo token at `POST /notifications/devices` after sign-in
and retires it at `DELETE /notifications/devices` on sign-out. A token the
provider reports as `DeviceNotRegistered` is deactivated automatically, so a
dead address is not retried on every future campaign.

### Sound

The push payload carries a `sound` name and an Android `channelId`
(`messages` for chat, `announcements` for campaigns), so the operating system
plays the right tone and respects the user's per-channel settings. Which sound
plays is the recipient's choice, stored on their account as
`preferences.notificationSound`, and muted entirely when
`preferences.soundEnabled` is false — the server reads those before sending
rather than letting the sender decide.
