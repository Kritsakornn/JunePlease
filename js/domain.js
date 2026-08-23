export const LANDMARKS = { NOSE: 0, LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16 };

export function isFilled(ev) {
  return Boolean(ev.time && ev.person && ev.set.length);
}

export function isVisible(ev, events) {
  if (!isFilled(ev)) return false;
  const first = events
    .filter((other) => isFilled(other) && other.time === ev.time)
    .reduce((winner, other) => (winner === null || other.id < winner.id ? other : winner), null);
  return first === ev;
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

export function checkT(lm) {
  const { LS, RS, LE, RE, LW, RW } = LANDMARKS;
  const sw = shoulderWidth(lm);
  const left = vis(lm, LW) ? lm[LW] : vis(lm, LE) ? lm[LE] : null;
  const right = vis(lm, RW) ? lm[RW] : vis(lm, RE) ? lm[RE] : null;
  if (!vis(lm, LS) || !vis(lm, RS) || !left || !right) {
    return { ok: false, close: false };
  }
  const leftOut = Math.abs(left.x - lm[LS].x);
  const rightOut = Math.abs(right.x - lm[RS].x);
  const leftLevel = Math.abs(left.y - lm[LS].y) < sw * 1.1;
  const rightLevel = Math.abs(right.y - lm[RS].y) < sw * 1.1;
  const close = leftOut > sw * 0.45 && rightOut > sw * 0.45;
  const ok = leftOut > sw * 0.7 && rightOut > sw * 0.7 && leftLevel && rightLevel;
  return { ok, close };
}

export function checkShoulders(lm) {
  const { LS, RS, LE, RE, LW, RW } = LANDMARKS;
  if (!vis(lm, LS) || !vis(lm, RS)) return { ok: false, close: false };
  const sw = shoulderWidth(lm);
  const leftHand = vis(lm, LW) ? lm[LW] : vis(lm, LE) ? lm[LE] : null;
  const rightHand = vis(lm, RW) ? lm[RW] : vis(lm, RE) ? lm[RE] : null;
  if (!leftHand || !rightHand) return { ok: false, close: false };
  const dL = dist(leftHand, lm[LS]);
  const dR = dist(rightHand, lm[RS]);
  return { ok: dL < sw * 0.7 && dR < sw * 0.7, close: dL < sw && dR < sw };
}

export function checkPunch(lm) {
  const { LS, RS, LE, RE, LW, RW } = LANDMARKS;
  if (!vis(lm, LS) || !vis(lm, RS)) return { ok: false, close: false };
  const sw = shoulderWidth(lm);
  const left = vis(lm, LW) ? lm[LW] : vis(lm, LE) ? lm[LE] : null;
  const right = vis(lm, RW) ? lm[RW] : vis(lm, RE) ? lm[RE] : null;
  if (!left || !right) return { ok: false, close: false };
  const leftLen = dist(left, lm[LS]);
  const rightLen = dist(right, lm[RS]);
  const leftFwd = (lm[LS].z ?? 0) - (left.z ?? 0);
  const rightFwd = (lm[RS].z ?? 0) - (right.z ?? 0);
  const punching =
    leftLen > sw * 1.05 ||
    rightLen > sw * 1.05 ||
    leftFwd > 0.06 ||
    rightFwd > 0.06;
  return { ok: punching, close: leftLen > sw * 0.7 || rightLen > sw * 0.7 };
}

export function checkArmsUp(lm) {
  const { NOSE, LS, RS, LE, RE, LW, RW } = LANDMARKS;
  if (!vis(lm, LS) || !vis(lm, RS)) return { ok: false, close: false };
  const sw = shoulderWidth(lm);
  const left = vis(lm, LW) ? lm[LW] : vis(lm, LE) ? lm[LE] : null;
  const right = vis(lm, RW) ? lm[RW] : vis(lm, RE) ? lm[RE] : null;
  if (!left || !right) return { ok: false, close: false };
  const top = vis(lm, NOSE) ? lm[NOSE].y : Math.min(lm[LS].y, lm[RS].y) - sw * 0.4;
  const leftUp = top - left.y;
  const rightUp = top - right.y;
  return {
    ok: leftUp > sw * 0.2 && rightUp > sw * 0.2,
    close: leftUp > 0 && rightUp > 0,
  };
}

export function checkHandsHead(lm) {
  const { NOSE, LS, RS, LE, RE, LW, RW } = LANDMARKS;
  if (!vis(lm, LS) || !vis(lm, RS) || !hasFace(lm)) return { ok: false, close: false };
  const sw = shoulderWidth(lm);
  const left = vis(lm, LW) ? lm[LW] : vis(lm, LE) ? lm[LE] : null;
  const right = vis(lm, RW) ? lm[RW] : vis(lm, RE) ? lm[RE] : null;
  if (!left || !right) return { ok: false, close: false };
  const nose = lm[NOSE];
  const dL = dist(left, nose);
  const dR = dist(right, nose);
  const above = left.y < lm[LS].y && right.y < lm[RS].y;
  return {
    ok: above && dL < sw * 0.8 && dR < sw * 0.8,
    close: above && dL < sw * 1.15 && dR < sw * 1.15,
  };
}

export const POSE_CHECKS = {
  t: checkT,
  shoulders: checkShoulders,
  punch: checkPunch,
  armsUp: checkArmsUp,
  handsHead: checkHandsHead,
};
