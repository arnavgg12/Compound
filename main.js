/* ============================================================
   COMPOUND — choreography
   One rAF conducts everything: scroll → day → field → HUD.
   ============================================================ */
"use strict";

/* ---------- config (replace with real handles before launch) ---------- */
const WHATSAPP_NUMBER = "919999999999"; // TODO: real WhatsApp Business number, country code, no '+'
const EMAIL = "hello@compound.in"; // TODO: real address
const FOUNDER = "Arnav"; // first name used in the prefill

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = window.matchMedia("(pointer: fine)").matches;
/* phones get their own physics: 1:1 touch tracking, no boot curtain,
   featherweight rendering — desktop keeps the cinema */
const MOBILE = window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 760px)").matches;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- contact links ---------- */
/* a message a dignified owner would actually send unedited — and that
   hands Compound qualifying context. Category set by the finale chips. */
let waCategory = "";
function waMessage() {
  const cat = waCategory ? ` I run ${waCategory},` : "";
  return `Hi Compound — I came across your site.${cat} I'd like to talk about a growth engine for my city.`;
}
function buildWaHref() {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMessage())}`;
}
const waTargets = ["waMain", "waNav", "waDemo"].map((id) => document.getElementById(id)).filter(Boolean);
function syncWa() {
  const href = buildWaHref();
  waTargets.forEach((a) => (a.href = href));
}
syncWa();

const mail = document.getElementById("mailLink");
mail.href = `mailto:${EMAIL}?subject=${encodeURIComponent("A growth engine for my business")}`;
mail.textContent = EMAIL;

/* category chips on the finale pre-qualify the very first WhatsApp message */
document.querySelectorAll(".catchip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const on = chip.classList.contains("is-on");
    document.querySelectorAll(".catchip").forEach((c) => c.classList.remove("is-on"));
    if (!on) { chip.classList.add("is-on"); waCategory = chip.dataset.cat; }
    else { waCategory = ""; }
    syncWa();
  });
});

/* ---------- boot ---------- */
/* sessionStorage throws under "block all cookies" / partitioned webviews —
   an unguarded read here would strand the visitor behind the boot overlay */
const safeStorage = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* boot replays */ } },
};

let choreoStarted = false; /* must precede the boot IIFE — its early-return
  path calls startChoreography() synchronously (TDZ otherwise) */

const boot = document.getElementById("boot");
(function runBoot() {
  if (REDUCED || MOBILE || safeStorage.get("compound-booted")) {
    boot.remove();
    startChoreography();
    return;
  }
  document.body.classList.add("is-booting");
  safeStorage.set("compound-booted", "1"); /* set at start — failsafe paths
    and storage-less sessions must not replay the curtain forever */
  const eq = document.getElementById("bootEq");
  const T = 550; /* the brand moment survives at half the wait */
  const t0 = performance.now();
  let iv = 0;
  const finishBoot = () => {
    clearInterval(iv);
    if (!document.body.contains(boot)) return;
    boot.classList.add("done");
    document.body.classList.remove("is-booting");
    startChoreography(); /* hero entrance rises as the curtain fades */
    if (engine) engine.burst(); /* the year arrives with a pulse */
    shudderHero(); /* …and the headline feels it */
    setTimeout(() => boot.remove(), 800);
  };
  /* setInterval, not rAF — must run even in throttled webviews */
  iv = setInterval(() => {
    const p = clamp((performance.now() - t0) / T, 0, 1);
    const exp = Math.max(1, Math.round(p * 365));
    eq.innerHTML = `1.01<sup>${exp}</sup> = ${Math.pow(1.01, exp).toFixed(2)}`;
    if (p >= 1) {
      clearInterval(iv);
      setTimeout(finishBoot, 120);
    }
  }, 16);
  /* any input skips the curtain; the timeout is the failsafe */
  ["scroll", "keydown", "pointerdown", "wheel"].forEach((ev) =>
    addEventListener(ev, finishBoot, { once: true, passive: true })
  );
  setTimeout(finishBoot, 2200);
})();

/* ---------- the field ---------- */
/* engine creation (context + 5 shader programs + particle scatter) is
   ~50-150ms on low-end phones — keep it off the first-paint path. The
   conductor null-checks `engine` everywhere, so late binding is free. */
const canvas = document.getElementById("field");
let engine = null;
function initEngine() {
  if (engine) return;
  engine = window.CompoundEngine
    ? window.CompoundEngine.create(canvas, { reduced: REDUCED, lite: MOBILE })
    : null;
  if (!engine) canvas.style.display = "none";
}
const engineFallback = setTimeout(initEngine, 300); /* suspended-rAF webviews */
requestAnimationFrame(() => requestAnimationFrame(() => {
  clearTimeout(engineFallback);
  initEngine();
}));

/* ---------- nav scrolled state ---------- */
const nav = document.getElementById("nav");

/* ---------- sections → days ---------- */
let sections = [];
let docH = 0; /* cached — reading scrollHeight per frame forces layout */
function measure() {
  docH = document.body.scrollHeight;
  sections = [...document.querySelectorAll(".ch")].map((el) => {
    const [a, b] = el.dataset.days.split(",").map(Number);
    return {
      top: el.offsetTop,
      h: Math.max(el.offsetHeight, 1),
      a, b,
      beh: +el.dataset.beh,
      tag: el.dataset.tag,
      paper: el.classList.contains("ch--paper"),
    };
  });
}
measure();

let measureQueued = false;
new ResizeObserver(() => {
  if (measureQueued) return;
  measureQueued = true;
  /* content growth (demo result etc.) shifts section tops — remeasure
     only; the conductor's viewport poll handles real engine resizes */
  setTimeout(() => {
    measureQueued = false;
    measure();
  }, 80);
}).observe(document.body);

/* ---------- HUD elements ---------- */
const dayNum = document.getElementById("dayNum");
const chapterTag = document.getElementById("chapterTag");
const liveExp = document.getElementById("liveExp");
const liveRes = document.getElementById("liveRes");

let dayOverride = false; /* CTA hover flips the counter to 001 */

/* ---------- field dim + HUD yielding ---------- */
/* the field yields the stage wherever dense text lives — the demo, and
   the late chapters where the grown sun would sit behind the copy */
let dimTarget = 1, dimCur = 1;
const demoStage = document.querySelector(".demo__stage");
const DIM_FOR = [
  [demoStage, 0.32],
  [document.getElementById("compound"), 0.55],
  [document.getElementById("proof"), 0.38],
  [document.getElementById("terms"), 0.38],
];
const dimVis = new Map();
const dimIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) dimVis.set(e.target, e.isIntersecting);
    let d = 1;
    for (const [el, v] of DIM_FOR) if (dimVis.get(el)) d = Math.min(d, v);
    dimTarget = d;
  },
  { threshold: 0.15 }
);
DIM_FOR.forEach(([el]) => dimIO.observe(el));
/* hud--yield (the counter leaving the stage over paper pages) is driven
   by the conductor's scroll math, not IO — IO can starve in webviews */

/* the fixed day counter must not sit on the brass tape or colophon */
const endVis = new Map();
const endIO = new IntersectionObserver((entries) => {
  for (const e of entries) endVis.set(e.target, e.isIntersecting);
  document.body.classList.toggle("hud--end", [...endVis.values()].some(Boolean));
}, { threshold: 0 });
document.querySelectorAll(".tape, .colophon").forEach((el) => endIO.observe(el));

/* ---------- pointer ---------- */
let ptrX = -9999, ptrY = -9999, ptrOn = false;
addEventListener("pointermove", (e) => {
  ptrX = e.clientX;
  ptrY = e.clientY;
  ptrOn = true;
}, { passive: true });
addEventListener("pointerdown", (e) => {
  /* mouse only — on touch this fired a particle shockwave under the
     thumb at the start of every scroll flick */
  if (engine && !REDUCED && e.pointerType === "mouse") engine.pulse(e.clientX, e.clientY);
}, { passive: true });

/* ---------- the conductor ---------- */
let smooth = window.scrollY;
let lastScroll = smooth;
let lastT = performance.now();
let lastTag = "";
let lastDayShown = -1;
let titleAt = 0;
let lastVW = 0, lastVH = 0;
let lastLiveDay = -1;
let lastPaper = null;

/* the tab-title day-counter is a flourish for humans; gate it behind a
   genuine scroll so Googlebot (which renders JS but never scrolls)
   snapshots the static keyworded title */
let userEngaged = false;
const markEngaged = () => { userEngaged = true; };
addEventListener("scroll", markEngaged, { once: true, passive: true });
addEventListener("pointerdown", markEngaged, { once: true, passive: true });
addEventListener("keydown", markEngaged, { once: true });

/* cursor state (moved inside the conductor so one loop drives everything) */
const cursorOn = FINE_POINTER && !REDUCED;
const cursorEl = document.getElementById("cursor");
const HOVER = "a, button, .chip, .viz__chip";
let curX = -100, curY = -100;
if (cursorOn) document.body.classList.add("has-cursor");

function dayAt(sc) {
  if (!sections.length) return { day: 0, beh: 0, tag: "" };
  const first = sections[0];
  if (sc < first.top) return { day: 0, beh: first.beh, tag: first.tag, paper: false };
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    /* boundary = next section's top: offsetTop/offsetHeight round
       independently, and a 1px gap here would flash day 365 mid-page */
    const end = i + 1 < sections.length ? sections[i + 1].top : s.top + s.h;
    if (sc < end) {
      const t = clamp((sc - s.top) / Math.max(end - s.top, 1), 0, 1);
      return { day: lerp(s.a, s.b, t), beh: s.beh, tag: s.tag, paper: s.paper };
    }
  }
  const last = sections[sections.length - 1];
  return { day: 365, beh: last.beh, tag: last.tag, paper: last.paper };
}

/* rAF + setTimeout watchdog race: some webviews (in-app browsers,
   embedded panels) throttle or suspend rAF entirely — the timeout
   keeps the year alive at ~18fps there, rAF wins at 60 elsewhere. */
let rafId = 0, toId = 0;
function schedule() {
  rafId = requestAnimationFrame(frame);
  toId = setTimeout(() => {
    cancelAnimationFrame(rafId);
    frame(performance.now());
  }, 60);
}

function frame(now) {
  clearTimeout(toId);

  /* hidden tab: the rAF side stops on its own, but the watchdog would
     keep simulating at 16fps forever — idle at 2.5fps instead, and snap
     the smoothed scroll so the return isn't a catch-up cruise */
  if (document.hidden) {
    lastT = now;
    smooth = lastScroll = window.scrollY;
    toId = setTimeout(() => frame(performance.now()), 400);
    return;
  }

  const dt = clamp((now - lastT) / 1000, 0.001, 0.05);
  lastT = now;

  /* viewport poll — ResizeObserver can stall in suspended docs.
     Ignore small height-only deltas: the mobile URL bar fires them on
     every scroll flick, and a full engine rebuild per flick = stutter. */
  if (innerWidth !== lastVW || Math.abs(innerHeight - lastVH) > 150) {
    lastVW = innerWidth;
    lastVH = innerHeight;
    measure();
    if (engine) engine.resize();
  }

  /* smooth scroll value — desktop only. On touch, anything that lags
     the finger reads as broken: phones track scroll 1:1. */
  const target = window.scrollY;
  smooth += (target - smooth) * (REDUCED || MOBILE ? 1 : 0.12);
  const vel = smooth - lastScroll;
  lastScroll = smooth;

  /* anchor at viewport top: day 000 at rest, chapter handoff exactly
     when the next pinned headline takes the screen */
  const sc = smooth + 1;
  let { day, beh, tag, paper } = dayAt(sc);
  /* the year must complete at the absolute bottom even when the page
     tail is shorter than the viewport */
  if (target + innerHeight >= docH - 4) day = 365;
  const d = Math.round(day);

  /* HUD — phones skip the per-frame skew and rail churn; the main
     thread must stay free for compositor scrolling */
  if (dayOverride) {
    if (dayNum.textContent !== "001") dayNum.textContent = "001";
    lastDayShown = -1; /* force a rewrite when the override lifts */
  } else if (d !== lastDayShown) {
    lastDayShown = d;
    dayNum.textContent = String(d).padStart(3, "0");
  }
  if (!REDUCED && !MOBILE) dayNum.style.transform = `skewX(${clamp(-vel * 0.18, -9, 9)}deg)`;
  if (tag !== lastTag) {
    lastTag = tag;
    chapterTag.textContent = tag;
  }
  if (paper !== lastPaper) {
    lastPaper = paper;
    document.body.classList.toggle("hud--yield", paper);
  }
  nav.classList.toggle("is-scrolled", target > 32);

  /* live equation (compound chapter) — only on integer-day change */
  if (day >= 150 && day <= 290 && d !== lastLiveDay) {
    lastLiveDay = d;
    liveExp.textContent = d;
    liveRes.textContent = Math.pow(1.01, d).toFixed(2);
  }

  /* tab title — only after a real human scroll, so crawlers keep the
     static keyworded <title> instead of indexing "Day 000 of 365" */
  if (userEngaged && now - titleAt > 600) {
    titleAt = now;
    const t = dayOverride ? "Day 001 — Compound" : `Day ${String(d).padStart(3, "0")} of 365 — Compound`;
    if (document.title !== t) document.title = t;
  }

  /* cursor follows in the same loop */
  if (cursorOn) {
    curX += (ptrX - curX) * 0.22;
    curY += (ptrY - curY) * 0.22;
    cursorEl.style.transform = `translate(${curX}px, ${curY}px)`;
    /* the element under the pointer can vanish without a pointer event
       (chat chips are removed on click) — validate while grown */
    if (cursorEl.classList.contains("grow")) {
      const under = document.elementFromPoint(ptrX, ptrY);
      if (!under || !under.closest(HOVER)) cursorEl.classList.remove("grow");
    }
  }

  /* the field */
  if (engine) {
    dimCur += (dimTarget - dimCur) * 0.07;
    engine.setState({
      day,
      beh,
      dim: dimCur,
      pointerX: ptrX,
      pointerY: ptrY,
      pointerOn: ptrOn,
      scrollVel: vel,
    });
    engine.frame(dt);
  }

  schedule();
}
schedule();

document.addEventListener("visibilitychange", () => {
  /* resume instantly and without a dt spike when the tab returns */
  if (!document.hidden) {
    clearTimeout(toId);
    cancelAnimationFrame(rafId);
    lastT = performance.now();
    schedule();
  }
});

/* ---------- CTA hover: the year restarts ---------- */
/* mouse only — touch taps fire enter without a matching leave and
   would freeze the counter at 001 after returning from WhatsApp */
waMain.addEventListener("pointerenter", (e) => {
  if (e.pointerType !== "mouse") return;
  dayOverride = true;
  dayNum.classList.add("is-one");
  if (engine) engine.burst();
});
waMain.addEventListener("pointerleave", (e) => {
  if (e.pointerType !== "mouse") return;
  dayOverride = false;
  dayNum.classList.remove("is-one");
});

/* the last touch they make gets the sunrise: tapping the CTA fires the
   burst and flips the counter to Day 001 while WhatsApp opens */
waMain.addEventListener("click", () => {
  if (engine) engine.burst();
  dayOverride = true;
  dayNum.classList.add("is-one");
  setTimeout(() => {
    dayOverride = false;
    dayNum.classList.remove("is-one");
  }, 1600);
});

/* ---------- kinetic titles + reveals ---------- */
/* stagger indices are set immediately… */
document.querySelectorAll(".kin").forEach((kin) => {
  kin.querySelectorAll(".kw i").forEach((w, i) => w.style.setProperty("--i", i));
});
document.querySelectorAll(".ch__inner, .colophon").forEach((scope) => {
  scope.querySelectorAll(".reveal").forEach((el, i) => {
    el.style.setProperty("--d", `${Math.min(i * 90, 450)}ms`);
  });
});

/* the signature: 1.01^n races to 365 in the hero, for everyone */
const heroExp = document.getElementById("heroExp");
const heroRes = document.getElementById("heroRes");
let heroEqIv = null;
function runHeroEq() {
  if (REDUCED) return;
  clearInterval(heroEqIv);
  const T = 2000;
  const t0 = performance.now();
  heroEqIv = setInterval(() => {
    const p = clamp((performance.now() - t0) / T, 0, 1);
    const exp = Math.max(1, Math.round(p * 365));
    heroExp.textContent = exp;
    heroRes.textContent = Math.pow(1.01, exp).toFixed(2);
    if (p >= 1) clearInterval(heroEqIv);
  }, 16);
}
/* the cross-universe touch: when the field bursts, the type feels it */
function shudderHero() {
  if (REDUCED) return;
  const h = document.querySelector(".kin--hero");
  if (!h) return;
  h.classList.remove("is-shudder");
  void h.offsetWidth; /* restart the animation */
  h.classList.add("is-shudder");
}

function heroMoment() {
  runHeroEq();
  if (engine && !REDUCED) engine.burst();
  shudderHero();
}
const heroEqEl = document.getElementById("heroEq");
heroEqEl.addEventListener("click", heroMoment);
heroEqEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); heroMoment(); }
});

/* …but observation waits for the boot curtain, else the hero entrance
   plays unseen behind the opaque overlay on every first visit */
function startChoreography() {
  if (choreoStarted) return;
  choreoStarted = true;
  setTimeout(runHeroEq, 500);
  const enterIO = (threshold, rootMargin) =>
    new IntersectionObserver(
      (entries, io) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold, rootMargin }
    );
  /* throttled webviews can starve IO delivery — anything already on
     screen reveals immediately, observers cover the rest */
  const seedNow = (el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) el.classList.add("is-in");
  };
  const kinIO = enterIO(0.3);
  document.querySelectorAll(".kin").forEach((el) => { kinIO.observe(el); seedNow(el); });
  const revealIO = enterIO(0.15, "0px 0px -4% 0px");
  document.querySelectorAll(".reveal").forEach((el) => { revealIO.observe(el); seedNow(el); });
}

/* ---------- cursor hover states (movement lives in the conductor) ---------- */
if (cursorOn) {
  const tagEl = document.getElementById("cursorTag");
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest(HOVER);
    if (t) {
      cursorEl.classList.add("grow");
      tagEl.textContent = t.dataset.cursor || "";
    } else {
      cursorEl.classList.remove("grow");
    }
  });
  /* leaving a target without entering another (window edge, scrollbar) */
  document.addEventListener("pointerout", (e) => {
    const to = e.relatedTarget;
    if (!to || !(to.closest && to.closest(HOVER))) cursorEl.classList.remove("grow");
  });
  /* hide the ring while the pointer is outside the window */
  document.documentElement.addEventListener("pointerleave", () => {
    cursorEl.classList.add("is-out");
  });
  document.documentElement.addEventListener("pointerenter", (e) => {
    ptrX = e.clientX;
    ptrY = e.clientY;
    curX = ptrX; /* snap — don't lerp across the screen from a stale spot */
    curY = ptrY;
    cursorEl.classList.remove("is-out");
  });
}

/* ============================================================
   THE DEMO — a playable replica of Engine №001
   ============================================================ */

const chatLog = document.getElementById("chatLog");
const chatScroll = document.getElementById("chatScroll");
const chatChips = document.getElementById("chatChips");
const chatStatus = document.getElementById("chatStatus");
const chatTimer = document.getElementById("chatTimer");
const demoResult = document.getElementById("demoResult");
const finalTime = document.getElementById("finalTime");

const VIZ_COLORS = {
  "Terracotta lime-wash": "#c4795b",
  "Sage velvet": "#a9b49a",
  "Slate blue": "#8694a8",
};

const VIZ_SVG = `
<svg class="viz__room" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustrated living room with a recolorable wall">
  <rect class="viz__wall" x="0" y="0" width="320" height="156" fill="#c4795b"/>
  <rect x="0" y="156" width="320" height="44" fill="#c9a87c"/>
  <rect x="0" y="156" width="320" height="3" fill="rgba(46,41,32,.18)"/>
  <ellipse cx="160" cy="182" rx="118" ry="13" fill="rgba(250,247,240,.32)"/>
  <g stroke="#8a6532" stroke-width="2" fill="#faf7f0">
    <rect x="36" y="34" width="52" height="66"/>
  </g>
  <rect x="44" y="42" width="36" height="50" fill="#a9b49a" opacity=".75"/>
  <rect x="208" y="120" width="10" height="42" fill="#3a342b"/>
  <ellipse cx="213" cy="118" rx="26" ry="5" fill="#3a342b"/>
  <path d="M213 116 C 206 96, 196 92, 192 80 M213 116 C 214 94, 222 90, 226 76 M213 116 C 208 100, 218 98, 213 84" stroke="#6f7d5c" stroke-width="4" fill="none" stroke-linecap="round"/>
  <g>
    <rect x="96" y="118" width="120" height="44" rx="9" fill="#3a342b"/>
    <rect x="88" y="108" width="16" height="54" rx="7" fill="#332d25"/>
    <rect x="208" y="108" width="16" height="54" rx="7" fill="#332d25"/>
    <rect x="104" y="106" width="50" height="26" rx="6" fill="#464033"/>
    <rect x="158" y="106" width="50" height="26" rx="6" fill="#464033"/>
    <rect x="118" y="112" width="26" height="20" rx="5" fill="#c2914c"/>
    <rect x="100" y="162" width="6" height="14" fill="#26211a"/>
    <rect x="206" y="162" width="6" height="14" fill="#26211a"/>
  </g>
</svg>`;

let demoStarted = false;
let timerInt = null;
let timerStart = null;
let elapsed = 0;
let pending = [];

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function startTimer() {
  if (timerStart) return;
  timerStart = Date.now();
  timerInt = setInterval(() => {
    elapsed = Math.round((Date.now() - timerStart) / 1000);
    chatTimer.textContent = fmt(elapsed);
  }, 400);
}
function stopTimer() {
  clearInterval(timerInt);
  if (timerStart) elapsed = Math.round((Date.now() - timerStart) / 1000);
  chatTimer.textContent = fmt(elapsed);
}

function scrollChat() {
  /* immediate + settle pass — no rAF, it stalls in throttled webviews */
  chatScroll.scrollTop = chatScroll.scrollHeight;
  setTimeout(() => { chatScroll.scrollTop = chatScroll.scrollHeight; }, 60);
}

function stamp() {
  return new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function addNote(text) {
  const el = document.createElement("p");
  el.className = "msg msg--note";
  el.textContent = text;
  chatLog.appendChild(el);
  scrollChat();
}

function addOut(text) {
  const el = document.createElement("div");
  el.className = "msg msg--out";
  el.innerHTML = `${text}<span class="msg__meta" aria-hidden="true">${stamp()} <span class="msg__ticks">✓✓</span></span>`;
  chatLog.appendChild(el);
  scrollChat();
}

function addIn(html, wide = false) {
  const el = document.createElement("div");
  el.className = "msg msg--in" + (wide ? " msg--wide" : "");
  el.innerHTML = `${html}<span class="msg__meta" aria-hidden="true">${stamp()}</span>`;
  chatLog.appendChild(el);
  scrollChat();
  return el;
}

function setTyping(on) {
  chatStatus.textContent = on ? "typing…" : "online";
  chatStatus.classList.toggle("is-typing", on);
}

function wait(ms) {
  return new Promise((res) => {
    const id = setTimeout(res, REDUCED ? Math.min(ms, 220) : ms);
    pending.push(id);
  });
}

async function botSays(html, { wide = false, pre = 420 } = {}) {
  await wait(pre);
  setTyping(true);
  const t = document.createElement("div");
  t.className = "msg msg--in msg--typing";
  t.setAttribute("aria-hidden", "true");
  t.innerHTML = "<i></i><i></i><i></i>";
  chatLog.appendChild(t);
  scrollChat();
  const text = html.replace(/<[^>]+>/g, "");
  await wait(Math.min(2000, 480 + text.length * 13));
  t.remove();
  setTyping(false);
  return addIn(html, wide);
}

let kbDemo = false; /* keyboard users get focus moved to each new chip set */

function offerChips(options) {
  chatChips.innerHTML = "";
  return new Promise((resolve) => {
    options.forEach((label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = label;
      b.addEventListener("click", (e) => {
        kbDemo = e.detail === 0; /* keyboard activation */
        startTimer();
        chatChips.innerHTML = "";
        addOut(label);
        resolve(label);
      });
      chatChips.appendChild(b);
    });
    if (kbDemo) {
      const first = chatChips.querySelector(".chip");
      if (first) first.focus();
    }
    scrollChat();
  });
}

function chipsHint(text) {
  chatChips.innerHTML = `<span class="chips__hint">${text}</span>`;
}

function vizCard() {
  return new Promise(async (resolve) => {
    const bubble = await botSays(
      `<span class="viz">
         <span class="viz__title">Pick a finish — watch the wall change:</span>
         ${VIZ_SVG}
         <span class="viz__chips">
           ${Object.keys(VIZ_COLORS).map((n) => `<button type="button" class="viz__chip">${n}</button>`).join("")}
         </span>
         <span class="viz__caption">live preview · engine renders these on photos of your actual room</span>
       </span>`,
      { wide: true }
    );
    chipsHint("tap a finish above ↑");
    const wall = bubble.querySelector(".viz__wall");
    const chips = bubble.querySelectorAll(".viz__chip");
    let settle = null;
    let picked = null;
    if (kbDemo && chips[0]) chips[0].focus();
    chips.forEach((chip) => {
      chip.addEventListener("click", (e) => {
        kbDemo = e.detail === 0;
        startTimer();
        picked = chip.textContent;
        wall.setAttribute("fill", VIZ_COLORS[picked]);
        chips.forEach((c) => c.classList.toggle("is-on", c === chip));
        clearTimeout(settle);
        settle = setTimeout(() => {
          chips.forEach((c) => (c.disabled = true));
          chatChips.innerHTML = "";
          resolve(picked);
        }, REDUCED ? 300 : 1500);
        pending.push(settle);
      });
    });
  });
}

function bookingCard(slotLabel) {
  const [day, time] = slotLabel.split(" · ");
  addIn(
    `<span class="booking">
       <span class="booking__when">${day} · ${time}</span>
       <span class="booking__what">Video consult · 25 min · with Ananya, Principal Designer</span>
       <span class="booking__checks">
         <span>Calendar invite sent</span>
         <span>Reminder set, one hour before</span>
         <span>Your choices already in Ananya&rsquo;s brief</span>
       </span>
     </span>`,
    true
  );
}

async function runDemo() {
  chatLog.innerHTML = "";
  chatChips.innerHTML = "";
  demoResult.hidden = true;
  timerStart = null;
  elapsed = 0;
  chatTimer.textContent = "0:00";
  setTyping(false);

  addNote("A working demonstration of the funnel we build for premium interiors studios — fictional studio, real mechanics. You play the customer. The clock starts when you reply.");

  await botSays("Namaste 🙏 Mira here, from Atelier Dhara. You found us through our 90-day full-home film — glad it found you.", { pre: 900 });
  await botSays("So I show you the right work — which city is the project in?");
  const city = await offerChips(["Delhi", "Gurugram", "Another city"]);

  const cityLine = {
    "Delhi": "Lovely — half our portfolio lives in Delhi.",
    "Gurugram": "Perfect — Gurugram towers are home turf for us.",
    "Another city": "We travel for the right project — distance has never stopped us.",
  }[city];
  await botSays(`${cityLine} And what are we transforming?`);
  const scope = await offerChips(["Full home", "Kitchen + living", "Office / studio"]);

  await botSays(`A ${scope.toLowerCase()} — wonderful. So I pair you with the right designer: where does the budget sit? <em>(No judgment, only fit.)</em>`);
  const budget = await offerChips(["₹8–15L", "₹15–30L", "₹30L+"]);

  const tier = { "₹8–15L": "Essential Luxe", "₹15–30L": "Signature", "₹30L+": "Bespoke" }[budget];
  await botSays(`Lovely — that opens our <strong>${tier}</strong> portfolio. One thing before we book — pick a finish, watch the wall change:`);
  await vizCard();

  await botSays("A beautiful choice — that&rsquo;s our most-requested finish this season. Ananya, our principal designer, kept two slots this week for a 25-minute video consult, complimentary:");
  const slot = await offerChips(["Thursday · 4:30 PM", "Saturday · 11:00 AM"]);

  stopTimer();
  await wait(500);
  bookingCard(slot);
  await botSays("Done — she&rsquo;ll walk in knowing exactly what you love. See you then. 🙂");

  await wait(700);
  addNote(`Booked in ${fmt(elapsed)} — the studio was asleep. The machine works nights; a human reviews every booking before the consult and keeps the relationship.`);
  chipsHint("demonstration complete");

  finalTime.textContent = fmt(elapsed);
  demoResult.hidden = false;
  if (kbDemo) {
    const cta = demoResult.querySelector("a, button");
    if (cta) cta.focus();
  }
}

new IntersectionObserver(
  (entries, io) => {
    if (entries[0].isIntersecting && !demoStarted) {
      demoStarted = true;
      io.disconnect();
      runDemo();
    }
  },
  { threshold: 0.35 }
).observe(document.getElementById("phone"));

document.getElementById("replayDemo").addEventListener("click", () => {
  pending.forEach(clearTimeout);
  pending = [];
  stopTimer();
  timerInt = null;
  runDemo();
  document.getElementById("phone").scrollIntoView({ behavior: REDUCED || MOBILE ? "auto" : "smooth", block: "center" });
});
