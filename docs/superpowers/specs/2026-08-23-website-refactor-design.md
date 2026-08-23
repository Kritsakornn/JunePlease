# Website Refactor Design

**Date:** 2026-08-23  
**Product:** ขยับกับหลาน (Kha-Yab-Gub-Lan)  
**Status:** Draft for implementation planning

## Callers

This file is not imported by runtime JS. It is the spec for:

- `docs/superpowers/plans/2026-08-23-website-refactor.md` (header **Spec:**)
- `docs/superpowers/specs/2026-08-23-mobile-next-phase-design.md` (**Depends on:**)

No existing spec covers this split. The tree has only `docs/adr/0001-web-for-hackathon-demo.md` (why the demo is a website) plus the mobile spec created in this session.

This spec does not read or write data files. The demo event shape it freezes is in-memory only:

```js
{ id: 1, time: "10:00", person: "pong", set: [{ id: "t", ms: 10000 }], started: false, done: false }
```

`time` is `HH:MM` (24-hour, from `<input type="time">`). No calendar date.

## Problem

The public website and the working product demo live in one HTML page, one 952-line `app.js`, and one 2203-line `styles.css`. That was correct for a hackathon demo. It is now the wrong shape for two jobs:

1. Tell the story of ขยับกับหลาน to a visitor.
2. Let a family try the seated session (กล้อง, เสียงเรียก, ฟีดแบ็กท่า).

Because those jobs share a file, a visual change on the story page can break the session, MediaPipe downloads even if the visitor never opens the demo, CSS rules collide (`.topbar` is declared twice, at `styles.css:70` and `styles.css:152`), and there are no tests around the event and pose rules.

## Goal

Split the story site from the product demo without changing what the demo does. After this refactor:

- `index.html` is only the story site.
- `demo.html` is only the working prototype.
- Event visibility, pose checks, and copy lookup are pure modules with tests.
- Story CSS and demo CSS do not share colliding selectors except the shared header tokens.
- MediaPipe, camera, and audio load only on `demo.html`.

## Non-goals

- Native app, PWA, persistence, or notifications (mobile spec).
- Face swap, SOS, fall detection, voice cloning, or a backend.
- New poses, new people, or new audio files.
- Changing pose-check thresholds or session timing (`HOLD_MS = 4000`, `DEFAULT_MS = 20000`, durations 10/20/30s, `WRONG_GRACE_MS = 4500`, `WRONG_GAP_MS = 7000`).
- Rewriting in React, Next, or another framework.

## Current inventory

| File | Role today |
|---|---|
| `index.html` | Story sections + five demo screens in one document |
| `app.js` | i18n, story/demo view switch, events, MediaPipe, camera, audio, render |
| `site-content.js` | `PEOPLE`, `COPY`, `DEMO_PRESET` |
| `styles.css` | Tokens + story + demo, duplicate `.topbar` |
| `docs/adr/0001-web-for-hackathon-demo.md` | Why this is a browser app |
| `ideaMD/CONTEXT.md` | Language rules |

Demo behavior that must survive:

- Roles: ผู้สูงอายุ (default) and หลาน, one app, one origin.
- Grandchild creates events: time + person + seated pose set. Incomplete events stay off the elder home.
- Duplicate times: only the first filled event at that time is visible.
- Elder taps a card → การเรียกจากหลาน (face + recorded voice + one green start button) → session → หน้าชม.
- Camera stays on-device. Feedback is large Thai/English text plus a few dots, never a skeleton.
- Yeen and James have photos and no audio; the session still runs with on-screen text.

## Target file map

```
JunePlease/
  index.html                 # story only
  demo.html                  # prototype only
  css/tokens.css             # :root, reset, focus
  css/story.css              # story layout
  css/demo.css               # demo screens
  js/content.js              # PEOPLE, COPY, DEMO_PRESET
  js/i18n.js                 # t(lang, key, vars)
  js/domain.js               # events + pose checks (no DOM)
  js/story.js                # lang, nav, scroll reveal
  js/demo-app.js             # screens, camera, audio, MediaPipe, render
  tests/domain.test.js
  tests/i18n.test.js
  package.json
  vitest.config.js
```

## Domain module

`js/domain.js` must not import `document` or a global `state`.

```js
export function isFilled(ev)
export function isVisible(ev, events)
export function isLocked(ev)
export function visibleEvents(events)
export function eventNeedKey(ev, events)
  // 'needTime' | 'needPerson' | 'needMove' | 'timeTaken' | ''
export function unusedPoseIds(ev, poseIds)
export function vis(lm, i)
export function dist(a, b)
export function shoulderWidth(lm)
export function hasFace(lm)
export function checkT(lm)
export function checkShoulders(lm)
export function checkPunch(lm)
export function checkArmsUp(lm)
export function checkHandsHead(lm)
export const POSE_CHECKS = { t, shoulders, punch, armsUp, handsHead }
export const LANDMARKS = { NOSE: 0, LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16 }
```

Pose-check bodies copy `app.js` as-is. Event shape stays:

```js
{ id, time, person, set: [{ id, ms }], started, done }
```

## Story site

Sections stay: intro, inspiration, how-it-works, mobile-app, team. Thai default, EN toggle.

Changes:

- Header has story nav + language + “ลองเดโม” linking to `demo.html?entry=preset` and a text link to `demo.html?entry=setup`.
- No role switcher, reset, or demo screens on the story page.
- `#mobile-app` states honestly: web prototype works today; daily mobile app is the next phase. No fake store buttons.
- Do not load `@mediapipe/tasks-vision` on `index.html`.

## Demo site

Same five screens: home, call, session, praise, grandchild. Same seed: empty until preset entry opens the sample event (10:00, pong, t / shoulders / armsUp at 10s each). Query:

- `demo.html` or `demo.html?entry=preset` → seed preset, open การเรียกจากหลาน.
- `demo.html?entry=setup` → seed preset, show หน้าหลาน.
- “กลับไปดูเรื่องราว” → `index.html`.

Demo still has no persistence in this spec. Refresh clears events.

## Visual identity

Keep porcelain / indigo / marigold / green-only-for-start. Keep Chonburi + IBM Plex Sans Thai Looped. Merge the two `.topbar` blocks into one sticky bar. Do not invent a new brand.

## Testing

Vitest, Node, no browser for unit tests.

- Domain: filled/visible/locked/need-key, duplicate times, unused poses, each pose check with fake landmarks.
- i18n: Thai and English have the same keys; `{n}` substitution; Thai brand has no Latin letters.

Camera and MediaPipe stay a manual checklist.

## Success

1. `npm test` passes.
2. Story page has no `#demo-view`, no camera, no MediaPipe network request.
3. Preset demo still runs: call → three seated poses → หน้าชม.
4. Grandchild can add two events at different times; elder home shows both, sorted.
5. Same time twice: elder sees only the first filled event.
6. Language toggle still works on both pages.
7. `ideaMD/CONTEXT.md` terms are unchanged.
