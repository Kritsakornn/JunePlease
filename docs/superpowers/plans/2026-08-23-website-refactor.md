# Website Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the ขยับกับหลาน story site from the working demo, with tested domain and i18n modules, without changing pose checks or session timing.

**Architecture:** Vanilla ES modules. `js/domain.js` and `js/i18n.js` have no DOM. `index.html` loads story assets only. `demo.html` loads domain, content, i18n, and `js/demo-app.js` (camera / MediaPipe / screens). CSS splits into tokens, story, and demo.

**Tech Stack:** Existing static HTML/CSS/JS, Vitest, current MediaPipe Pose Landmarker on the demo page only.

**Spec:** `docs/superpowers/specs/2026-08-23-website-refactor-design.md`

## Global Constraints

- ผู้สูงอายุ is the person on the main screens; never “user” / “คนไข้”.
- หลาน sets ตารางเวลา, ชุดท่า, and เสียงเรียก in advance; never “trainer” / “coach”.
- การเรียกจากหลาน is face + one recorded clip + one green start button; never a generic alarm sound as the primary cue.
- All poses are seated. No standing poses. No skeleton overlay.
- Camera is on-device only. Do not add upload, recording, or a backend.
- Do not change `HOLD_MS`, duration list, or pose-check thresholds.
- Thai default; English via the existing toggle. Do not mix Thai and English in one visible string.
- One app, two roles. Do not split into two URLs for elder vs grandchild.
- Keep porcelain / indigo / marigold visual identity. Green is only the start action.
- YAGNI: no React, no PWA in this plan, no persistence in this plan.

---

## File map (locked)

- Create: `package.json`, `vitest.config.js`, `js/domain.js`, `js/i18n.js`, `js/content.js`, `js/story.js`, `js/demo-app.js`, `css/tokens.css`, `css/story.css`, `css/demo.css`, `demo.html`, `tests/domain.test.js`, `tests/i18n.test.js`
- Modify: `index.html` (story only), `README.md`
- Delete after cutover: `app.js`, `site-content.js`, `styles.css` (only when the new files are wired and tests pass)
- Unchanged: `ideaMD/CONTEXT.md`, pose math, `PEOPLE` audio paths

---

### Task 1: Vitest + domain module

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `js/domain.js`
- Create: `tests/domain.test.js`

**Interfaces:**
- Consumes: pose-check bodies and event rules from current `app.js:131-269`
- Produces: `isFilled`, `isVisible`, `isLocked`, `visibleEvents`, `eventNeedKey`, `unusedPoseIds`, `vis`, `dist`, `shoulderWidth`, `hasFace`, `checkT`, `checkShoulders`, `checkPunch`, `checkArmsUp`, `checkHandsHead`, `POSE_CHECKS`, `LANDMARKS`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from "vitest";
import {
  isFilled,
  isVisible,
  isLocked,
  visibleEvents,
  eventNeedKey,
  unusedPoseIds,
  checkT,
  checkShoulders,
  hasFace,
} from "../js/domain.js";

const POSE_IDS = ["t", "shoulders", "punch", "armsUp", "handsHead"];

function ev(partial) {
  return { id: 1, time: "", person: "", set: [], started: false, done: false, ...partial };
}

describe("events", () => {
  it("is filled only with time, person, and at least one pose", () => {
    expect(isFilled(ev({}))).toBe(false);
    expect(isFilled(ev({ time: "10:00", person: "pong" }))).toBe(false);
    expect(isFilled(ev({ time: "10:00", person: "pong", set: [{ id: "t", ms: 10_000 }] }))).toBe(true);
  });

  it("hides incomplete events from the elder list", () => {
    const events = [ev({ id: 1, time: "10:00" })];
    expect(visibleEvents(events)).toEqual([]);
  });

  it("keeps only the first filled event at a duplicate time", () => {
    const a = ev({ id: 1, time: "10:00", person: "pong", set: [{ id: "t", ms: 10_000 }] });
    const b = ev({ id: 2, time: "10:00", person: "nua", set: [{ id: "punch", ms: 10_000 }] });
    expect(isVisible(a, [a, b])).toBe(true);
    expect(isVisible(b, [a, b])).toBe(false);
    expect(visibleEvents([b, a]).map((e) => e.id)).toEqual([1]);
  });

  it("sorts visible events by time", () => {
    const late = ev({ id: 2, time: "14:00", person: "pong", set: [{ id: "t", ms: 10_000 }] });
    const early = ev({ id: 1, time: "09:00", person: "nua", set: [{ id: "t", ms: 10_000 }] });
    expect(visibleEvents([late, early]).map((e) => e.time)).toEqual(["09:00", "14:00"]);
  });

  it("locks after start or done", () => {
    expect(isLocked(ev({}))).toBe(false);
    expect(isLocked(ev({ started: true }))).toBe(true);
    expect(isLocked(ev({ done: true }))).toBe(true);
  });

  it("returns need keys in order", () => {
    const empty = ev({});
    expect(eventNeedKey(empty, [empty])).toBe("needTime");
    const timed = ev({ time: "10:00" });
    expect(eventNeedKey(timed, [timed])).toBe("needPerson");
    const withPerson = ev({ time: "10:00", person: "pong" });
    expect(eventNeedKey(withPerson, [withPerson])).toBe("needMove");
    const filled = ev({ time: "10:00", person: "pong", set: [{ id: "t", ms: 10_000 }] });
    expect(eventNeedKey(filled, [filled])).toBe("");
  });

  it("returns timeTaken for the second event at the same time", () => {
    const a = ev({ id: 1, time: "10:00", person: "pong", set: [{ id: "t", ms: 10_000 }] });
    const b = ev({ id: 2, time: "10:00", person: "nua", set: [{ id: "t", ms: 10_000 }] });
    expect(eventNeedKey(b, [a, b])).toBe("timeTaken");
  });

  it("lists unused pose ids", () => {
    const e = ev({ set: [{ id: "t", ms: 10_000 }] });
    expect(unusedPoseIds(e, POSE_IDS)).toEqual(["shoulders", "punch", "armsUp", "handsHead"]);
  });
});

function pt(x, y, z = 0, visibility = 1) {
  return { x, y, z, visibility };
}

describe("pose checks", () => {
  it("hasFace is true when the nose is visible", () => {
    const lm = Array.from({ length: 17 }, () => pt(0, 0, 0, 0));
    lm[0] = pt(0.5, 0.2, 0, 0.9);
    expect(hasFace(lm)).toBe(true);
  });

  it("checkT is ok when both wrists are out at shoulder height", () => {
    const lm = Array.from({ length: 17 }, () => pt(0.5, 0.5));
    lm[11] = pt(0.4, 0.5);
    lm[12] = pt(0.6, 0.5);
    lm[15] = pt(0.1, 0.5);
    lm[16] = pt(0.9, 0.5);
    expect(checkT(lm).ok).toBe(true);
  });

  it("checkShoulders is ok when wrists are near shoulders", () => {
    const lm = Array.from({ length: 17 }, () => pt(0.5, 0.5));
    lm[11] = pt(0.4, 0.5);
    lm[12] = pt(0.6, 0.5);
    lm[15] = pt(0.41, 0.51);
    lm[16] = pt(0.59, 0.51);
    expect(checkShoulders(lm).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm install` after adding `package.json` below, then `npx vitest run tests/domain.test.js`

`package.json`:

```json
{
  "name": "kayab-gub-lan",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

`vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

Expected: FAIL with `Cannot find module '../js/domain.js'`

- [ ] **Step 3: Write `js/domain.js`**

Copy landmark helpers and `check*` functions from `app.js` unchanged. Event helpers take `events` as an argument instead of reading `state`:

```js
export const LANDMARKS = { NOSE: 0, LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16 };

export function isFilled(ev) {
  return Boolean(ev.time && ev.person && ev.set.length);
}

export function isVisible(ev, events) {
  if (!isFilled(ev)) return false;
  return events.find((other) => isFilled(other) && other.time === ev.time) === ev;
}

export function isLocked(ev) {
  return ev.started || ev.done;
}

export function visibleEvents(events) {
  return events.filter((ev) => isVisible(ev, events)).sort((a, b) => a.time.localeCompare(b.time));
}

export function eventNeedKey(ev, events) {
  if (!ev.time) return "needTime";
  if (!ev.person) return "needPerson";
  if (!ev.set.length) return "needMove";
  if (!isVisible(ev, events)) return "timeTaken";
  return "";
}

export function unusedPoseIds(ev, poseIds) {
  const used = new Set(ev.set.map((item) => item.id));
  return poseIds.filter((id) => !used.has(id));
}

export function vis(lm, i) {
  const p = lm[i];
  if (!p) return false;
  if (p.visibility === undefined || p.visibility === null) return true;
  return p.visibility > 0.2;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function shoulderWidth(lm) {
  const { LS, RS } = LANDMARKS;
  if (!vis(lm, LS) || !vis(lm, RS)) return 0.22;
  return Math.max(dist(lm[LS], lm[RS]), 0.12);
}

export function hasFace(lm) {
  return vis(lm, LANDMARKS.NOSE) || vis(lm, 2) || vis(lm, 5);
}

// Paste checkT, checkShoulders, checkPunch, checkArmsUp, checkHandsHead from app.js.
// Replace LS/RS/LE/RE/LW/RW/NOSE identifiers with LANDMARKS.* or keep local consts with the same numbers.

export const POSE_CHECKS = {
  t: checkT,
  shoulders: checkShoulders,
  punch: checkPunch,
  armsUp: checkArmsUp,
  handsHead: checkHandsHead,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.js js/domain.js tests/domain.test.js
git commit -m "test: extract event and pose domain with vitest"
```

---

### Task 2: i18n module + content move

**Files:**
- Create: `js/content.js` (move `site-content.js` unchanged, plus export `POSE_IDS` if you keep pose *copy* in content; pose *checks* stay in domain)
- Create: `js/i18n.js`
- Create: `tests/i18n.test.js`
- Modify: later tasks import these; do not delete `site-content.js` until Task 5

**Interfaces:**
- Consumes: `COPY` from content
- Produces: `t(lang, key, vars)`, `poseText(pose, field, lang)`

- [ ] **Step 1: Write the failing i18n tests**

```js
import { describe, expect, it } from "vitest";
import { COPY } from "../js/content.js";
import { t } from "../js/i18n.js";

const REQUIRED = [
  "brand",
  "tryDemo",
  "needTime",
  "needPerson",
  "needMove",
  "timeTaken",
  "callLine1",
  "start",
  "faceCamera",
  "hold",
  "skip",
  "praise",
  "gTitle",
  "mobileTitle",
];

describe("COPY", () => {
  it("has the same keys in th and en", () => {
    expect(Object.keys(COPY.th).sort()).toEqual(Object.keys(COPY.en).sort());
  });

  it("includes required keys", () => {
    for (const key of REQUIRED) {
      expect(COPY.th[key]).toBeTruthy();
      expect(COPY.en[key]).toBeTruthy();
    }
  });
});

describe("t", () => {
  it("substitutes {n}", () => {
    expect(t("th", "timeLeft", { n: 3 })).toContain("3");
    expect(t("en", "timeLeft", { n: 3 })).toContain("3");
  });

  it("does not mix scripts in brand strings", () => {
    expect(COPY.th.brand).toMatch(/ขยับ/);
    expect(COPY.en.brand).toMatch(/Kha-Yab/);
    expect(COPY.th.brand).not.toMatch(/[A-Za-z]/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/i18n.test.js`

Expected: FAIL missing `js/content.js` / `js/i18n.js`

- [ ] **Step 3: Implement**

Copy `site-content.js` to `js/content.js` (same exports).

```js
export function t(lang, key, vars) {
  let s = COPY[lang][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export function poseText(pose, field, lang) {
  return pose[field][lang];
}
```

`i18n.js` must `import { COPY } from "./content.js"`.

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS (domain + i18n)

- [ ] **Step 5: Commit**

```bash
git add js/content.js js/i18n.js tests/i18n.test.js
git commit -m "feat: move copy into tested i18n helpers"
```

---

### Task 3: Split CSS

**Files:**
- Create: `css/tokens.css`, `css/story.css`, `css/demo.css`
- Modify: none of the HTML yet (Task 4)

**Interfaces:**
- Consumes: current `styles.css`
- Produces: three stylesheets with one `.topbar` definition

- [ ] **Step 1: Create `css/tokens.css`**

Move `:root`, `*`, `html, body`, `body` background, `:focus-visible`, `[hidden]`, `.skip-link` from `styles.css` (lines 1–150). Do not include `.topbar` here.

- [ ] **Step 2: Create `css/story.css`**

Move story selectors only: `.topbar` (merge both blocks), `.brand`, `.story-nav`, `.lang`, `.btn-header-demo`, `.setup-demo-link`, `.hero`, `.inspiration-section`, `.how-section`, `.mobile-section`, `.team-section`, `.site-footer`, scroll-reveal, and the story parts of the existing media queries.

Merged `.topbar`:

```css
.topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px max(22px, calc((100% - 1076px) / 2)) 16px;
  margin-bottom: 26px;
  border-bottom: 1px solid var(--hair);
  background: rgba(231, 238, 243, 0.94);
  backdrop-filter: blur(16px);
}
```

Do not copy `.screen`, `.session`, `.home`, `.call`, `.setup`, `.btn-green` session styles into `story.css`.

- [ ] **Step 3: Create `css/demo.css`**

Move demo selectors: `.demo-actions`, `.btn-text-top`, `.roles`, `.screen`, `.home`, `.card`, `.call`, `.session`, `.watch`, `.feedback`, `.timer`, `.praise`, `.setup`, `.event-card`, stickers used on demo screens, demo media queries.

Demo header can reuse `.topbar` by importing tokens + a tiny shared header in both files, or duplicate the merged `.topbar` rule in `demo.css`. Duplicating the 15-line merged rule is better than a fourth file.

- [ ] **Step 4: Confirm no selector lives in both story and demo except `.topbar`, `.brand`, `.lang`, `.skip-link`**

Run: `rg -l "^\.session" css/` → only `css/demo.css`  
Run: `rg -l "^\.hero" css/` → only `css/story.css`

- [ ] **Step 5: Commit**

```bash
git add css/tokens.css css/story.css css/demo.css
git commit -m "refactor: split story and demo CSS"
```

---

### Task 4: Story-only `index.html` + `js/story.js`

**Files:**
- Modify: `index.html`
- Create: `js/story.js`

**Interfaces:**
- Consumes: `t`, `COPY` person names, `css/tokens.css` + `css/story.css`
- Produces: story page with no `#demo-view`

- [ ] **Step 1: Strip demo markup from `index.html`**

Keep `<div id="story-view">` sections intro → footer. Delete `<main id="demo-view">` and the demo role/reset controls. Header:

```html
<link rel="stylesheet" href="./css/tokens.css" />
<link rel="stylesheet" href="./css/story.css" />
...
<a class="btn-header-demo" href="./demo.html?entry=preset" data-i18n="tryDemo">ลองเดโม</a>
...
<a class="setup-demo-link" href="./demo.html?entry=setup" data-i18n="setupDemo">ทดลองตั้งค่าในบทบาทหลาน</a>
...
<script type="module" src="./js/story.js"></script>
```

Hero “ลองเดโม 60 วินาที” and footer CTA become the same `demo.html?entry=preset` links (anchors, not buttons).

- [ ] **Step 2: Write `js/story.js`**

```js
import { COPY } from "./content.js";
import { t } from "./i18n.js";

const state = { lang: "th" };

function paint() {
  document.documentElement.lang = state.lang;
  document.title = t(state.lang, "brand");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(state.lang, el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(state.lang, el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    el.setAttribute("alt", t(state.lang, el.dataset.i18nAlt));
  });
  document.querySelectorAll("[data-person-name]").forEach((el) => {
    const who = COPY === undefined ? "" : null;
    el.textContent = whoName(el.dataset.personName);
  });
  document.querySelectorAll(".lang").forEach((btn) => {
    const on = btn.dataset.lang === state.lang;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function whoName(key) {
  return {
    pong: { th: "ป้อง", en: "Pong" },
    nua: { th: "เหนือ", en: "Nua" },
    yeen: { th: "ยีนส์", en: "Yeen" },
    james: { th: "เจมส์", en: "James" },
  }[key][state.lang];
}
```

Use `PEOPLE[key].name[state.lang]` from `content.js` instead of the inline map above (the inline map is the expected data, not a second source of truth).

Move `initSectionTransitions` from `app.js` into `story.js`. Language buttons call `state.lang = ...; paint()`.

Do not import MediaPipe, domain pose checks, or camera code.

- [ ] **Step 3: Manual check**

Open `index.html`. Confirm: no camera prompt, Network tab has no `pose_landmarker` request, nav anchors scroll, EN toggle changes the hero, “ลองเดโม” goes to `demo.html` (404 until Task 5 is fine).

- [ ] **Step 4: Commit**

```bash
git add index.html js/story.js
git commit -m "refactor: make index.html the story site only"
```

---

### Task 5: `demo.html` + `js/demo-app.js`

**Files:**
- Create: `demo.html` (demo markup currently in `index.html` `#demo-view`, plus a demo header)
- Create: `js/demo-app.js` from current `app.js`, importing domain/i18n/content
- Delete: `app.js`, `site-content.js`, `styles.css` after the demo runs

**Interfaces:**
- Consumes: `visibleEvents`, `eventNeedKey`, `POSE_CHECKS`, `t`, `PEOPLE`, `DEMO_PRESET`
- Produces: same five screens and query `?entry=preset|setup`

- [ ] **Step 1: Add `demo.html`**

Head: tokens.css + demo.css. Body: skip link, topbar with brand link to `index.html`, lang, roles, กลับไปดูเรื่องราว (`href="./index.html"`), เริ่มเดโมใหม่. Main: the five `#screen-*` sections copied from current `index.html`. Script: `./js/demo-app.js`.

- [ ] **Step 2: Port `app.js` → `js/demo-app.js`**

Remove story functions (`showStory` as a view toggle, `initSectionTransitions`, `#story-view` painting). Replace local helpers:

```js
import { COPY, DEMO_PRESET, PEOPLE } from "./content.js";
import { t as tLang, poseText as poseTextLang } from "./i18n.js";
import {
  isFilled,
  isVisible,
  isLocked,
  visibleEvents,
  eventNeedKey,
  unusedPoseIds,
  POSE_CHECKS,
  hasFace,
} from "./domain.js";

function t(key, vars) {
  return tLang(state.lang, key, vars);
}
```

`POSES` in demo-app keeps `name/how/hint` and sets `check: POSE_CHECKS[id]`.

`eventNeed(ev)` becomes `const key = eventNeedKey(ev, state.events); return key ? t(key) : ""`.

`visibleEvents()` local wrapper: `return visibleEvents(state.events)`.

Startup:

```js
const entry = new URLSearchParams(location.search).get("entry") || "preset";
seedDemo();
if (entry === "setup") {
  state.role = "grandchild";
  render();
} else {
  openCall(1);
}
```

Keep MediaPipe loader, camera, `tick`, audio, render, and event listeners as in `app.js`.

- [ ] **Step 3: Run unit tests**

Run: `npm test`

Expected: PASS (demo-app is not unit-tested; domain still passes)

- [ ] **Step 4: Manual demo checklist**

1. `demo.html?entry=preset` → call screen, Pong voice, Start → camera → three poses → หน้าชม.
2. Role หลาน → add a second event at 14:00 → role ผู้สูงอายุ → two cards, morning first.
3. Two events at 10:00 → elder sees one; grandchild sees `timeTaken` on the second.
4. EN toggle on demo page.
5. Brand / กลับไปดูเรื่องราว returns to story.

- [ ] **Step 5: Delete dead files and commit**

```bash
git rm app.js site-content.js styles.css
git add demo.html js/demo-app.js index.html
git commit -m "refactor: isolate the working demo on demo.html"
```

---

### Task 6: Honest mobile section + README

**Files:**
- Modify: `js/content.js` keys `mobileTitle`, `mobileBody`, `mobileNow`, `mobileNext` if the current copy implies an app already exists
- Modify: `index.html` `#mobile-app` so the “กำลังพัฒนา” card links to nothing fake; optional text link to `demo.html`
- Modify: `README.md`
- Modify: `tests/i18n.test.js` if copy keys change

**Interfaces:**
- Consumes: mobile spec one-liner (PWA next; not a store app yet)
- Produces: story copy that matches reality

- [ ] **Step 1: Set copy**

Thai `mobileBody` must say the working prototype is the website demo, and the daily tablet client is the next phase. Do not say “download on the App Store”.

- [ ] **Step 2: README**

```md
# ขยับกับหลาน

Story site: `index.html`
Working prototype: `demo.html`

npm test
```

- [ ] **Step 3: `npm test` and commit**

```bash
git add js/content.js index.html README.md tests/i18n.test.js
git commit -m "docs: describe web demo vs next mobile phase"
```

---

## Self-review

- Spec coverage: split pages, domain tests, CSS split, no MediaPipe on story, identity kept, demo behavior unchanged, mobile copy honest.
- No placeholders in tasks.
- Names: `eventNeedKey` / `visibleEvents(events)` / `POSE_CHECKS` used the same way in Tasks 1 and 5.
