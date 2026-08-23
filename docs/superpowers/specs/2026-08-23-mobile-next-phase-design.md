# Mobile Next Phase Design

**Date:** 2026-08-23  
**Product:** ขยับกับหลาน (Kha-Yab-Gub-Lan)  
**Depends on:** `docs/superpowers/specs/2026-08-23-website-refactor-design.md`  
**Status:** Draft for implementation planning

## Problem

The original idea is a tablet app for ผู้สูงอายุ, with หลาน setting the day in advance. The ADR correctly shipped a browser demo instead. The story page already says the mobile app is in development. There is no installable app, no saved ตารางเวลา, and no real การเรียกจากหลาน at the clock time — the elder taps a card.

The next phase is not a rewrite in React Native or Flutter, and not face-swap or SOS. Those would throw away a working on-device pose loop and spend the phase on the riskiest unfinished ideas.

## Goal

Turn the extracted demo into a daily-use installable client for one household, on a tablet or large phone, without a backend.

After this phase a family can:

1. Install ขยับกับหลาน on the elder’s tablet (Add to Home Screen, then Capacitor if a store build is needed).
2. Have หลาน set today’s events once; they survive refresh and reopen.
3. At the event time, the tablet plays the recorded การเรียกจากหลาน without anyone tapping a card (notification + auto-open of the call screen when the app is in the foreground; notification when it is in the background).
4. Run the same seated session: camera on-device, large text feedback, หน้าชม, summary the grandchild can see in-app.

## Non-goals

- Face swap / AI grandchild trainer video.
- SOS, fall detection, auto-call, or sending camera frames off-device.
- Accounts, cloud sync, or two separate apps.
- Voice cloning / TTS. Keep prerecorded files. Yeen and James stay silent until files exist.
- App Store / Play listing, push-notification servers, or SMS.
- Changing pose-check math.

## Approaches considered

1. **Rewrite native (React Native / Flutter)** — Clean store story, rewrite camera + MediaPipe bindings, months of work. Rejected for this phase.
2. **PWA of the extracted demo** — Same origin as the website, `display: standalone`, `localStorage`, Notification + `setTimeout` while open. Fastest path that reuses `js/domain.js` and `js/demo-app.js`. **This phase ships this.**
3. **Capacitor wrapper of the same demo** — Needed later for reliable iOS local notifications and a store icon. Scaffold only; do not require a store release to call the phase done.

## Architecture

One origin. Story site stays `index.html`. Product client is `demo.html` in standalone display.

```
js/storage.js     load/save events + lang + last role
js/schedule.js    when to fire a call; notifier port
js/demo-app.js    uses storage + schedule; same screens
manifest.webmanifest
sw.js             cache app shell + portraits + audio; never cache camera
```

Event records stay the website shape:

```js
{ id, time, person, set: [{ id, ms }], started, done }
```

`time` is `HH:MM` for *today* only. No calendar yet. Refreshing after midnight: keep the list but clear `started`/`done` so a new day can be run. Do not invent multi-day recurrence in this phase.

## Persistence

Key: `kayab:v1`.

```js
{
  version: 1,
  lang: 'th' | 'en',
  role: 'elder' | 'grandchild',
  events: Event[],
  nextEventId: number
}
```

Rules:

- Save after every grandchild edit and after a session completes.
- Load on `demo.html` startup. If missing, events are `[]` (same empty home as today’s demo).
- `?entry=preset` still seeds the sample event only when there is no saved filled event. It must not wipe a real household’s day.
- “เริ่มเดโมใหม่” becomes “ล้างวันนี้” and clears saved events after a confirm. Story-site wording can still say เดโม; the product client uses ล้างวันนี้.

Camera frames, landmarks, and summaries that include images are never written to disk.

## การเรียกจากหลาน at clock time

`js/schedule.js` is pure:

```js
export function nextCall(events, now /* Date */)
// { eventId, fireAt: Date } | null
// next visible, not done, with time >= now, else null
```

Adapters:

- **Foreground:** `setInterval` 1s. When `now` crosses `fireAt` and elder role is active and screen is `home`, open the call screen and play the recorded cue (existing `playCue('call')`).
- **Background / installed:** `Notification` with title = grandchild name, body = existing `callLine1`, click opens `demo.html?call=<eventId>`.
- Do not spam: one notification per event id per calendar date (`notifiedOn: 'YYYY-MM-DD'` stored on the event).

iOS Safari will not reliably notify a PWA in the background. The spec accepts that. Capacitor Local Notifications is the follow-up, not a blocker.

## Elder vs grandchild on a tablet

Default role remains ผู้สูงอายุ. Grandchild setup stays in the same app behind the existing role control.

Standalone mode (`display-mode: standalone` or `?client=app`):

- Hide “กลับไปดูเรื่องราว”.
- Keep language + role + ล้างวันนี้.
- Home cards stay large; session layout stays instruction left, camera right (existing).

No PIN in this phase. The tablet lives in the house.

## Install surface on the story site

The `#mobile-app` section, after the website refactor, tells the truth:

- Now: open `demo.html` in the browser.
- Next: on iPhone/iPad, Share → Add to Home Screen; on Android, Install app / Add to Home Screen.
- Not yet: App Store / Play.

No fake badges.

## Testing

Vitest for storage round-trip, `nextCall`, duplicate-time visibility still using `domain.js`, and “do not overwrite saved events with preset”.

Manual checklist: install PWA, kill tab, reopen, events still there; with the tablet clock set near an event time, call screen opens; camera still local.

## Success

1. Refresh on `demo.html` keeps grandchild events.
2. At event time, with the client open on elder home, การเรียกจากหลาน starts without a tap.
3. Installed PWA opens `demo.html`, not the story site.
4. Pose session behavior matches the website demo.
5. No image or video from the camera is stored or uploaded.
6. CONTEXT.md terms still hold: ผู้สูงอายุ, หลาน, การเรียกจากหลาน, เซสชัน, ชุดท่า, หน้าชม.
