/* ============================================================
   COMPOUND — choreography
   One rAF conducts everything: scroll → day → field → HUD.
   ============================================================ */
"use strict";

/* ---------- config (replace with real handles before launch) ---------- */
const WHATSAPP_NUMBER = "919999999999"; // TODO: real number, country code, no '+'
const WHATSAPP_TEXT = "Hi Compound — I run a premium business and I want a growth engine. Day one is today.";
const EMAIL = "hello@compound.in"; // TODO: real address

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = window.matchMedia("(pointer: fine)").matches;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- contact links ---------- */
const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
const waMain = document.getElementById("waMain");
waMain.href = waHref;
const mail = document.getElementById("mailLink");
mail.href = `mailto:${EMAIL}?subject=${encodeURIComponent("A growth engine for my business")}`;
mail.textContent = EMAIL;

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
  if (REDUCED || safeStorage.get("compound-booted")) {
    boot.remove();
    startChoreography();
    return;
  }
  document.body.classList.add("is-booting");
  const eq = document.getElementById("bootEq");
  const T = 1050;
  const t0 = performance.now();
  /* setInterval, not rAF — must run even in throttled webviews */
  const iv = setInterval(() => {
    const p = clamp((performance.now() - t0) / T, 0, 1);
    const exp = Math.max(1, Math.round(p * 365));
    eq.innerHTML = `1.01<sup>${exp}</sup> = ${Math.pow(1.01, exp).toFixed(2)}`;
    if (p >= 1) {
      clearInterval(iv);
      setTimeout(() => {
        boot.classList.add("done");
        document.body.classList.remove("is-booting");
        safeStorage.set("compound-booted", "1");
        startChoreography(); /* hero entrance rises as the curtain fades */
        if (engine) engine.burst(); /* the year arrives with a pulse */
        setTimeout(() => boot.remove(), 800);
      }, 260);
    }
  }, 16);
  /* failsafe — never trap the visitor behind the curtain */
  setTimeout(() => {
    if (document.body.contains(boot)) {
      boot.classList.add("done");
      document.body.classList.remove("is-booting");
      startChoreography();
      setTimeout(() => boot.remove(), 800);
    }
  }, 2600);
})();

/* ---------- the field ---------- */
const canvas = document.getElementById("field");
const engine = window.CompoundEngine
  ? window.CompoundEngine.create(canvas, { reduced: REDUCED })
  : null;
if (!engine) canvas.style.display = "none";

/* ---------- nav scrolled state ---------- */
const nav = document.getElementById("nav");

/* ---------- sections → days ---------- */
let sections = [];
function measure() {
  sections = [...document.querySelectorAll(".ch")].map((el) => {
    const [a, b] = el.dataset.days.split(",").map(Number);
    return {
      top: el.offsetTop,
      h: Math.max(el.offsetHeight, 1),
      a, b,
      beh: +el.dataset.beh,
      tag: el.dataset.tag,
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
const railFill = document.getElementById("railFill");
const liveExp = document.getElementById("liveExp");
const liveRes = document.getElementById("liveRes");

let dayOverride = false; /* CTA hover flips the counter to 001 */

/* ---------- demo dim + HUD yielding ---------- */
let dimTarget = 1, dimCur = 1;
const demoStage = document.querySelector(".demo__stage");
new IntersectionObserver(
  (entries) => {
    /* last entry = latest state — e[0] can be a stale queued record */
    const on = entries[entries.length - 1].isIntersecting;
    dimTarget = on ? 0.32 : 1;
    document.body.classList.toggle("hud--yield", on);
  },
  { threshold: 0.18 }
).observe(demoStage);

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
  if (engine && !REDUCED) engine.pulse(e.clientX, e.clientY);
}, { passive: true });

/* ---------- the conductor ---------- */
let smooth = window.scrollY;
let lastScroll = smooth;
let lastT = performance.now();
let lastTag = "";
let lastDayShown = -1;
let titleAt = 0;
let lastVW = 0, lastVH = 0;

/* cursor state (moved inside the conductor so one loop drives everything) */
const cursorOn = FINE_POINTER && !REDUCED;
const cursorEl = document.getElementById("cursor");
const HOVER = "a, button, .chip, .viz__chip";
let curX = -100, curY = -100;
if (cursorOn) document.body.classList.add("has-cursor");

function dayAt(sc) {
  if (!sections.length) return { day: 0, beh: 0, tag: "" };
  const first = sections[0];
  if (sc < first.top) return { day: 0, beh: first.beh, tag: first.tag };
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    /* boundary = next section's top: offsetTop/offsetHeight round
       independently, and a 1px gap here would flash day 365 mid-page */
    const end = i + 1 < sections.length ? sections[i + 1].top : s.top + s.h;
    if (sc < end) {
      const t = clamp((sc - s.top) / Math.max(end - s.top, 1), 0, 1);
      return { day: lerp(s.a, s.b, t), beh: s.beh, tag: s.tag };
    }
  }
  const last = sections[sections.length - 1];
  return { day: 365, beh: last.beh, tag: last.tag };
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

  /* smooth scroll value */
  const target = window.scrollY;
  smooth += (target - smooth) * (REDUCED ? 1 : 0.12);
  const vel = smooth - lastScroll;
  lastScroll = smooth;

  /* anchor at viewport top: day 000 at rest, chapter handoff exactly
     when the next pinned headline takes the screen */
  const sc = smooth + 1;
  let { day, beh, tag } = dayAt(sc);
  /* the year must complete at the absolute bottom even when the page
     tail is shorter than the viewport */
  if (target + innerHeight >= document.body.scrollHeight - 4) day = 365;
  const d = Math.round(day);

  /* HUD */
  if (dayOverride) {
    if (dayNum.textContent !== "001") dayNum.textContent = "001";
    lastDayShown = -1; /* force a rewrite when the override lifts */
  } else if (d !== lastDayShown) {
    lastDayShown = d;
    dayNum.textContent = String(d).padStart(3, "0");
  }
  if (!REDUCED) dayNum.style.transform = `skewX(${clamp(-vel * 0.18, -9, 9)}deg)`;
  if (tag !== lastTag) {
    lastTag = tag;
    chapterTag.textContent = tag;
  }
  railFill.style.transform = `scaleY(${clamp(day / 365, 0, 1)})`;
  nav.classList.toggle("is-scrolled", target > 32);

  /* live equation (compound chapter) */
  if (day >= 150 && day <= 290) {
    liveExp.textContent = d;
    liveRes.textContent = Math.pow(1.01, day).toFixed(2);
  }

  /* tab title — throttled */
  if (now - titleAt > 600) {
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
  /* avoid a huge dt spike after the tab returns */
  lastT = performance.now();
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

/* …but observation waits for the boot curtain, else the hero entrance
   plays unseen behind the opaque overlay on every first visit */
function startChoreography() {
  if (choreoStarted) return;
  choreoStarted = true;
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
  el.innerHTML = `${text}<span class="msg__meta">${stamp()} <span class="msg__ticks">✓✓</span></span>`;
  chatLog.appendChild(el);
  scrollChat();
}

function addIn(html, wide = false) {
  const el = document.createElement("div");
  el.className = "msg msg--in" + (wide ? " msg--wide" : "");
  el.innerHTML = `${html}<span class="msg__meta">${stamp()}</span>`;
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
  t.innerHTML = "<i></i><i></i><i></i>";
  chatLog.appendChild(t);
  scrollChat();
  const text = html.replace(/<[^>]+>/g, "");
  await wait(Math.min(2000, 480 + text.length * 13));
  t.remove();
  setTyping(false);
  return addIn(html, wide);
}

function offerChips(options) {
  chatChips.innerHTML = "";
  return new Promise((resolve) => {
    options.forEach((label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = label;
      b.addEventListener("click", () => {
        startTimer();
        chatChips.innerHTML = "";
        addOut(label);
        resolve(label);
      });
      chatChips.appendChild(b);
    });
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
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
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

  addNote("Working replica of Engine №001 — the WhatsApp funnel we run for a Delhi interiors studio (name changed). You play the customer. The clock starts when you reply.");

  await botSays("Namaste 🙏 Mira here, from Atelier Dhara. You found us through our 90-day full-home film — glad it resonated.", { pre: 900 });
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
  await botSays(`Great — that opens our <strong>${tier}</strong> portfolio. One quick piece of magic before we book:`);
  await vizCard();

  await botSays("That finish makes clients gasp 😄 Ananya, our principal designer, kept two slots this week for a 25-minute video consult — free, no pressure:");
  const slot = await offerChips(["Thursday · 4:30 PM", "Saturday · 11:00 AM"]);

  stopTimer();
  await wait(500);
  bookingCard(slot);
  await botSays("Done! She&rsquo;ll walk in knowing exactly what you love. Until then — the Gurugram penthouse film everyone asks about 🎬");

  await wait(700);
  addNote(`Simulation complete — booked in ${fmt(elapsed)}. No human touched this. The studio was asleep.`);
  chipsHint("simulation complete");

  finalTime.textContent = fmt(elapsed);
  demoResult.hidden = false;
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
  document.getElementById("phone").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
});
