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
