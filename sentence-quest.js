(() => {
  const WORDS = [
    { word: "under", meaning: "below something", starters: ["The kitten", "My shoes", "A small key"] },
    { word: "rain", meaning: "water falling from clouds", starters: ["Soft rain", "Heavy rain", "After the rain"] },
    { word: "sale", meaning: "a time when something costs less", starters: ["The store", "Dad found", "During the sale"] },
    { word: "tall", meaning: "having great height", starters: ["The tall tree", "A tall tower", "My brother"] },
    { word: "vein", meaning: "a tube that carries blood", starters: ["A vein", "The nurse", "This leaf"] }
  ];

  const state = {
    phase: "ready",
    mode: "word",
    wordIndex: 0,
    finalIndex: 0,
    stars: 0,
    energy: 0,
    accepted: [],
    listening: false,
    speaking: false,
    finished: false,
    t: 0,
    speed: 250,
    spawnTimer: 0,
    crystalTimer: 0,
    hitCooldown: 0,
    player: { x: 140, y: 0, vy: 0, onGround: true },
    obstacles: [],
    crystals: [],
    particles: [],
    message: "Tap Start Run, then jump to collect crystals."
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let last = performance.now();

  function currentWord() { return state.mode === "final" ? WORDS[state.finalIndex] : WORDS[state.wordIndex]; }
  function normalize(text) { return String(text || "").toLowerCase().replace(/[^a-z'\s-]/g, " ").replace(/\s+/g, " ").trim(); }
  function wordsIn(text) { return normalize(text).split(" ").filter(Boolean); }
  function escapeHtml(text) { return String(text).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }

  function setBusy(isBusy) {
    state.speaking = isBusy;
    const inSentence = state.phase === "sentence" || state.mode === "final";
    const blocked = isBusy || state.listening || state.finished;
    $("speakPromptBtn").disabled = blocked;
    $("recordBtn").disabled = blocked || !SpeechRecognition || !inSentence;
    $("checkBtn").disabled = blocked || !inSentence;
    $("jumpBtn").disabled = state.phase !== "run" || blocked;
    $("startRunBtn").disabled = state.phase !== "ready" || blocked;
  }

  function speak(text) {
    return new Promise(resolve => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.86;
      u.pitch = 1.03;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }

  function missionLine() {
    const item = currentWord();
    if (state.mode === "final") return `Final challenge: make one sentence with ${item.word}.`;
    if (state.phase === "run") return `Run, jump, and collect 3 crystals for ${item.word}.`;
    if (state.phase === "sentence") return `Use ${item.word} in one real sentence to launch your skill.`;
    return `Start the run for ${item.word}. Collect 3 crystals first.`;
  }

  function renderUi() {
    if (state.finished) {
      $("finishPanel").classList.remove("hidden");
      setBusy(false);
      return;
    }
    const item = currentWord();
    $("stageCounter").textContent = state.mode === "final" ? `Final ${state.finalIndex + 1} / 5` : `Stage ${state.wordIndex + 1} / 5`;
    $("stars").textContent = `${state.stars} stars`;
    $("stageLabel").textContent = state.mode === "final" ? "Final Sentence Bridge" : "Crystal Run";
    $("targetWord").textContent = item.word;
    $("meaning").textContent = item.meaning;
    $("energyText").textContent = state.mode === "final" ? `${state.finalIndex} / 5` : `${state.energy} / 3`;
    $("energyFill").style.width = state.mode === "final" ? `${(state.finalIndex / 5) * 100}%` : `${(state.energy / 3) * 100}%`;
    $("missionText").textContent = missionLine();
    $("starterBank").innerHTML = item.starters.map(s => `<button type="button" data-starter="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("");
    $("sentencePanel").classList.toggle("hidden", state.phase !== "sentence" && state.mode !== "final");
    $("sentenceList").innerHTML = state.accepted.length
      ? state.accepted.map(row => `<li><strong>${escapeHtml(row.word)}:</strong> ${escapeHtml(row.sentence)}</li>`).join("")
      : `<li>No sentences collected yet.</li>`;
    $("recordBtn").textContent = SpeechRecognition ? "Speak" : "Type Only";
    $("finishPanel").classList.add("hidden");
    setBusy(false);
  }

  function setFeedback(msg, good = false) {
    const el = $("feedback");
    el.textContent = msg;
    el.className = good ? "feedback good" : "feedback bad";
  }

  function startRun() {
    if (state.phase !== "ready" || state.finished) return;
    state.phase = "run";
    state.energy = 0;
    state.obstacles = [];
    state.crystals = [];
    state.particles = [];
    state.spawnTimer = 0.7;
    state.crystalTimer = 0.35;
    state.message = "Jump over blocks and collect crystals.";
    setFeedback("Jump over blocks and collect 3 crystals.", true);
    renderUi();
  }

  function jump() {
    if (state.phase !== "run" || !state.player.onGround) return;
    state.player.vy = -690;
    state.player.onGround = false;
    burst(state.player.x, state.player.y + 28, "#f6c84c", 8);
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({ x, y, vx: -90 + Math.random() * 180, vy: -190 + Math.random() * 130, life: .5 + Math.random() * .35, color });
    }
  }

  function rectsHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateRunner(dt) {
    if (state.phase !== "run") return;
    const ground = canvas.clientHeight * .76;
    state.player.vy += 1700 * dt;
    state.player.y += state.player.vy * dt;
    if (state.player.y >= ground - 72) {
      state.player.y = ground - 72;
      state.player.vy = 0;
      state.player.onGround = true;
    }

    state.spawnTimer -= dt;
    state.crystalTimer -= dt;
    state.hitCooldown = Math.max(0, state.hitCooldown - dt);
    if (state.spawnTimer <= 0) {
      state.obstacles.push({ x: canvas.clientWidth + 50, y: ground - 42, w: 44, h: 42 });
      state.spawnTimer = 1.35 + Math.random() * .7;
    }
    if (state.crystalTimer <= 0) {
      const high = Math.random() > .45;
      state.crystals.push({ x: canvas.clientWidth + 60, y: high ? ground - 155 : ground - 92, r: 17, spin: Math.random() * 6 });
      state.crystalTimer = .95 + Math.random() * .55;
    }

    for (const o of state.obstacles) o.x -= state.speed * dt;
    for (const c of state.crystals) { c.x -= state.speed * dt; c.spin += dt * 5; }
    state.obstacles = state.obstacles.filter(o => o.x > -80);
    state.crystals = state.crystals.filter(c => c.x > -80 && !c.hit);

    const pbox = { x: state.player.x - 23, y: state.player.y - 44, w: 46, h: 70 };
    for (const o of state.obstacles) {
      if (state.hitCooldown <= 0 && rectsHit(pbox, o)) {
        state.hitCooldown = .9;
        state.energy = Math.max(0, state.energy - 1);
        burst(state.player.x, state.player.y - 8, "#f06b4f", 12);
        state.message = "Ouch! One crystal dropped.";
        setFeedback("Ouch! Jump over the blocks.", false);
        renderUi();
      }
    }
    for (const c of state.crystals) {
      const cbox = { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
      if (!c.hit && rectsHit(pbox, cbox)) {
        c.hit = true;
        state.energy += 1;
        state.stars += 1;
        burst(c.x, c.y, "#f6c84c", 16);
        if (state.energy >= 3) {
          state.phase = "sentence";
          state.message = "Skill ready! Make a sentence.";
          setFeedback("Skill ready. Now use the word in a sentence.", true);
        } else {
          state.message = "Crystal collected!";
          setFeedback("Crystal collected.", true);
        }
        renderUi();
      }
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function drawRunner(time) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ground = h * .76;
    ctx.clearRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#80cbff");
    sky.addColorStop(.6, "#dff8f2");
    sky.addColorStop(1, "#ffe3a5");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 6; i += 1) {
      const x = ((time * .018 + i * 190) % (w + 180)) - 90;
      const y = 72 + (i % 3) * 42;
      ctx.beginPath();
      ctx.ellipse(x, y, 46, 17, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 38, y - 8, 54, 23, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 82, y, 42, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(39,140,111,.22)";
    ctx.beginPath();
    ctx.moveTo(0, h * .68);
    for (let x = 0; x <= w; x += 35) ctx.lineTo(x, h * .68 + Math.sin((x + time * .05) / 70) * 18);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.fillStyle = "#219b70";
    ctx.fillRect(0, ground, w, h - ground);
    ctx.fillStyle = "#32bd84";
    ctx.fillRect(0, ground, w, 18);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    for (let x = -80 + ((time * .18) % 80); x < w; x += 80) ctx.fillRect(x, ground + 34, 38, 8);

    for (const o of state.obstacles) {
      ctx.fillStyle = "#724f3a";
      roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.fillStyle = "#9d7356";
      roundRect(o.x + 8, o.y + 7, o.w - 16, 10, 5);
    }

    for (const c of state.crystals) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.spin);
      ctx.fillStyle = "#f6c84c";
      ctx.beginPath();
      ctx.moveTo(0, -c.r);
      ctx.lineTo(c.r, 0);
      ctx.lineTo(0, c.r);
      ctx.lineTo(-c.r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#102036";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    drawPlayer(state.player.x, state.player.y, time);
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 1.8);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "rgba(16,32,54,.78)";
    ctx.font = "900 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.message, w / 2, h - 22);

    if (state.phase === "ready") drawCenterCard("Ready?", "Tap Start Run, then jump to collect crystals.");
    if (state.phase === "sentence" || state.mode === "final") drawCenterCard("Sentence Skill Ready", "Use the word to move forward.");
    if (state.finished) drawCenterCard("Crystal Run Complete", "You finished all word challenges.");
  }

  function drawCenterCard(title, subtitle) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = "rgba(255,255,255,.82)";
    roundRect(w / 2 - 190, h / 2 - 62, 380, 124, 8);
    ctx.fillStyle = "#102842";
    ctx.textAlign = "center";
    ctx.font = "950 30px system-ui, sans-serif";
    ctx.fillText(title, w / 2, h / 2 - 12);
    ctx.font = "800 16px system-ui, sans-serif";
    ctx.fillText(subtitle, w / 2, h / 2 + 24);
  }

  function drawPlayer(x, y, time) {
    const bob = state.player.onGround ? Math.sin(time / 85) * 3 : 0;
    ctx.fillStyle = "rgba(16,32,54,.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + 77, 35, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f06b4f";
    roundRect(x - 23, y - 22 + bob, 46, 54, 18);
    ctx.fillStyle = "#fff0a8";
    ctx.beginPath();
    ctx.arc(x, y - 36 + bob, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#102036";
    ctx.beginPath();
    ctx.arc(x - 7, y - 39 + bob, 3.5, 0, Math.PI * 2);
    ctx.arc(x + 8, y - 39 + bob, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#102036";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 1, y - 32 + bob, 8, 0, Math.PI);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
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
    return { ok: true, msg: "Skill launched." };
  }

  async function acceptSentence(sentence) {
    const item = currentWord();
    state.accepted.push({ word: item.word, sentence: sentence.trim() });
    state.stars += 2;
    burst(state.player.x + 90, state.player.y - 40, "#2467dc", 28);
    $("sentenceInput").value = "";
    setFeedback("Skill launched. Nice sentence.", true);
    setBusy(true);
    await speak("Skill launched. Nice sentence.");

    if (state.mode === "word") {
      state.wordIndex += 1;
      if (state.wordIndex >= WORDS.length) {
        state.mode = "final";
        state.finalIndex = 0;
        state.phase = "sentence";
        state.message = "Final challenge: five words, five sentences.";
        renderUi();
        setFeedback("Final challenge unlocked. One sentence for each word.", true);
        await speak("Final challenge unlocked. One sentence for each word.");
      } else {
        state.phase = "ready";
        state.energy = 0;
        state.message = "New stage ready.";
        renderUi();
      }
      setBusy(false);
      return;
    }

    state.finalIndex += 1;
    if (state.finalIndex >= WORDS.length) {
      state.finished = true;
      state.message = "Crystal Run complete.";
      renderUi();
      setFeedback("Crystal Run complete. Great work.", true);
      await speak("Crystal Run complete. Great work today.");
      return;
    }
    state.message = "Next final word.";
    renderUi();
    setBusy(false);
  }

  async function checkTypedSentence() {
    if (state.speaking || state.listening || state.finished) return;
    if (state.phase !== "sentence" && state.mode !== "final") return;
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
    if (state.phase !== "sentence" && state.mode !== "final") return;
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    state.listening = true;
    $("recordBtn").textContent = "Listening...";
    setBusy(false);
    $("recordBtn").disabled = true;
    $("feedback").textContent = "Listening...";
    recognition.onresult = event => { $("sentenceInput").value = event.results[0][0].transcript; };
    recognition.onerror = () => setFeedback("I could not hear clearly. Try again or type it.", false);
    recognition.onend = async () => {
      state.listening = false;
      renderUi();
      await checkTypedSentence();
    };
    recognition.start();
  }

  async function sayMission() {
    if (state.finished) return;
    const item = currentWord();
    setBusy(true);
    if (state.phase === "run") await speak(`Run and collect three crystals for ${item.word}. Jump over the blocks.`);
    else await speak(`Target word: ${item.word}. Meaning: ${item.meaning}. Say one sentence with eight to ten words.`);
    setBusy(false);
  }

  function addStarter(text) {
    const input = $("sentenceInput");
    const clean = String(text || "").trim();
    input.value = input.value.trim() ? `${input.value.trim()} ${clean}` : clean;
    input.focus();
  }

  function restart() {
    state.phase = "ready";
    state.mode = "word";
    state.wordIndex = 0;
    state.finalIndex = 0;
    state.stars = 0;
    state.energy = 0;
    state.accepted = [];
    state.finished = false;
    state.obstacles = [];
    state.crystals = [];
    state.particles = [];
    state.message = "Tap Start Run, then jump to collect crystals.";
    $("sentenceInput").value = "";
    $("finishPanel").classList.add("hidden");
    setFeedback("Ready when you are.", true);
    renderUi();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(640, Math.floor(rect.width * ratio));
    canvas.height = Math.max(330, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!state.player.y) state.player.y = canvas.clientHeight * .76 - 72;
  }

  function loop(now) {
    const dt = Math.min(.033, (now - last) / 1000);
    last = now;
    state.t += dt;
    updateRunner(dt);
    updateParticles(dt);
    drawRunner(now);
    requestAnimationFrame(loop);
  }

  $("startRunBtn").addEventListener("click", startRun);
  $("jumpBtn").addEventListener("click", jump);
  $("tapLayer").addEventListener("pointerdown", () => { if (state.phase === "run") jump(); });
  window.addEventListener("keydown", e => { if (e.code === "Space") { e.preventDefault(); jump(); } });
  $("speakPromptBtn").addEventListener("click", sayMission);
  $("recordBtn").addEventListener("click", startListening);
  $("checkBtn").addEventListener("click", checkTypedSentence);
  $("restartBtn").addEventListener("click", restart);
  $("starterBank").addEventListener("click", event => {
    const btn = event.target.closest("button[data-starter]");
    if (btn) addStarter(btn.dataset.starter);
  });
  $("sentenceInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) checkTypedSentence();
  });
  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  renderUi();
  setFeedback("Start the run, collect 3 crystals, then make a sentence.", true);
  requestAnimationFrame(loop);
})();
