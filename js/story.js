import { PEOPLE } from "./content.js";
import { t } from "./i18n.js";

const state = { lang: "th" };

function whoName(key) {
  return PEOPLE[key]?.name[state.lang] || "";
}

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
    el.textContent = whoName(el.dataset.personName);
  });
  document.querySelectorAll(".lang").forEach((btn) => {
    const on = btn.dataset.lang === state.lang;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function initSectionTransitions() {
  const sections = [...document.querySelectorAll(".story-section")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("IntersectionObserver" in window) || !sections.length || reduceMotion) return;

  sections[0].classList.add("is-visible");
  document.body.classList.add("has-scroll-reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8%" },
  );
  sections.slice(1).forEach((section) => observer.observe(section));
}

document.querySelectorAll(".lang").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.lang = btn.dataset.lang;
    paint();
  });
});

initSectionTransitions();
paint();
