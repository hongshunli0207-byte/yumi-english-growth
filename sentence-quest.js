(() => {
  const WORDS = [
    { word: "under", meaning: "below something", starters: ["The kitten", "My shoes", "A small key"], examples: ["The kitten sleeps under the warm kitchen chair.", "My shoes are under the bed after soccer practice.", "A small key was hidden under the blue mat."] },
    { word: "rain", meaning: "water falling from clouds", starters: ["Soft rain", "Heavy rain", "After the rain"], examples: ["Soft rain tapped gently on my bedroom window.", "Heavy rain made the street shine at night.", "After the rain, the garden smelled clean and fresh."] },
    { word: "sale", meaning: "a time when something costs less", starters: ["The store", "Dad found", "During the sale"], examples: ["The store had a sale on warm winter coats.", "Dad found cheap notebooks during the school sale.", "During the sale, we bought a blue backpack."] },
    { word: "tall", meaning: "having great height", starters: ["The tall tree", "A tall man", "My tower"], examples: ["The tall tree gave shade to our playground.", "A tall man helped reach the top shelf.", "My tower was tall enough to touch the sofa."] },
    { word: "vein", meaning: "a tube that carries blood", starters: ["A vein", "The nurse", "This leaf"], examples: ["A vein carries blood back toward the heart.", "The nurse found a vein in his arm.", "This leaf has a vein down the middle."] }
  ];

  const state = {
    wordIndex: 0,
    charge: 0,
    stars: 0,
    accepted: [],
    listening: false,
    speaking: false,
    finished: false
  };

  const $ = (id) => document.getElementById(id);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function currentWord() { return WORDS[state.wordIndex]; }
  function normalize(text) { return String(text || "").toLowerCase().replace(/[^a-z'\s-]/g, " ").replace(/\s+/g, " ").trim(); }
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

  async function sayMission() {
    if (state.finished) return;
    const item = currentWord();
    setBusy(true);
    await speak(`Gate word: ${item.word}. Meaning: ${item.meaning}. Say a sentence with eight to ten words.`);
    setBusy(false);
  }

  function render() {
    if (state.wordIndex >= WORDS.length) {
      state.finished = true;
      $("finishPanel").classList.remove("hidden");
      setBusy(false);
      return;
    }

    const item = currentWord();
    $("wordCounter").textContent = `${state.wordIndex + 1} / ${WORDS.length}`;
    $("stars").textContent = `${state.stars} stars`;
    $("targetWord").textContent = item.word;
    $("meaning").textContent = item.meaning;
    $("missionText").textContent = `Open this gate with ${3 - state.charge} more power sentence${3 - state.charge === 1 ? "" : "s"}.`;
    $("sentenceList").innerHTML = state.accepted.length
      ? state.accepted.map(s => `<li>${escapeHtml(s)}</li>`).join("")
      : `<li>No power sentences yet.</li>`;

    for (let i = 0; i < 3; i += 1) {
      $("orb" + i).classList.toggle("filled", i < state.charge);
    }

    const avatarStops = [10, 39, 70, 86];
    $("avatar").style.setProperty("--x", avatarStops[state.charge] + "%");
    $("gate").classList.toggle("open", state.charge >= 3);
    $("recordBtn").textContent = SpeechRecognition ? "Speak" : "Type Only";
    $("starterBank").innerHTML = item.starters.map(starter => `<button type="button" data-starter="${escapeHtml(starter)}">${escapeHtml(starter)}</button>`).join("");
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
    if (!tokens.includes(item.word.toLowerCase())) return { ok: false, msg: `Use the gate word: ${item.word}.` };
    if (tokens.length < 8) return { ok: false, msg: `Add more words. You used ${tokens.length}; aim for 8 to 10.` };
    if (tokens.length > 10) return { ok: false, msg: `Make it shorter. You used ${tokens.length}; aim for 8 to 10.` };
    if (state.accepted.some(s => normalize(s) === normalize(sentence))) return { ok: false, msg: "That sentence already powered the gate. Try a new one." };
    return { ok: true, msg: "Power sentence accepted." };
  }

  function animateHit() {
    const avatar = $("avatar");
    const gate = $("gate");
    avatar.classList.add("jump");
    gate.classList.add("hit");
    setTimeout(() => avatar.classList.remove("jump"), 220);
    setTimeout(() => gate.classList.remove("hit"), 220);

    const stage = $("track");
    for (let i = 0; i < 14; i += 1) {
      const spark = document.createElement("i");
      spark.className = "spark";
      spark.style.setProperty("--sx", `${74 + Math.random() * 14}%`);
      spark.style.setProperty("--sy", `${42 + Math.random() * 22}%`);
      spark.style.setProperty("--dx", `${-60 + Math.random() * 120}px`);
      spark.style.setProperty("--dy", `${-70 + Math.random() * 60}px`);
      stage.appendChild(spark);
      setTimeout(() => spark.remove(), 560);
    }
  }

  async function acceptSentence(sentence) {
    state.accepted.push(sentence.trim());
    state.charge += 1;
    state.stars += 1;
    $("sentenceInput").value = "";
    setFeedback("Nice. The gate is charging.", true);
    animateHit();
    render();
    setBusy(true);
    await speak("Power sentence accepted.");

    if (state.charge >= 3) {
      $("gate").classList.add("open");
      await speak(`${currentWord().word} gate opened.`);
      state.wordIndex += 1;
      state.charge = 0;
      state.accepted = [];
      if (state.wordIndex >= WORDS.length) {
        state.finished = true;
        render();
        setFeedback("All gates opened. Great run.", true);
        await speak("Run complete. Great work today.");
        return;
      }
      render();
      setFeedback("New gate unlocked. Build the next sentence.", true);
      await sayMission();
      return;
    }

    setBusy(false);
  }

  async function checkTypedSentence() {
    if (state.speaking || state.listening || state.finished) return;
    const sentence = $("sentenceInput").value;
    const result = checkSentence(sentence);
    if (!result.ok) {
      setFeedback(result.msg, false);
      setBusy(true);
      await speak(result.msg);
      setBusy(false);
      return;
    }
    await acceptSentence(sentence);
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

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      $("sentenceInput").value = text;
    };
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
    if (!clean) return;
    input.value = input.value.trim() ? `${input.value.trim()} ${clean}` : clean;
    input.focus();
  }

  function restart() {
    state.wordIndex = 0;
    state.charge = 0;
    state.stars = 0;
    state.accepted = [];
    state.listening = false;
    state.speaking = false;
    state.finished = false;
    $("sentenceInput").value = "";
    $("finishPanel").classList.add("hidden");
    setFeedback("Ready when you are.", true);
    render();
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

  render();
  setFeedback(SpeechRecognition ? "Tap Speak or type a sentence to fire." : "Speech recognition is not available here. Type a sentence to fire.", true);
})();
