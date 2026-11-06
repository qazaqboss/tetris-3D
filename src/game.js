// Tetra Well: game logic and live drawing. Inlined after the Anatomy kit and CFG by build.mjs,
// so kit functions (translateAlong, lineOnTop, iso) are in scope.
const { P, C, COLS, ROWS, SHOWN, FLOOR, MINI, TEMPLATES } = CFG;
const NS = "http://www.w3.org/2000/svg";
const body = document.body;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const well = svg.querySelector('[data-part="well"]');
const nextTray = svg.querySelector('[data-part="next"]');
const holdTray = svg.querySelector('[data-part="hold"]');
const needle = svg.querySelector('[data-part="needle"]');
const pointer = svg.querySelector('[data-part="pointer"]');
const readout = document.querySelector("[data-readout]");
const overlay = document.querySelector("[data-overlay]");
const overlayTitle = document.querySelector("[data-overlay-title]");
const overlaySub = document.querySelector("[data-overlay-sub]");
const stat = Object.fromEntries([...document.querySelectorAll("[data-stat]")].map((el) => [el.dataset.stat, el]));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const store = {
  get(key, fallback) { try { const v = localStorage.getItem("tetra-well:" + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem("tetra-well:" + key, JSON.stringify(value)); } catch {} },
};

// ---------- pieces (SRS) ----------
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};
const KINDS = Object.keys(SHAPES);
const BOX = (kind) => (kind === "I" || kind === "O" ? 4 : 3);
const ROTATIONS = {};
for (const kind of KINDS) {
  const n = BOX(kind);
  const list = [SHAPES[kind]];
  for (let r = 1; r < 4; r++) list.push(kind === "O" ? SHAPES.O : list[r - 1].map(([x, y]) => [n - 1 - y, x]));
  ROTATIONS[kind] = list;
}
// kicks as [dx, dy] with y up, per "from>to"
const JLSTZ = {
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const IKICK = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const SCORE = [0, 100, 300, 500, 800];
const gravityOf = (level) => Math.pow(Math.max(0.05, 0.8 - (level - 1) * 0.007), level - 1);
const LOCK_DELAY = 0.5;
const MAX_RESETS = 15;
const DAS = 0.16;
const ARR = 0.04;

// ---------- state ----------
let board; // board[row][col] = null | { kind, node, off }
let piece = null; // { kind, rot, x, y } (x: box left column, y: box top row)
let disp = { x: 0, y: 0 }; // where the piece is drawn, eases to piece.x / piece.y
let bag = [];
let queue = [];
let hold = null;
let canHold = true;
let score = 0, lines = 0, level = 1;
let best = store.get("best", 0);
let mode = "attract"; // attract | play | paused | over
let fall = 0, lockTimer = 0, resets = 0;
let clearing = null; // { t, rows }
let soft = false;
const held = { dir: 0, das: 0, arr: 0 };
let ai = null;
let restartTimer = 0;
let overAt = 0;
let gauge = { lines: 0, level: 1 };

const cellsOf = (p, rot = p.rot, x = p.x, y = p.y) => ROTATIONS[p.kind][rot].map(([bx, by]) => [x + bx, y - by]);
const blocked = (col, row) => col < 0 || col >= COLS || row < 0 || row >= SHOWN || !!board[row][col];
const fits = (p, rot = p.rot, x = p.x, y = p.y) => cellsOf(p, rot, x, y).every(([c, r]) => !blocked(c, r));

function refill() {
  while (queue.length < 4) {
    if (!bag.length) {
      bag = [...KINDS];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    queue.push(bag.pop());
  }
}

// ---------- nodes ----------
function makeCube(template, kind) {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "cube");
  g.setAttribute("data-k", kind);
  g.innerHTML = template;
  return g;
}
const liveNodes = Array.from({ length: 4 }, () => makeCube(TEMPLATES.live, "T"));
const ghostNodes = Array.from({ length: 4 }, () => makeCube(TEMPLATES.ghost, "T"));
const fading = new Set();

function place(node, x, z) {
  const t = translateAlong(P, [x * C, 0, FLOOR + z * C]);
  if (node._t !== t) { node.setAttribute("transform", t); node._t = t; }
}

// ---------- game flow ----------
function reset(nextMode) {
  well.replaceChildren();
  fading.clear();
  board = Array.from({ length: SHOWN }, () => Array(COLS).fill(null));
  bag = []; queue = []; hold = null; canHold = true;
  score = 0; lines = 0; level = 1;
  fall = 0; lockTimer = 0; resets = 0; clearing = null; soft = false;
  held.dir = 0;
  mode = nextMode;
  refill();
  spawn();
  updateStats();
  drawTray(holdTray, hold, canHold);
}

function spawn(kind) {
  if (!kind) { kind = queue.shift(); refill(); }
  piece = { kind, rot: 0, x: 3, y: SHOWN - 1 };
  disp = { x: piece.x, y: piece.y + 0.6 };
  fall = 0; lockTimer = 0; resets = 0;
  for (const n of [...liveNodes, ...ghostNodes]) n.setAttribute("data-k", kind);
  drawTray(nextTray, queue[0], true);
  if (!fits(piece)) { piece = null; gameOver(); return; }
  if (mode === "attract") ai = plan();
}

function gameOver() {
  if (mode === "attract") { restartTimer = 2.2; mode = "over"; overlay.dataset.attract = ""; return; }
  mode = "over";
  overAt = performance.now();
  delete overlay.dataset.attract;
  if (score > best) { best = score; store.set("best", best); }
  updateStats();
  showOverlay("WELL FULL", `score ${score.toLocaleString("en")} · Enter or tap to play again`);
  sound("over");
}

function grounded() { return !fits(piece, piece.rot, piece.x, piece.y - 1); }

function move(dx) {
  if (!piece || clearing) return false;
  if (!fits(piece, piece.rot, piece.x + dx, piece.y)) return false;
  piece.x += dx;
  touched();
  sound("move");
  return true;
}

function rotate(dir) {
  if (!piece || clearing || piece.kind === "O") return false;
  const from = piece.rot;
  const to = (from + dir + 4) % 4;
  const kicks = (piece.kind === "I" ? IKICK : JLSTZ)[`${from}>${to}`];
  for (const [dx, dy] of kicks) {
    if (fits(piece, to, piece.x + dx, piece.y + dy)) {
      piece.rot = to; piece.x += dx; piece.y += dy;
      disp.x = piece.x; disp.y = piece.y; // a turn is drawn at once; only travel is eased
      touched();
      sound("turn");
      return true;
    }
  }
  return false;
}

function touched() {
  if (grounded() && resets < MAX_RESETS) { lockTimer = 0; resets++; }
}

function stepDown() {
  if (fits(piece, piece.rot, piece.x, piece.y - 1)) { piece.y -= 1; if (soft && mode === "play") score += 1; return true; }
  return false;
}

function hardDrop() {
  if (!piece || clearing) return;
  let n = 0;
  while (fits(piece, piece.rot, piece.x, piece.y - 1)) { piece.y--; n++; }
  if (mode === "play") score += n * 2;
  lock();
}

function holdPiece() {
  if (!piece || clearing || !canHold) return;
  const kind = piece.kind;
  canHold = false;
  if (hold) { const swap = hold; hold = kind; spawn(swap); }
  else { hold = kind; spawn(); }
  drawTray(holdTray, hold, canHold);
  sound("turn");
}

function lock() {
  const cells = cellsOf(piece);
  const dropFrom = Math.max(0, disp.y - piece.y);
  for (const [c, r] of cells) {
    const node = makeCube(TEMPLATES.stack, piece.kind);
    well.appendChild(node);
    board[r][c] = { kind: piece.kind, node, off: still.matches ? 0 : dropFrom };
  }
  const lockedOut = cells.every(([, r]) => r >= ROWS);
  piece = null;
  canHold = true;
  drawTray(holdTray, hold, canHold);
  const full = [];
  for (let r = 0; r < SHOWN; r++) if (board[r].every(Boolean)) full.push(r);
  if (full.length) {
    for (const r of full) for (const cell of board[r]) cell.node.innerHTML = TEMPLATES.live;
    clearing = { t: 0, rows: full };
    lines += full.length;
    if (mode === "play") score += SCORE[full.length] * level;
    level = 1 + Math.floor(lines / 10);
    sound(full.length === 4 ? "four" : "clear");
  } else {
    sound("lock");
  }
  updateStats();
  if (lockedOut && !full.length) { gameOver(); return; }
  if (!full.length) spawn();
}

function finishClear() {
  const { rows } = clearing;
  const kept = [];
  for (let r = 0; r < SHOWN; r++) {
    if (rows.includes(r)) { for (const cell of board[r]) { cell.node.remove(); } continue; }
    kept.push({ from: r, row: board[r] });
  }
  board = Array.from({ length: SHOWN }, () => Array(COLS).fill(null));
  kept.forEach(({ from, row }, to) => {
    row.forEach((cell, c) => { if (cell) { cell.off += still.matches ? 0 : from - to; board[to][c] = cell; } });
  });
  clearing = null;
  spawn();
}

// ---------- attract mode: a small placement planner ----------
function plan() {
  let bestMove = null;
  const grid = board.map((row) => row.map(Boolean));
  for (let rot = 0; rot < (piece.kind === "O" ? 1 : 4); rot++) {
    for (let x = -3; x < COLS; x++) {
      const p = { ...piece, rot, x };
      if (!fits(p)) continue;
      while (fits(p, rot, x, p.y - 1)) p.y--;
      const g = grid.map((row) => [...row]);
      for (const [c, r] of cellsOf(p)) g[r][c] = true;
      const left = g.filter((row) => !row.every(Boolean));
      const cleared = SHOWN - left.length;
      while (left.length < SHOWN) left.push(Array(COLS).fill(false));
      let height = 0, holes = 0, bump = 0, prev = -1;
      for (let c = 0; c < COLS; c++) {
        let h = 0;
        for (let r = SHOWN - 1; r >= 0; r--) if (left[r][c]) { h = r + 1; break; }
        for (let r = 0; r < h; r++) if (!left[r][c]) holes++;
        height += h;
        if (prev >= 0) bump += Math.abs(h - prev);
        prev = h;
      }
      const value = -0.51 * height + 0.76 * cleared - 0.36 * holes - 0.18 * bump;
      if (!bestMove || value > bestMove.value) bestMove = { value, rot, x };
    }
  }
  return bestMove && { ...bestMove, t: 0.35 };
}

function driveAI(dt) {
  if (!piece || !ai || clearing) return;
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = 0.085;
  if (piece.rot !== ai.rot) { if (!rotate(1)) ai.rot = piece.rot; return; }
  if (piece.x < ai.x) { if (!move(1)) ai.x = piece.x; return; }
  if (piece.x > ai.x) { if (!move(-1)) ai.x = piece.x; return; }
  ai.t = 0.12;
  hardDrop();
}

// ---------- frame loop ----------
let last = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (mode === "play" || mode === "attract") update(dt);
  if (mode === "over" && restartTimer > 0) { restartTimer -= dt; if (restartTimer <= 0) reset("attract"); }
  animate(dt);
  render();
  syncMusic();
  requestAnimationFrame(tick);
}

function update(dt) {
  if (clearing) {
    clearing.t += dt;
    if (clearing.t > 0.12 && !clearing.faded) {
      clearing.faded = true;
      for (const r of clearing.rows) for (const cell of board[r]) cell.node.setAttribute("data-gone", "");
    }
    if (clearing.t > (still.matches ? 0.12 : 0.3)) finishClear();
    return;
  }
  if (!piece) return;
  if (mode === "attract") driveAI(dt);
  if (!piece) return;
  if (held.dir && mode === "play") {
    held.das -= dt;
    if (held.das <= 0) {
      held.arr -= dt;
      while (held.arr <= 0) { held.arr += ARR; if (!move(held.dir)) break; }
    }
  }
  const interval = soft && mode === "play" ? Math.min(gravityOf(level), 0.035) : gravityOf(mode === "attract" ? 1 : level);
  fall += dt;
  while (fall >= interval && piece) {
    fall -= interval;
    if (!stepDown()) { fall = 0; break; }
  }
  if (piece && grounded()) {
    lockTimer += dt;
    if (lockTimer >= LOCK_DELAY) lock();
  } else lockTimer = 0;
}

const follow = (value, target, dt, tau) => (still.matches ? target : target + (value - target) * Math.exp(-dt / tau));

function animate(dt) {
  if (piece) {
    disp.x = follow(disp.x, piece.x, dt, 0.035);
    disp.y = follow(disp.y, piece.y, dt, 0.045);
    if (Math.abs(disp.x - piece.x) < 0.01) disp.x = piece.x;
    if (Math.abs(disp.y - piece.y) < 0.01) disp.y = piece.y;
  }
  for (const row of board) for (const cell of row) {
    if (cell && cell.off) { cell.off = follow(cell.off, 0, dt, 0.055); if (cell.off < 0.01) cell.off = 0; }
  }
  gauge.lines = follow(gauge.lines, lines, dt, 0.25);
  gauge.level = follow(gauge.level, level, dt, 0.3);
}

let order = [];
function render() {
  const items = [];
  const sliding = piece && Math.abs(disp.x - piece.x) > 0.02;
  const key = (x, z) => (sliding ? Math.round(z) * 1000 + x : x * 1000 + z);
  for (let r = 0; r < SHOWN; r++) for (let c = 0; c < COLS; c++) {
    const cell = board[r][c];
    if (!cell) continue;
    const z = r + cell.off;
    place(cell.node, c, z);
    items.push([key(c, z), cell.node]);
  }
  if (piece) {
    const live = cellsOf(piece, piece.rot, 0, 0);
    let gy = piece.y;
    while (fits(piece, piece.rot, piece.x, gy - 1)) gy--;
    const own = new Set(cellsOf(piece).map(([c, r]) => c + "," + r));
    live.forEach(([bx, by], i) => {
      const x = disp.x + bx, z = disp.y + by;
      place(liveNodes[i], x, z);
      items.push([key(x, z), liveNodes[i]]);
      const gc = piece.x + bx, gr = gy + by;
      if (gy < piece.y && !own.has(gc + "," + gr) && mode !== "attract") {
        place(ghostNodes[i], gc, gr);
        items.push([key(gc, gr) - 0.001, ghostNodes[i]]);
      }
    });
  }
  items.sort((a, b) => a[0] - b[0]);
  const nodes = items.map(([, n]) => n);
  let same = nodes.length === order.length;
  for (let i = 0; same && i < nodes.length; i++) if (nodes[i] !== order[i]) same = false;
  if (!same) {
    for (const n of [...liveNodes, ...ghostNodes]) if (!nodes.includes(n) && n.parentNode) n.remove();
    nodes.forEach((n, i) => { if (well.childNodes[i] !== n) well.insertBefore(n, well.childNodes[i] || null); });
    order = nodes;
  }
  // dial: lines toward the next level; knob: the level
  const turn = (gauge.lines % 10) / 10;
  const a = turn * Math.PI * 2;
  const [dx, dy] = CFG.DIAL;
  const R = CFG.DIAL_R - 3.4;
  const d = lineOnTop([dx - Math.sin(a) * 3.2, dy + Math.cos(a) * 3.2], [dx + Math.sin(a) * R, dy - Math.cos(a) * R], CFG.DIAL_TOP + 0.2, P);
  if (needle._d !== d) { needle.setAttribute("d", d); needle._d = d; }
  const ka = -Math.PI * 0.75 + (Math.min(gauge.level, 16) - 1) / 15 * Math.PI * 1.5;
  const [kx, ky] = CFG.KNOB;
  const kd = lineOnTop([kx, ky], [kx + Math.sin(ka) * (CFG.KNOB_R - 1.2), ky - Math.cos(ka) * (CFG.KNOB_R - 1.2)], CFG.KNOB_TOP, P);
  if (pointer._d !== kd) { pointer.setAttribute("d", kd); pointer._d = kd; }
}

function drawTray(tray, kind, active) {
  if (!kind) { tray.replaceChildren(); return; }
  const cells = ROTATIONS[kind][0];
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const midX = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
  const maxY = Math.max(...ys);
  const [cx, cy] = tray === nextTray ? CFG.NEXT_C : CFG.HOLD_C;
  const placed = cells
    .map(([bx, by]) => [cx + (bx - midX) * MINI, CFG.SHELF_TOP + (maxY - by) * MINI])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  tray.innerHTML = placed.map(([x, z]) => `<g class="cube" data-k="${kind}" transform="${translateAlong(P, [x, cy, z])}">${TEMPLATES.mini}</g>`).join("");
  tray.style.opacity = active ? "" : "0.45";
}

function updateStats() {
  const demo = mode === "attract" || (mode === "over" && "attract" in overlay.dataset);
  const text = demo ? "demo · press Enter to play" : `score ${score.toLocaleString("en")} · lines ${lines} · lvl ${level}`;
  if (readout.textContent !== text) readout.textContent = text;
  stat.score.textContent = score.toLocaleString("en");
  stat.lines.textContent = lines;
  stat.level.textContent = level;
  stat.best.textContent = Math.max(best, mode === "play" ? score : 0).toLocaleString("en");
}

function showOverlay(title, sub) { overlayTitle.textContent = title; overlaySub.textContent = sub; overlay.hidden = false; }
function hideOverlay() { overlay.hidden = true; }

function start() {
  ensureAudio();
  song.step = 0;
  reset("play");
  hideOverlay();
  stage.focus({ preventScroll: true });
}
function togglePause() {
  if (mode === "play") { mode = "paused"; showOverlay("PAUSED", "P or tap to resume"); }
  else if (mode === "paused") { mode = "play"; hideOverlay(); }
}

// ---------- input ----------
const playing = () => mode === "play";
function press(action) {
  if (mode === "over" && !("attract" in overlay.dataset) && performance.now() - overAt < 900) return;
  if (mode === "attract" || mode === "over") { if (action !== "pause") start(); return; }
  if (mode === "paused") { if (action === "pause") togglePause(); return; }
  if (action === "left" || action === "right") {
    const dir = action === "left" ? -1 : 1;
    move(dir);
    held.dir = dir; held.das = DAS; held.arr = 0;
  } else if (action === "rotate") rotate(1);
  else if (action === "rotateLeft") rotate(-1);
  else if (action === "soft") soft = true;
  else if (action === "drop") hardDrop();
  else if (action === "hold") holdPiece();
  else if (action === "pause") togglePause();
  updateStats();
}
function release(action) {
  if ((action === "left" && held.dir === -1) || (action === "right" && held.dir === 1)) held.dir = 0;
  if (action === "soft") soft = false;
}
const KEYMAP = {
  ArrowLeft: "left", ArrowRight: "right", ArrowDown: "soft", ArrowUp: "rotate", x: "rotate", X: "rotate",
  z: "rotateLeft", Z: "rotateLeft", Control: "rotateLeft", " ": "drop", c: "hold", C: "hold", Shift: "hold",
  p: "pause", P: "pause", Escape: "pause", m: "music", M: "music",
  a: "left", A: "left", d: "right", D: "right", s: "soft", S: "soft", w: "rotate", W: "rotate",
};
addEventListener("keydown", (event) => {
  if (event.target.closest && event.target.closest("button") && (event.key === " " || event.key === "Enter")) return;
  if (event.key === "Enter") { event.preventDefault(); if (mode === "paused") togglePause(); else if (mode !== "play") start(); return; }
  const action = KEYMAP[event.key];
  if (!action) return;
  event.preventDefault();
  if (event.repeat) return;
  if (action === "music") { ensureAudio(); applyMusic(!musicOn); return; }
  press(action);
});
addEventListener("keyup", (event) => { const action = KEYMAP[event.key]; if (action) release(action); });
addEventListener("blur", () => { held.dir = 0; soft = false; if (mode === "play") togglePause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") togglePause(); });

// touch on the drawing: drag sideways to move, flick down to drop, tap to turn
let touch = null;
stage.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") { stage.focus({ preventScroll: true }); if (mode !== "play") press("rotate"); return; }
  touch = { x: event.clientX, y: event.clientY, t: performance.now(), moved: 0, steps: 0 };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (!touch || !playing()) return;
  const step = Math.max(18, stage.clientWidth / 22);
  const steps = Math.trunc((event.clientX - touch.x) / step);
  while (touch.steps < steps) { move(1); touch.steps++; touch.moved = 1; }
  while (touch.steps > steps) { move(-1); touch.steps--; touch.moved = 1; }
  soft = event.clientY - touch.y > 40 && !touch.moved;
});
stage.addEventListener("pointerup", (event) => {
  if (!touch) return;
  const dy = event.clientY - touch.y, dt = performance.now() - touch.t;
  soft = false;
  if (mode !== "play" && mode !== "paused") press("rotate");
  else if (mode === "paused") togglePause();
  else if (!touch.moved && dy > 50 && dt < 260) hardDrop();
  else if (!touch.moved && Math.abs(dy) < 12 && Math.abs(event.clientX - touch.x) < 12) rotate(1);
  touch = null;
  updateStats();
});
stage.addEventListener("pointercancel", () => { touch = null; soft = false; });

// on-screen pad
for (const button of document.querySelectorAll("[data-key]")) {
  const action = button.dataset.key;
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); ensureAudio(); press(action); });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, () => release(action));
}

// side buttons
const applyTheme = (theme) => {
  body.dataset.theme = theme;
  document.querySelector('[data-act="theme"]').textContent = theme === "dark" ? "Light" : "Dark";
  store.set("theme", theme);
};
const applyTint = (on) => {
  body.classList.toggle("tint", on);
  document.querySelector('[data-act="tint"]').textContent = on ? "Mono" : "Colour";
  store.set("tint", on);
};
let soundOn = store.get("sound", true);
const applySound = (on) => { soundOn = on; document.querySelector('[data-act="sound"]').textContent = on ? "Sound on" : "Sound off"; store.set("sound", on); };
document.querySelector('[data-act="start"]').addEventListener("click", start);
document.querySelector('[data-act="pause"]').addEventListener("click", () => { togglePause(); stage.focus({ preventScroll: true }); });
document.querySelector('[data-act="theme"]').addEventListener("click", () => applyTheme(body.dataset.theme === "dark" ? "light" : "dark"));
document.querySelector('[data-act="tint"]').addEventListener("click", () => applyTint(!body.classList.contains("tint")));
document.querySelector('[data-act="sound"]').addEventListener("click", () => { ensureAudio(); applySound(!soundOn); });
document.querySelector('[data-act="music"]').addEventListener("click", () => { ensureAudio(); applyMusic(!musicOn); });
for (const b of document.querySelectorAll("[data-act]")) b.addEventListener("click", () => stage.focus({ preventScroll: true }));
applyTheme(store.get("theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
applyTint(store.get("tint", false));
applySound(soundOn);

// ---------- sound: small synthesized ticks, quiet ----------
let audio = null;
function ensureAudio() {
  if (audio) { if (audio.state === "suspended") audio.resume(); return; }
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
}
const VOICES = {
  move: [[620, 0.025, 0.03, "square"]],
  turn: [[880, 0.04, 0.04, "triangle"]],
  lock: [[140, 0.09, 0.12, "triangle"]],
  clear: [[523, 0.09, 0.08, "triangle"], [784, 0.12, 0.08, "triangle", 0.07]],
  four: [[523, 0.1, 0.1, "triangle"], [659, 0.1, 0.1, "triangle", 0.07], [784, 0.1, 0.1, "triangle", 0.14], [1047, 0.2, 0.1, "triangle", 0.21]],
  over: [[392, 0.2, 0.1, "triangle"], [311, 0.25, 0.1, "triangle", 0.18], [233, 0.4, 0.1, "triangle", 0.38]],
};
function sound(name) {
  if (!audio || !soundOn || mode === "attract") return;
  const now = audio.currentTime;
  for (const [freq, len, gain, type, delay = 0] of VOICES[name]) {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, now + delay);
    amp.gain.linearRampToValueAtTime(gain * 0.5, now + delay + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + delay + len);
    osc.connect(amp).connect(audio.destination);
    osc.start(now + delay);
    osc.stop(now + delay + len + 0.02);
  }
}

// ---------- music: an original 8-bar loop, synthesized live (no audio files) ----------
// A minor, i–VI–III–VII (Am F C G). Melody, bass, arpeggio and soft drums on a 16th-note grid,
// scheduled slightly ahead on the audio clock. Tempo rises a little with the level.
let musicOn = store.get("music", true);
function applyMusic(on) { musicOn = on; document.querySelector('[data-act="music"]').textContent = on ? "Music on" : "Music off"; store.set("music", on); }
applyMusic(musicOn);
const CHORDS = [
  { root: 45, arp: [57, 60, 64] }, // Am
  { root: 41, arp: [53, 57, 60] }, // F
  { root: 48, arp: [55, 60, 64] }, // C
  { root: 43, arp: [55, 59, 62] }, // G
];
const _ = null;
// semitones above A4, one entry per eighth note
const MELODY = [
  [[7, _, 12, _, 10, 8, 7, _], [8, _, 5, 7, 8, _, 12, _], [10, _, 7, _, 3, 5, 7, _], [5, _, 2, _, -2, _, _, _]],
  [[12, _, 15, 14, 12, _, 10, _], [8, 10, 12, _, 8, _, 5, _], [7, _, 10, 8, 7, 3, 7, _], [10, _, 7, _, 2, _, _, _]],
];
const song = { running: false, step: 0, next: 0, timer: 0, bus: null, noise: null };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
function musicBus() {
  if (song.bus) return song.bus;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 3200; filter.Q.value = 0.3;
  const gain = audio.createGain();
  gain.gain.value = 0;
  filter.connect(gain).connect(audio.destination);
  const buffer = audio.createBuffer(1, audio.sampleRate * 0.3, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  song.noise = buffer;
  song.bus = { input: filter, gain };
  return song.bus;
}
function note(t, freq, len, peak, type, glide = 0) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + len);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(amp).connect(song.bus.input);
  osc.start(t);
  osc.stop(t + len + 0.03);
}
function hiss(t, len, peak, cutoff) {
  const src = audio.createBufferSource();
  src.buffer = song.noise;
  const filter = audio.createBiquadFilter();
  filter.type = "highpass"; filter.frequency.value = cutoff;
  const amp = audio.createGain();
  amp.gain.setValueAtTime(peak, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter).connect(amp).connect(song.bus.input);
  src.start(t);
  src.stop(t + len + 0.02);
}
function playStep(step, t, sixteenth) {
  const s = step % 16;
  const bar = Math.floor(step / 16) % 8;
  const chord = CHORDS[bar % 4];
  const section = bar < 4 ? 0 : 1;
  if (s % 2 === 0) {
    note(t, hz(chord.root + (s % 4 === 2 ? 12 : 0)), sixteenth * 1.8, 0.32, "triangle");
    const line = MELODY[section][bar % 4];
    const i = s / 2;
    if (line[i] !== null) {
      let length = 1;
      while (i + length < line.length && line[i + length] === null) length++;
      note(t, hz(69 + line[i]), sixteenth * 2 * length * 0.92, 0.075, "square");
      note(t, hz(69 + line[i]) * 1.003, sixteenth * 2 * length * 0.92, 0.05, "triangle");
    }
  }
  const arp = chord.arp[[0, 1, 2, 1][s % 4]] + 12;
  note(t, hz(arp), sixteenth * 0.9, section ? 0.03 : 0.018, "square");
  if (s === 0 || s === 8 || (section && s === 10)) note(t, 150, 0.16, 0.5, "sine", 45);
  if (s === 4 || s === 12) hiss(t, 0.12, 0.09, 1800);
  if (s % 2 === 1) hiss(t, 0.035, 0.035, 7000);
}
function scheduler() {
  const bpm = Math.min(150, 108 + (level - 1) * 4);
  const sixteenth = 60 / bpm / 4;
  while (song.next < audio.currentTime + 0.15) {
    playStep(song.step, song.next, sixteenth);
    song.step = (song.step + 1) % 128;
    song.next += sixteenth;
  }
}
function syncMusic() {
  const want = !!audio && musicOn && mode === "play" && !document.hidden;
  if (want === song.running) return;
  song.running = want;
  if (want) {
    const bus = musicBus();
    bus.gain.gain.cancelScheduledValues(audio.currentTime);
    bus.gain.gain.setTargetAtTime(0.42, audio.currentTime, 0.3);
    song.next = audio.currentTime + 0.06;
    scheduler();
    song.timer = setInterval(scheduler, 25);
  } else {
    clearInterval(song.timer);
    if (song.bus) song.bus.gain.gain.setTargetAtTime(0, audio.currentTime, 0.08);
  }
}

// ---------- go ----------
reset("attract");
showOverlay("TETRA WELL", "Press Enter or tap to start");
requestAnimationFrame(tick);
window.__tetra = { get state() { return { mode, score, lines, level, piece, board: board.map((r) => r.map((c) => (c ? c.kind : "."))) }; }, start, press, release };
