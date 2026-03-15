const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const restartBtn = document.getElementById('restart');
const soundBtn = document.getElementById('soundToggle');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayScore = document.getElementById('overlayScore');
const overlayRestartBtn = document.getElementById('overlayRestart');

const COLORS = { I:'#27d9ff', O:'#ffd625', T:'#b478ff', S:'#5dff7a', Z:'#ff5b65', J:'#4a78ff', L:'#ff9a3b' };
const SHAPES = {
  I:[[1,1,1,1]], O:[[1,1],[1,1]], T:[[0,1,0],[1,1,1]],
  S:[[0,1,1],[1,1,0]], Z:[[1,1,0],[0,1,1]],
  J:[[1,0,0],[1,1,1]], L:[[0,0,1],[1,1,1]]
};

const BAG = Object.keys(SHAPES);
let board, current, nextPiece, score, lines, level, dropInterval, lastTime, dropCounter, isPaused, gameOver, bagPool = [];

const audio = {
  enabled: true,
  ctx: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  beep(freq = 440, duration = 0.07, type = 'square', volume = 0.04) {
    if (!this.enabled) return;
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  },
  lineClear(cleared) {
    [660, 740, 880, 1040].slice(0, cleared).forEach((f, i) => setTimeout(() => this.beep(f, 0.07, 'triangle', 0.05), i * 40));
  },
  gameOver() {
    [380, 280, 200].forEach((f, i) => setTimeout(() => this.beep(f, 0.15, 'sawtooth', 0.06), i * 120));
  }
};

function createBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
function refillBag() {
  const copy = [...BAG];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  bagPool.push(...copy);
}
function randomType() { if (!bagPool.length) refillBag(); return bagPool.pop(); }
function makePiece(type = randomType()) { return { type, shape: SHAPES[type].map(r => [...r]), x:0, y:0, color: COLORS[type] }; }

function spawnPiece() {
  current = nextPiece || makePiece();
  nextPiece = makePiece();
  current.x = Math.floor((COLS - current.shape[0].length) / 2);
  current.y = -topPadding(current.shape);

  if (collide(current, 0, 0)) {
    gameOver = true;
    showOverlay('💀 Game Over', 'Se llenó el tablero.', `Puntaje final: ${score}`);
    overlayRestartBtn.classList.remove('hidden');
    audio.gameOver();
  }
}

function topPadding(shape) {
  let pad = 0;
  for (let y = 0; y < shape.length; y++) {
    if (shape[y].some(Boolean)) break;
    pad++;
  }
  return pad;
}

function collide(piece, dx, dy, testShape = piece.shape) {
  for (let y = 0; y < testShape.length; y++) {
    for (let x = 0; x < testShape[y].length; x++) {
      if (!testShape[y][x]) continue;
      const nx = piece.x + x + dx;
      const ny = piece.y + y + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge(piece) {
  piece.shape.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    const by = piece.y + y;
    const bx = piece.x + x;
    if (by >= 0) board[by][bx] = piece.color;
  }));
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }
  if (!cleared) return;

  const points = [0, 100, 300, 500, 800];
  score += points[cleared] * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(90, 900 - (level - 1) * 70);
  updateHud();
  audio.lineClear(cleared);
}

function move(dx) {
  if (!collide(current, dx, 0)) {
    current.x += dx;
    audio.beep(460, 0.03, 'square', 0.02);
  }
}

function rotate() {
  const rotated = current.shape[0].map((_, i) => current.shape.map(r => r[i]).reverse());
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collide(current, kick, 0, rotated)) {
      current.shape = rotated;
      current.x += kick;
      audio.beep(700, 0.04, 'triangle', 0.03);
      return;
    }
  }
}

function softDrop(fromInput = false) {
  if (!collide(current, 0, 1)) {
    current.y++;
    if (fromInput) audio.beep(340, 0.02, 'square', 0.02);
    return true;
  }
  merge(current);
  audio.beep(180, 0.05, 'sawtooth', 0.03);
  clearLines();
  spawnPiece();
  return false;
}

function hardDrop() {
  let steps = 0;
  while (!collide(current, 0, 1)) {
    current.y++;
    steps++;
  }
  score += steps * 2;
  updateHud();
  audio.beep(900, 0.06, 'triangle', 0.05);
  softDrop();
}

function drawCell(c, x, y, color, size = BLOCK) {
  c.fillStyle = color;
  c.fillRect(x * size, y * size, size, size);
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.strokeRect(x * size + .5, y * size + .5, size - 1, size - 1);
}

function drawBoard() {
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x]) drawCell(ctx, x, y, board[y][x]);

  if (current && !gameOver) {
    drawGhost();
    current.shape.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      const px = current.x + x, py = current.y + y;
      if (py >= 0) drawCell(ctx, px, py, current.color);
    }));
  }
  drawGrid();
}

function drawGhost() {
  const ghost = { ...current, y: current.y, shape: current.shape };
  while (!collide(ghost, 0, 1)) ghost.y++;
  ctx.globalAlpha = 0.2;
  ghost.shape.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    const gx = ghost.x + x, gy = ghost.y + y;
    if (gy >= 0) drawCell(ctx, gx, gy, current.color);
  }));
  ctx.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * BLOCK + .5, 0); ctx.lineTo(x * BLOCK + .5, boardCanvas.height); ctx.stroke(); }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * BLOCK + .5); ctx.lineTo(boardCanvas.width, y * BLOCK + .5); ctx.stroke(); }
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;
  const shape = nextPiece.shape, size = 24;
  const ox = Math.floor((nextCanvas.width - shape[0].length * size) / 2);
  const oy = Math.floor((nextCanvas.height - shape.length * size) / 2);
  shape.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    nextCtx.fillStyle = nextPiece.color;
    nextCtx.fillRect(ox + x * size, oy + y * size, size, size);
    nextCtx.strokeStyle = 'rgba(255,255,255,.22)';
    nextCtx.strokeRect(ox + x * size + .5, oy + y * size + .5, size - 1, size - 1);
  }));
}

function updateHud() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = lines;
}

function showOverlay(title, text, scoreText = '') {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayScore.textContent = scoreText;
  overlay.classList.remove('hidden');
}
function hideOverlay() { overlay.classList.add('hidden'); }

function togglePause() {
  if (gameOver) return;
  isPaused = !isPaused;
  if (isPaused) showOverlay('Pausa', 'Pulsa P para continuar');
  else { hideOverlay(); lastTime = performance.now(); requestAnimationFrame(update); }
}

function update(time = 0) {
  if (isPaused || gameOver) return;
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;

  if (dropCounter >= dropInterval) {
    softDrop();
    dropCounter = 0;
  }

  drawBoard();
  drawNext();
  requestAnimationFrame(update);
}

function resetGame() {
  board = createBoard();
  bagPool = [];
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 900;
  dropCounter = 0;
  lastTime = 0;
  isPaused = false;
  gameOver = false;
  nextPiece = makePiece();
  spawnPiece();
  updateHud();
  hideOverlay();
  overlayRestartBtn.classList.add('hidden');
  drawBoard();
  drawNext();
  requestAnimationFrame(update);
}

function handleAction(action) {
  if (action === 'pause') return togglePause();
  if (isPaused || gameOver) return;

  if (action === 'left') move(-1);
  if (action === 'right') move(1);
  if (action === 'down') { if (softDrop(true)) score += 1; updateHud(); dropCounter = 0; }
  if (action === 'rotate') rotate();
  if (action === 'drop') hardDrop();

  drawBoard();
  drawNext();
}

document.addEventListener('keydown', (e) => {
  const key = e.key;
  if (key.toLowerCase() === 'p') return handleAction('pause');
  if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' ','Spacebar'].includes(key)) e.preventDefault();

  if (key === 'ArrowLeft') handleAction('left');
  if (key === 'ArrowRight') handleAction('right');
  if (key === 'ArrowDown') handleAction('down');
  if (key === 'ArrowUp') handleAction('rotate');
  if (key === ' ' || key === 'Spacebar') handleAction('drop');
});

document.querySelectorAll('.touch button').forEach((btn) => {
  const action = btn.dataset.action;
  const run = (ev) => { ev.preventDefault(); audio.ensure(); handleAction(action); };
  btn.addEventListener('touchstart', run, { passive: false });
  btn.addEventListener('click', run);
});

soundBtn.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  soundBtn.textContent = audio.enabled ? '🔊 Sonido: ON' : '🔇 Sonido: OFF';
  if (audio.enabled) audio.beep(520, 0.05, 'triangle', 0.03);
});

restartBtn.addEventListener('click', () => { audio.ensure(); resetGame(); });
overlayRestartBtn.addEventListener('click', () => { audio.ensure(); resetGame(); });
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });

resetGame();
