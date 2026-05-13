// ======================================================
// Web Camera AR Hunt Tanpa Marker
// Beberapa PNG muncul bersamaan dan dipilih pakai crosshair
// Score hanya bertambah jika item5.png tertangkap
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

// ==========================
// Setting Game
// ==========================

const maxScore = 5;

// Area hit dibuat besar supaya lebih enak dimainkan di layar HP.
const captureRadius = 105;

// Jumlah item yang muncul bersamaan.
const itemsPerWave = 5;

// Jeda spawn object baru setelah capture.
const respawnDelay = 360;

// Spawn item berpindah otomatis jika terlalu lama tidak ditangkap.
const autoMoveInterval = 3200;

// Asset item.
// item5.png adalah target score.
const itemList = [
  {
    name: "item1",
    src: "assets/item1.png",
    isScoreItem: false
  },
  {
    name: "item2",
    src: "assets/item2.png",
    isScoreItem: false
  },
  {
    name: "item3",
    src: "assets/item3.png",
    isScoreItem: false
  },
  {
    name: "item4",
    src: "assets/item4.png",
    isScoreItem: false
  },
  {
    name: "item5",
    src: "assets/item5.png",
    isScoreItem: true
  }
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

// Data gyro.
// Dipakai untuk efek parallax agar terasa seperti AR.
let motionEnabled = false;

let orientationState = {
  beta: 0,
  gamma: 0,
  baseBeta: null,
  baseGamma: null
};

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
  const index = Math.floor(Math.random() * itemList.length);
  return itemList[index];
}

function shuffledItems() {
  return [...itemList].sort(() => Math.random() - 0.5);
}

function getScreenCenter() {
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  };
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
        facingMode: {
          ideal: "environment"
        },
        width: {
          ideal: 1280
        },
        height: {
          ideal: 720
        }
      },
      audio: false
    });

    cameraVideo.srcObject = stream;

    await cameraVideo.play();

    return true;
  } catch (error) {
    console.error(error);

    setInstruction(
      "Kamera gagal dibuka. Pastikan izin kamera aktif dan web dibuka lewat HTTPS."
    );

    return false;
  }
}

// ==========================
// Device Orientation / Gyro
// ==========================

async function enableMotionPermission() {
  // iOS butuh permission manual dari event click/tap.
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();

      motionEnabled = permission === "granted";
    } catch (error) {
      console.warn("Gyro permission error:", error);
      motionEnabled = false;
    }
  } else {
    // Android biasanya tidak butuh requestPermission.
    motionEnabled = true;
  }

  if (motionEnabled) {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }
}

function handleOrientation(event) {
  const beta = event.beta || 0;
  const gamma = event.gamma || 0;

  if (orientationState.baseBeta === null) {
    orientationState.baseBeta = beta;
  }

  if (orientationState.baseGamma === null) {
    orientationState.baseGamma = gamma;
  }

  orientationState.beta = beta;
  orientationState.gamma = gamma;
}

function getParallaxOffset() {
  if (!motionEnabled) {
    return {
      x: 0,
      y: 0
    };
  }

  const deltaGamma = orientationState.gamma - orientationState.baseGamma;
  const deltaBeta = orientationState.beta - orientationState.baseBeta;

  // Semakin besar multiplier, semakin terasa object bergerak saat HP digerakkan.
  const x = clamp(deltaGamma * 7, -110, 110);
  const y = clamp(deltaBeta * 4, -90, 90);

  return {
    x,
    y
  };
}

// ==========================
// Spawn Item
// ==========================

function clearRespawnTimer() {
  if (respawnId) {
    clearTimeout(respawnId);
    respawnId = null;
  }
}

function removeItem(item) {
  if (item.el && item.el.parentNode) {
    item.el.parentNode.removeChild(item.el);
  }

  activeItems = activeItems.filter((activeItem) => activeItem !== item);
}

function deactivateItem(item) {
  activeItems = activeItems.filter((activeItem) => activeItem !== item);
}

function removeAllItems() {
  activeItems.forEach((item) => {
    if (item.el && item.el.parentNode) {
      item.el.parentNode.removeChild(item.el);
    }
  });

  activeItems = [];
}

function createItemElement(itemData) {
  const img = document.createElement("img");

  img.className = "arItem";
  img.src = itemData.src;
  img.alt = itemData.name;
  img.draggable = false;

  img.dataset.name = itemData.name;
  img.dataset.scoreItem = itemData.isScoreItem ? "true" : "false";

  return img;
}

function generateRandomPosition(index = 0, total = 1) {
  const safeTop = 145;
  const safeBottom = 170;
  const marginX = 64;
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
  const depth = randomRange(0.08, 0.62);

  return {
    el,
    data: itemData,
    state: {
      x: pos.x,
      y: pos.y,
      targetX: pos.x,
      targetY: pos.y,
      depth,
      rotation: randomRange(-10, 10),
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

  setInstruction("Pilih item dengan crosshair. Tangkap item5.png untuk score.");
}

function moveItemToNewRandomPosition(item, index, total) {
  const pos = generateRandomPosition(index, total);

  item.state.targetX = pos.x;
  item.state.targetY = pos.y;
  item.state.depth = randomRange(0.08, 0.62);
  item.state.rotation = randomRange(-10, 10);
}

function moveAllItemsToNewRandomPosition() {
  if (gameFinished) return;

  activeItems.forEach((item, index) => {
    moveItemToNewRandomPosition(item, index, activeItems.length);
  });
}

// ==========================
// Render Loop
// ==========================

function renderLoop(now) {
  const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  activeItems.forEach((item) => {
    const state = item.state;

    state.x = lerp(state.x, state.targetX, deltaTime * 2.6);
    state.y = lerp(state.y, state.targetY, deltaTime * 2.6);
    state.floatPhase += deltaTime * 2.4;

    const parallax = getParallaxOffset();

    // Object dibuat lebih besar dan blur dikurangi supaya mudah ditangkap.
    const scale = lerp(1.38, 0.82, state.depth);
    const floatY = Math.sin(state.floatPhase) * 8;
    const floatX = Math.cos(state.floatPhase * 0.75) * 4;
    const opacity = lerp(1.0, 0.84, state.depth);
    const blur = lerp(0, 0.65, state.depth);

    const finalX = state.x + parallax.x * (1 - state.depth);
    const finalY = state.y + parallax.y * (1 - state.depth);

    item.el.style.opacity = opacity;
    item.el.style.filter = `blur(${blur}px)`;

    item.el.style.transform = `
      translate(-50%, -50%)
      translate3d(${finalX - window.innerWidth / 2 + floatX}px, ${finalY - window.innerHeight / 2 + floatY}px, 0)
      scale(${scale})
      rotate(${state.rotation}deg)
    `;
  });

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
  const center = getScreenCenter();
  let nearest = null;

  activeItems.forEach((item) => {
    const itemPos = getItemScreenPosition(item);
    const dx = itemPos.x - center.x;
    const dy = itemPos.y - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const itemBonusRadius = Math.min(itemPos.width, itemPos.height) * 0.42;
    const hitRadius = captureRadius + itemBonusRadius;

    if (distance > hitRadius) return;

    if (!nearest || distance < nearest.distance) {
      nearest = {
        item,
        distance
      };
    }
  });

  return nearest ? nearest.item : null;
}

function captureItem() {
  if (!gameStarted || gameFinished) return;

  if (activeItems.length === 0) return;

  const capturedItem = getNearestCapturableItem();

  if (!capturedItem) {
    setInstruction("Dekatkan crosshair ke salah satu item lalu Capture.");
    shakeCrosshair();
    return;
  }

  capturedItem.el.classList.add("captured");
  deactivateItem(capturedItem);

  setTimeout(() => {
    removeItem(capturedItem);

    if (capturedItem.data.isScoreItem) {
      score++;
      updateScoreUI();

      if (score >= maxScore) {
        finishGame();
        return;
      }

      setInstruction(`Mantap! item5.png tertangkap ${score}/${maxScore}.`);

      respawnId = setTimeout(() => {
        spawnNewWave();
      }, respawnDelay);
    } else {
      setInstruction(`${capturedItem.data.name} tertangkap. Cari item5.png untuk score.`);

      respawnId = setTimeout(() => {
        spawnItem(randomItem());
      }, respawnDelay);
    }
  }, 220);
}

function shakeCrosshair() {
  const crosshair = document.getElementById("crosshair");

  crosshair.animate(
    [
      {
        transform: "translate(-50%, -50%) translateX(0px)"
      },
      {
        transform: "translate(-50%, -50%) translateX(-8px)"
      },
      {
        transform: "translate(-50%, -50%) translateX(8px)"
      },
      {
        transform: "translate(-50%, -50%) translateX(0px)"
      }
    ],
    {
      duration: 180,
      iterations: 1
    }
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

  autoMoveId = setInterval(() => {
    moveAllItemsToNewRandomPosition();
  }, autoMoveInterval);
}

function finishGame() {
  gameFinished = true;
  gameStarted = false;

  clearRespawnTimer();

  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  if (autoMoveId) {
    clearInterval(autoMoveId);
    autoMoveId = null;
  }

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

// Tap layar juga bisa capture, kecuali tap tombol.
window.addEventListener("pointerup", (event) => {
  const target = event.target;

  if (
    target === startButton ||
    target === captureButton ||
    target === restartButton
  ) {
    return;
  }

  if (gameStarted && !gameFinished) {
    captureItem();
  }
});

// Kalau ukuran layar berubah, object jangan keluar area terlalu jauh.
window.addEventListener("resize", () => {
  activeItems.forEach((item) => {
    item.state.targetX = clamp(item.state.targetX, 64, window.innerWidth - 64);
    item.state.targetY = clamp(item.state.targetY, 145, window.innerHeight - 170);
  });
});

// ==========================
// Init
// ==========================

updateScoreUI();
timeText.textContent = "0.0";
