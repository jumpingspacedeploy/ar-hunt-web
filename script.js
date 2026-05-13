const camera = document.getElementById("camera");
const gameLayer = document.getElementById("gameLayer");
const legacyHuntObject = document.getElementById("huntObject");

const scoreText = document.getElementById("scoreText");
const timerText = document.getElementById("timerText");
const roundTimerText = document.getElementById("roundTimerText");
const statusText = document.getElementById("statusText");

const startBtn = document.getElementById("startBtn");
const gyroBtn = document.getElementById("gyroBtn");
const voiceBtn = document.getElementById("voiceBtn");
const catchBtn = document.getElementById("catchBtn");
const resetBtn = document.getElementById("resetBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const resultPanel = document.getElementById("resultPanel");
const finalScoreText = document.getElementById("finalScoreText");
const finalTotalCaughtText = document.getElementById("finalTotalCaughtText");
const finalTimeText = document.getElementById("finalTimeText");

const targetScore = 5;
const scoreItem = "assets/item5.png";
const roundDuration = 20;
const crowdSize = 48;
const worldWidth = 1800;
const worldHeight = 1200;

const itemImages = [
  "assets/item1.png",
  "assets/item2.png",
  "assets/item3.png",
  "assets/item4.png",
  "assets/item5.png"
];

let score = 0;
let totalCaught = 0;

let gameStarted = false;
let cameraStarted = false;
let gyroStarted = false;

let startTime = 0;
let elapsedTime = 0;
let roundStartTime = 0;
let timerInterval = null;
let animationFrameId = null;

let recognition = null;
let isListening = false;

let currentYaw = 0;
let currentPitch = 0;

let baseYaw = null;
let basePitch = null;

let spawnedObjects = [];
let worldLayer = null;
let cameraX = 0;
let cameraY = 0;
let targetCameraX = 0;
let targetCameraY = 0;

const worldSensitivity = 34;
const catchRadius = 76;
const cameraEase = 0.14;

const deviceInfo = detectDeviceInfo();

if (legacyHuntObject) {
  legacyHuntObject.remove();
}

createWorldLayer();

function detectDeviceInfo() {
  const ua = navigator.userAgent || "";
  const uaLower = ua.toLowerCase();

  const isIOS =
    /iphone|ipad|ipod/.test(uaLower) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isAndroid = /android/.test(uaLower);

  return {
    isIOS,
    isAndroid
  };
}

function showDeviceMessage() {
  if (deviceInfo.isIOS) {
    statusText.textContent = "iOS terdeteksi. Tekan Start Camera, lalu Aktifkan Gyro.";
  } else if (deviceInfo.isAndroid) {
    statusText.textContent = "Android terdeteksi. Tekan Start Camera, lalu Aktifkan Gyro.";
  } else {
    statusText.textContent = "Gunakan Safari iOS atau Chrome Android.";
  }
}

// =====================
// CAMERA
// =====================

async function startCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.textContent = "Browser ini tidak mendukung akses camera.";
      return;
    }

    statusText.textContent = "Membuka camera...";

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    camera.srcObject = stream;
    await camera.play();

    cameraStarted = true;
    statusText.textContent = "Camera aktif. Sekarang tekan Aktifkan Gyro.";

    if (gyroStarted) {
      startGame();
    }
  } catch (error) {
    console.error("Camera error:", error);

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      statusText.textContent = "Camera butuh HTTPS. Upload ke hosting HTTPS.";
      return;
    }

    if (error.name === "NotAllowedError") {
      statusText.textContent = "Izin camera ditolak.";
      return;
    }

    statusText.textContent = "Gagal membuka camera.";
  }
}

// =====================
// GYRO / ORIENTATION
// =====================

async function startGyro() {
  try {
    if (!window.DeviceOrientationEvent) {
      statusText.textContent = "Gyro/orientation tidak didukung browser ini.";
      return;
    }

    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();

      if (permission !== "granted") {
        statusText.textContent = "Izin gyro ditolak.";
        return;
      }
    }

    window.addEventListener("deviceorientation", handleOrientation, true);

    gyroStarted = true;
    gyroBtn.textContent = "Gyro Aktif";

    statusText.textContent = "Gyro aktif. Arahkan HP untuk mencari item5.";

    if (cameraStarted) {
      startGame();
    }
  } catch (error) {
    console.error("Gyro error:", error);
    statusText.textContent = "Gyro gagal aktif. Coba refresh lalu tekan tombol lagi.";
  }
}

function handleOrientation(event) {
  if (event.alpha === null || event.beta === null) {
    return;
  }

  currentYaw = event.alpha;
  currentPitch = event.beta;

  if (baseYaw === null) {
    baseYaw = currentYaw;
    basePitch = currentPitch;
  }
}

function getRelativeYaw() {
  if (baseYaw === null) return 0;
  return normalizeAngle(currentYaw - baseYaw);
}

function getRelativePitch() {
  if (basePitch === null) return 0;
  return currentPitch - basePitch;
}

function normalizeAngle(angle) {
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

function recenterGyro(message = "Arah tengah disetel ulang.") {
  baseYaw = currentYaw;
  basePitch = currentPitch;
  cameraX = 0;
  cameraY = 0;
  targetCameraX = 0;
  targetCameraY = 0;
  statusText.textContent = message;
}

// =====================
// GAME
// =====================

function startGame() {
  if (!cameraStarted) {
    statusText.textContent = "Aktifkan camera dulu.";
    return;
  }

  if (!gyroStarted) {
    statusText.textContent = "Aktifkan gyro dulu agar object terkunci di ruang AR.";
    return;
  }

  score = 0;
  totalCaught = 0;
  elapsedTime = 0;

  gameStarted = true;

  scoreText.textContent = score;
  timerText.textContent = "0.0";
  roundTimerText.textContent = roundDuration;

  resultPanel.classList.add("hidden");

  startTime = performance.now();

  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 100);

  recenterGyro("Game mulai. Kejar dan tangkap item5 sebelum waktunya habis.");
  spawnRound();

  cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(updateObjectsPosition);
}

function updateTimer() {
  if (!gameStarted) return;

  elapsedTime = (performance.now() - startTime) / 1000;
  timerText.textContent = elapsedTime.toFixed(1);

  const roundTimeLeft = getRoundTimeLeft();
  roundTimerText.textContent = Math.ceil(roundTimeLeft);
  const targetObject = spawnedObjects.find((item) => item.isTarget);

  if (targetObject) {
    targetObject.element.dataset.time = Math.ceil(roundTimeLeft);
  }

  if (roundTimeLeft <= 0) {
    statusText.textContent = "Waktu spawn habis. Item muncul ulang, cari item5 lagi.";
    spawnRound();
  }
}

function getRoundTimeLeft() {
  return Math.max(0, roundDuration - (performance.now() - roundStartTime) / 1000);
}

function spawnRound() {
  if (!gameStarted) return;

  if (score >= targetScore) {
    finishGame();
    return;
  }

  clearSpawnedObjects();
  roundStartTime = performance.now();

  const items = buildCrowdItems();

  spawnedObjects = items.map((item) => {
    const element = document.createElement("img");

    element.src = item.image;
    element.alt = item.isTarget ? "target item5" : "decoy item";
    element.className = `hunt-object${item.isTarget ? " target-item" : ""}`;
    element.dataset.time = roundDuration;
    element.style.left = `${item.worldX}px`;
    element.style.top = `${item.worldY}px`;
    element.style.width = `${item.size}px`;
    element.style.height = `${item.size}px`;
    element.style.setProperty("--spin", `${item.rotation}deg`);
    worldLayer.appendChild(element);

    return {
      element,
      image: item.image,
      isTarget: item.isTarget,
      worldX: item.worldX,
      worldY: item.worldY,
      screenX: 0,
      screenY: 0
    };
  });

  statusText.textContent = `Cari item5 di keramaian. Ada ${spawnedObjects.length} item, waktu ${roundDuration} detik.`;
}

function createWorldLayer() {
  worldLayer = document.createElement("div");
  worldLayer.id = "worldLayer";
  worldLayer.style.width = `${worldWidth}px`;
  worldLayer.style.height = `${worldHeight}px`;
  gameLayer.prepend(worldLayer);
}

function buildCrowdItems() {
  const decoyImages = itemImages.filter((image) => image !== scoreItem);
  const items = [];
  const safeMargin = 120;

  for (let index = 0; index < crowdSize - 1; index++) {
    items.push(createCrowdItem(decoyImages[index % decoyImages.length], false, safeMargin));
  }

  items.push(createCrowdItem(scoreItem, true, safeMargin));

  return shuffleArray(items);
}

function createCrowdItem(image, isTarget, safeMargin) {
  return {
    image,
    isTarget,
    worldX: randomRange(safeMargin, worldWidth - safeMargin),
    worldY: randomRange(safeMargin, worldHeight - safeMargin),
    size: isTarget ? randomRange(70, 92) : randomRange(54, 96),
    rotation: randomRange(-10, 10)
  };
}

function clearSpawnedObjects() {
  spawnedObjects.forEach((item) => item.element.remove());
  spawnedObjects = [];
}

function updateObjectsPosition() {
  if (!gameStarted) {
    return;
  }

  targetCameraX = clamp(getRelativeYaw() * worldSensitivity, -worldWidth / 2, worldWidth / 2);
  targetCameraY = clamp(getRelativePitch() * worldSensitivity, -worldHeight / 2, worldHeight / 2);

  cameraX += (targetCameraX - cameraX) * cameraEase;
  cameraY += (targetCameraY - cameraY) * cameraEase;

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const layerLeft = centerX - worldWidth / 2 - cameraX;
  const layerTop = centerY - worldHeight / 2 - cameraY;

  worldLayer.style.transform = `translate3d(${layerLeft}px, ${layerTop}px, 0)`;

  spawnedObjects.forEach((item) => {
    item.screenX = layerLeft + item.worldX;
    item.screenY = layerTop + item.worldY;
  });

  animationFrameId = requestAnimationFrame(updateObjectsPosition);
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getObjectInCrosshair() {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  return spawnedObjects
    .map((item) => ({
      item,
      distance: Math.hypot(item.screenX - centerX, item.screenY - centerY)
    }))
    .filter(({ distance }) => distance <= catchRadius)
    .sort((a, b) => a.distance - b.distance)[0]?.item;
}

function catchObject() {
  if (!gameStarted) {
    statusText.textContent = "Game belum dimulai.";
    return;
  }

  if (spawnedObjects.length === 0) {
    statusText.textContent = "Belum ada item.";
    return;
  }

  const caughtObject = getObjectInCrosshair();

  if (!caughtObject) {
    statusText.textContent = "Belum tepat di tengah crosshair. Kejar item sampai masuk lingkaran.";
    return;
  }

  totalCaught++;
  vibratePhone();

  if (caughtObject.isTarget) {
    score++;
    scoreText.textContent = score;

    caughtObject.element.classList.add("caught");

    if (score >= targetScore) {
      setTimeout(finishGame, 250);
      return;
    }

    statusText.textContent = `Benar! item5 tertangkap. Score: ${score}/5`;
    setTimeout(spawnRound, 450);
    return;
  }

  caughtObject.element.classList.add("wrong");
  statusText.textContent = `Itu bukan item5. Cari target yang benar. Score: ${score}/5`;

  setTimeout(() => {
    caughtObject.element.remove();
    spawnedObjects = spawnedObjects.filter((item) => item !== caughtObject);

    if (spawnedObjects.length === 0) {
      spawnRound();
    }
  }, 240);
}

function finishGame() {
  gameStarted = false;

  clearInterval(timerInterval);
  timerInterval = null;

  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;

  elapsedTime = (performance.now() - startTime) / 1000;

  clearSpawnedObjects();

  finalScoreText.textContent = score;
  finalTotalCaughtText.textContent = totalCaught;
  finalTimeText.textContent = elapsedTime.toFixed(1);

  resultPanel.classList.remove("hidden");

  statusText.textContent = `Game selesai! item5 tertangkap ${score} kali.`;
}

function resetGame() {
  score = 0;
  totalCaught = 0;
  elapsedTime = 0;

  gameStarted = false;

  clearInterval(timerInterval);
  timerInterval = null;

  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;

  scoreText.textContent = "0";
  timerText.textContent = "0.0";
  roundTimerText.textContent = roundDuration;

  clearSpawnedObjects();
  resultPanel.classList.add("hidden");

  statusText.textContent = "Game direset. Tekan Start Camera lalu Aktifkan Gyro.";
}

function vibratePhone() {
  if ("vibrate" in navigator) {
    navigator.vibrate(80);
  }
}

// =====================
// VOICE
// =====================

function setupVoice() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    statusText.textContent = "Voice tidak tersedia di browser ini. Pakai tombol manual.";
    return;
  }

  if (isListening && recognition) {
    stopVoice();
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = "id-ID";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.textContent = "Voice Aktif";
    statusText.textContent = "Voice aktif. Bilang: tangkap";
  };

  recognition.onresult = (event) => {
    const result = event.results[0][0].transcript;
    const command = result.toLowerCase().trim();

    statusText.textContent = `Terdengar: "${command}"`;

    if (isCatchCommand(command)) {
      catchObject();
    }
  };

  recognition.onerror = (event) => {
    isListening = false;
    voiceBtn.textContent = "Aktifkan Voice";

    if (event.error === "not-allowed") {
      statusText.textContent = "Microphone ditolak.";
    } else if (event.error === "no-speech") {
      statusText.textContent = "Tidak ada suara terdeteksi.";
    } else {
      statusText.textContent = `Voice error: ${event.error}`;
    }
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = "Aktifkan Voice";
  };

  try {
    recognition.start();
  } catch (error) {
    statusText.textContent = "Voice gagal dimulai. Tekan ulang tombol Voice.";
  }
}

function stopVoice() {
  if (!recognition) return;

  try {
    recognition.stop();
  } catch (error) {
    console.log(error);
  }

  isListening = false;
  voiceBtn.textContent = "Aktifkan Voice";
}

function isCatchCommand(command) {
  return (
    command.includes("tangkap") ||
    command.includes("ambil") ||
    command.includes("dapat") ||
    command.includes("dapet") ||
    command.includes("catch") ||
    command.includes("capture") ||
    command.includes("oke") ||
    command.includes("ok")
  );
}

// =====================
// EVENTS
// =====================

window.addEventListener("load", showDeviceMessage);

startBtn.addEventListener("click", startCamera);
gyroBtn.addEventListener("click", startGyro);
voiceBtn.addEventListener("click", setupVoice);
catchBtn.addEventListener("click", catchObject);
resetBtn.addEventListener("click", resetGame);

playAgainBtn.addEventListener("click", () => {
  startGame();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopVoice();
  }
});
