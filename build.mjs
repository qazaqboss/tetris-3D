// Builds index.html: a falling-block well drawn as an isometric bench instrument
// with the Anatomy kit (kit/iso-kit.mjs, MIT, github.com/wheresryan22/anatomy).
// Run: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const kitSource = readFileSync(join(HERE, "kit/iso-kit.mjs"), "utf8").replace(/^export /gm, "");
const gameSource = readFileSync(join(HERE, "src/game.js"), "utf8");

// ---------- world ----------
const WIDTH = 560;
const HEIGHT = 640;
const C = 10; // one cell, world units
const COLS = 10;
const ROWS = 20; // playable rows under the limit line
const SHOWN = 22; // rows drawn (two spawn rows above the limit)
const FLOOR = 3; // top of the floor tray, where row 0 sits
const TOP = 236; // underside of the top beam

const PLATE = { x: -78, y: -28, w: 256, d: 76, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;
const PANEL = { x: -4, y: -8, w: 108, d: 6, r: 1 };
const TRAY = { x: -4, y: -2, w: 108, d: 17, r: 1.2 };
const LIP = { x: -4, y: 12, w: 108, d: 3, r: 0.8 };
const POST_L = { x: -12, y: -8, w: 8, d: 22, r: 1.4 };
const POST_R = { x: 104, y: -8, w: 8, d: 22, r: 1.4 };
const BEAM = { x: -14, y: -9, w: 128, d: 24, r: 1.6 };
const BEAM_H = 10;
const HOPPER = { x: 26, y: -5, w: 48, d: 16, r: 2 };

const MINI = 6; // cell of the next / hold trays
const SHELF_Z = 184;
const SHELF_H = 4;
const NEXT_TRAY = { x: 122, y: -14, w: 46, d: 32, r: 2.4 };
const HOLD_TRAY = { x: -68, y: -14, w: 46, d: 32, r: 2.4 };

const DIAL = [146, 26];
const DIAL_R = 15;
const DIAL_Z = 5;
const DIAL_H = 8;
const DIAL_TOP = DIAL_Z + DIAL_H;
const KNOB = [-18, 32];
const KNOB_R = 6.5;
const KNOB_Z = 2.2;
const KNOB_TOP = KNOB_Z + 5;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...k.boxCorners(BEAM, TOP, TOP + BEAM_H + 8),
    ...k.boxCorners(NEXT_TRAY, SHELF_Z, SHELF_Z + 26),
    ...k.boxCorners(HOLD_TRAY, SHELF_Z, SHELF_Z + 26),
  ],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 63, elevation: 24 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const front = (plan) => plan.y + plan.d;

// ---------- static art ----------
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  const seam = k.sideSeam(PLATE, -PLATE_H + 4, P, 8);
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // column ruler under the well
  const strip = { x: -4, y: 25, w: 108, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(0, 100, 5, 2, strip.y + 0.01, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 1.6, strip.y + 5, 0.6]), at([strip.x + strip.w - 1.6, strip.y + 5, 0.6])], { size: 0.45 }));

  // label plate
  const label = { x: -70, y: 14, w: 40, d: 22, r: 1.6 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 5, label.y + 8], 0.8, P, "x"), "TETRA-10/20", { size: 3.4, tone: "mid" }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 12.5], [label.x + 31, label.y + 12.5], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 15.5], [label.x + 24, label.y + 15.5], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 18.5], [label.x + 28, label.y + 18.5], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.6, label.y + 2.6, 0.8]), at([label.x + label.w - 2.6, label.y + label.d - 2.6, 0.8])], { size: 0.45 }));

  // knob seat ring with level ticks
  out.push(S(k.cylinder(KNOB[0], KNOB[1], 10.5, 0, KNOB_Z, P, 48, 0.5), { tone: "mid" }));
  const kt = k.radialTicks(KNOB[0], KNOB[1], 10, 15, 5, KNOB_Z, [1.2, 2.4], P, -Math.PI * 0.75, Math.PI * 1.5);
  out.push(L(kt.minor, { tone: "lo" }), L(kt.major, { tone: "mid" }));

  // dial pedestal
  const pad = { x: DIAL[0] - 19, y: DIAL[1] - 19, w: 38, d: 38, r: 5 };
  out.push(S(k.slabOf(pad, 0, DIAL_Z, P, 6, 0.8), { tone: "mid" }));
  out.push(D(k.corners(pad, 3.4).map(([x, y]) => at([x, y, DIAL_Z])), { size: 0.45 }));
  return out.join("");
}

function holdShelf() {
  return shelf(HOLD_TRAY, { x: HOLD_TRAY.x + HOLD_TRAY.w, w: POST_L.x - HOLD_TRAY.x - HOLD_TRAY.w }, "hold");
}
function nextShelf() {
  return shelf(NEXT_TRAY, { x: POST_R.x + POST_R.w, w: NEXT_TRAY.x - POST_R.x - POST_R.w }, "next");
}
function shelf(tray, armSpan, name) {
  const out = [];
  const arm = { x: armSpan.x, y: -1, w: armSpan.w, d: 8, r: 0.8 };
  // a gusset under the arm, then the arm, then the tray
  const gusset = { x: armSpan.x + (name === "next" ? 0 : armSpan.w - 3), y: 1, w: 3, d: 4, r: 0.6 };
  out.push(S(k.slabOf(gusset, SHELF_Z - 16, 16, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf(arm, SHELF_Z - 2, 6, P, 2, 0.4), { tone: "mid" }));
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(tray, 4), SHELF_Z - 6, 0.1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(tray, SHELF_Z, SHELF_H, P, 5, 0.8), { tone: "mid", inner: L(k.sideSeam(tray, SHELF_Z + 1.4, P, 5), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(tray, 3), SHELF_Z + SHELF_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(tray, 1.8).map(([x, y]) => at([x, y, SHELF_Z + SHELF_H])), { size: 0.45 }));
  out.push(D([at([arm.x + arm.w / 2, arm.y + 4, SHELF_Z + 4])], { size: 0.45 }));
  // tray tag: a short engraved slot ruler on the front edge
  const tag = { x: tray.x + 6, y: front(tray) - 5, w: 12, d: 3, r: 0.6 };
  out.push(S(k.slabOf(tag, SHELF_Z + SHELF_H, 0.5, P, 2), { tone: "lo", crease: "none" }));
  out.push(k.faceTextSvg(k.topMatrix([tray.x + tray.w - 6, front(tray) - 3], SHELF_Z + SHELF_H, P, "x"), name.toUpperCase(), { size: 2.6, tone: "lo", anchor: "end" }));
  out.push(`<g data-part="${name}"></g>`);
  return out.join("");
}

function panel() {
  const out = [];
  const z1 = TOP;
  out.push(S(k.slabOf(PANEL, 0, z1, P, 2, 0.5), { tone: "lo", crease: "faint" }));
  const face = front(PANEL);
  const lines = [];
  for (let c = 1; c < COLS; c++) lines.push(k.segment([c * C, face, FLOOR], [c * C, face, z1], P));
  for (let r = 1; r <= SHOWN + 1; r++) {
    if (r === ROWS) continue;
    lines.push(k.segment([PANEL.x, face, FLOOR + r * C], [PANEL.x + PANEL.w, face, FLOOR + r * C], P));
  }
  out.push(L(lines.join(""), { tone: "faint" }));
  // limit line: pieces locked above it end the game
  out.push(L(k.segment([PANEL.x, face, FLOOR + ROWS * C], [PANEL.x + PANEL.w, face, FLOOR + ROWS * C], P), { tone: "mid" }));
  out.push(D([at([PANEL.x + 2.6, face, FLOOR + ROWS * C + 2.4]), at([PANEL.x + PANEL.w - 2.6, face, FLOOR + ROWS * C + 2.4])], { size: 0.5, tone: "mid" }));
  return out.join("");
}

function post(plan, side) {
  const out = [];
  const collar = k.insetPlan(plan, -1.2);
  out.push(S(k.slabOf(collar, 0, 5, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf(plan, 5, TOP - 5, P, 3, 0.5), { tone: "mid", inner: L([60, 120, 180].map((z) => k.sideSeam(plan, z, P, 3)).join(""), { tone: "faint" }) }));
  out.push(D(k.corners(collar, 1.6).filter(([, y]) => y > plan.y + 4).map(([x, y]) => at([x, y, 5])), { size: 0.45 }));
  // row ruler on the front face
  const strip = { x: side === "left" ? plan.x + 1 : plan.x + 1, y: front(plan), w: plan.w - 2, d: 0.8, r: 0.3 };
  const z0 = FLOOR;
  const z1 = FLOOR + SHOWN * C + 2;
  out.push(S(k.slabOf(strip, z0 - 1, z1 - z0 + 1, P, 2), { tone: "lo", crease: "none" }));
  const fy = front(strip);
  const edge = side === "left" ? strip.x + strip.w : strip.x;
  const dir = side === "left" ? -1 : 1;
  const minor = [];
  const major = [];
  for (let r = 0; r <= SHOWN; r++) {
    const big = r % 5 === 0;
    const z = FLOOR + r * C;
    (big ? major : minor).push(k.segment([edge, fy, z], [edge + dir * (big ? 4 : 2.2), fy, z], P));
  }
  for (let r = 0; r < SHOWN; r++) {
    const z = FLOOR + r * C + C / 2;
    minor.push(k.segment([edge, fy, z], [edge + dir * 1.1, fy, z], P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  return out.join("");
}

function floorTray() {
  const out = [];
  out.push(S(k.slabOf(TRAY, 0, FLOOR, P, 2, 0.5), { tone: "mid" }));
  out.push(D([[TRAY.x + 2, front(TRAY) - 1.4], [TRAY.x + TRAY.w - 2, front(TRAY) - 1.4]].map(([x, y]) => at([x, y, FLOOR])), { size: 0.45 }));
  return out.join("");
}

function lip() {
  const out = [];
  out.push(S(k.slabOf(LIP, FLOOR, 3.4, P, 2, 0.4), { tone: "mid" }));
  out.push(D([12, 50, 88].map((x) => at([x, LIP.y + LIP.d / 2, FLOOR + 3.4])), { size: 0.4, tone: "lo" }));
  return out.join("");
}

function beam() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(BEAM, 6), TOP - 2, 0.1, P)}" style="filter:blur(6px);opacity:.5"/>`);
  out.push(S(k.slabOf(BEAM, TOP, BEAM_H, P, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(BEAM, TOP + 3, P, 3), { tone: "faint" }) }));
  const z = TOP + BEAM_H;
  out.push(D([[BEAM.x + 6, BEAM.y + 5], [BEAM.x + 6, front(BEAM) - 5], [BEAM.x + BEAM.w - 6, BEAM.y + 5], [BEAM.x + BEAM.w - 6, front(BEAM) - 5]].map(([x, y]) => at([x, y, z])), { size: 0.5 }));
  out.push(L(k.planOutline(k.insetPlan(BEAM, 3), z, P, 3), { tone: "faint" }));
  // hopper: the feed the pieces drop out of
  out.push(S(k.slabOf(HOPPER, z, 7, P, 4, 0.6), { tone: "mid" }));
  const slot = { x: HOPPER.x + 6, y: HOPPER.y + 5, w: HOPPER.w - 12, d: 6, r: 2.6 };
  out.push(L(k.planOutline(slot, z + 7, P, 6), { tone: "lo" }));
  out.push(D(k.corners(HOPPER, 2.2).map(([x, y]) => at([x, y, z + 7])), { size: 0.45 }));
  for (const x of [HOPPER.x - 9, HOPPER.x + HOPPER.w + 9]) {
    out.push(S(k.cylinder(x, 3, 3.6, z, 2.4, P, 20), { tone: "mid" }));
    out.push(L(k.ring(x, 3, 1.4, z + 2.4, P, 12), { tone: "lo" }));
  }
  return out.join("");
}

function dial() {
  const out = [];
  const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3.2, DIAL_TOP, 80, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_TOP - 3.2, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 2.6, 50, 5, DIAL_TOP, [1.1, 2.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(S(k.slabOf({ x: x + DIAL_R - 1, y: y - 2.2, w: 4.4, d: 4.4, r: 1.1 }, DIAL_Z + 2, 4, P, 3), { tone: "mid" }));
  out.push(S(k.cylinder(x + DIAL_R + 5, y, 2.4, DIAL_Z + 1.4, 5.4, P, 20), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 7], DIAL_TOP, P, "x"), "LINES", { size: 2.2, tone: "lo", anchor: "middle" }));
  out.push(`<path data-part="needle" class="iso-line" data-tone="hi" data-free="start" style="stroke-width:1.1" d=""/>`);
  out.push(L(k.ring(x, y, 1.5, DIAL_TOP + 0.2, P, 16), { tone: "mid" }));
  return out.join("");
}

function knob() {
  const out = [];
  const [x, y] = KNOB;
  out.push(S(k.cylinder(x, y, KNOB_R, KNOB_Z, KNOB_TOP - KNOB_Z, P, 36), { tone: "mid" }));
  out.push(L(k.knurl(x, y, KNOB_R, KNOB_Z, KNOB_TOP, 40, P), { tone: "lo" }));
  out.push(`<path data-part="pointer" class="iso-line" data-tone="hi" d=""/>`);
  out.push(D([at([x, y, KNOB_TOP])], { size: 0.55, tone: "hi" }));
  return out.join("");
}

// ---------- cube templates (built at the origin, placed with translateAlong) ----------
const cube = (size, gap, bevel) => k.slabOf({ x: gap, y: gap, w: size - gap * 2, d: size - gap * 2, r: size * 0.09 }, gap, size - gap * 2, P, 3, bevel);
const CUBE = cube(C, 0.45, 0.8);
const MINI_CUBE = cube(MINI, 0.3, 0.5);
const TEMPLATES = {
  stack: S(CUBE, { tone: "mid", crease: "lo" }),
  live: S(CUBE, { tone: "lit", crease: "mid", lit: true }),
  ghost: S(CUBE, { tone: "mid", crease: "faint", className: "ghost" }),
  mini: S(MINI_CUBE, { tone: "hi", crease: "lo" }),
};

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A falling-block well built as a bench instrument: a ten-column, twenty-row well between two ruled posts on a base plate, a hopper on the top beam that feeds the pieces, a hold tray and a next tray on brackets, a dial that counts lines toward the next level and a knob that shows the level.",
  body: [
    base(),
    holdShelf(),
    panel(),
    post(POST_L, "left"),
    floorTray(),
    `<g data-part="well"></g>`,
    lip(),
    post(POST_R, "right"),
    beam(),
    nextShelf(),
    knob(),
    dial(),
  ],
});

const CFG = {
  P,
  C,
  COLS,
  ROWS,
  SHOWN,
  FLOOR,
  MINI,
  SHELF_TOP: SHELF_Z + SHELF_H,
  NEXT_C: [NEXT_TRAY.x + NEXT_TRAY.w / 2, NEXT_TRAY.y + NEXT_TRAY.d / 2 - MINI / 2],
  HOLD_C: [HOLD_TRAY.x + HOLD_TRAY.w / 2, HOLD_TRAY.y + HOLD_TRAY.d / 2 - MINI / 2],
  DIAL,
  DIAL_R,
  DIAL_TOP,
  KNOB,
  KNOB_R,
  KNOB_TOP,
  TEMPLATES,
};

const plate = k.plateHtml({
  fig: "Fig 1",
  title: "Tetra well",
  hint: "← → move · ↑ turn · space drop",
  readout: "score 0 · lines 0 · lvl 1",
  keys: [
    { mark: "lit", label: "The falling piece" },
    { mark: "raised", label: "Locked blocks" },
    { mark: "dim", label: "Limit line: lock above it and the well is full" },
  ],
  caption:
    "Ten columns, twenty rows. Fill a row edge to edge and it clears; every ten lines the knob turns up a level and the pieces fall faster. The dial counts the lines toward the next level.",
  body: `<div class="iso-stage" tabindex="0" role="application" aria-label="Tetra well game. Arrow keys move and turn, space drops, C holds, P pauses.">${svg}<div class="tw-overlay" data-overlay><div class="tw-card"><div class="tw-big" data-overlay-title>TETRA WELL</div><div class="tw-sub" data-overlay-sub>Press Enter or tap to start</div></div></div></div>`,
});

const side = `
<aside class="tw-side">
  <div class="tw-stats">
    <div class="tw-stat tw-score"><span>Score</span><b data-stat="score">0</b></div>
    <div class="tw-stat"><span>Lines</span><b data-stat="lines">0</b></div>
    <div class="tw-stat"><span>Level</span><b data-stat="level">1</b></div>
    <div class="tw-stat"><span>Best</span><b data-stat="best">0</b></div>
  </div>
  <div class="tw-buttons">
    <button type="button" data-act="start">Start</button>
    <button type="button" data-act="pause">Pause</button>
    <button type="button" data-act="theme">Light</button>
    <button type="button" data-act="tint">Colour</button>
    <button type="button" data-act="sound">Sound on</button>
  </div>
  <dl class="tw-keys">
    <dt>← →</dt><dd>move</dd>
    <dt>↑ / X</dt><dd>turn right</dd>
    <dt>Z</dt><dd>turn left</dd>
    <dt>↓</dt><dd>soft drop</dd>
    <dt>Space</dt><dd>hard drop</dd>
    <dt>C / Shift</dt><dd>hold</dd>
    <dt>P / Esc</dt><dd>pause</dd>
  </dl>
</aside>`;

const pad = `
<div class="tw-pad" aria-label="Touch controls">
  <button type="button" data-key="hold" aria-label="Hold">HOLD</button>
  <button type="button" data-key="left" aria-label="Left">◀</button>
  <button type="button" data-key="rotate" aria-label="Turn">↻</button>
  <button type="button" data-key="right" aria-label="Right">▶</button>
  <button type="button" data-key="soft" aria-label="Soft drop">▼</button>
  <button type="button" data-key="drop" aria-label="Hard drop">DROP</button>
</div>`;

const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;transition:background .3s}
.tw-page{display:grid;grid-template-columns:minmax(0,640px) 230px;gap:28px;justify-content:center;align-items:start;width:min(920px,100% - 32px);margin:36px auto 64px}
.tw-page .iso-figure{margin:0}
.iso-stage{position:relative;outline:none;touch-action:none;user-select:none;-webkit-user-select:none}
.iso-stage .iso-svg{height:min(74vh,700px);width:100%}

.ghost{opacity:.22}
.cube{transition:opacity .16s ease}
.cube[data-gone]{opacity:0}
.tw-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;transition:opacity .35s var(--anatomy-ease)}
.tw-overlay[hidden]{display:flex;opacity:0}
.tw-card{background:color-mix(in srgb,var(--anatomy-card) 86%,transparent);box-shadow:0 0 0 1px var(--anatomy-mid);padding:14px 20px;text-align:center;font-family:var(--anatomy-mono);backdrop-filter:blur(2px)}
.tw-big{color:var(--anatomy-strong);letter-spacing:.24em;font-size:15px}
.tw-sub{color:var(--anatomy-muted);font-size:11px;letter-spacing:.08em;margin-top:4px;text-transform:uppercase}
.tw-side{display:grid;gap:18px;position:sticky;top:24px}
.tw-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--anatomy-mid);box-shadow:0 0 0 1px var(--anatomy-mid)}
.tw-stat{background:var(--anatomy-card);padding:10px 12px;display:grid;gap:2px}
.tw-stat span{font:10.5px var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted)}
.tw-stat b{font:500 18px var(--anatomy-mono);color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.tw-score{grid-column:1/-1}
.tw-score b{font-size:26px}
.tw-buttons{display:flex;flex-wrap:wrap;gap:6px}
.tw-side button,.tw-pad button{font:11px var(--anatomy-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-text);background:var(--anatomy-card);border:0;box-shadow:0 0 0 1px var(--anatomy-mid);padding:7px 10px;cursor:pointer;border-radius:0}
.tw-side button:hover,.tw-pad button:active{color:var(--anatomy-strong);box-shadow:0 0 0 1px var(--anatomy-hi)}
.tw-keys{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0;font:12px var(--anatomy-mono);color:var(--anatomy-muted)}
.tw-keys dt{color:var(--anatomy-text)}
.tw-keys dd{margin:0}
.tw-pad{display:none;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:14px}
.tw-pad button{padding:14px 0;font-size:14px}
@media (max-width:900px){.tw-page{grid-template-columns:minmax(0,640px);margin-top:16px}.tw-side{position:static}.tw-keys{display:none}}
@media (pointer:coarse){.tw-pad{display:grid}.tw-keys{display:none}.tw-page .iso-legend{display:none}}
@media (max-width:560px){.iso-stage .iso-svg{height:auto;max-height:68vh}.tw-page{width:calc(100% - 16px)}}
/* optional colour: one hue per piece kind, tones still from facing */
.cube[data-k="I"]{--h:188}.cube[data-k="O"]{--h:46}.cube[data-k="T"]{--h:284}.cube[data-k="S"]{--h:140}.cube[data-k="Z"]{--h:356}.cube[data-k="J"]{--h:222}.cube[data-k="L"]{--h:26}
.tint .cube .iso-fill{fill:hsl(var(--h) 34% 15%)}
.tint .cube .iso-top{fill:hsl(var(--h) 42% 30%)}
.tint .cube .iso-shade[data-shade="0"]{fill:hsl(var(--h) 34% 13%)}
.tint .cube .iso-shade[data-shade="1"]{fill:hsl(var(--h) 36% 16%)}
.tint .cube .iso-shade[data-shade="2"]{fill:hsl(var(--h) 38% 20%)}
.tint .cube .iso-shade[data-shade="3"]{fill:hsl(var(--h) 40% 24%)}
.tint .cube .iso-solid[data-lit]>.iso-top{fill:hsl(var(--h) 60% 46%)}
.tint .cube .iso-solid[data-lit]>.iso-shade{fill:hsl(var(--h) 50% 28%)}
.tint[data-theme="light"] .cube .iso-fill{fill:hsl(var(--h) 50% 80%)}
.tint[data-theme="light"] .cube .iso-top{fill:hsl(var(--h) 60% 86%)}
.tint[data-theme="light"] .cube .iso-shade[data-shade="0"]{fill:hsl(var(--h) 40% 66%)}
.tint[data-theme="light"] .cube .iso-shade[data-shade="1"]{fill:hsl(var(--h) 42% 70%)}
.tint[data-theme="light"] .cube .iso-shade[data-shade="2"]{fill:hsl(var(--h) 44% 74%)}
.tint[data-theme="light"] .cube .iso-shade[data-shade="3"]{fill:hsl(var(--h) 46% 78%)}
.tint[data-theme="light"] .cube .iso-solid[data-lit]>.iso-top{fill:hsl(var(--h) 80% 72%)}
.tint[data-theme="light"] .cube .iso-solid[data-lit]>.iso-shade{fill:hsl(var(--h) 60% 62%)}
`;

const escapeScript = (text) => text.replace(/<\/(script)/gi, "<\\/$1");
const script = `${kitSource}\nconst CFG = ${JSON.stringify(CFG)};\n${gameSource}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tetra Well — 3D falling blocks</title><style>${k.ISO_CSS}${PAGE_CSS}</style></head><body class="iso" data-theme="dark"><main class="tw-page"><div>${plate}${pad}</div>${side}</main><script type="module">${escapeScript(script)}</script></body></html>`;

writeFileSync(join(HERE, "index.html"), html);
console.log(`wrote index.html (${(html.length / 1024).toFixed(0)} KB)`);
