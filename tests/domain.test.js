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
  checkPunch,
  checkArmsUp,
  checkHandsHead,
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

  it("checkPunch is ok when a wrist is extended far from the shoulder", () => {
    const lm = Array.from({ length: 17 }, () => pt(0.5, 0.5));
    lm[11] = pt(0.4, 0.5);
    lm[12] = pt(0.6, 0.5);
    lm[15] = pt(0.05, 0.5);
    lm[16] = pt(0.62, 0.5);
    expect(checkPunch(lm).ok).toBe(true);
  });

  it("checkArmsUp is ok when both wrists are above the nose", () => {
    const lm = Array.from({ length: 17 }, () => pt(0.5, 0.5));
    lm[0] = pt(0.5, 0.3);
    lm[11] = pt(0.4, 0.5);
    lm[12] = pt(0.6, 0.5);
    lm[15] = pt(0.35, 0.15);
    lm[16] = pt(0.65, 0.15);
    expect(checkArmsUp(lm).ok).toBe(true);
  });

  it("checkHandsHead is ok when both wrists are near the nose above the shoulders", () => {
    const lm = Array.from({ length: 17 }, () => pt(0.5, 0.5));
    lm[0] = pt(0.5, 0.25, 0, 0.9);
    lm[11] = pt(0.4, 0.5);
    lm[12] = pt(0.6, 0.5);
    lm[15] = pt(0.48, 0.28);
    lm[16] = pt(0.52, 0.28);
    expect(checkHandsHead(lm).ok).toBe(true);
  });
});
