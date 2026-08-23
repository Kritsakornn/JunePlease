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
  vis,
  LANDMARKS,
} from "./domain.js";


const HOLD_MS = 4_000;
const DEFAULT_MS = 20_000;
const DURS = [10_000, 20_000, 30_000];
const WRONG_GRACE_MS = 4_500;
const WRONG_GAP_MS = 7_000;
const { NOSE, LS, RS, LE, RE, LW, RW } = LANDMARKS;
const GAIN = 2.6;

const PERSON_IDS = Object.keys(PEOPLE);

const POSE_IDS = ["t", "shoulders", "punch", "armsUp", "handsHead"];

const POSES = {
  t: {
    name: { th: "ท่าตัว T", en: "Arm T" },
    how: { th: "กางแขนออกข้าง ระดับไหล่", en: "Arms out to the sides at shoulder height" },
    hint: { th: "กางแขนออกข้างให้สุด", en: "Open both arms all the way" },
    check: POSE_CHECKS.t,
  },
  shoulders: {
    name: { th: "ท่าวาดไหล่", en: "Shoulder circles" },
    how: { th: "มือแตะหัวไหล่ แล้ววาดวงกลม", en: "Hands on shoulders, then draw circles" },
    hint: { th: "ยกมือแตะหัวไหล่", en: "Raise both hands to your shoulders" },
    check: POSE_CHECKS.shoulders,
  },
  punch: {
    name: { th: "ท่าชกสลับ", en: "Alternate punch" },
    how: { th: "ชกไปข้างหน้าทีละข้าง", en: "Punch forward one arm at a time" },
    hint: { th: "ชกแขนไปข้างหน้า", en: "Punch an arm forward" },
    check: POSE_CHECKS.punch,
  },
  armsUp: {
    name: { th: "ท่ายกแขนขึ้น", en: "Arms up" },
    how: { th: "ยกแขนทั้งสองข้างขึ้นเหนือหัว", en: "Raise both arms above your head" },
    hint: { th: "ยกแขนขึ้นให้พ้นหัว", en: "Raise both arms over your head" },
    check: POSE_CHECKS.armsUp,
  },
  handsHead: {
    name: { th: "ทามือแตะศีรษะ", en: "Hands on head" },
    how: { th: "ยกมือทั้งสองมาแตะศีรษะ", en: "Bring both hands to your head" },
    hint: { th: "ยกมือแตะหัว", en: "Touch your head with both hands" },
    check: POSE_CHECKS.handsHead,
  },
};

const state = {
  role: "elder",
  lang: "th",
  screen: "home",
  person: "pong",
  events: [],
  currentId: 0,
  poseIndex: 0,
  held: [],
  holdStarted: 0,
  poseStarted: 0,
  summary: null,
};

let nextEventId = 1;

const video = document.getElementById("cam");
const canvas = document.getElementById("dots");
const feedbackEl = document.getElementById("feedback");
const sessionEl = document.querySelector(".session");
const timerTextEl = document.querySelector("[data-bind='timer']");
const timerBarEl = document.querySelector(".timer-bar span");
const timerEl = document.querySelector(".timer");
const praiseBodyEl = document.querySelector("[data-bind='praise-body']");
const homeEmptyEl = document.getElementById("home-empty");
const homeTallyEl = document.getElementById("home-tally");
const homeCardsEl = document.getElementById("home-cards");
const todoNEl = document.querySelector("[data-bind='todo-n']");
const doneNEl = document.querySelector("[data-bind='done-n']");
const allDoneEl = document.querySelector(".tally-complete");
const eventListEl = document.getElementById("event-list");
const stepsEl = document.querySelector("[data-bind='pose-steps']");
let lastTone = "";
let lastWrongAt = 0;
let lastTick = 0;
let poseLandmarker = null;
let stream = null;
let loopId = 0;
let player = null;
let audioCtx = null;
let models = null;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function t(key, vars) {
  return tLang(state.lang, key, vars);
}

function poseText(pose, field) {
  return poseTextLang(pose, field, state.lang);
}

function whoName(key = state.person) {
  return PEOPLE[key]?.name[state.lang] || "";
}

function clockTime(value) {
  return (value || "").slice(0, 5);
}

function currentEvent() {
  return state.events.find((ev) => ev.id === state.currentId) || null;
}

function eventNeed(ev) {
  const key = eventNeedKey(ev, state.events);
  return key ? t(key) : "";
}

function currentPose() {
  const ev = currentEvent();
  const item = ev?.set[state.poseIndex];
  return item ? POSES[item.id] : null;
}

function poseMs() {
  return currentEvent().set[state.poseIndex].ms;
}

function isPlaying() {
  return Boolean(player && !player.paused && !player.ended);
}

function person() {
  return PEOPLE[state.person] || PEOPLE.pong;
}

function stopSound() {
  if (!player) return;
  player.pause();
  player.src = "";
  player = null;
}

function playSound(src) {
  stopSound();
  player = new Audio(src);
  player.volume = 1;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const node = audioCtx.createMediaElementSource(player);
    const gain = audioCtx.createGain();
    gain.gain.value = GAIN;
    node.connect(gain);
    gain.connect(audioCtx.destination);
  } catch {
    player.volume = 1;
  }
  player.play().catch(() => {});
}

function playCue(kind) {
  const list = person()[kind];
  if (!list || !list.length) return;
  playSound(pick(list));
}

/* tick() runs every frame, so only touch the DOM on a real change — otherwise the
   tone animation restarts 60 times a second and never plays */
function setFeedback(th, tone) {
  if (feedbackEl.textContent === th && lastTone === tone) return;
  feedbackEl.textContent = th;
  feedbackEl.className = `feedback tone-${tone}`;
  sessionEl.dataset.tone = tone;
  lastTone = tone;
}

function drawDots(lm, close) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const points = close ? [LS, RS, LW, RW, LE, RE] : [NOSE];
  ctx.fillStyle = close ? "rgba(21, 170, 70, 0.95)" : "rgba(255, 210, 80, 0.9)";
  for (const i of points) {
    if (!vis(lm, i)) continue;
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, close ? 12 : 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function eventCardHtml(ev, done) {
  const names = ev.set.map((item) => poseText(POSES[item.id], "name")).join("\n");
  return `<button type="button" class="card${done ? " is-done" : ""}" data-open="${ev.id}"${done ? " disabled" : ""}>
        ${done ? `<span class="card-check">${t("doneLabel")}</span>` : ""}
        <span class="card-time">${ev.time}</span>
        <span class="card-title">${t("stretchWith")} ${whoName(ev.person)}</span>
        <span class="card-poses">${names}</span>
        <span class="card-go">${done ? t("doneLabel") : t("tapToStart")}</span>
      </button>`;
}

function homeGroupHtml(title, cards) {
  return `<section class="home-group">
      <h2 class="home-group-title">${title}</h2>
      <div class="home-cards">${cards}</div>
    </section>`;
}

function renderHomeCards() {
  const list = visibleEvents(state.events);
  const todo = list.filter((ev) => !ev.done);
  const done = list.filter((ev) => ev.done);
  homeEmptyEl.hidden = list.length > 0;
  homeTallyEl.hidden = list.length === 0;
  todoNEl.textContent = String(todo.length);
  doneNEl.textContent = String(done.length);
  allDoneEl.hidden = todo.length > 0;

  let html = "";
  if (todo.length) {
    html += homeGroupHtml(t("todoLabel"), todo.map((ev) => eventCardHtml(ev, false)).join(""));
  }
  if (done.length) {
    html += homeGroupHtml(t("doneLabel"), done.map((ev) => eventCardHtml(ev, true)).join(""));
  }
  homeCardsEl.innerHTML = html;
}

function renderEventList() {
  const active = document.activeElement;
  if (active && eventListEl.contains(active) && active.matches("input[type=time]")) return;

  eventListEl.innerHTML = state.events
    .map((ev) => {
      const lock = isLocked(ev);
      const dis = lock ? " disabled" : "";
      const need = eventNeed(ev);
      const picks = PERSON_IDS.map((key) => {
        const on = ev.person === key ? " is-on" : "";
        return `<button type="button" class="pick${on}" data-person="${key}" data-event="${ev.id}"${dis}>
          <span class="avatar" data-who="${key}"></span>
          <span>${whoName(key)}</span>
        </button>`;
      }).join("");
      const poses = ev.set
        .map((item, i) => {
          const durs = DURS.map((ms) => {
            const on = item.ms === ms ? " is-on" : "";
            return `<button type="button" class="dur${on}" data-set-ms="${ms}" data-i="${i}" data-event="${ev.id}"${dis}>${ms / 1000}</button>`;
          }).join("");
          const remove = lock
            ? ""
            : `<button type="button" class="btn-remove" data-remove-pose="${i}" data-event="${ev.id}">${t("removeMove")}</button>`;
          return `<li class="set-card">
            <p class="set-card-name">${poseText(POSES[item.id], "name")}</p>
            <div class="set-card-row">
              <div class="durs">${durs}</div>
              ${remove}
            </div>
          </li>`;
        })
        .join("");
      const unused = unusedPoseIds(ev, POSE_IDS);
      const add =
        lock || unused.length === 0
          ? ""
          : `<p class="add-label">${t("addMove")}</p>
            <div class="add-poses">${unused
              .map(
                (id) =>
                  `<button type="button" class="btn-add" data-add="${id}" data-event="${ev.id}">${poseText(POSES[id], "name")}</button>`,
              )
              .join("")}</div>`;
      const removeEventBtn = lock
        ? ""
        : `<button type="button" class="btn-remove btn-remove-event" data-remove-event="${ev.id}">${t("removeEvent")}</button>`;
      const check = ev.done ? `<span class="event-check">${t("doneLabel")}</span>` : "";
      return `<article class="panel event-card${lock ? " is-locked" : ""}${ev.done ? " is-done" : ""}">
        <h2 class="panel-title">${t("startTime")} ${check}</h2>
        ${need ? `<p class="event-need">${need}</p>` : ""}
        <label class="time-field">
          <input type="time" data-time="${ev.id}" value="${ev.time}"${dis} />
        </label>
        <h2 class="panel-title">${t("pickWho")}</h2>
        <div class="picker">${picks}</div>
        <h2 class="panel-title">${t("setToday")}</h2>
        <ul class="set-cards">${poses}</ul>
        ${add}
        ${removeEventBtn}
      </article>`;
    })
    .join("");
}

function paintAvatars() {
  document.querySelectorAll(".avatar").forEach((el) => {
    const key = el.dataset.who || state.person;
    const face = PEOPLE[key];
    if (!face) {
      el.style.backgroundImage = "";
      el.classList.remove("has-photo", "is-nua", "is-yeen", "is-james");
      return;
    }
    el.textContent = "";
    el.style.backgroundImage = `url("${face.photo}")`;
    el.classList.add("has-photo");
    el.classList.toggle("is-nua", key === "nua");
    el.classList.toggle("is-yeen", key === "yeen");
    el.classList.toggle("is-james", key === "james");
  });
}

function render() {
  const pose = currentPose();
  const ev = currentEvent();
  const total = ev?.set.length || 0;
  const elderScreen = state.role === "elder" ? state.screen : "grandchild";

  for (const id of ["home", "call", "session", "praise", "grandchild"]) {
    document.getElementById(`screen-${id}`).classList.toggle("is-on", elderScreen === id);
  }
  document.querySelectorAll(".role").forEach((btn) => {
    const isOn = btn.dataset.role === state.role;
    btn.classList.toggle("is-on", isOn);
    btn.setAttribute("aria-pressed", String(isOn));
  });
  document.querySelectorAll(".lang").forEach((btn) => {
    const isOn = btn.dataset.lang === state.lang;
    btn.classList.toggle("is-on", isOn);
    btn.setAttribute("aria-pressed", String(isOn));
  });
  document.documentElement.lang = state.lang;
  document.title = t("brand");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n, { n: total });
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    el.setAttribute("alt", t(el.dataset.i18nAlt));
  });
  document.querySelectorAll("[data-person-name]").forEach((el) => {
    el.textContent = whoName(el.dataset.personName);
  });
  document.querySelectorAll("[data-bind='grandchild-name']").forEach((el) => {
    el.textContent = whoName();
  });

  renderHomeCards();
  renderEventList();
  paintAvatars();

  if (pose) {
    if (stepsEl.children.length !== total) {
      stepsEl.innerHTML = ev.set.map(() => "<span></span>").join("");
    }
    stepsEl.style.gridTemplateColumns = `repeat(${total}, 1fr)`;
    document.querySelectorAll("[data-bind='pose-index']").forEach((el) => {
      el.textContent = String(state.poseIndex + 1);
    });
    document.querySelectorAll("[data-bind='pose-name']").forEach((el) => {
      el.textContent = poseText(pose, "name");
    });
    document.querySelectorAll("[data-bind='pose-how']").forEach((el) => {
      el.textContent = poseText(pose, "how");
    });
    stepsEl.querySelectorAll("span").forEach((el, i) => {
      el.classList.toggle("is-done", Boolean(state.held[i]));
      el.classList.toggle("is-now", i === state.poseIndex);
    });
  }

  if (state.summary == null) {
    praiseBodyEl.textContent = t("praiseAll", { n: total || 1 });
  } else if (state.summary.held === state.summary.total) {
    praiseBodyEl.textContent = t("praiseAll", { n: state.summary.total });
  } else {
    praiseBodyEl.textContent = t("praiseSome", {
      n: state.summary.held,
      total: state.summary.total,
    });
  }
}

function createPresetEvent() {
  return {
    id: 1,
    time: DEMO_PRESET.time,
    person: DEMO_PRESET.person,
    set: DEMO_PRESET.set.map((item) => ({ ...item })),
    started: false,
    done: false,
  };
}

function seedDemo() {
  stopCamera();
  stopSound();
  state.role = "elder";
  state.screen = "home";
  state.person = DEMO_PRESET.person;
  state.events = [createPresetEvent()];
  state.currentId = 0;
  state.poseIndex = 0;
  state.held = [];
  state.holdStarted = 0;
  state.poseStarted = 0;
  state.summary = null;
  nextEventId = 2;
}

function go(screen) {
  const leaving = state.screen;
  state.screen = screen;
  if (leaving === "session" && screen !== "session") stopCamera();
  if (screen !== "call" && screen !== "praise") stopSound();
  render();
}

function openCall(id) {
  const ev = state.events.find((item) => item.id === id);
  if (!ev || ev.done || !isVisible(ev, state.events)) return;
  state.currentId = ev.id;
  state.person = ev.person;
  state.role = "elder";
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  go("call");
  playCue("call");
}

function finishSession() {
  const ev = currentEvent();
  if (ev) ev.done = true;
  const total = ev?.set.length || 0;
  state.summary = {
    held: state.held.filter(Boolean).length,
    total,
  };
  go("praise");
  playCue("finish");
}

function completePose(held) {
  const ev = currentEvent();
  if (!ev) return;
  state.held[state.poseIndex] = held;
  state.holdStarted = 0;
  timerEl.classList.remove("is-hold");
  if (state.poseIndex >= ev.set.length - 1) {
    finishSession();
    return;
  }
  if (held) playCue("correct");
  state.poseIndex += 1;
  state.poseStarted = performance.now();
  setFeedback(t("faceCamera"), "wait");
  drawDots(null, false);
  render();
}

function eventById(id) {
  return state.events.find((ev) => ev.id === id) || null;
}

function addEvent() {
  state.events.push({
    id: nextEventId,
    time: "",
    person: "",
    set: [],
    started: false,
    done: false,
  });
  nextEventId += 1;
  render();
}

function removeEvent(id) {
  const ev = eventById(id);
  if (!ev || isLocked(ev)) return;
  state.events = state.events.filter((item) => item.id !== id);
  if (state.currentId === id) state.currentId = 0;
  render();
}

function addPose(eventId, poseId) {
  const ev = eventById(eventId);
  if (!ev || isLocked(ev) || !POSES[poseId] || ev.set.some((item) => item.id === poseId)) return;
  ev.set.push({ id: poseId, ms: DEFAULT_MS });
  render();
}

function removePose(eventId, i) {
  const ev = eventById(eventId);
  if (!ev || isLocked(ev) || !ev.set[i]) return;
  ev.set.splice(i, 1);
  render();
}

function setPoseMs(eventId, i, ms) {
  const ev = eventById(eventId);
  if (!ev || isLocked(ev) || !DURS.includes(ms) || !ev.set[i]) return;
  ev.set[i].ms = ms;
  render();
}

function setEventPerson(eventId, key) {
  const ev = eventById(eventId);
  if (!ev || isLocked(ev) || !PEOPLE[key]) return;
  ev.person = key;
  render();
}

function setEventTime(eventId, value) {
  const ev = eventById(eventId);
  if (!ev || isLocked(ev)) return;
  ev.time = clockTime(value);
}

async function loadModels() {
  const { FilesetResolver, PoseLandmarker } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  );
  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.3,
    minPosePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options("GPU"));
  } catch {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options("CPU"));
  }
}

function getModels() {
  if (!models) {
    models = loadModels().catch((err) => {
      console.warn(err);
      return null;
    });
  }
  return models;
}

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
}

function stopCamera() {
  cancelAnimationFrame(loopId);
  loopId = 0;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  video.srcObject = null;
  drawDots(null, false);
}

function tick() {
  if (state.screen !== "session") return;
  const now = performance.now();
  const limit = poseMs();
  if (lastTick && state.holdStarted) state.poseStarted += now - lastTick;
  lastTick = now;

  const left = Math.max(0, limit - (now - state.poseStarted));
  if (left <= 0 && !state.holdStarted) {
    completePose(false);
    if (state.screen === "session") loopId = requestAnimationFrame(tick);
    return;
  }

  if (poseLandmarker && video.readyState >= 2) {
    const pose = poseLandmarker.detectForVideo(video, now);
    const lm = pose.landmarks?.[0];
    if (!lm || !hasFace(lm)) {
      state.holdStarted = 0;
      timerEl.classList.remove("is-hold");
      setFeedback(t("faceCamera"), "wait");
      drawDots(lm, false);
      timerTextEl.textContent = t("timeLeft", { n: Math.ceil(left / 1000) });
      timerBarEl.style.setProperty("--left", String(left / limit));
    } else {
      const result = currentPose().check(lm);
      drawDots(lm, result.close || result.ok);
      if (result.ok) {
        if (!state.holdStarted) state.holdStarted = now;
        const heldFor = now - state.holdStarted;
        const holdLeft = Math.max(0, HOLD_MS - heldFor);
        timerEl.classList.add("is-hold");
        setFeedback(t("hold"), "good");
        timerTextEl.textContent = t("holdLeft", { n: Math.ceil(holdLeft / 1000) });
        timerBarEl.style.setProperty("--left", String(Math.min(1, heldFor / HOLD_MS)));
        if (heldFor >= HOLD_MS) completePose(true);
      } else {
        state.holdStarted = 0;
        timerEl.classList.remove("is-hold");
        setFeedback(poseText(currentPose(), "hint"), "hint");
        timerTextEl.textContent = t("timeLeft", { n: Math.ceil(left / 1000) });
        timerBarEl.style.setProperty("--left", String(left / limit));
        if (
          now - state.poseStarted >= WRONG_GRACE_MS &&
          now - lastWrongAt >= WRONG_GAP_MS &&
          !isPlaying()
        ) {
          lastWrongAt = now;
          playCue("wrong");
        }
      }
    }
  } else {
    timerTextEl.textContent = t("timeLeft", { n: Math.ceil(left / 1000) });
    timerBarEl.style.setProperty("--left", String(left / limit));
  }

  if (state.screen === "session") loopId = requestAnimationFrame(tick);
}

async function openSession() {
  const ev = currentEvent();
  if (!ev || ev.done || !isVisible(ev, state.events)) return;
  ev.started = true;
  state.person = ev.person;
  state.poseIndex = 0;
  state.held = ev.set.map(() => false);
  state.holdStarted = 0;
  state.poseStarted = performance.now();
  lastWrongAt = 0;
  lastTick = 0;
  timerEl.classList.remove("is-hold");
  go("session");
  setFeedback(t("openingCam"), "wait");
  try {
    await startCamera();
    await getModels();
    state.poseStarted = performance.now();
    lastTick = 0;
    loopId = requestAnimationFrame(tick);
  } catch (err) {
    console.warn(err);
    setFeedback(t("camFail"), "hint");
  }
}

document.getElementById("reset-demo").addEventListener("click", () => {
  seedDemo();
  openCall(1);
});

document.querySelectorAll(".lang").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.lang = btn.dataset.lang;
    render();
  });
});

document.querySelectorAll(".role").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.role = btn.dataset.role;
    if (state.role === "grandchild" && state.screen === "session") {
      const ev = currentEvent();
      if (ev && !ev.done) ev.started = false;
      stopCamera();
    }
    if (state.role === "elder") go("home");
    else {
      stopSound();
      render();
    }
  });
});

document.getElementById("add-event").addEventListener("click", addEvent);

homeCardsEl.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) openCall(Number(open.dataset.open));
});

eventListEl.addEventListener("click", (e) => {
  const personBtn = e.target.closest("[data-person]");
  if (personBtn) {
    setEventPerson(Number(personBtn.dataset.event), personBtn.dataset.person);
    return;
  }
  const add = e.target.closest("[data-add]");
  if (add) {
    addPose(Number(add.dataset.event), add.dataset.add);
    return;
  }
  const removePoseBtn = e.target.closest("[data-remove-pose]");
  if (removePoseBtn) {
    removePose(Number(removePoseBtn.dataset.event), Number(removePoseBtn.dataset.removePose));
    return;
  }
  const dur = e.target.closest("[data-set-ms]");
  if (dur) {
    setPoseMs(Number(dur.dataset.event), Number(dur.dataset.i), Number(dur.dataset.setMs));
    return;
  }
  const removeEv = e.target.closest("[data-remove-event]");
  if (removeEv) removeEvent(Number(removeEv.dataset.removeEvent));
});

eventListEl.addEventListener("change", (e) => {
  const input = e.target.closest("[data-time]");
  if (!input) return;
  setEventTime(Number(input.dataset.time), input.value);
  render();
});

eventListEl.addEventListener("input", (e) => {
  const input = e.target.closest("[data-time]");
  if (!input) return;
  setEventTime(Number(input.dataset.time), input.value);
});

document.getElementById("start-btn").addEventListener("click", openSession);
document.getElementById("call-back").addEventListener("click", () => {
  state.currentId = 0;
  go("home");
});
document.getElementById("skip-btn").addEventListener("click", () => completePose(false));
document.getElementById("home-btn").addEventListener("click", () => go("home"));

const entry = new URLSearchParams(location.search).get("entry") || "preset";
seedDemo();
if (entry === "setup") {
  state.role = "grandchild";
  render();
} else {
  openCall(1);
}
