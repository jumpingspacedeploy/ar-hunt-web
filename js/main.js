// ======================================================
// Web Camera AR Hunt Tanpa Marker
// PNG muncul random, ditangkap pakai crosshair
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

// Ukuran area hit crosshair.
// Makin besar, makin mudah ditangkap.
const captureRadius = 58;

// Jeda spawn object baru setelah capture.
const respawnDelay = 420;

// Spawn item berpindah otomatis jika terlalu lama tidak ditangkap.
const autoMoveInterval = 2600;

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

let currentItemEl = null;
let currentItemData = null;

let score = 0;
let startTime = 0;
let elapsedTime = 0;

let gameStarted = false;
let gameFinished = false;

let timerId = null;
let animationId = null;
let autoMoveId = null;

let lastFrameTime = performance.now();

// Posisi virtual object.
// x dan y = posisi layar.
// depth = efek jarak, 0 dekat, 1 jauh.
let itemState = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  depth: 0.5,
  rotation: 0,
  floatPhase: 0
};

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

      if (permission === "granted") {
        motionEnabled = true;
      } else {
        motionEnabled = false;
      }
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

function removeCurrentItem() {
  if (currentItemEl && currentItemEl.parentNode) {
    currentItemEl.parentNode.removeChild(currentItemEl);
  }

  currentItemEl = null;
  currentItemData = null;
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

function generateRandomPosition() {
  const safeTop = 150;
  const safeBottom = 180;
  const marginX = 80;

  const x = randomRange(marginX, window.innerWidth - marginX);
  const y = randomRange(safeTop, window.innerHeight - safeBottom);

  return {
    x,
    y
  };
}

function spawnNewItem() {
  if (!gameStarted || gameFinished) return;

  removeCurrentItem();

  currentItemData = randomItem();
  currentItemEl = createItemElement(currentItemData);

  const pos = generateRandomPosition();

  itemState.x = pos.x;
  itemState.y = pos.y;
  itemState.targetX = pos.x;
  itemState.targetY = pos.y;

  // depth 0 = dekat, 1 = jauh.
  itemState.depth = randomRange(0.15, 0.85);
  itemState.rotation = randomRange(-12, 12);
  itemState.floatPhase = randomRange(0, Math.PI * 2);

  worldLayer.appendChild(currentItemEl);

  if (currentItemData.isScoreItem) {
    setInstruction("Target muncul! Arahkan crosshair ke item5.png lalu Capture.");
  } else {
    setInstruction("Item pengecoh muncul. Cari item5.png.");
  }
}

function moveItemToNewRandomPosition() {
  if (!currentItemEl || gameFinished) return;

  const pos = generateRandomPosition();

  itemState.targetX = pos.x;
  itemState.targetY = pos.y;
  itemState.depth = randomRange(0.15, 0.85);
  itemState.rotation = randomRange(-12, 12);
}

// ==========================
// Render Loop
// ==========================

function renderLoop(now) {
  const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  if (currentItemEl) {
    itemState.x = lerp(itemState.x, itemState.targetX, deltaTime * 2.6);
    itemState.y = lerp(itemState.y, itemState.targetY, deltaTime * 2.6);

    itemState.floatPhase += deltaTime * 2.4;

    const parallax = getParallaxOffset();

    // Object jauh lebih kecil, object dekat lebih besar.
    const scale = lerp(1.2, 0.58, itemState.depth);

    // Efek floating.
    const floatY = Math.sin(itemState.floatPhase) * 10;
    const floatX = Math.cos(itemState.floatPhase * 0.75) * 5;

    // Object jauh sedikit blur/transparan.
    const opacity = lerp(1.0, 0.72, itemState.depth);
    const blur = lerp(0, 1.4, itemState.depth);

    const finalX = itemState.x + parallax.x * (1 - itemState.depth);
    const finalY = itemState.y + parallax.y * (1 - itemState.depth);

    currentItemEl.style.opacity = opacity;
    currentItemEl.style.filter = `blur(${blur}px)`;

    currentItemEl.style.transform = `
      translate(-50%, -50%)
      translate3d(${finalX - window.innerWidth / 2 + floatX}px, ${finalY - window.innerHeight / 2 + floatY}px, 0)
      scale(${scale})
      rotate(${itemState.rotation}deg)
    `;
  }

  animationId = requestAnimationFrame(renderLoop);
}

// ==========================
// Capture Logic
// ==========================

function getCurrentItemScreenPosition() {
  if (!currentItemEl) return null;

  const rect = currentItemEl.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height
  };
}

function isCrosshairHitItem() {
  const itemPos = getCurrentItemScreenPosition();

  if (!itemPos) return false;

  const center = getScreenCenter();

  const dx = itemPos.x - center.x;
  const dy = itemPos.y - center.y;

  const distance = Math.sqrt(dx * dx + dy * dy);

  // Object besar lebih mudah kena sedikit.
  const itemBonusRadius = Math.min(itemPos.width, itemPos.height) * 0.22;

  return distance <= captureRadius + itemBonusRadius;
}

function captureItem() {
  if (!gameStarted || gameFinished) return;

  if (!currentItemEl || !currentItemData) return;

  const hit = isCrosshairHitItem();

  if (!hit) {
    setInstruction("Belum tepat. Arahkan crosshair ke item.");
    shakeCrosshair();
    return;
  }

  currentItemEl.classList.add("captured");

  const capturedItem = currentItemData;

  setTimeout(() => {
    if (capturedItem.isScoreItem) {
      score++;
      updateScoreUI();

      if (score >= maxScore) {
        finishGame();
        return;
      }

      setInstruction(`Mantap! item5.png tertangkap ${score}/${maxScore}.`);
    } else {
      setInstruction("Itu bukan item5.png. Score tidak bertambah.");
    }

    setTimeout(() => {
      spawnNewItem();
    }, respawnDelay);
  }, 260);
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

  setInstruction("Game dimulai. Cari item5.png!");

  spawnNewItem();

  timerId = setInterval(updateTimeUI, 100);

  if (!animationId) {
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(renderLoop);
  }

  autoMoveId = setInterval(() => {
    moveItemToNewRandomPosition();
  }, autoMoveInterval);
}

function finishGame() {
  gameFinished = true;
  gameStarted = false;

  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  if (autoMoveId) {
    clearInterval(autoMoveId);
    autoMoveId = null;
  }

  elapsedTime = (performance.now() - startTime) / 1000;

  removeCurrentItem();

  captureButton.classList.add("hidden");

  finalScoreText.textContent = score;
  finalTimeText.textContent = elapsedTime.toFixed(1);

  resultPanel.classList.remove("hidden");

  setInstruction("Game selesai.");
}

function restartGame() {
  resultPanel.classList.add("hidden");

  score = 0;
  elapsedTime = 0;
  gameStarted = false;
  gameFinished = false;

  updateScoreUI();
  timeText.textContent = "0.0";

  removeCurrentItem();

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
  if (!currentItemEl) return;

  itemState.targetX = clamp(itemState.targetX, 80, window.innerWidth - 80);
  itemState.targetY = clamp(itemState.targetY, 150, window.innerHeight - 180);
});

// ==========================
// Init
// ==========================

updateScoreUI();
timeText.textContent = "0.0";