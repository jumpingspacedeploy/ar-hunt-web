const camera = document.getElementById("camera");
const huntObject = document.getElementById("huntObject");

const scoreText = document.getElementById("scoreText");
const timerText = document.getElementById("timerText");
const statusText = document.getElementById("statusText");

const startBtn = document.getElementById("startBtn");
const voiceBtn = document.getElementById("voiceBtn");
const catchBtn = document.getElementById("catchBtn");
const resetBtn = document.getElementById("resetBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const resultPanel = document.getElementById("resultPanel");
const finalScoreText = document.getElementById("finalScoreText");
const finalTotalCaughtText = document.getElementById("finalTotalCaughtText");
const finalTimeText = document.getElementById("finalTimeText");

// =====================
// SETTING GAME
// =====================

const targetScore = 5;

const scoreItem = "assets/item5.png";

const itemImages = [
  "assets/item1.png",
  "assets/item2.png",
  "assets/item3.png",
  "assets/item4.png",
  "assets/item5.png"
];

// =====================
// STATE
// =====================

let score = 0;
let totalCaught = 0;

let currentItemImage = "";

let objectX = 0;
let objectY = 0;
let objectVisible = false;

let gameStarted = false;
let cameraStarted = false;

let startTime = 0;
let elapsedTime = 0;
let timerInterval = null;

let recognition = null;
let isListening = false;

const deviceInfo = detectDeviceInfo();

// =====================
// DEVICE DETECTION
// =====================

function detectDeviceInfo() {
  const ua = navigator.userAgent || "";
  const uaLower = ua.toLowerCase();

  const isIOS =
    /iphone|ipad|ipod/.test(uaLower) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isAndroid = /android/.test(uaLower);

  const isChrome =
    /chrome|crios/i.test(ua) &&
    !/edg|opr|opera/i.test(ua);

  const isSafari =
    /safari/i.test(ua) &&
    !/chrome|crios|android|edg|opr|opera/i.test(ua);

  return {
    isIOS,
    isAndroid,
    isChrome,
    isSafari
  };
}

function showDeviceMessage() {
  if (deviceInfo.isIOS) {
    statusText.textContent = "iOS terdeteksi. Gunakan Safari, lalu izinkan camera dan microphone.";
  } else if (deviceInfo.isAndroid) {
    statusText.textContent = "Android terdeteksi. Gunakan Chrome, lalu izinkan camera dan microphone.";
  } else {
    statusText.textContent = "Gunakan browser mobile: Safari iOS atau Chrome Android.";
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
    statusText.textContent = "Camera aktif. Game dimulai.";

    startGame();
  } catch (error) {
    console.error("Camera error:", error);

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      statusText.textContent = "Camera butuh HTTPS. Upload web ke hosting yang punya SSL/HTTPS.";
      return;
    }

    if (error.name === "NotAllowedError") {
      statusText.textContent = "Izin camera ditolak. Aktifkan permission camera di browser.";
      return;
    }

    if (error.name === "NotFoundError") {
      statusText.textContent = "Camera tidak ditemukan di device ini.";
      return;
    }

    statusText.textContent = "Gagal membuka camera. Coba refresh dan izinkan camera.";
  }
}

// =====================
// GAME
// =====================

function startGame() {
  if (!cameraStarted) {
    statusText.textContent = "Aktifkan camera dulu.";
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

  spawnObject();
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

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  const marginX = 80;
  const topSafe = 120;
  const bottomSafe = 310;

  const minX = marginX;
  const maxX = screenW - marginX;

  const minY = topSafe;
  const maxY = screenH - bottomSafe;

  objectX = randomRange(minX, maxX);
  objectY = randomRange(minY, maxY);

  const randomIndex = Math.floor(Math.random() * itemImages.length);
  currentItemImage = itemImages[randomIndex];

  huntObject.src = currentItemImage;

  huntObject.style.left = `${objectX}px`;
  huntObject.style.top = `${objectY}px`;
  huntObject.style.display = "block";

  objectVisible = true;

  if (currentItemImage === scoreItem) {
    statusText.textContent = `Item target muncul! Arahkan crosshair, lalu bilang "tangkap". Score: ${score}/5`;
  } else {
    statusText.textContent = `Item biasa muncul. Hanya item5.png yang menambah score. Score: ${score}/5`;
  }
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function isObjectInCrosshair() {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const distance = Math.hypot(objectX - centerX, objectY - centerY);

  return distance <= 95;
}

function catchObject() {
  if (!gameStarted) {
    statusText.textContent = "Game belum dimulai.";
    return;
  }

  if (!objectVisible) {
    statusText.textContent = "Belum ada item yang muncul.";
    return;
  }

  if (!isObjectInCrosshair()) {
    statusText.textContent = "Item belum tepat di tengah crosshair.";
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
    statusText.textContent = `Item tertangkap, tapi bukan item5.png. Score tetap: ${score}/5`;
  }

  setTimeout(() => {
    spawnObject();
  }, 700);
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

  statusText.textContent = "Game direset. Tekan Start Camera untuk mulai.";
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
    if (deviceInfo.isIOS) {
      statusText.textContent = "Voice tidak tersedia di Safari ini. Pakai tombol Tangkap Manual.";
    } else if (deviceInfo.isAndroid) {
      statusText.textContent = "Voice tidak tersedia. Coba buka dengan Chrome Android.";
    } else {
      statusText.textContent = "Voice recognition tidak didukung browser ini.";
    }

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

    console.log("Voice result:", command);

    statusText.textContent = `Terdengar: "${command}"`;

    if (isCatchCommand(command)) {
      catchObject();
    }
  };

  recognition.onerror = (event) => {
    console.log("Speech error:", event.error);

    isListening = false;
    voiceBtn.textContent = "Aktifkan Voice";

    if (event.error === "not-allowed") {
      statusText.textContent = "Microphone ditolak. Izinkan microphone di browser.";
    } else if (event.error === "no-speech") {
      statusText.textContent = "Tidak ada suara terdeteksi. Tekan Voice lagi.";
    } else if (event.error === "audio-capture") {
      statusText.textContent = "Microphone tidak ditemukan.";
    } else {
      statusText.textContent = `Voice error: ${event.error}`;
    }
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = "Aktifkan Voice";

    /*
      Untuk iOS Safari:
      Jangan auto-start voice terus-menerus.
      Safari sering memblokir restart otomatis.
      Jadi user tekan tombol Voice lagi setiap mau memberi command.
    */
  };

  try {
    recognition.start();
  } catch (error) {
    console.error("Recognition start error:", error);
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

window.addEventListener("load", () => {
  showDeviceMessage();
});

startBtn.addEventListener("click", () => {
  startCamera();
});

voiceBtn.addEventListener("click", () => {
  setupVoice();
});

catchBtn.addEventListener("click", () => {
  catchObject();
});

resetBtn.addEventListener("click", () => {
  resetGame();
});

playAgainBtn.addEventListener("click", () => {
  startGame();
});

window.addEventListener("resize", () => {
  if (gameStarted && objectVisible) {
    spawnObject();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopVoice();
  }
});