import { COPY } from "./content.js";

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
