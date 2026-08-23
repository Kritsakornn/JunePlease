# Mobile Next Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the extracted `demo.html` a daily household client: saved ตารางเวลา, การเรียกจากหลาน at clock time, and install-to-home-screen — without a backend or a native rewrite.

**Architecture:** Same origin as the story site. `js/storage.js` persists events. `js/schedule.js` decides when a call should fire. `js/demo-app.js` loads/saves and runs a foreground clock. A web manifest + service worker cache the shell. Capacitor is scaffold only.

**Tech Stack:** Existing demo ES modules, Vitest, Web App Manifest, service worker, Notification API. Capacitor CLI only in the last task.

**Spec:** `docs/superpowers/specs/2026-08-23-mobile-next-phase-design.md`

**Depends on:** Website refactor plan (`docs/superpowers/plans/2026-08-23-website-refactor.md`) so `demo.html`, `js/domain.js`, `js/demo-app.js`, and `js/content.js` already exist.

## Global Constraints

- ผู้สูงอายุ is the person on the main screens; never “user” / “คนไข้”.
- หลาน sets ตารางเวลา, ชุดท่า, and เสียงเรียก in advance; never “trainer” / “coach”.
- การเรียกจากหลาน is face + one recorded clip + one green start button; never a generic alarm as the primary cue.
- All poses are seated. No standing poses. No skeleton overlay.
- Camera is on-device only. Do not store, upload, or cache camera frames or landmarks.
- Do not change pose-check math or session timing.
- Thai default; do not mix Thai and English in one visible string.
- One app, two roles. Do not ship two binaries.
- Persistence key is `kayab:v1`. Event `time` is `HH:MM`. `notifiedOn` is `YYYY-MM-DD` or omitted.
- YAGNI: no accounts, no cloud, no face swap, no SOS, no voice cloning, no App Store release.

---

## File map (locked)

- Create: `js/storage.js`, `js/schedule.js`, `tests/storage.test.js`, `tests/schedule.test.js`, `manifest.webmanifest`, `sw.js`
- Modify: `js/demo-app.js`, `demo.html`, `js/content.js`, `index.html` (`#mobile-app` copy only), `css/demo.css`
- Optional last: `capacitor.config.json` via `npx cap init` — do not move `webDir` away from this folder
- Do not modify pose checks in `js/domain.js`

---

### Task 1: Persistence module

**Files:**
- Create: `js/storage.js`
- Create: `tests/storage.test.js`

**Interfaces:**
- Consumes: event objects from `js/domain.js` / demo-app (`{ id, time, person, set, started, done }`)
- Produces: `STORAGE_KEY`, `emptyState()`, `serialize(state)`, `parse(raw)`, `load(getItem)`, `save(state, setItem)`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from "vitest";
import { STORAGE_KEY, emptyState, parse, serialize, load, save } from "../js/storage.js";

const sample = {
  version: 1,
  lang: "th",
  role: "elder",
  events: [
    {
      id: 1,
      time: "10:00",
      person: "pong",
      set: [{ id: "t", ms: 10_000 }],
      started: false,
      done: false,
    },
  ],
  nextEventId: 2,
};

describe("storage", () => {
  it("uses kayab:v1", () => {
    expect(STORAGE_KEY).toBe("kayab:v1");
  });

  it("round-trips a household day", () => {
    const raw = serialize(sample);
    expect(parse(raw).events[0].time).toBe("10:00");
    expect(parse(raw).events[0].set[0].id).toBe("t");
  });

  it("returns emptyState for missing or garbage JSON", () => {
    expect(parse(null).events).toEqual([]);
    expect(parse("{").events).toEqual([]);
    expect(emptyState()).toEqual({
      version: 1,
      lang: "th",
      role: "elder",
      events: [],
      nextEventId: 1,
    });
  });

  it("load/save go through the storage port", () => {
    const mem = {};
    save(sample, (k, v) => {
      mem[k] = v;
    });
    expect(mem[STORAGE_KEY]).toBeTruthy();
    const loaded = load((k) => mem[k]);
    expect(loaded.events).toHaveLength(1);
    expect(loaded.nextEventId).toBe(2);
  });

  it("does not persist camera or landmark fields", () => {
    const raw = serialize(sample);
    expect(raw).not.toMatch(/landmark/i);
    expect(raw).not.toMatch(/video/i);
    expect(raw).not.toMatch(/blob/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/storage.test.js`

Expected: FAIL `Cannot find module '../js/storage.js'`

- [ ] **Step 3: Write `js/storage.js`**

```js
export const STORAGE_KEY = "kayab:v1";

export function emptyState() {
  return { version: 1, lang: "th", role: "elder", events: [], nextEventId: 1 };
}

export function serialize(state) {
  return JSON.stringify({
    version: 1,
    lang: state.lang === "en" ? "en" : "th",
    role: state.role === "grandchild" ? "grandchild" : "elder",
    events: state.events.map((ev) => ({
      id: ev.id,
      time: ev.time,
      person: ev.person,
      set: ev.set.map((item) => ({ id: item.id, ms: item.ms })),
      started: Boolean(ev.started),
      done: Boolean(ev.done),
      notifiedOn: ev.notifiedOn || undefined,
    })),
    nextEventId: state.nextEventId,
  });
}

export function parse(raw) {
  if (!raw) return emptyState();
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.events)) return emptyState();
    return {
      version: 1,
      lang: data.lang === "en" ? "en" : "th",
      role: data.role === "grandchild" ? "grandchild" : "elder",
      events: data.events.map((ev) => ({
        id: Number(ev.id),
        time: String(ev.time || ""),
        person: String(ev.person || ""),
        set: Array.isArray(ev.set) ? ev.set.map((item) => ({ id: item.id, ms: Number(item.ms) })) : [],
        started: Boolean(ev.started),
        done: Boolean(ev.done),
        notifiedOn: typeof ev.notifiedOn === "string" ? ev.notifiedOn : undefined,
      })),
      nextEventId: Number(data.nextEventId) || 1,
    };
  } catch {
    return emptyState();
  }
}

export function load(getItem) {
  return parse(getItem(STORAGE_KEY));
}

export function save(state, setItem) {
  setItem(STORAGE_KEY, serialize(state));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/storage.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "feat: persist household events under kayab:v1"
```

---

### Task 2: Wire demo-app to storage

**Files:**
- Modify: `js/demo-app.js`
- Create: `tests/preset-guard.test.js`

**Interfaces:**
- Consumes: `load`, `save`, `emptyState` from `js/storage.js`; `isFilled` from `js/domain.js`
- Produces: `shouldSeedPreset(saved, entry)` — true only when `entry === 'preset'` or default, AND `saved.events` has no filled event

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from "vitest";
import { shouldSeedPreset } from "../js/storage.js";
import { isFilled } from "../js/domain.js";

describe("shouldSeedPreset", () => {
  it("seeds when storage is empty", () => {
    expect(shouldSeedPreset({ events: [] }, "preset")).toBe(true);
  });

  it("does not wipe a saved filled event", () => {
    const saved = {
      events: [{ id: 1, time: "14:00", person: "nua", set: [{ id: "t", ms: 10_000 }], started: false, done: false }],
    };
    expect(saved.events.every.bind(saved.events, isFilled)).toBeTruthy();
    expect(shouldSeedPreset(saved, "preset")).toBe(false);
    expect(shouldSeedPreset(saved, "setup")).toBe(false);
  });
});
```

Put `shouldSeedPreset` in `js/storage.js` (keeps demo-app thin):

```js
import { isFilled } from "./domain.js";

export function shouldSeedPreset(saved, entry) {
  const hasFilled = (saved.events || []).some(isFilled);
  if (hasFilled) return false;
  return entry === "setup" || entry === "preset" || !entry;
}
```

If the test file imports it from storage, add the export in Step 3 of this task (after Step 2 fails on missing export).

- [ ] **Step 2: Run tests to verify fail**

Run: `npx vitest run tests/preset-guard.test.js`

Expected: FAIL `shouldSeedPreset is not a function` or missing export

- [ ] **Step 3: Add the export (if not already) and persist from demo-app**

In `js/demo-app.js` startup, replace in-memory-only seed:

```js
import { load, save, shouldSeedPreset } from "./storage.js";

function persist() {
  save(
    {
      lang: state.lang,
      role: state.role,
      events: state.events,
      nextEventId,
    },
    (k, v) => localStorage.setItem(k, v),
  );
}

function boot() {
  const entry = new URLSearchParams(location.search).get("entry") || "preset";
  const saved = load((k) => localStorage.getItem(k));
  state.lang = saved.lang;
  if (shouldSeedPreset(saved, entry)) {
    seedDemo();
  } else {
    state.events = saved.events;
    nextEventId = saved.nextEventId;
    state.role = entry === "setup" ? "grandchild" : saved.role;
  }
  if (entry === "setup") state.role = "grandchild";
  persist();
  if (entry !== "setup" && shouldSeedPreset(saved, entry)) openCall(state.events[0]?.id);
  else render();
}
```

Call `persist()` after add/remove event, pose edits, `openCall` (started), `finishSession` (done), language/role changes.

Rename the demo reset button label in `js/content.js`:

- `th.resetDemo` → `ล้างวันนี้`
- `en.resetDemo` → `Clear today`

Reset handler: `localStorage.removeItem` via `save(emptyState(), ...)` then `seedDemo()` only if you still want a sample; spec says ล้างวันนี้ clears saved events after confirm. Implement:

```js
if (confirm(t("resetDemo"))) {
  save(emptyState(), (k, v) => localStorage.setItem(k, v));
  state.events = [];
  nextEventId = 1;
  go("home");
}
```

Do not auto-seed after clear.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS

Manual: add an event, refresh `demo.html` — the event is still there. `?entry=preset` must not replace it.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js js/demo-app.js js/content.js tests/preset-guard.test.js
git commit -m "feat: keep today's events across refresh"
```

---

### Task 3: Schedule module

**Files:**
- Create: `js/schedule.js`
- Create: `tests/schedule.test.js`

**Interfaces:**
- Consumes: `visibleEvents` from `js/domain.js`
- Produces: `todayStamp(now)`, `eventDate(now, time)`, `nextCall(events, now)`, `shouldNotify(ev, now)`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from "vitest";
import { eventDate, nextCall, shouldNotify, todayStamp } from "../js/schedule.js";

function ev(partial) {
  return {
    id: 1,
    time: "10:00",
    person: "pong",
    set: [{ id: "t", ms: 10_000 }],
    started: false,
    done: false,
    ...partial,
  };
}

describe("schedule", () => {
  it("builds today's stamp as YYYY-MM-DD", () => {
    expect(todayStamp(new Date("2026-08-23T09:00:00"))).toBe("2026-08-23");
  });

  it("combines HH:MM with the local calendar day", () => {
    const at = eventDate(new Date("2026-08-23T09:00:00"), "10:00");
    expect(at.getHours()).toBe(10);
    expect(at.getMinutes()).toBe(0);
  });

  it("picks the next visible not-done event at or after now", () => {
    const events = [
      ev({ id: 1, time: "08:00", done: true }),
      ev({ id: 2, time: "10:00" }),
      ev({ id: 3, time: "14:00" }),
    ];
    const n = nextCall(events, new Date("2026-08-23T09:30:00"));
    expect(n.eventId).toBe(2);
    expect(n.fireAt.getHours()).toBe(10);
  });

  it("returns null when the day's visible events are done", () => {
    expect(nextCall([ev({ done: true })], new Date("2026-08-23T11:00:00"))).toBe(null);
  });

  it("notifies once per event per date", () => {
    const now = new Date("2026-08-23T10:00:05");
    expect(shouldNotify(ev({}), now)).toBe(true);
    expect(shouldNotify(ev({ notifiedOn: "2026-08-23" }), now)).toBe(false);
    expect(shouldNotify(ev({ done: true }), now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/schedule.test.js`

Expected: FAIL missing module

- [ ] **Step 3: Write `js/schedule.js`**

```js
import { isFilled, visibleEvents } from "./domain.js";

export function todayStamp(now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function eventDate(now, time) {
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const at = new Date(now.getTime());
  at.setHours(hh || 0, mm || 0, 0, 0);
  return at;
}

export function nextCall(events, now) {
  const open = visibleEvents(events).filter((ev) => !ev.done && !ev.started);
  for (const ev of open) {
    const fireAt = eventDate(now, ev.time);
    if (fireAt.getTime() >= now.getTime()) return { eventId: ev.id, fireAt };
  }
  return null;
}

export function shouldNotify(ev, now) {
  if (!isFilled(ev) || ev.done || ev.started) return false;
  if (ev.notifiedOn === todayStamp(now)) return false;
  return eventDate(now, ev.time).getTime() <= now.getTime();
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/schedule.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/schedule.js tests/schedule.test.js
git commit -m "feat: decide when การเรียกจากหลาน should fire"
```

---

### Task 4: Foreground clock + notification adapter

**Files:**
- Modify: `js/demo-app.js`
- Modify: `demo.html` (optional `?call=` handling already in boot)

**Interfaces:**
- Consumes: `nextCall`, `shouldNotify`, `todayStamp` from `js/schedule.js`; existing `openCall(id)`
- Produces: `tickClock(now)` used by `setInterval`; `notifyCall(ev)` using `window.KayabNotify` if set, else `Notification`

- [ ] **Step 1: Extract a testable tick (add to `js/schedule.js`)**

No new file. Add:

```js
export function dueEventIds(events, now) {
  return events.filter((ev) => shouldNotify(ev, now)).map((ev) => ev.id);
}
```

Test in `tests/schedule.test.js`:

```js
it("lists due ids", () => {
  const events = [ev({ id: 9, time: "09:00" })];
  expect(dueEventIds(events, new Date("2026-08-23T09:00:01"))).toEqual([9]);
});
```

- [ ] **Step 2: Run the new test — fail then pass after adding `dueEventIds`**

Run: `npx vitest run tests/schedule.test.js`

- [ ] **Step 3: Wire the interval in `demo-app.js`**

```js
import { dueEventIds, todayStamp } from "./schedule.js";

function notifyCall(ev) {
  const title = whoName(ev.person);
  const body = t("callLine1");
  const notify = window.KayabNotify;
  if (typeof notify === "function") {
    notify({ title, body, eventId: ev.id });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body });
    n.onclick = () => openCall(ev.id);
  }
}

function tickClock(now = new Date()) {
  if (state.role !== "elder") return;
  if (state.screen !== "home") return;
  for (const id of dueEventIds(state.events, now)) {
    const ev = state.events.find((item) => item.id === id);
    if (!ev) continue;
    ev.notifiedOn = todayStamp(now);
    persist();
    notifyCall(ev);
    openCall(id);
    break;
  }
}

setInterval(() => tickClock(), 1000);
```

On first grandchild save of a filled event, request permission once:

```js
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}
```

Boot: if `?call=2`, `openCall(2)` after load (only if that event exists and is not done).

- [ ] **Step 4: Manual check**

Set an event one minute ahead, stay on elder home, wait. Call screen must open and recorded cue must play without tapping the card. Refresh must not fire a second notification the same day (`notifiedOn`).

- [ ] **Step 5: Commit**

```bash
git add js/demo-app.js js/schedule.js tests/schedule.test.js
git commit -m "feat: start การเรียกจากหลาน at the clock time"
```

---

### Task 5: PWA install

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Modify: `demo.html` (link rel=manifest, register sw)
- Modify: `index.html` only if you add a “ติดตั้งบนแท็บเล็ต” sentence in `#mobile-app`

**Interfaces:**
- Consumes: static demo assets
- Produces: standalone display starting at `demo.html`

- [ ] **Step 1: Add `manifest.webmanifest`**

```json
{
  "name": "ขยับกับหลาน",
  "short_name": "ขยับกับหลาน",
  "start_url": "./demo.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#e7eef3",
  "theme_color": "#1d4e89",
  "lang": "th",
  "icons": [
    {
      "src": "./prop_image_people/Pong/pong.jpg",
      "sizes": "512x512",
      "type": "image/jpeg",
      "purpose": "any"
    }
  ]
}
```

- [ ] **Step 2: Add `sw.js` that caches the shell, never media streams**

```js
const CACHE = "kayab-shell-v1";
const SHELL = [
  "./demo.html",
  "./css/tokens.css",
  "./css/demo.css",
  "./js/content.js",
  "./js/i18n.js",
  "./js/domain.js",
  "./js/storage.js",
  "./js/schedule.js",
  "./js/demo-app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.protocol.startsWith("blob") || url.pathname.includes("mediapipe")) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 3: Register from `demo.html`**

```html
<link rel="manifest" href="./manifest.webmanifest" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="theme-color" content="#1d4e89" />
```

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
```

Put the register call at the bottom of `js/demo-app.js`.

When `window.matchMedia("(display-mode: standalone)").matches` or `?client=app` is set, hide the story return link:

```css
body.is-standalone .back-story { display: none; }
```

```js
if (matchMedia("(display-mode: standalone)").matches || new URLSearchParams(location.search).get("client") === "app") {
  document.body.classList.add("is-standalone");
}
```

- [ ] **Step 4: Manual check**

Chrome → Install app / Add to Home Screen. Opening the icon lands on `demo.html`, not the story. Camera still works after install (HTTPS or localhost).

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest sw.js demo.html js/demo-app.js css/demo.css
git commit -m "feat: install the demo as a standalone home-screen app"
```

---

### Task 6: Story copy + midnight reset of started/done

**Files:**
- Modify: `js/content.js` (`mobileTitle`, `mobileBody`, `mobileNow`, `mobileNext`)
- Modify: `js/storage.js` + `tests/storage.test.js`
- Modify: `index.html` `#mobile-app` if it still implies a store listing

**Interfaces:**
- Consumes: `todayStamp`
- Produces: `rollDay(state, now)` — if stored `day !== today`, set every event `started/done/notifiedOn` to false/undefined, set `day`

- [ ] **Step 1: Failing test for day roll**

```js
import { rollDay } from "../js/storage.js";

it("clears started and done at local midnight without dropping the timetable", () => {
  const state = {
    version: 1,
    lang: "th",
    role: "elder",
    day: "2026-08-22",
    events: [{ id: 1, time: "10:00", person: "pong", set: [{ id: "t", ms: 10_000 }], started: true, done: true, notifiedOn: "2026-08-22" }],
    nextEventId: 2,
  };
  const rolled = rollDay(state, new Date("2026-08-23T07:00:00"));
  expect(rolled.events[0].done).toBe(false);
  expect(rolled.events[0].started).toBe(false);
  expect(rolled.events[0].notifiedOn).toBeUndefined();
  expect(rolled.events[0].time).toBe("10:00");
  expect(rolled.day).toBe("2026-08-23");
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement `rollDay` and call it inside `load()` after parse**

`emptyState` / `serialize` / `parse` must include `day` (string `YYYY-MM-DD` or `""`).

`load(getItem, now = new Date())` returns `rollDay(parse(...), now)`.

Copy (Thai):

- `mobileNow`: เปิดเดโมในเบราว์เซอร์ได้วันนี้
- `mobileNext`: ติดตั้งบนแท็บเล็ตด้วย Add to Home Screen แล้วใช้ตารางวันที่บันทึกไว้ — ยังไม่อยู่บน App Store

- [ ] **Step 4: `npm test` + commit**

```bash
git add js/storage.js js/content.js tests/storage.test.js index.html
git commit -m "feat: roll the day and tell the truth about install"
```

---

### Task 7: Capacitor scaffold (optional, last)

**Files:**
- Create: `capacitor.config.json` via CLI
- Do not rearrange `js/` or `demo.html`

**Interfaces:**
- Consumes: this folder as `webDir: "."`
- Produces: iOS/Android projects that load `demo.html`

- [ ] **Step 1: Init only if the team needs a store wrapper**

```bash
npm install @capacitor/core @capacitor/cli @capacitor/local-notifications
npx cap init "ขยับกับหลาน" com.kayab.gublan --web-dir .
```

`capacitor.config.json`:

```json
{
  "appId": "com.kayab.gublan",
  "appName": "ขยับกับหลาน",
  "webDir": ".",
  "server": { "androidScheme": "https" }
}
```

Set `window.KayabNotify` in a tiny `js/capacitor-notify.js` later; this task only inits. Do not implement iOS permission UI in this task.

- [ ] **Step 2: Commit config only**

```bash
git add capacitor.config.json package.json package-lock.json
git commit -m "chore: scaffold Capacitor for a later store wrap"
```

Skip this task if nobody needs Xcode/Android Studio yet.

---

## Self-review

- Spec coverage: persist, no preset wipe, foreground call at clock time, notify once per day, PWA start_url demo.html, no camera on disk, copy uses CONTEXT terms, Capacitor not required to finish.
- Names: `shouldSeedPreset`, `nextCall`, `shouldNotify`, `dueEventIds`, `rollDay`, `STORAGE_KEY` stay consistent across tasks.
- Website split must be done first; this plan does not recreate `app.js`.
