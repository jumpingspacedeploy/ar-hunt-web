// ======================================================
// AR Hunt — WebXR-style Camera Experience
// ======================================================

const cameraVideo = document.getElementById("cameraVideo");
const worldLayer = document.getElementById("worldLayer");

const scoreText = document.getElementById("scoreText");
const timeText = document.getElementById("timeText");
const instructionBox = document.getElementById("instructionBox");

const startButton = document.getElementById("startButton");
const captureButton = document.getElementById("captureButton");
const restartButton = document.getElementById("restartButton");

const resultPanel = document.getElementById("resultPanel");
const finalScoreText = document.getElementById("finalScoreText");
const finalTimeText = document.getElementById("finalTimeText");

const dwellRing = document.getElementById("dwellRing");

// ==========================
// Setting Game
// ==========================

const maxScore = 5;
const captureRadius = 100;
const itemsPerWave = 5;
const respawnDelay = 360;
const autoMoveInterval = 3200;

// Durasi tahan crosshair agar auto-capture (ms)
const DWELL_MS = 750;
const DWELL_CIRCUMFERENCE = 264; // 2 * π * 42

const itemList = [
  { name: "item1", src: "assets/item1.png", isScoreItem: false },
  { name: "item2", src: "assets/item2.png", isScoreItem: false },
  { name: "item3", src: "assets/item3.png", isScoreItem: false },
  { name: "item4", src: "assets/item4.png", isScoreItem: false },
  { name: "item5", src: "assets/item5.png", isScoreItem: true }
];

// ==========================
// State
// ==========================

let activeItems = [];

let score = 0;
let startTime = 0;
let elapsedTime = 0;

let gameStarted = false;
let gameFinished = false;

let timerId = null;
let animationId = null;
let autoMoveId = null;
let respawnId = null;

let lastFrameTime = performance.now();

let motionEnabled = false;

let orientationState = {
  beta: 0,
  gamma: 0,
  baseBeta: null,
  baseGamma: null
};

// State dwell (gaze-based capture)
let dwellTarget = null;
let dwellStart = 0;
let isDwelling = false;

// ==========================
// Utility
// ==========================

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomItem() {
  return itemList[Math.floor(Math.random() * itemList.length)];
}

function shuffledItems() {
  return [...itemList].sort(() => Math.random() - 0.5);
}

function updateScoreUI() {
  scoreText.textContent = score;
}

function updateTimeUI() {
  if (!gameStarted || gameFinished) return;
  elapsedTime = (performance.now() - startTime) / 1000;
  timeText.textContent = elapsedTime.toFixed(1);
}

function setInstruction(text) {
  instructionBox.textContent = text;
}

// ==========================
// Camera
// ==========================

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    cameraVideo.srcObject = stream;
    await cameraVideo.play();
    return true;
  } catch (error) {
    console.error(error);
    setInstruction("Kamera gagal dibuka. Pastikan izin kamera aktif dan web dibuka lewat HTTPS.");
    return false;
  }
}

// ==========================
// Device Orientation / Gyro
// ==========================

async function enableMotionPermission() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      motionEnabled = permission === "granted";
    } catch (error) {
      motionEnabled = false;
    }
  } else {
    motionEnabled = true;
  }

  if (motionEnabled) {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }
}

function handleOrientation(event) {
  const beta = event.beta || 0;
  const gamma = event.gamma || 0;

  if (orientationState.baseBeta === null) orientationState.baseBeta = beta;
  if (orientationState.baseGamma === null) orientationState.baseGamma = gamma;

  orientationState.beta = beta;
  orientationState.gamma = gamma;
}

// Mengembalikan parallax shift + 3D tilt dari gyro
function getMotionData() {
  if (!motionEnabled) return { x: 0, y: 0, tiltX: 0, tiltY: 0 };

  const dGamma = orientationState.gamma - (orientationState.baseGamma || 0);
  const dBeta = orientationState.beta - (orientationState.baseBeta || 0);

  return {
    // Translasi parallax
    x: clamp(dGamma * 7, -110, 110),
    y: clamp(dBeta * 4, -90, 90),
    // Tilt 3D (object sedikit berotasi saat HP dimiringkan)
    tiltX: clamp(-dBeta * 1.4, -16, 16),
    tiltY: clamp(dGamma * 1.4, -16, 16)
  };
}

// ==========================
// Spawn Item
// ==========================

function clearRespawnTimer() {
  if (respawnId) { clearTimeout(respawnId); respawnId = null; }
}

function removeItem(item) {
  if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
  activeItems = activeItems.filter(i => i !== item);
}

function deactivateItem(item) {
  activeItems = activeItems.filter(i => i !== item);
}

function removeAllItems() {
  activeItems.forEach(item => {
    if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
  });
  activeItems = [];
}

function createItemElement(itemData) {
  const wrapper = document.createElement("div");
  wrapper.className = "arItem";
  wrapper.dataset.name = itemData.name;
  wrapper.dataset.scoreItem = itemData.isScoreItem ? "true" : "false";

  const img = document.createElement("img");
  img.className = "ar-img";
  img.src = itemData.src;
  img.alt = itemData.name;
  img.draggable = false;

  // AR bracket corners (indicator tracking)
  const brackets = document.createElement("div");
  brackets.className = "ar-brackets";
  ["tl", "tr", "bl", "br"].forEach(pos => {
    const corner = document.createElement("span");
    corner.className = "ar-corner " + pos;
    brackets.appendChild(corner);
  });

  // Label nama
  const label = document.createElement("div");
  label.className = "ar-label";
  label.textContent = itemData.isScoreItem ? "★ TARGET" : itemData.name;

  wrapper.appendChild(img);
  wrapper.appendChild(brackets);
  wrapper.appendChild(label);

  return wrapper;
}

function generateRandomPosition(index = 0, total = 1) {
  const safeTop = 145;
  const safeBottom = 185;
  const marginX = 70;
  const laneWidth = (window.innerWidth - marginX * 2) / Math.max(total, 1);
  const laneCenter = marginX + laneWidth * index + laneWidth / 2;

  const x = randomRange(laneCenter - laneWidth * 0.35, laneCenter + laneWidth * 0.35);
  const y = randomRange(safeTop, window.innerHeight - safeBottom);

  return {
    x: clamp(x, marginX, window.innerWidth - marginX),
    y: clamp(y, safeTop, window.innerHeight - safeBottom)
  };
}

function createGameItem(itemData, index = 0, total = 1) {
  const el = createItemElement(itemData);
  const pos = generateRandomPosition(index, total);
  const depth = randomRange(0.1, 0.6);

  return {
    el,
    data: itemData,
    state: {
      x: pos.x,
      y: pos.y,
      targetX: pos.x,
      targetY: pos.y,
      depth,
      floatPhase: randomRange(0, Math.PI * 2)
    }
  };
}

function spawnItem(itemData = randomItem()) {
  if (!gameStarted || gameFinished) return;
  const item = createGameItem(itemData, activeItems.length, itemsPerWave);
  activeItems.push(item);
  worldLayer.appendChild(item.el);
}

function spawnNewWave() {
  if (!gameStarted || gameFinished) return;

  clearRespawnTimer();
  removeAllItems();

  const waveItems = shuffledItems().slice(0, itemsPerWave);
  waveItems.forEach((itemData, index) => {
    const item = createGameItem(itemData, index, waveItems.length);
    activeItems.push(item);
    worldLayer.appendChild(item.el);
  });

  setInstruction("Arahkan crosshair ke item — tahan sebentar atau tap untuk menangkap.");
}

function moveItemToNewRandomPosition(item, index, total) {
  const pos = generateRandomPosition(index, total);
  item.state.targetX = pos.x;
  item.state.targetY = pos.y;
  item.state.depth = randomRange(0.1, 0.6);
}

function moveAllItemsToNewRandomPosition() {
  if (gameFinished) return;
  activeItems.forEach((item, index) => {
    moveItemToNewRandomPosition(item, index, activeItems.length);
  });
}

// ==========================
// Dwell Capture
// ==========================

function setDwellProgress(progress) {
  const offset = DWELL_CIRCUMFERENCE * (1 - clamp(progress, 0, 1));
  dwellRing.style.strokeDashoffset = offset;
  dwellRing.style.opacity = progress > 0.02 ? "1" : "0";
}

function resetDwell() {
  dwellTarget = null;
  dwellStart = 0;
  isDwelling = false;
  setDwellProgress(0);
}

// ==========================
// Render Loop
// ==========================

function renderLoop(now) {
  const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  const motion = getMotionData();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  let closestItem = null;
  let closestDist = Infinity;

  activeItems.forEach((item) => {
    const state = item.state;

    // Interpolasi posisi menuju target
    state.x = lerp(state.x, state.targetX, deltaTime * 2.6);
    state.y = lerp(state.y, state.targetY, deltaTime * 2.6);
    state.floatPhase += deltaTime * 1.7;

    const scale = lerp(1.38, 0.82, state.depth);
    const opacity = lerp(1.0, 0.8, state.depth);

    // Float natural, amplitudo kecil
    const floatY = Math.sin(state.floatPhase) * 5;
    const floatX = Math.cos(state.floatPhase * 0.55) * 2.5;

    // Parallax — object lebih depan (depth kecil) bergerak lebih banyak
    const worldX = state.x + motion.x * (1 - state.depth);
    const worldY = state.y + motion.y * (1 - state.depth);

    // Posisi relatif terhadap tengah layar
    const relX = worldX - cx + floatX;
    const relY = worldY - cy + floatY;

    // 3D tilt dari gyro (object berasa punya volume)
    const tiltX = motion.tiltX * (1 - state.depth * 0.4);
    const tiltY = motion.tiltY * (1 - state.depth * 0.4);

    item.el.style.opacity = opacity;
    item.el.style.transform =
      `translate(-50%, -50%) ` +
      `translate3d(${relX}px, ${relY}px, 0) ` +
      `scale(${scale}) ` +
      `rotateX(${tiltX}deg) ` +
      `rotateY(${tiltY}deg)`;

    // Proximity check — pakai koordinat logis (tidak perlu getBoundingClientRect di sini)
    const dist = Math.sqrt(relX * relX + relY * relY);
    const approxHitR = 70 * scale * 0.5 + captureRadius;
    const isNear = dist <= approxHitR;

    item.el.classList.toggle("near", isNear);
    item.el.classList.toggle("dwelling", item === dwellTarget);

    if (isNear && dist < closestDist) {
      closestDist = dist;
      closestItem = item;
    }
  });

  // Update dwell state
  if (closestItem && gameStarted && !gameFinished) {
    if (dwellTarget !== closestItem) {
      dwellTarget = closestItem;
      dwellStart = now;
      isDwelling = true;
    }

    const progress = (now - dwellStart) / DWELL_MS;
    setDwellProgress(progress);

    if (progress >= 1) {
      const target = closestItem;
      resetDwell();
      doCaptureItem(target);
    }
  } else {
    if (isDwelling) resetDwell();
  }

  animationId = requestAnimationFrame(renderLoop);
}

// ==========================
// Capture Logic
// ==========================

function getItemScreenPosition(item) {
  const rect = item.el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height
  };
}

function getNearestCapturableItem() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  let nearest = null;

  activeItems.forEach((item) => {
    const pos = getItemScreenPosition(item);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const bonusR = Math.min(pos.width, pos.height) * 0.45;
    const hitR = captureRadius + bonusR;

    if (dist > hitR) return;
    if (!nearest || dist < nearest.dist) nearest = { item, dist };
  });

  return nearest ? nearest.item : null;
}

function doCaptureItem(capturedItem) {
  if (!capturedItem || !gameStarted || gameFinished) return;

  // Stop JS dari update item ini
  deactivateItem(capturedItem);

  // Bersihkan inline opacity supaya CSS animation bisa jalan
  capturedItem.el.style.opacity = "";

  // Animasi tangkap via Web Animations API (tidak bentrok dengan inline transform)
  capturedItem.el.querySelector(".ar-img").animate(
    [
      {
        transform: "scale(1)",
        filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.6)) brightness(1)",
        opacity: "1"
      },
      {
        transform: "scale(1.38)",
        filter: "drop-shadow(0 0 32px rgba(0,255,170,1)) brightness(2.3)",
        opacity: "1",
        offset: 0.4
      },
      {
        transform: "scale(0.55)",
        filter: "drop-shadow(0 0 10px rgba(0,255,170,0.2)) brightness(0.3)",
        opacity: "0"
      }
    ],
    { duration: 310, fill: "forwards", easing: "ease-out" }
  );

  capturedItem.el.querySelector(".ar-brackets").animate(
    [
      { transform: "scale(1)", opacity: "1" },
      { transform: "scale(1.8)", opacity: "0" }
    ],
    { duration: 310, fill: "forwards", easing: "ease-out" }
  );

  setTimeout(() => {
    removeItem(capturedItem);

    if (capturedItem.data.isScoreItem) {
      score++;
      updateScoreUI();

      if (score >= maxScore) {
        finishGame();
        return;
      }

      setInstruction(`Mantap! Target tertangkap ${score}/${maxScore}.`);
      respawnId = setTimeout(spawnNewWave, respawnDelay);
    } else {
      setInstruction(`${capturedItem.data.name} tertangkap. Cari TARGET (★) untuk score.`);
      respawnId = setTimeout(() => spawnItem(randomItem()), respawnDelay);
    }
  }, 320);
}

function captureItem() {
  if (!gameStarted || gameFinished) return;
  if (activeItems.length === 0) return;

  const item = getNearestCapturableItem();

  if (!item) {
    setInstruction("Arahkan crosshair ke item lalu tahan atau tap.");
    shakeCrosshair();
    return;
  }

  resetDwell();
  doCaptureItem(item);
}

function shakeCrosshair() {
  const crosshair = document.getElementById("crosshair");

  crosshair.animate(
    [
      { transform: "translate(-50%, -50%) translateX(0px)" },
      { transform: "translate(-50%, -50%) translateX(-9px)" },
      { transform: "translate(-50%, -50%) translateX(9px)" },
      { transform: "translate(-50%, -50%) translateX(0px)" }
    ],
    { duration: 200, iterations: 1 }
  );
}

// ==========================
// Game Flow
// ==========================

async function startGame() {
  if (gameStarted) return;

  startButton.disabled = true;
  setInstruction("Membuka kamera...");

  const cameraReady = await startCamera();

  if (!cameraReady) {
    startButton.disabled = false;
    return;
  }

  await enableMotionPermission();

  gameStarted = true;
  gameFinished = false;

  score = 0;
  elapsedTime = 0;
  startTime = performance.now();

  updateScoreUI();
  timeText.textContent = "0.0";

  startButton.classList.add("hidden");
  captureButton.classList.remove("hidden");

  spawnNewWave();

  timerId = setInterval(updateTimeUI, 100);

  if (!animationId) {
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(renderLoop);
  }

  autoMoveId = setInterval(moveAllItemsToNewRandomPosition, autoMoveInterval);
}

function finishGame() {
  gameFinished = true;
  gameStarted = false;

  clearRespawnTimer();
  resetDwell();

  if (timerId) { clearInterval(timerId); timerId = null; }
  if (autoMoveId) { clearInterval(autoMoveId); autoMoveId = null; }

  elapsedTime = (performance.now() - startTime) / 1000;

  removeAllItems();

  captureButton.classList.add("hidden");

  finalScoreText.textContent = score;
  finalTimeText.textContent = elapsedTime.toFixed(1);

  resultPanel.classList.remove("hidden");

  setInstruction("Game selesai.");
}

function restartGame() {
  resultPanel.classList.add("hidden");
  clearRespawnTimer();
  resetDwell();

  score = 0;
  elapsedTime = 0;
  gameStarted = false;
  gameFinished = false;

  updateScoreUI();
  timeText.textContent = "0.0";

  removeAllItems();

  startButton.disabled = false;
  startButton.classList.remove("hidden");
  captureButton.classList.add("hidden");

  setInstruction("Tekan Start untuk mulai AR Hunt.");
}

// ==========================
// Event Listener
// ==========================

startButton.addEventListener("click", startGame);
captureButton.addEventListener("click", captureItem);
restartButton.addEventListener("click", restartGame);

// Tap layar untuk capture (kecuali tap tombol)
window.addEventListener("pointerup", (event) => {
  const target = event.target;

  if (
    target === startButton ||
    target === captureButton ||
    target === restartButton
  ) return;

  if (gameStarted && !gameFinished) {
    captureItem();
  }
});

window.addEventListener("resize", () => {
  activeItems.forEach((item) => {
    item.state.targetX = clamp(item.state.targetX, 70, window.innerWidth - 70);
    item.state.targetY = clamp(item.state.targetY, 145, window.innerHeight - 185);
  });
});

// ==========================
// Init
// ==========================

updateScoreUI();
timeText.textContent = "0.0";
