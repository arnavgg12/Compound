/* ============================================================
   COMPOUND — the field
   Hand-written WebGL particle engine. No libraries.
   CPU flow-field simulation + GL point sprites + glow shader.
   Behaviors: 0 drift · 1 leak · 2 attract · 3 convert ·
              4 book · 5 compound · 6 calm · 7 sun
   ============================================================ */
"use strict";

window.CompoundEngine = (function () {

  const POINT_VS = `
attribute vec2 aPos;
attribute vec3 aDat; // st, flash, seed
uniform vec2 uRes;
uniform float uSize;
uniform float uDim;
varying float vSt;
varying float vFlash;
varying float vAlpha;
void main() {
  vec2 clip = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = (2.2 + aDat.x * 1.8 + aDat.y * 2.6) * uSize;
  vSt = aDat.x;
  vFlash = aDat.y;
  vAlpha = (0.45 + aDat.x * 0.34 + aDat.y * 0.60) * uDim * (0.72 + 0.28 * fract(aDat.z * 13.7));
}`;

  const POINT_FS = `
precision mediump float;
varying float vSt;
varying float vFlash;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float disc = smoothstep(0.5, 0.10, length(d));
  vec3 c0 = vec3(0.90, 0.86, 0.78);
  vec3 c1 = vec3(0.96, 0.69, 0.34);
  vec3 c2 = vec3(1.00, 0.90, 0.66);
  vec3 col = vSt < 1.0
    ? mix(c0, c1, clamp(vSt, 0.0, 1.0))
    : mix(c1, c2, clamp(vSt - 1.0, 0.0, 1.0));
  col = mix(col, vec3(0.51, 0.75, 0.56), vFlash * 0.6);
  gl_FragColor = vec4(col, 1.0) * (disc * vAlpha);
}`;

  const GLOW_VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  /* trail fade: instead of clearing, wash the last frame with translucent
     ink — moving lights become comet streaks */
  const FADE_FS = `
precision mediump float;
uniform float uFade;
void main() { gl_FragColor = vec4(0.063, 0.055, 0.043, uFade); }`;

  /* hairline trail segments — same varyings as points, no disc mask
     (gl_PointCoord is undefined for lines) */
  const LINE_FS = `
precision mediump float;
varying float vSt;
varying float vFlash;
varying float vAlpha;
void main() {
  vec3 c0 = vec3(0.90, 0.86, 0.78);
  vec3 c1 = vec3(0.96, 0.69, 0.34);
  vec3 c2 = vec3(1.00, 0.90, 0.66);
  vec3 col = vSt < 1.0
    ? mix(c0, c1, clamp(vSt, 0.0, 1.0))
    : mix(c1, c2, clamp(vSt - 1.0, 0.0, 1.0));
  col = mix(col, vec3(0.51, 0.75, 0.56), vFlash * 0.6);
  gl_FragColor = vec4(col, 1.0) * (vAlpha * 0.5);
}`;

  /* present the accumulation texture on the canvas */
  const BLIT_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const BLIT_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

  const GLOW_FS = `
precision mediump float;
uniform vec2 uRes;
uniform vec2 uFocal;
uniform float uMassR;
uniform float uRingR;
uniform float uRingA;
uniform float uDim;
uniform float uTime;
uniform float uBurst;
uniform float uDPR;
void main() {
  /* gl_FragCoord is in device px; uniforms are CSS px — normalize first */
  vec2 p = gl_FragCoord.xy / uDPR;
  p.y = uRes.y - p.y;
  float d = distance(p, uFocal);
  float shimmer = 0.92 + 0.08 * sin(uTime * 2.6 + d * 0.06);
  float core = exp(-d / max(uMassR * 0.55, 5.0)) * shimmer;
  float halo = exp(-d / max(uMassR * 2.2, 26.0)) * 0.32;
  float ring = smoothstep(9.0, 0.0, abs(d - uRingR)) * uRingA
             * (0.55 + 0.45 * sin(uTime * 2.0 - d * 0.04));
  float br = (1.0 - uBurst) * min(uRes.x, uRes.y) * 0.55;
  float burst = smoothstep(36.0, 0.0, abs(d - br)) * uBurst * 0.9;
  vec3 gold  = vec3(1.00, 0.84, 0.55);
  vec3 brass = vec3(0.80, 0.60, 0.33);
  vec3 col = gold * core + brass * (halo + ring) + gold * burst;
  gl_FragColor = vec4(col * uDim, 1.0);
}`;

  /* ---------- helpers ---------- */

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("shader:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function program(gl, vsSrc, fsSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("link:", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- factory ---------- */

  function create(canvas, opts) {
    opts = opts || {};
    const reduced = !!opts.reduced;
    /* lite = phones: no trail passes, fewer lights, no pointer chase —
       the field must never cost the thumb a frame */
    const lite = !!opts.lite;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false, /* trails persist in an FBO instead */
    });
    if (!gl) return null;

    /* All GL objects live behind initGL() so a lost context can rebuild
       them — programs, locations and buffers die with the old context. */
    let progP, progG, progF, progB, progL, locP, locG, locF, locB, locL;
    let triBuf, partBuf, cellBuf, lineBuf;
    let fbo = null, fboTex = null, fboW = 0, fboH = 0;
    let lost = false;

    function initGL() {
      progP = program(gl, POINT_VS, POINT_FS);
      progG = program(gl, GLOW_VS, GLOW_FS);
      progF = program(gl, GLOW_VS, FADE_FS);
      progB = program(gl, BLIT_VS, BLIT_FS);
      progL = program(gl, POINT_VS, LINE_FS);
      if (!progP || !progG || !progF || !progB || !progL) return false;

      locP = {
        aPos: gl.getAttribLocation(progP, "aPos"),
        aDat: gl.getAttribLocation(progP, "aDat"),
        uRes: gl.getUniformLocation(progP, "uRes"),
        uSize: gl.getUniformLocation(progP, "uSize"),
        uDim: gl.getUniformLocation(progP, "uDim"),
      };
      locG = {
        aPos: gl.getAttribLocation(progG, "aPos"),
        uRes: gl.getUniformLocation(progG, "uRes"),
        uFocal: gl.getUniformLocation(progG, "uFocal"),
        uMassR: gl.getUniformLocation(progG, "uMassR"),
        uRingR: gl.getUniformLocation(progG, "uRingR"),
        uRingA: gl.getUniformLocation(progG, "uRingA"),
        uDim: gl.getUniformLocation(progG, "uDim"),
        uTime: gl.getUniformLocation(progG, "uTime"),
        uBurst: gl.getUniformLocation(progG, "uBurst"),
        uDPR: gl.getUniformLocation(progG, "uDPR"),
      };
      locF = {
        aPos: gl.getAttribLocation(progF, "aPos"),
        uFade: gl.getUniformLocation(progF, "uFade"),
      };
      locB = {
        aPos: gl.getAttribLocation(progB, "aPos"),
        uTex: gl.getUniformLocation(progB, "uTex"),
      };
      locL = {
        aPos: gl.getAttribLocation(progL, "aPos"),
        aDat: gl.getAttribLocation(progL, "aDat"),
        uRes: gl.getUniformLocation(progL, "uRes"),
        uSize: gl.getUniformLocation(progL, "uSize"),
        uDim: gl.getUniformLocation(progL, "uDim"),
      };

      /* glow geometry: one fullscreen triangle */
      triBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      partBuf = gl.createBuffer();
      cellBuf = gl.createBuffer();
      lineBuf = gl.createBuffer();

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.clearColor(0.063, 0.055, 0.043, 1.0); // #100e0b
      return true;
    }
    if (!initGL()) return null;

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); /* without this, restored never fires */
      lost = true;
      fbo = fboTex = null; /* dead with the old context */
      fboW = fboH = 0;
    });
    /* fixed-capacity GPU buffers: per-frame bufferData at varying sizes
       makes mobile drivers reallocate; allocate once, update with
       bufferSubData */
    function allocGpu() {
      if (!N) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.bufferData(gl.ARRAY_BUFFER, N * 5 * 4, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, N * 10 * 4, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
      gl.bufferData(gl.ARRAY_BUFFER, CELLS * 5 * 4, gl.DYNAMIC_DRAW);
    }

    canvas.addEventListener("webglcontextrestored", () => {
      if (initGL()) {
        lost = false;
        resize();
        allocGpu(); /* resize skips the N-change branch when N is unchanged */
      }
    });

    /* ---------- state ---------- */

    let W = 1, H = 1, DPR = 1;
    let N = 0;            // particle capacity
    let px, py, vx, vy, px0, py0, st, fl, seed;   // particle fields
    let inter;            // interleaved upload buffer (N * 5)
    let lineInter;        // trail segments, 2 verts per particle (N * 10)

    /* calendar lattice */
    const COLS = 7, ROWS = 5, CELLS = COLS * ROWS;
    const cellX = new Float32Array(CELLS);
    const cellY = new Float32Array(CELLS);
    const cellGlow = new Float32Array(CELLS);
    const cellInter = new Float32Array(CELLS * 5);

    let focalX = 0, focalY = 0, ringR = 200, sizeScale = 1;
    let massPulse = 0, burstT = 0;
    let time = 0;
    let lastUploadN = -1; /* reduced mode: skip identical re-uploads */
    let lastDtN = 1; /* trail fade must be frame-rate independent */

    const state = {
      day: 0,
      beh: 0,
      dim: 1,
      pointerX: -9999,
      pointerY: -9999,
      pointerOn: false,
      scrollVel: 0,
    };

    function respawnEdge(i) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { px[i] = Math.random() * W; py[i] = -20; }
      else if (side === 1) { px[i] = Math.random() * W; py[i] = H + 20; }
      else if (side === 2) { px[i] = -20; py[i] = Math.random() * H; }
      else { px[i] = W + 20; py[i] = Math.random() * H; }
      const a = Math.atan2(focalY - py[i], focalX - px[i]) + (Math.random() - 0.5) * 0.9;
      const s = 0.4 + Math.random() * 0.8;
      vx[i] = Math.cos(a) * s;
      vy[i] = Math.sin(a) * s;
      px0[i] = px[i]; /* teleport — no trail across the screen */
      py0[i] = py[i];
      st[i] = 0;
      fl[i] = 0;
    }

    function scatter(i) {
      px[i] = Math.random() * W;
      py[i] = Math.random() * H;
      const a = Math.random() * TAU;
      const s = Math.random() * 0.5;
      vx[i] = Math.cos(a) * s;
      vy[i] = Math.sin(a) * s;
      px0[i] = px[i];
      py0[i] = py[i];
      st[i] = 0;
      fl[i] = 0;
    }

    function resize() {
      W = canvas.clientWidth || innerWidth;
      H = canvas.clientHeight || innerHeight;
      /* phones: cap DPR low — three fullscreen passes (fade/glow/blit)
         at 1.5x are too heavy for mid-range mobile GPUs */
      DPR = clamp(devicePixelRatio || 1, 1, W > 760 ? 1.75 : 1.25);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      if (!lost) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        /* accumulation target — trails persist here between frames */
        if (!reduced && (!fbo || fboW !== canvas.width || fboH !== canvas.height)) {
          if (fboTex) gl.deleteTexture(fboTex);
          if (fbo) gl.deleteFramebuffer(fbo);
          fboTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, fboTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
          gl.clear(gl.COLOR_BUFFER_BIT); /* start the canvas from clean ink */
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          fboW = canvas.width;
          fboH = canvas.height;
        }
      }

      const mobile = W < 760;
      focalX = mobile ? W * 0.5 : W * 0.62;
      focalY = mobile ? H * 0.52 : H * 0.50;
      ringR = Math.min(W, H) * (mobile ? 0.30 : 0.26);
      sizeScale = clamp(Math.min(W, H) / 800, 0.8, 1.5) * DPR * (lite ? 1.15 : 1);

      const target = lite
        ? Math.round(clamp((W * H) / 110, 1800, 4200))
        : Math.round(clamp((W * H) / 80, 3000, 12000));
      if (target !== N) {
        N = target;
        lastUploadN = -1;
        allocGpu();
        px = new Float32Array(N); py = new Float32Array(N);
        vx = new Float32Array(N); vy = new Float32Array(N);
        px0 = new Float32Array(N); py0 = new Float32Array(N);
        st = new Float32Array(N); fl = new Float32Array(N);
        seed = new Float32Array(N);
        inter = new Float32Array(N * 5);
        lineInter = new Float32Array(N * 10);
        for (let i = 0; i < N; i++) { seed[i] = Math.random(); scatter(i); }
      }

      /* lattice: a 7x5 month-grid hovering right of / around the focal */
      const sp = Math.min(W, H) * 0.052;
      const ox = focalX - ((COLS - 1) / 2) * sp;
      const oy = focalY - ((ROWS - 1) / 2) * sp;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const k = r * COLS + c;
          cellX[k] = ox + c * sp;
          cellY[k] = oy + r * sp;
        }
      }
    }
    resize();

    /* ---------- simulation ---------- */

    function aliveCount() {
      const d = clamp(state.day / 365, 0, 1);
      return Math.max(48, Math.floor(N * (0.18 + 0.82 * Math.pow(d, 1.6))));
    }

    function sim(dtN) {
      const beh = state.beh;
      const n = aliveCount();
      const pOn = state.pointerOn;
      const pX = state.pointerX, pY = state.pointerY;
      const wind = clamp(state.scrollVel * -0.006, -0.8, 0.8);
      const coreR = massRadius() * 0.55;
      const damp = Math.pow(0.945, dtN);

      /* a booked calendar stays booked: lit cells latch instead of
         flickering back out */
      for (let k = 0; k < CELLS; k++) {
        const floor = cellGlow[k] > 0.7 ? 0.7 : 0;
        cellGlow[k] = Math.max(cellGlow[k] * Math.pow(0.985, dtN), floor);
      }

      for (let i = 0; i < n; i++) {
        let ax = 0, ay = 0;

        /* ambient flow field */
        const na = Math.sin(px[i] * 0.0023 + time * 0.21 + seed[i] * 6.28) * 1.8
                 + Math.cos(py[i] * 0.0019 - time * 0.17) * 1.8;
        const flow = beh === 1 ? 0.045 : beh === 0 ? 0.03 : 0.014;
        ax += Math.cos(na) * flow;
        ay += Math.sin(na) * flow;

        const dx = px[i] - focalX, dy = py[i] - focalY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        if (beh === 0) {
          /* DAY ZERO — a slow galaxy turning behind the headline */
          const gx = px[i] - W * 0.5, gy = py[i] - H * 0.45;
          const gd = Math.sqrt(gx * gx + gy * gy) || 1;
          const sw = 0.09 * Math.min(1, 260 / gd);
          ax += (-gy / gd) * sw - gx * 0.00012;
          ay += (gx / gd) * sw - gy * 0.00012;
        } else if (beh === 1) {
          /* LEAK — drift outward, die at the edges */
          ax += (dx / dist) * 0.022;
          ay += (dy / dist) * 0.022;
        } else if (beh === 2 || beh === 3) {
          /* ATTRACT / CONVERT — pulled into orbit around the ring */
          const pull = (dist - ringR) * -0.0011;
          ax += (dx / dist) * pull;
          ay += (dy / dist) * pull;
          ax += (-dy / dist) * 0.05;          /* swirl */
          ay += (dx / dist) * 0.05;
          if (beh === 2 && st[i] < 0.45) st[i] = Math.min(0.45, st[i] + 0.004 * dtN);
          if (beh === 3) {
            if (st[i] < 0.45) st[i] = Math.min(0.45, st[i] + 0.006 * dtN);
            /* the gate: pass through the bottom arc and you're qualified */
            const ang = Math.atan2(dy, dx);
            if (st[i] < 1 && Math.abs(dist - ringR) < 26 && Math.abs(ang - 1.25) < 0.16) {
              st[i] = 1;
              fl[i] = 1;
            }
          }
        } else if (beh === 4) {
          /* BOOK — qualified lights dock into the calendar lattice */
          if (st[i] >= 1) {
            const ci = (seed[i] * CELLS) | 0;
            const docked = ((time * 0.05 + seed[i] * 3.7) % 1) < 0.62;
            if (docked) {
              const tx = cellX[ci], ty = cellY[ci];
              ax += (tx - px[i]) * 0.012;
              ay += (ty - py[i]) * 0.012;
              const dd = Math.abs(tx - px[i]) + Math.abs(ty - py[i]);
              if (dd < 14) {
                cellGlow[ci] = Math.min(1, cellGlow[ci] + 0.10 * dtN);
                if (st[i] < 2) st[i] = Math.min(2, st[i] + 0.01 * dtN);
              }
            } else {
              ax += (-dy / dist) * 0.045;
              ay += (dx / dist) * 0.045;
            }
          } else {
            const pull = (dist - ringR) * -0.0011;
            ax += (dx / dist) * pull + (-dy / dist) * 0.04;
            ay += (dy / dist) * pull + (dx / dist) * 0.04;
            if (Math.random() < 0.002 * dtN) { st[i] = 1; fl[i] = 0.7; }
          }
        } else if (beh === 5 || beh === 6 || beh === 7) {
          /* COMPOUND / CALM / SUN — spiral in, feed the mass.
             The finale sun RISES: it sits high above the text horizon,
             so the composition is sunrise over Day One, not noise. */
          let bx = dx, by = dy, bd = dist;
          if (beh === 7) {
            bx = px[i] - W * 0.5;
            by = py[i] - H * 0.26;
            bd = Math.sqrt(bx * bx + by * by) || 1;
          }
          const swirl = beh === 7 ? 0.085 : beh === 5 ? 0.06 : 0.035;
          const inward = beh === 7 ? 0.0009 : beh === 5 ? 0.00045 : 0.00022;
          ax += (-by / bd) * swirl - bx * inward;
          ay += (bx / bd) * swirl - by * inward;
          st[i] = Math.min(2, st[i] + (beh === 7 ? 0.006 : 0.003) * dtN);
          if (bd < coreR) {
            massPulse = Math.min(1.6, massPulse + 0.10);
            respawnEdge(i);
            continue;
          }
        }

        /* pointer attention — the strangers follow it (desktop only;
           on touch this would fight the scrolling thumb) */
        if (pOn && !lite) {
          const qx = pX - px[i], qy = pY - py[i];
          const qd = Math.sqrt(qx * qx + qy * qy);
          if (qd < 240 && qd > 0.5) {
            const f = (1 - qd / 240) * 0.10;
            ax += (qx / qd) * f;
            ay += (qy / qd) * f;
          }
        }

        ay += wind;

        vx[i] = (vx[i] + ax * dtN) * damp;
        vy[i] = (vy[i] + ay * dtN) * damp;
        const sp2 = vx[i] * vx[i] + vy[i] * vy[i];
        if (sp2 > 9) { const s = 3 / Math.sqrt(sp2); vx[i] *= s; vy[i] *= s; }
        px0[i] = px[i]; /* trail segment spans this frame's motion */
        py0[i] = py[i];
        px[i] += vx[i] * dtN;
        py[i] += vy[i] * dtN;
        fl[i] *= Math.pow(0.94, dtN);

        /* off-screen */
        if (px[i] < -40 || px[i] > W + 40 || py[i] < -40 || py[i] > H + 40) {
          if (beh === 1) {
            /* the leak: lost forever — a new stranger arrives somewhere else */
            scatter(i);
            st[i] = 0;
          } else {
            respawnEdge(i);
          }
        }
      }
      return n;
    }

    function massRadius() {
      const d = clamp(state.day / 365, 0, 1);
      /* phones: slightly smaller sun so the halo never floods the copy */
      const base = lerp(10, Math.min(W, H) * (lite ? 0.24 : 0.28), Math.pow(d, 1.6));
      const breathe = 1 + 0.04 * Math.sin(time * 1.8);
      return base * breathe + massPulse * 9;
    }

    /* ---------- render ---------- */

    function uploadParticles(n) {
      for (let i = 0; i < n; i++) {
        const o = i * 5;
        inter[o] = px[i];
        inter[o + 1] = py[i];
        inter[o + 2] = st[i];
        inter[o + 3] = fl[i];
        inter[o + 4] = seed[i];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, inter.subarray(0, n * 5));
    }

    function drawPoints(buf, count, dim) {
      gl.useProgram(progP);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(locP.aPos);
      gl.enableVertexAttribArray(locP.aDat);
      gl.vertexAttribPointer(locP.aPos, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(locP.aDat, 3, gl.FLOAT, false, 20, 8);
      gl.uniform2f(locP.uRes, W, H);
      gl.uniform1f(locP.uSize, sizeScale);
      gl.uniform1f(locP.uDim, dim);
      gl.drawArrays(gl.POINTS, 0, count);
    }

    /* shorter fade = longer comet trails */
    const FADE_BY_BEH = [0.16, 0.20, 0.16, 0.16, 0.22, 0.15, 0.25, 0.12];

    function render(n) {
      const beh = state.beh;
      const dim = state.dim;
      const useTrails = !reduced; /* phones keep the streaks — the look
        survives because text chapters dim the field independently */

      /* trails accumulate offscreen; lite/reduced draw straight to canvas */
      gl.bindFramebuffer(gl.FRAMEBUFFER, useTrails ? fbo : null);

      if (!useTrails) {
        gl.clear(gl.COLOR_BUFFER_BIT); /* crisp frame — no trail passes */
      } else {
        gl.useProgram(progF);
        gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
        gl.enableVertexAttribArray(locF.aPos);
        gl.vertexAttribPointer(locF.aPos, 2, gl.FLOAT, false, 0, 0);
        /* compound the per-frame wash by elapsed sim time so trail length
           reads the same at 60fps and in throttled 15fps webviews.
           Phones get a fade floor: full-length finale rays swallow the
           copy on a small screen. */
        let base = FADE_BY_BEH[beh] || 0.14;
        if (lite) base = Math.max(base, 0.2);
        gl.uniform1f(locF.uFade, 1 - Math.pow(1 - base, lastDtN));
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.blendFunc(gl.ONE, gl.ONE); /* back to additive for the lights */
      }

      /* glow: mass + ring + burst */
      const showMass = beh >= 4 || state.day > 110;
      const ringA = beh === 2 ? 0.7 : beh === 3 ? 0.9 : beh === 4 ? 0.22 : 0.0;
      gl.useProgram(progG);
      gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
      gl.enableVertexAttribArray(locG.aPos);
      gl.vertexAttribPointer(locG.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(locG.uRes, W, H);
      /* the finale glow rises with the sun */
      if (beh === 7) gl.uniform2f(locG.uFocal, W * 0.5, H * 0.26);
      else gl.uniform2f(locG.uFocal, focalX, focalY);
      gl.uniform1f(locG.uMassR, showMass ? massRadius() : 0.0);
      gl.uniform1f(locG.uRingR, ringR);
      gl.uniform1f(locG.uRingA, ringA * dim);
      /* glow runs a touch quieter on phones so copy stays readable */
      gl.uniform1f(locG.uDim, dim * (lite ? 0.8 : 1));
      /* wrap at a common period of both shader sines — raw seconds
         overflow fp16 mediump on mobile GPUs after ~17 min */
      gl.uniform1f(locG.uTime, time % (10 * Math.PI));
      gl.uniform1f(locG.uBurst, burstT);
      gl.uniform1f(locG.uDPR, DPR);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* calendar lattice (book chapter only) */
      if (beh === 4) {
        for (let k = 0; k < CELLS; k++) {
          const o = k * 5;
          cellInter[o] = cellX[k];
          cellInter[o + 1] = cellY[k];
          cellInter[o + 2] = 1.2;
          cellInter[o + 3] = cellGlow[k];
          cellInter[o + 4] = k / CELLS;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, cellInter);
        drawPoints(cellBuf, CELLS, dim * 0.9);
      }

      /* hairline trails — smooth continuous streaks, not dotted scratch */
      if (useTrails) {
        for (let i = 0; i < n; i++) {
          const o = i * 10;
          lineInter[o] = px0[i];
          lineInter[o + 1] = py0[i];
          lineInter[o + 2] = st[i];
          lineInter[o + 3] = fl[i];
          lineInter[o + 4] = seed[i];
          lineInter[o + 5] = px[i];
          lineInter[o + 6] = py[i];
          lineInter[o + 7] = st[i];
          lineInter[o + 8] = fl[i];
          lineInter[o + 9] = seed[i];
        }
        gl.useProgram(progL);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineInter.subarray(0, n * 10));
        gl.enableVertexAttribArray(locL.aPos);
        gl.enableVertexAttribArray(locL.aDat);
        gl.vertexAttribPointer(locL.aPos, 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(locL.aDat, 3, gl.FLOAT, false, 20, 8);
        gl.uniform2f(locL.uRes, W, H);
        gl.uniform1f(locL.uSize, sizeScale);
        gl.uniform1f(locL.uDim, dim);
        gl.drawArrays(gl.LINES, 0, n * 2);
      }

      if (!reduced || n !== lastUploadN) {
        uploadParticles(n);
        lastUploadN = n;
      }
      drawPoints(partBuf, n, dim);

      /* present the accumulation texture on the canvas */
      if (useTrails) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(progB);
        gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
        gl.enableVertexAttribArray(locB.aPos);
        gl.vertexAttribPointer(locB.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboTex);
        gl.uniform1i(locB.uTex, 0);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.BLEND);
      }
    }

    /* ---------- public ---------- */

    let frozen = false;

    return {
      reduced,
      resize,
      setState(s) { Object.assign(state, s); },
      burst() { if (!reduced) burstT = 1; },
      pulse(x, y) {
        if (reduced || lite) return; /* lite contract: no pointer effects */
        const n = aliveCount();
        for (let i = 0; i < n; i++) {
          const qx = px[i] - x, qy = py[i] - y;
          const qd = Math.sqrt(qx * qx + qy * qy);
          if (qd < 220 && qd > 0.5) {
            const f = (1 - qd / 220) * 5.5;
            vx[i] += (qx / qd) * f;
            vy[i] += (qy / qd) * f;
          }
        }
      },
      frame(dt) {
        if (lost) return; /* context lost — wait for restore */
        let n;
        if (reduced) {
          /* static constellation — time frozen so nothing shimmers */
          if (!frozen) { sim(1); frozen = true; }
          n = aliveCount();
        } else {
          time += dt;
          massPulse *= 0.92;
          burstT = Math.max(0, burstT - dt * 1.4);
          lastDtN = clamp(dt * 60, 0.5, 3.5);
          n = sim(clamp(dt * 60, 0.5, 2.2));
        }
        render(n);
      },
    };
  }

  return { create };
})();
