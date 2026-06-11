(() => {
  const WORDS = [
    { word: "under", meaning: "below something", starters: ["The kitten", "My shoes", "A small key"], sample: "The kitten sleeps under the warm kitchen chair." },
    { word: "rain", meaning: "water falling from clouds", starters: ["Soft rain", "Heavy rain", "After the rain"], sample: "Soft rain tapped gently on my bedroom window." },
    { word: "sale", meaning: "a time when something costs less", starters: ["The store", "Dad found", "During the sale"], sample: "The store had a sale on warm winter coats." },
    { word: "tall", meaning: "having great height", starters: ["The tall tree", "A tall tower", "My brother"], sample: "The tall tree gave shade to our playground." },
    { word: "vein", meaning: "a tube that carries blood", starters: ["A vein", "The nurse", "This leaf"], sample: "A vein carries blood back toward the heart." }
  ];

  const state = {
    mode: "word",
    wordIndex: 0,
    finalIndex: 0,
    stars: 0,
    accepted: [],
    listening: false,
    speaking: false,
    finished: false,
    action: null,
    actionStart: 0,
    camera: 0
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let lastTime = performance.now();

  function currentWord() {
    if (state.mode === "final") return WORDS[state.finalIndex];
    return WORDS[state.wordIndex];
  }

  function stageNumber() {
    return state.mode === "final" ? 6 : state.wordIndex + 1;
  }

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/[^a-z'\s-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function wordsIn(text) { return normalize(text).split(" ").filter(Boolean); }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  }

  function setBusy(isBusy) {
    state.speaking = isBusy;
    const blocked = isBusy || state.listening || state.finished;
    $("speakPromptBtn").disabled = blocked;
    $("recordBtn").disabled = blocked || !SpeechRecognition;
    $("checkBtn").disabled = blocked;
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.86;
      utterance.pitch = 1.03;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  function missionLine() {
    const item = currentWord();
    if (state.mode === "final") {
      return `Final Run: make one sentence with ${item.word}. ${5 - state.finalIndex} word${5 - state.finalIndex === 1 ? "" : "s"} left.`;
    }
    return `Collect a sky crystal: make one real sentence with ${item.word}.`;
  }

  async function sayMission() {
    if (state.finished) return;
    const item = currentWord();
    setBusy(true);
    const prefix = state.mode === "final" ? "Final Run." : "Sky Run.";
    await speak(`${prefix} Target word: ${item.word}. Meaning: ${item.meaning}. Say one sentence with eight to ten words.`);
    setBusy(false);
  }

  function render() {
    if (state.finished) {
      $("finishPanel").classList.remove("hidden");
      setBusy(false);
      return;
    }
    const item = currentWord();
    $("stageCounter").textContent = state.mode === "final" ? `Final ${state.finalIndex + 1} / 5` : `Stage ${state.wordIndex + 1} / 5`;
    $("stars").textContent = `${state.stars} stars`;
    $("stageLabel").textContent = state.mode === "final" ? "Final Bridge" : "Word Run";
    $("targetWord").textContent = item.word;
    $("meaning").textContent = item.meaning;
    $("missionText").textContent = missionLine();
    $("starterBank").innerHTML = item.starters.map(starter => `<button type="button" data-starter="${escapeHtml(starter)}">${escapeHtml(starter)}</button>`).join("");
    $("sentenceList").innerHTML = state.accepted.length
      ? state.accepted.map(row => `<li><strong>${escapeHtml(row.word)}:</strong> ${escapeHtml(row.sentence)}</li>`).join("")
      : `<li>No sentences collected yet.</li>`;
    $("wordTrail").innerHTML = WORDS.map((w, i) => {
      const done = state.mode === "final" ? i < state.finalIndex : i < state.wordIndex;
      const active = state.mode === "final" ? i === state.finalIndex : i === state.wordIndex;
      return `<span class="word-chip ${done ? "done" : ""} ${active ? "active" : ""}">${escapeHtml(w.word)}</span>`;
    }).join("");
    $("recordBtn").textContent = SpeechRecognition ? "Speak" : "Type Only";
    $("finishPanel").classList.add("hidden");
    setBusy(false);
  }

  function setFeedback(msg, good = false) {
    const el = $("feedback");
    el.textContent = msg;
    el.className = good ? "feedback good" : "feedback bad";
  }

  function checkSentence(raw) {
    const item = currentWord();
    const sentence = String(raw || "").trim();
    const tokens = wordsIn(sentence);
    if (!sentence) return { ok: false, msg: "Say or type a sentence first." };
    if (!tokens.includes(item.word.toLowerCase())) return { ok: false, msg: `Use the target word: ${item.word}.` };
    if (tokens.length < 8) return { ok: false, msg: `Add more words. You used ${tokens.length}; aim for 8 to 10.` };
    if (tokens.length > 10) return { ok: false, msg: `Make it shorter. You used ${tokens.length}; aim for 8 to 10.` };
    if (/\b(word|spell|spelling|sentence)\b/.test(normalize(sentence))) return { ok: false, msg: `Use the meaning of ${item.word}, not spelling talk.` };
    if (state.accepted.some(row => normalize(row.sentence) === normalize(sentence))) return { ok: false, msg: "Try a new sentence, not the same one." };
    return { ok: true, msg: "Sentence launched." };
  }

  function beginAction(type) {
    state.action = type;
    state.actionStart = performance.now();
  }

  async function acceptSentence(sentence) {
    const item = currentWord();
    state.accepted.push({ word: item.word, sentence: sentence.trim() });
    state.stars += 1;
    $("sentenceInput").value = "";
    setFeedback(state.mode === "final" ? "Bridge tile built." : "Sky crystal collected.", true);
    beginAction(state.mode === "final" ? "bridge" : "crystal");
    render();
    setBusy(true);
    await speak(state.mode === "final" ? "Bridge tile built." : "Sky crystal collected.");

    if (state.mode === "word") {
      state.wordIndex += 1;
      if (state.wordIndex >= WORDS.length) {
        state.mode = "final";
        state.finalIndex = 0;
        render();
        setFeedback("Final Run unlocked. Use each word once.", true);
        await speak("Final Run unlocked. Use each word once.");
      } else {
        render();
      }
      setBusy(false);
      return;
    }

    state.finalIndex += 1;
    if (state.finalIndex >= WORDS.length) {
      state.finished = true;
      beginAction("finish");
      render();
      setFeedback("Sky Run complete. Great work.", true);
      await speak("Sky Run complete. Great work today.");
      return;
    }
    render();
    setBusy(false);
  }

  async function checkTypedSentence() {
    if (state.speaking || state.listening || state.finished) return;
    const result = checkSentence($("sentenceInput").value);
    if (!result.ok) {
      setFeedback(result.msg, false);
      setBusy(true);
      await speak(result.msg);
      setBusy(false);
      return;
    }
    await acceptSentence($("sentenceInput").value);
  }

  function startListening() {
    if (!SpeechRecognition || state.speaking || state.listening || state.finished) return;
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    state.listening = true;
    $("recordBtn").textContent = "Listening...";
    setBusy(false);
    $("recordBtn").disabled = true;
    $("feedback").textContent = "Listening...";
    recognition.onresult = (event) => { $("sentenceInput").value = event.results[0][0].transcript; };
    recognition.onerror = () => setFeedback("I could not hear clearly. Try again or type it.", false);
    recognition.onend = async () => {
      state.listening = false;
      render();
      await checkTypedSentence();
    };
    recognition.start();
  }

  function addStarter(text) {
    const input = $("sentenceInput");
    const clean = String(text || "").trim();
    input.value = input.value.trim() ? `${input.value.trim()} ${clean}` : clean;
    input.focus();
  }

  function restart() {
    state.mode = "word";
    state.wordIndex = 0;
    state.finalIndex = 0;
    state.stars = 0;
    state.accepted = [];
    state.listening = false;
    state.speaking = false;
    state.finished = false;
    state.action = null;
    $("sentenceInput").value = "";
    $("finishPanel").classList.add("hidden");
    setFeedback("Ready when you are.", true);
    render();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(640, Math.floor(rect.width * ratio));
    canvas.height = Math.max(330, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawScene(time) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#87cfff");
    sky.addColorStop(.62, "#dff6f1");
    sky.addColorStop(1, "#ffe1a6");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,.72)";
    for (let i = 0; i < 5; i += 1) {
      const cx = ((time * .018 + i * 220) % (w + 220)) - 110;
      const cy = 70 + (i % 3) * 38;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 34, cy - 8, 54, 23, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 78, cy, 42, 17, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(54,129,112,.22)";
    ctx.beginPath();
    ctx.moveTo(0, h * .68);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, h * .68 + Math.sin((x + time * .03) / 80) * 18);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    const groundY = h * .76;
    ctx.strokeStyle = "rgba(19,32,56,.28)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w * .08, groundY);
    ctx.lineTo(w * .92, groundY);
    ctx.stroke();

    const totalDone = state.mode === "final" ? 5 + state.finalIndex : state.wordIndex;
    for (let i = 0; i < 10; i += 1) {
      const x = w * (.12 + i * .08);
      ctx.fillStyle = i < totalDone ? "#f5c84b" : "rgba(255,255,255,.72)";
      drawRoundedRect(x - 22, groundY - 14, 44, 28, 8);
      ctx.strokeStyle = "rgba(19,32,56,.18)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 22, groundY - 14, 44, 28);
    }

    const runPulse = Math.sin(time / 120) * 4;
    const progress = state.mode === "final" ? 5 + state.finalIndex : state.wordIndex;
    const avatarX = w * (.12 + Math.min(progress, 9) * .08);
    const avatarY = groundY - 62 + runPulse;
    ctx.fillStyle = "rgba(19,32,56,.16)";
    ctx.beginPath();
    ctx.ellipse(avatarX, groundY + 22, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f06b4f";
    drawRoundedRect(avatarX - 22, avatarY - 28, 44, 54, 18);
    ctx.fillStyle = "#fff0a8";
    ctx.beginPath();
    ctx.arc(avatarX, avatarY - 40, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#132038";
    ctx.beginPath();
    ctx.arc(avatarX - 7, avatarY - 43, 3.5, 0, Math.PI * 2);
    ctx.arc(avatarX + 8, avatarY - 43, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#132038";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avatarX + 1, avatarY - 36, 8, 0, Math.PI);
    ctx.stroke();

    const targetX = state.mode === "final" ? w * (.82) : w * (.76);
    const targetY = groundY - 86 + Math.sin(time / 260) * 8;
    ctx.save();
    ctx.translate(targetX, targetY);
    ctx.rotate(time / 900);
    ctx.fillStyle = state.mode === "final" ? "#2467dc" : "#25b58d";
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(34, 0);
    ctx.lineTo(0, 38);
    ctx.lineTo(-34, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#132038";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    if (state.action) {
      const age = Math.min(1, (time - state.actionStart) / 720);
      const sx = avatarX + 20;
      const sy = avatarY - 46;
      const ex = targetX;
      const ey = targetY;
      const bx = sx + (ex - sx) * age;
      const by = sy + (ey - sy) * age - Math.sin(age * Math.PI) * 64;
      ctx.strokeStyle = "rgba(245,200,75,.55)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ex) / 2, sy - 90, bx, by);
      ctx.stroke();
      ctx.fillStyle = "#f5c84b";
      ctx.beginPath();
      ctx.arc(bx, by, 13 + Math.sin(time / 60) * 2, 0, Math.PI * 2);
      ctx.fill();
      if (age >= 1) state.action = null;
    }

    if (state.finished || state.action === "finish") {
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#13284a";
      ctx.font = "900 42px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Sky Run Complete", w / 2, h * .44);
      ctx.font = "800 20px system-ui, sans-serif";
      ctx.fillText("All five final sentences built the bridge.", w / 2, h * .52);
    }

    requestAnimationFrame(drawScene);
  }

  $("speakPromptBtn").addEventListener("click", sayMission);
  $("recordBtn").addEventListener("click", startListening);
  $("checkBtn").addEventListener("click", checkTypedSentence);
  $("restartBtn").addEventListener("click", restart);
  $("starterBank").addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-starter]");
    if (btn) addStarter(btn.dataset.starter);
  });
  $("sentenceInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) checkTypedSentence();
  });
  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  render();
  requestAnimationFrame(drawScene);
  setFeedback(SpeechRecognition ? "Tap Speak or type a sentence to launch." : "Speech recognition is not available here. Type a sentence to launch.", true);
})();
