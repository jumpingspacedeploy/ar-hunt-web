const camera = document.getElementById("camera");
const huntObject = document.getElementById("huntObject");

const scoreText = document.getElementById("scoreText");
const timerText = document.getElementById("timerText");
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

const itemImages = [
  "assets/item1.png",
  "assets/item2.png",
  "assets/item3.png",
  "assets/item4.png",
  "assets/item5.png"
];

let score = 0;
let totalCaught = 0;
let currentItemImage = "";

let gameStarted = false;
let cameraStarted = false;
let gyroStarted = false;

let objectVisible = false;

let startTime = 0;
let elapsedTime = 0;
let timerInterval = null;

let recognition = null;
let isListening = false;

let currentYaw = 0;
let currentPitch = 0;

let baseYaw = null;
let basePitch = null;

let targetYaw = 0;
let targetPitch = 0;

let objectScreenX = 0;
let objectScreenY = 0;

const sensitivity = 22;
const catchRadius = 70;

const deviceInfo = detectDeviceInfo();

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

    statusText.textContent = "Gyro aktif. Arahkan HP untuk mencari item.";

    if (cameraStarted) {
      startGame();
    }
  } catch (error) {
    console.error("Gyro error:", error);
    statusText.textContent = "Gyro gagal aktif. Coba refresh lalu tekan tombol lagi.";
  }
}

function handleOrientation(event) {
  /*
    alpha = arah kiri/kanan / kompas relatif
    beta  = kemiringan depan/belakang
    gamma = miring kiri/kanan

    Untuk game sederhana:
    - alpha dipakai sebagai yaw
    - beta dipakai sebagai pitch
  */

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

function recenterGyro() {
  baseYaw = currentYaw;
  basePitch = currentPitch;
  statusText.textContent = "Arah tengah disetel ulang.";
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
    statusText.textContent = "Aktifkan gyro dulu agar object tidak ikut layar.";
    return;
  }

  score = 0;
  totalCaught = 0;
  elapsedTime = 0;

  gameStarted = true;
  objectVisible = false;

  scoreText.textContent = score;
  timerText.textContent = "0.0";

  resultPanel.classList.add("hidden");

  startTime = performance.now();

  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 100);

  recenterGyro();
  spawnObject();

  requestAnimationFrame(updateObjectPosition);
}

function updateTimer() {
  if (!gameStarted) return;

  elapsedTime = (performance.now() - startTime) / 1000;
  timerText.textContent = elapsedTime.toFixed(1);
}

function spawnObject() {
  if (!gameStarted) return;

  if (score >= targetScore) {
    finishGame();
    return;
  }

  const randomIndex = Math.floor(Math.random() * itemImages.length);
  currentItemImage = itemImages[randomIndex];

  huntObject.src = currentItemImage;

  /*
    Target disimpan sebagai sudut virtual,
    bukan posisi layar.
    Jadi saat HP diputar, object akan bergeser relatif ke crosshair.
  */

  targetYaw = randomRange(-35, 35);
  targetPitch = randomRange(-18, 18);

  huntObject.style.display = "block";
  objectVisible = true;

  if (currentItemImage === scoreItem) {
    statusText.textContent = `Target item5 muncul. Putar HP sampai masuk crosshair. Score: ${score}/5`;
  } else {
    statusText.textContent = `Item biasa muncul. Hanya item5.png yang menambah score. Score: ${score}/5`;
  }
}

function updateObjectPosition() {
  if (!gameStarted || !objectVisible) {
    requestAnimationFrame(updateObjectPosition);
    return;
  }

  const relativeYaw = getRelativeYaw();
  const relativePitch = getRelativePitch();

  const diffYaw = normalizeAngle(targetYaw - relativeYaw);
  const diffPitch = targetPitch - relativePitch;

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  objectScreenX = centerX + diffYaw * sensitivity;
  objectScreenY = centerY + diffPitch * sensitivity;

  huntObject.style.left = `${objectScreenX}px`;
  huntObject.style.top = `${objectScreenY}px`;

  const isOutside =
    objectScreenX < -100 ||
    objectScreenX > window.innerWidth + 100 ||
    objectScreenY < -100 ||
    objectScreenY > window.innerHeight + 100;

  huntObject.style.opacity = isOutside ? "0.25" : "1";

  requestAnimationFrame(updateObjectPosition);
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function isObjectInCrosshair() {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const distance = Math.hypot(objectScreenX - centerX, objectScreenY - centerY);

  return distance <= catchRadius;
}

function catchObject() {
  if (!gameStarted) {
    statusText.textContent = "Game belum dimulai.";
    return;
  }

  if (!objectVisible) {
    statusText.textContent = "Belum ada item.";
    return;
  }

  if (!isObjectInCrosshair()) {
    statusText.textContent = "Item belum tepat di tengah crosshair. Putar HP sampai pas.";
    return;
  }

  totalCaught++;

  huntObject.style.display = "none";
  objectVisible = false;

  vibratePhone();

  if (currentItemImage === scoreItem) {
    score++;
    scoreText.textContent = score;

    if (score >= targetScore) {
      finishGame();
      return;
    }

    statusText.textContent = `Benar! item5.png tertangkap. Score: ${score}/5`;
  } else {
    statusText.textContent = `Item tertangkap, tapi bukan item5.png. Score tetap ${score}/5`;
  }

  setTimeout(spawnObject, 700);
}

function finishGame() {
  gameStarted = false;
  objectVisible = false;

  clearInterval(timerInterval);
  timerInterval = null;

  elapsedTime = (performance.now() - startTime) / 1000;

  huntObject.style.display = "none";

  finalScoreText.textContent = score;
  finalTotalCaughtText.textContent = totalCaught;
  finalTimeText.textContent = elapsedTime.toFixed(1);

  resultPanel.classList.remove("hidden");

  statusText.textContent = `Game selesai! item5.png tertangkap ${score} kali.`;
}

function resetGame() {
  score = 0;
  totalCaught = 0;
  elapsedTime = 0;

  gameStarted = false;
  objectVisible = false;

  clearInterval(timerInterval);
  timerInterval = null;

  scoreText.textContent = "0";
  timerText.textContent = "0.0";

  huntObject.style.display = "none";
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