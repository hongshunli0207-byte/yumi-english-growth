(() => {
  const WORDS = [
    { word: "under", meaning: "below something", examples: ["The cat is under the chair.", "Yumi put her shoes under the bed.", "The ball rolled under the table."] },
    { word: "rain", meaning: "water falling from clouds", examples: ["Rain fell softly on the window.", "We stayed inside because of the rain.", "The flowers grew after the rain."] },
    { word: "sale", meaning: "a time when something costs less", examples: ["The store has a big sale today.", "Mom bought shoes during the sale.", "This jacket is cheaper because it is on sale."] },
    { word: "tall", meaning: "having great height", examples: ["The tall tree reached above the roof.", "My brother is taller than me.", "A tall glass of water stood on the table."] },
    { word: "vein", meaning: "a tube that carries blood", examples: ["A vein carries blood back to the heart.", "The nurse looked for a vein in his arm.", "A leaf has a thin vein down the middle."] }
  ];

  const state = {
    wordIndex: 0,
    hp: 3,
    stars: 0,
    accepted: [],
    listening: false,
    speaking: false
  };

  const $ = (id) => document.getElementById(id);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function currentWord() { return WORDS[state.wordIndex]; }
  function normalize(text) { return String(text || "").toLowerCase().replace(/[^a-z'\s-]/g, " ").replace(/\s+/g, " ").trim(); }
  function wordsIn(text) { return normalize(text).split(" ").filter(Boolean); }

  function setBusy(isBusy) {
    state.speaking = isBusy;
    $("speakPromptBtn").disabled = isBusy || state.listening;
    $("recordBtn").disabled = isBusy || state.listening || !SpeechRecognition;
    $("checkBtn").disabled = isBusy || state.listening;
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.86;
      utterance.pitch = 1.02;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  async function sayMission() {
    const item = currentWord();
    setBusy(true);
    await speak(`Use the word ${item.word} in a sentence. Make it eight to ten words long.`);
    setBusy(false);
  }

  function render() {
    const item = currentWord();
    $("wordCounter").textContent = `${state.wordIndex + 1} / ${WORDS.length}`;
    $("stars").textContent = `${state.stars} stars`;
    $("targetWord").textContent = item.word;
    $("meaning").textContent = item.meaning;
    $("prompt").textContent = `Use ${item.word} in a real sentence.`;
    $("hpText").textContent = `${state.hp} / 3`;
    $("hpFill").style.width = `${(state.hp / 3) * 100}%`;
    $("sentenceList").innerHTML = state.accepted.length
      ? state.accepted.map(s => `<li>${escapeHtml(s)}</li>`).join("")
      : `<li>No sentences yet.</li>`;
    $("finishPanel").classList.toggle("hidden", state.wordIndex < WORDS.length);
    $("recordBtn").textContent = SpeechRecognition ? "Speak Sentence" : "Type Only";
    $("recordBtn").disabled = !SpeechRecognition || state.speaking;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  }

  function checkSentence(raw) {
    const item = currentWord();
    const sentence = String(raw || "").trim();
    const tokens = wordsIn(sentence);
    if (!sentence) return { ok: false, msg: "Say or type a sentence first." };
    if (!tokens.includes(item.word.toLowerCase())) return { ok: false, msg: `Use the word ${item.word}.` };
    if (tokens.length < 8) return { ok: false, msg: `Make it longer. You used ${tokens.length} words; aim for 8-10.` };
    if (tokens.length > 10) return { ok: false, msg: `Make it shorter. You used ${tokens.length} words; aim for 8-10.` };
    if (state.accepted.some(s => normalize(s) === normalize(sentence))) return { ok: false, msg: "Try a new sentence, not the same one." };
    return { ok: true, msg: "Great sentence. The task lost energy." };
  }

  async function acceptSentence(sentence) {
    state.accepted.push(sentence.trim());
    state.hp -= 1;
    state.stars += 1;
    $("sentenceInput").value = "";
    setFeedback("Great sentence. Keep going.", true);
    render();
    await speak("Great sentence.");

    if (state.hp <= 0) {
      await speak(`${currentWord().word} complete.`);
      state.wordIndex += 1;
      state.hp = 3;
      state.accepted = [];
      if (state.wordIndex >= WORDS.length) {
        render();
        await speak("Quest complete. Great work today.");
        return;
      }
      render();
      await sayMission();
    }
  }

  function setFeedback(msg, good = false) {
    const el = $("feedback");
    el.textContent = msg;
    el.className = good ? "feedback good" : "feedback bad";
  }

  async function checkTypedSentence() {
    if (state.speaking || state.listening || state.wordIndex >= WORDS.length) return;
    const sentence = $("sentenceInput").value;
    const result = checkSentence(sentence);
    if (!result.ok) {
      setFeedback(result.msg, false);
      await speak(result.msg);
      return;
    }
    await acceptSentence(sentence);
  }

  function startListening() {
    if (!SpeechRecognition || state.speaking || state.listening || state.wordIndex >= WORDS.length) return;
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

  function restart() {
    state.wordIndex = 0;
    state.hp = 3;
    state.stars = 0;
    state.accepted = [];
    state.listening = false;
    state.speaking = false;
    $("sentenceInput").value = "";
    $("finishPanel").classList.add("hidden");
    setFeedback("Ready when you are.", true);
    render();
  }

  $("speakPromptBtn").addEventListener("click", sayMission);
  $("recordBtn").addEventListener("click", startListening);
  $("checkBtn").addEventListener("click", checkTypedSentence);
  $("restartBtn").addEventListener("click", restart);
  $("sentenceInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) checkTypedSentence();
  });

  render();
  setFeedback(SpeechRecognition ? "Tap Speak Sentence or type one." : "Speech recognition is not available here. Type the sentence instead.", true);
})();
