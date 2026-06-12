(() => {
  const WORDS = window.YUMI_WORDS || [];
  const COURSE = window.YUMI_COURSE || { courseStartDate: "2026-06-01", schedule: [], seedWrongWords: [] };

  const KEYS = {
    learned: "YUMI_PWA_LEARNED",
    wrongbook: "YUMI_PWA_WRONGBOOK",
    logs: "YUMI_PWA_DICTATION_LOGS",
    rewards: "YUMI_PWA_REWARD_LOGS",
    mathLogs: "YUMI_PWA_MATH_LOGS",
    dictationSession: "YUMI_PWA_DICTATION_SESSION",
    studySession: "YUMI_PWA_STUDY_SESSION",
    mathSession: "YUMI_PWA_MATH_SESSION",
    seeded: "YUMI_PWA_SEEDED_WRONGBOOK_V3_20260604",
    contentMigrated: "YUMI_PWA_CONTENT_MIGRATED_V6"
  };

  let currentPlan = null;
  let dictationState = null;
  let mathState = null;
  let studyState = null;

  const VOICE_KEYS = {
    provider: "YUMI_PWA_TTS_PROVIDER",
    accent: "YUMI_PWA_VOICE_ACCENT",
    rate: "YUMI_PWA_VOICE_RATE",
    repeat: "YUMI_PWA_VOICE_REPEAT"
  };

  let availableVoices = [];
  let selectedVoice = null;
  let currentAudio = null;

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dateKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function parseDateKey(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function daysBetween(a, b) {
    const one = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const two = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((two - one) / 86400000);
  }

  function getStore(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }
  function setStore(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function getWrongbook() { return getStore(KEYS.wrongbook, {}); }
  function setWrongbook(wrongbook) { setStore(KEYS.wrongbook, wrongbook); }

  function addWrong(word, input = "", customDateKey = null) {
    const wrongbook = getWrongbook();
    const today = customDateKey || dateKey();
    const old = wrongbook[word.id] || { ...word, wrongCount: 0, history: [] };
    old.wrongCount = (old.wrongCount || 0) + 1;
    old.lastWrongAt = new Date().toISOString();
    old.lastWrongDateKey = today;
    old.history = old.history || [];
    old.history.unshift({ input, date: new Date().toISOString(), dateKey: today });
    old.history = old.history.slice(0, 50);
    wrongbook[word.id] = old;
    setWrongbook(wrongbook);
  }

  function seedInitialWrongbook() {
    if (localStorage.getItem(KEYS.seeded)) return;
    const wrongbook = getWrongbook();
    (COURSE.seedWrongWords || []).forEach(word => {
      const id = word.id || ("seed_" + word.word);
      if (!wrongbook[id]) {
        wrongbook[id] = {
          ...word,
          wrongCount: word.wrongCount || 1,
          lastWrongAt: new Date().toISOString(),
          lastWrongDateKey: word.seedWrongDateKey || "2026-06-03",
          history: [{
            input: "",
            date: new Date().toISOString(),
            dateKey: word.seedWrongDateKey || "2026-06-03",
            source: "seed"
          }]
        };
      }
    });
    setWrongbook(wrongbook);
    localStorage.setItem(KEYS.seeded, "1");
  }


  function migrateWordContent() {
    if (localStorage.getItem(KEYS.contentMigrated)) return;
    const byId = {};
    const byWord = {};
    (COURSE.schedule || []).forEach(day => {
      (day.words || []).forEach(w => {
        byId[w.id] = w;
        byWord[String(w.word || "").toLowerCase()] = w;
      });
    });
    const wrongbook = getWrongbook();
    let changed = false;
    Object.keys(wrongbook).forEach(id => {
      const old = wrongbook[id];
      const fresh = byId[id] || byWord[String(old.word || "").toLowerCase()];
      if (fresh) {
        wrongbook[id] = {
          ...old,
          cn: fresh.cn,
          pattern: fresh.pattern,
          examples: fresh.examples,
          example: fresh.example,
          audioText: fresh.audioText || old.audioText
        };
        changed = true;
      }
    });
    if (changed) setWrongbook(wrongbook);
    localStorage.setItem(KEYS.contentMigrated, "1");
  }


  function findWordByResult(result) {
    const id = result && result.id;
    const wordText = String((result && result.word) || "").toLowerCase();
    let found = null;
    (COURSE.schedule || []).some(day => {
      found = (day.words || []).find(w => w.id === id || String(w.word || "").toLowerCase() === wordText);
      return !!found;
    });
    return found || (WORDS || []).find(w => w.id === id || String(w.word || "").toLowerCase() === wordText) || null;
  }

  function restoreWrongbookFromLogs() {
    const logs = getStore(KEYS.logs, []);
    if (!Array.isArray(logs) || !logs.length) return;
    const wrongbook = getWrongbook();
    let changed = false;

    logs.forEach(log => {
      const logDateKey = log.dateKey || dateKey(new Date(log.createdAt || Date.now()));
      (log.results || []).forEach(result => {
        if (!result || !result.hadWrong) return;
        const fresh = findWordByResult(result);
        const id = result.id || (fresh && fresh.id) || ("log_" + result.word);
        const old = wrongbook[id] || { ...(fresh || result), id, wrongCount: 0, history: [] };
        old.word = old.word || result.word;
        old.level = old.level || result.level || (fresh && fresh.level);
        old.cn = old.cn || result.cn || (fresh && fresh.cn);
        old.pattern = old.pattern || (fresh && fresh.pattern);
        old.examples = old.examples || (fresh && fresh.examples);
        old.example = old.example || (fresh && fresh.example);
        old.audioText = old.audioText || (fresh && fresh.audioText) || result.word;
        old.history = old.history || [];
        const alreadyLogged = old.history.some(h => h.dateKey === logDateKey && h.source === "dictation-log");
        if (!alreadyLogged) {
          old.history.unshift({ input: result.input || "", date: log.createdAt || new Date().toISOString(), dateKey: logDateKey, source: "dictation-log" });
          old.history = old.history.slice(0, 50);
          old.wrongCount = Math.max(old.wrongCount || 0, old.history.length);
          changed = true;
        }
        old.lastWrongDateKey = old.lastWrongDateKey && old.lastWrongDateKey > logDateKey ? old.lastWrongDateKey : logDateKey;
        old.lastWrongAt = old.lastWrongAt || log.createdAt || new Date().toISOString();
        wrongbook[id] = old;
      });
    });

    if (changed) setWrongbook(wrongbook);
  }

  function removeWrong(id) {
    const wrongbook = getWrongbook();
    delete wrongbook[id];
    setWrongbook(wrongbook);
    renderAll();
  }

  function getYesterdayWrongWords(date = new Date()) {
    const yesterday = dateKey(addDays(date, -1));
    return Object.values(getWrongbook())
      .filter(item =>
        item.lastWrongDateKey === yesterday ||
        (item.history || []).some(h => h.dateKey === yesterday)
      )
      .sort((a, b) => {
        const diff = (b.wrongCount || 0) - (a.wrongCount || 0);
        if (diff) return diff;
        return String(b.lastWrongAt || "").localeCompare(String(a.lastWrongAt || ""));
      })
      .map(w => ({ ...w, taskType: "review" }));
  }

  function getCoursePosition(date = new Date()) {
    const start = parseDateKey(COURSE.courseStartDate || "2026-06-01");
    const diff = Math.max(0, daysBetween(start, date));
    return {
      week: Math.floor(diff / 7) + 1,
      dayOfWeek: date.getDay(),
      dayIndex: date.getDay() >= 1 && date.getDay() <= 5 ? date.getDay() - 1 : null
    };
  }

  function getCourseDay(week, dayIndex) {
    return (COURSE.schedule || []).find(d => d.week === week && d.dayIndex === dayIndex) || null;
  }

  function getWeekNewWords(week) {
    return (COURSE.schedule || [])
      .filter(d => d.week === week)
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .flatMap(d => d.words || []);
  }

  function getWeekWrongWords(date = new Date()) {
    const start = parseDateKey(COURSE.courseStartDate || "2026-06-01");
    const diff = Math.max(0, daysBetween(start, date));
    const weekStart = addDays(start, Math.floor(diff / 7) * 7);
    const weekEnd = addDays(weekStart, 6);
    const startKey = dateKey(weekStart);
    const endKey = dateKey(weekEnd);
    return Object.values(getWrongbook())
      .filter(item => {
        const history = item.history || [];
        return history.some(h => h.dateKey >= startKey && h.dateKey <= endKey) ||
          (item.lastWrongDateKey >= startKey && item.lastWrongDateKey <= endKey);
      })
      .sort((a, b) => {
        const diff = (b.wrongCount || 0) - (a.wrongCount || 0);
        if (diff) return diff;
        return String(b.lastWrongAt || "").localeCompare(String(a.lastWrongAt || ""));
      })
      .map(w => ({ ...w, taskType: "weekWrong" }));
  }

  function getPlan(date = new Date()) {
    const pos = getCoursePosition(date);
    const dk = dateKey(date);
    const wk = `Week ${pos.week}`;

    if (pos.dayOfWeek >= 1 && pos.dayOfWeek <= 5) {
      const courseDay = getCourseDay(pos.week, pos.dayIndex);
      const newWords = courseDay ? courseDay.words.map(w => ({ ...w, taskType: "new" })) : [];
      const reviewWords = getYesterdayWrongWords(date);
      return {
        mode: "weekday",
        dateKey: dk,
        weekKey: wk,
        title: `${wk}${courseDay ? " " + courseDay.dayName : ""}: 10 new words + all missed words from yesterday`,
        desc: "Each weekday has 7 core words and 3 challenge words. Any words missed yesterday are added for review today.",
        newWords,
        reviewWords,
        words: [...newWords, ...reviewWords],
        dictationWords: [...newWords, ...reviewWords]
      };
    }

    if (pos.dayOfWeek === 6) {
      const weekWords = getWeekNewWords(pos.week).map(w => ({ ...w, taskType: "weeklyDictation" }));
      return {
        mode: "saturday",
        dateKey: dk,
        weekKey: wk,
        title: `${wk} Saturday Dictation: this week's 50 new words`,
        desc: "No new words today. Dictate the 35 core words and 15 challenge words from Monday to Friday.",
        newWords: [],
        reviewWords: [],
        words: weekWords,
        dictationWords: weekWords
      };
    }

    const weekWrong = getWeekWrongWords(date);
    return {
      mode: "sunday",
      dateKey: dk,
      weekKey: wk,
      title: `${wk} Sunday Review: focus on this week's missed words`,
      desc: "No new words today. Review the words missed during this week's study or dictation.",
      newWords: [],
      reviewWords: weekWrong,
      words: weekWrong,
      dictationWords: weekWrong
    };
  }

  function badge(word) {
    let label = word.level === "challenge" ? "Challenge" : "Core";
    let cls = word.level === "challenge" ? "challenge" : "";
    if (word.taskType === "review") { label = "Yesterday Missed"; cls = "review"; }
    if (word.taskType === "weeklyDictation") { label = "Saturday Dictation"; cls = "week"; }
    if (word.taskType === "weekWrong") { label = "This Week Missed"; cls = "review"; }
    return `<span class="badge ${cls}">${label}</span>`;
  }


  const EXAMPLE_OVERRIDES = {
    about: ["I read a book about space.", "We talked about the weather.", "This story is about a brave girl."],
    baby: ["The baby smiled at her mother.", "A baby needs a lot of sleep.", "Please be quiet while the baby sleeps."],
    cage: ["The bird sat safely in its cage.", "She cleaned the cage for her hamster.", "The cage door was open."],
    dad: ["My dad made breakfast this morning.", "Dad helped me fix my bike.", "I gave Dad a card."],
    ear: ["My ear hurt after the loud noise.", "She whispered into my ear.", "A rabbit has long ears."],
    face: ["Wash your face before bed.", "Her face lit up with a smile.", "The clown painted his face."],
    game: ["We played a board game after dinner.", "The game was close until the end.", "Yumi learned the rules of the game."],
    box: ["I put my toys in the box.", "The box was too heavy to lift.", "She opened the box carefully."],
    ability: ["Reading every day builds your ability.", "She has the ability to solve hard problems.", "Practice improves spelling ability."],
    apple: ["I ate a red apple for lunch.", "The apple fell from the tree.", "She sliced the apple into pieces."],
    book: ["I borrowed a book from the library.", "The book has a funny story.", "Please put the book on the shelf."],
    cat: ["The cat slept on the sofa.", "A black cat crossed the garden.", "The cat chased a toy mouse."],
    dog: ["The dog wagged its tail.", "My dog likes long walks.", "The dog barked at the door."],
    fish: ["The fish swam in the pond.", "We saw a gold fish in the tank.", "A fish needs clean water."],
    milk: ["I poured milk into my cup.", "The baby drank warm milk.", "Please keep the milk cold."],
    school: ["Yumi goes to school every morning.", "Our school has a big playground.", "I packed my bag for school."],
    table: ["The bowl is on the table.", "We ate dinner at the table.", "Please clean the table."],
    water: ["Drink water after exercise.", "The plant needs water.", "Cold water filled the glass."],
    mother: ["My mother read me a story.", "Mother packed a snack for school.", "I helped my mother cook dinner."],
    rabbit: ["The rabbit hopped across the grass.", "A rabbit likes fresh carrots.", "The rabbit hid under the bush."],
    kettle: ["The kettle boiled water for tea.", "Dad put the kettle on the stove.", "The kettle made a soft whistle."],
    education: ["Education helps children grow.", "Good education opens many doors.", "Reading is an important part of education."],
    hamburger: ["I ate a hamburger for lunch.", "The hamburger had cheese and lettuce.", "He ordered a hamburger at the cafe."],
    umpire: ["The umpire watched the game carefully.", "The umpire called the player safe.", "A fair umpire knows the rules."],

    sale: ["The store has a big sale today.", "Mom bought shoes during the sale.", "This jacket is cheaper because it is on sale."],
    tall: ["The tall tree reached above the roof.", "My brother is taller than me.", "A tall glass of water stood on the table."],
    vein: ["A vein carries blood back to the heart.", "The nurse looked for a vein in his arm.", "A leaf has a thin vein down the middle."],
    under: ["The cat is under the chair.", "Yumi put her shoes under the bed.", "The ball rolled under the table."],
    rain: ["Rain fell softly on the window.", "We stayed inside because of the rain.", "The flowers grew after the rain."],
    quilt: ["Grandma made a warm quilt for the bed.", "I pulled the quilt over my shoulders.", "The quilt has many colorful squares."],
    immersion: ["Language immersion helps students learn faster.", "The class used immersion to practice English.", "Immersion means using the language often."]
  };

  function isGenericExample(example, word) {
    const ex = String(example || "").toLowerCase();
    const w = String(word || "").toLowerCase();
    return !ex ||
      ex.includes("the word " + w) ||
      ex.includes("read " + w) ||
      ex.includes("spell " + w) ||
      ex.includes("say " + w) ||
      ex.includes("learn " + w) ||
      ex.includes("spelling " + w) ||
      ex.includes("word " + w) ||
      ex.includes("sentence with " + w) ||
      ex.includes("make a sentence with " + w) ||
      ex.includes(w + " is useful") ||
      ex.includes(w + " is in my spelling list");
  }

  function articleFor(word) {
    return /^[aeiou]/i.test(String(word || "")) ? "an" : "a";
  }

  function buildMeaningExamples(word) {
    const target = String(word.word || "word");
    const lower = target.toLowerCase();
    if (EXAMPLE_OVERRIDES[lower]) return EXAMPLE_OVERRIDES[lower];

    const art = articleFor(lower);
    const shortWord = lower.length <= 5;
    if (shortWord) {
      return [
        "I saw " + art + " " + lower + " near the door.",
        "Yumi pointed to the " + lower + " and smiled.",
        "The " + lower + " was easy to find."
      ];
    }

    return [
      "Yumi noticed the " + lower + " during the story.",
      "The " + lower + " helped explain what happened.",
      "We talked about the " + lower + " after reading."
    ];
  }

  function getStudyExamples(word) {
    const existing = (Array.isArray(word.examples) && word.examples.length ? word.examples : [word.example].filter(Boolean))
      .filter(ex => !isGenericExample(ex, word.word));
    const combined = [...existing, ...buildMeaningExamples(word)];
    return Array.from(new Set(combined.map(ex => String(ex || "").trim()).filter(Boolean))).slice(0, 3);
  }

  function heardStudyExamples(wordId) {
    if (!studyState) return [];
    studyState.examplesHeardById = studyState.examplesHeardById || {};
    return studyState.examplesHeardById[wordId] || [];
  }

  function areStudyExamplesComplete(wordId, count) {
    return heardStudyExamples(wordId).length >= count;
  }

  async function playStudyExample(index) {
    if (!studyState || !currentPlan || studyState.examplePlayingKey) return;
    const word = (currentPlan.words || [])[studyState.index];
    if (!word) return;
    const examples = getStudyExamples(word);
    const text = examples[index];
    if (!text) return;

    studyState.examplePlayingKey = word.id + ":" + index;
    renderStudy();
    try {
      await speak(text);
      const heard = new Set(heardStudyExamples(word.id));
      heard.add(index);
      studyState.examplesHeardById[word.id] = Array.from(heard).sort((a, b) => a - b);
      saveStudySession();
    } finally {
      if (studyState) studyState.examplePlayingKey = "";
      renderStudy();
    }
  }

  function wordItem(word, withActions = false) {
    const examples = Array.isArray(word.examples) && word.examples.length ? word.examples : [word.example].filter(Boolean);
    const exampleHtml = examples.length
      ? `<div class="examples"><div class="example-title">Examples:</div><ol>${examples.map(ex => `<li><span>${esc(ex)}</span> <button class="example-speak" data-speak="${esc(ex)}">🔊</button></li>`).join("")}</ol></div>`
      : "";
    const pattern = word.pattern ? `<div class="muted">Spelling hint: ${esc(word.pattern)}</div>` : "";

    return `
      <div class="word-item">
        ${badge(word)}
        <div class="word">${esc(word.word)}</div>

        ${pattern}
        ${exampleHtml}
        ${withActions ? `
          <div class="card-actions">
            <button class="mini-action" data-speak="${esc(word.audioText || word.word)}">🔊 Speak</button>
            <button class="mini-action" data-wrong="${esc(word.id)}">Add to Review List</button>
          </div>
        ` : ""}
      </div>`;
  }

  function getVoiceSetting() {
    return {
      provider: getStore(VOICE_KEYS.provider, "elevenlabs"),
      accent: getStore(VOICE_KEYS.accent, "en-US"),
      rate: parseFloat(getStore(VOICE_KEYS.rate, "0.82")),
      repeat: parseInt(getStore(VOICE_KEYS.repeat, "2"), 10)
    };
  }

  function scoreVoice(voice, accent) {
    const name = (voice.name || "").toLowerCase();
    const lang = (voice.lang || "").toLowerCase();
    let score = 0;

    if (lang === accent.toLowerCase()) score += 100;
    if (lang.startsWith(accent.slice(0, 2).toLowerCase())) score += 30;

    ["samantha", "alex", "ava", "allison", "tom", "daniel", "karen", "moira", "tessa", "serena", "arthur", "martha"].forEach((n, i) => {
      if (name.includes(n)) score += 80 - i;
    });

    if (name.includes("google")) score += 45;
    if (name.includes("microsoft")) score += 40;
    if (name.includes("natural")) score += 35;
    if (name.includes("premium")) score += 30;
    if (name.includes("compact")) score -= 30;
    if (name.includes("default")) score -= 10;

    return score;
  }

  function refreshVoices() {
    const setting = getVoiceSetting();
    const voiceName = $("voiceName");

    if (setting.provider === "elevenlabs") {
      if (voiceName) voiceName.textContent = "Current voice: ElevenLabs. If the network fails, the app will use device speech.";
      return;
    }

    if (!("speechSynthesis" in window)) return;
    availableVoices = window.speechSynthesis.getVoices() || [];
    const candidates = availableVoices.filter(v => (v.lang || "").toLowerCase().startsWith(setting.accent.toLowerCase().slice(0, 2)));
    selectedVoice = (candidates.length ? candidates : availableVoices)
      .sort((a, b) => scoreVoice(b, setting.accent) - scoreVoice(a, setting.accent))[0] || null;

    if (voiceName) {
      voiceName.textContent = selectedVoice
        ? `Current voice: ${selectedVoice.name} (${selectedVoice.lang})`
        : "No English voice is available on this device";
    }
  }

  function speakOnce(spoken, setting, onEnd) {
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = setting.accent;
    u.rate = setting.rate;
    u.pitch = 1.03;
    u.volume = 1;
    if (selectedVoice) u.voice = selectedVoice;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
  }

  function speakBrowser(spoken, setting) {
    return new Promise(resolve => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        refreshVoices();

        let remaining = Math.max(1, setting.repeat || 1);
        const playNext = () => {
          remaining -= 1;
          if (remaining <= 0) { resolve(); return; }
          setTimeout(() => speakOnce(spoken, setting, playNext), 260);
        };

        speakOnce(spoken, setting, playNext);
      } else {
        navigator.clipboard?.writeText(spoken);
        toast("Word copied");
        resolve();
      }
    });
  }

  async function speakElevenLabs(spoken, setting) {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const repeat = Math.max(1, setting.repeat || 1);
    const response = await fetch("/.netlify/functions/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken })
    });

    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data.error || data.detail || "";
      } catch {}
      throw new Error(detail || "ElevenLabs speech failed");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    let count = 0;
    const playOne = () => new Promise((resolve, reject) => {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = resolve;
      audio.onerror = reject;
      audio.playbackRate = setting.rate > 0.9 ? 1 : setting.rate > 0.8 ? 0.92 : 0.84;
      audio.play().catch(reject);
    });

    try {
      while (count < repeat) {
        count += 1;
        await playOne();
        if (count < repeat) await new Promise(r => setTimeout(r, 220));
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function speak(text) {
    const spoken = String(text || "").replace("/", " or ");
    const setting = getVoiceSetting();

    if (setting.provider === "elevenlabs") {
      try {
        await speakElevenLabs(spoken, setting);
        return;
      } catch (error) {
        console.warn("ElevenLabs TTS fallback:", error);
        toast("ElevenLabs failed. Using device speech instead.");
        await speakBrowser(spoken, setting);
        return;
      }
    }

    return speakBrowser(spoken, setting);
  }


  function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function speakDictationPrompt(word) {
    const target = String(word.audioText || word.word || "").replace("/", " or ");
    const examples = getStudyExamples(word);
    const example = examples[0] || word.example;

    // Weekday new words + Sunday/week wrong review: example → pause → target word.
    // Saturday weekly test: target word only, to keep the test strict.
    const withExample = currentPlan && currentPlan.mode !== "saturday" && example;

    if (withExample) {
      await speak(example);
      await waitMs(850);
      await speak(target);
    } else {
      await speak(target);
    }
  }

  function normalize(str) { return String(str || "").trim().toLowerCase().replace(/\s+/g, "").replace(/-/g, ""); }
  function checkAnswer(input, word) { return normalize(input) === normalize(word.word); }

  function planWordIds(plan = currentPlan) {
    return (plan && Array.isArray(plan.words) ? plan.words : []).map(w => w.id).filter(Boolean);
  }

  function planSignature(plan = currentPlan) {
    return planWordIds(plan).join("|");
  }

  function readLearnedEntry(entry) {
    if (Array.isArray(entry)) return { ids: entry, signature: "" };
    if (entry && typeof entry === "object") return { ids: entry.ids || [], signature: entry.signature || "" };
    return { ids: [], signature: "" };
  }

  function isPlanCompleted(plan = currentPlan) {
    if (!plan) return false;
    const learned = getStore(KEYS.learned, {});
    const saved = readLearnedEntry(learned[plan.dateKey]);
    const ids = planWordIds(plan);
    if (!ids.length) return false;
    const savedSet = new Set(saved.ids);
    const hasAllWords = ids.every(id => savedSet.has(id));
    return hasAllWords && saved.signature === planSignature(plan);
  }

  function clearTodayProgressIfStale(plan = currentPlan) {
    if (!plan) return;
    const today = dateKey();
    if (plan.dateKey !== today) return;
    const marker = "YUMI_PWA_PROGRESS_GUARD_" + today;
    if (localStorage.getItem(marker)) return;

    const learned = getStore(KEYS.learned, {});
    if (learned[plan.dateKey] && !isPlanCompleted(plan)) {
      delete learned[plan.dateKey];
      setStore(KEYS.learned, learned);
    }

    const dictation = getStore(KEYS.dictationSession, null);
    if (dictation && dictation.dateKey === plan.dateKey && dictation.finished) { localStorage.removeItem(KEYS.dictationSession); dictationState = null; }

    const math = getStore(KEYS.mathSession, null);
    if (math && math.dateKey === plan.dateKey && math.finished) { localStorage.removeItem(KEYS.mathSession); mathState = null; }

    localStorage.setItem(marker, "1");
  }
  function markLearned() {
    const learned = getStore(KEYS.learned, {});
    const ids = planWordIds(currentPlan);
    learned[currentPlan.dateKey] = {
      ids: Array.from(new Set(ids)),
      signature: planSignature(currentPlan),
      completedAt: new Date().toISOString()
    };
    setStore(KEYS.learned, learned);
    localStorage.removeItem(KEYS.studySession);
    toast("Study completed for today");
    renderAll();
  }
  function saveLog(log) {
    const logs = getStore(KEYS.logs, []);
    logs.unshift({ ...log, createdAt: new Date().toISOString() });
    setStore(KEYS.logs, logs.slice(0, 100));
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 1800);
  }


  
  function saveDictationSession() {
    if (!dictationState || !currentPlan) return;
    setStore(KEYS.dictationSession, {
      dateKey: currentPlan.dateKey,
      mode: currentPlan.mode,
      index: dictationState.index || 0,
      input: dictationState.input || "",
      checked: !!dictationState.checked,
      isRight: !!dictationState.isRight,
      feedback: dictationState.feedback || "",
      handwritingById: dictationState.handwritingById || {},
      resultsById: dictationState.resultsById || {},
      finished: !!dictationState.finished
    });
  }

  function loadDictationSession() {
    if (!currentPlan) return null;
    const saved = getStore(KEYS.dictationSession, null);
    if (!saved) return null;
    if (saved.dateKey !== currentPlan.dateKey || saved.mode !== currentPlan.mode) return null;
    return saved;
  }

  function saveStudySession() {
    if (!studyState || !currentPlan) return;
    setStore(KEYS.studySession, {
      dateKey: currentPlan.dateKey,
      mode: currentPlan.mode,
      index: studyState.index || 0,
      handwritingById: studyState.handwritingById || {},
      examplesHeardById: studyState.examplesHeardById || {}
    });
  }

  function loadStudySession() {
    if (!currentPlan) return null;
    const saved = getStore(KEYS.studySession, null);
    if (!saved) return null;
    if (saved.dateKey !== currentPlan.dateKey || saved.mode !== currentPlan.mode) return null;
    return saved;
  }

  function saveMathSession() {
    if (!mathState) return;
    setStore(KEYS.mathSession, {
      dateKey: dateKey(),
      index: mathState.index || 0,
      input: mathState.input || "",
      checked: !!mathState.checked,
      isRight: !!mathState.isRight,
      feedback: mathState.feedback || "",
      workById: mathState.workById || {},
      resultsById: mathState.resultsById || {},
      finished: !!mathState.finished
    });
  }

  function loadMathSession() {
    const saved = getStore(KEYS.mathSession, null);
    if (!saved || saved.dateKey !== dateKey()) return null;
    return saved;
  }

function seededNumber(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return Math.abs(h >>> 0);
  }

  function rng(seed) {
    let s = seededNumber(seed) || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function awardRandomPoints(source, wordOrQuestion) {
    const roll = Math.random();
    let points = 0;
    if (roll < 0.05) points = 5;
    else if (roll < 0.25) points = 2;
    else if (roll < 0.65) points = 1;

    const logs = getStore(KEYS.rewards, []);
    const entry = {
      dateKey: currentPlan ? currentPlan.dateKey : dateKey(),
      source,
      item: wordOrQuestion,
      points,
      createdAt: new Date().toISOString()
    };
    logs.unshift(entry);
    setStore(KEYS.rewards, logs.slice(0, 300));

    if (points > 0) showRewardEffect(points);
    return points;
  }

  function todayRewardTotal(dk = dateKey()) {
    return getStore(KEYS.rewards, [])
      .filter(x => x.dateKey === dk)
      .reduce((sum, x) => sum + (x.points || 0), 0);
  }

  function showRewardEffect(points) {
    const layer = document.createElement("div");
    layer.className = "reward-burst";
    layer.innerHTML = `
      <div class="reward-card">
        <div class="reward-stars">✨ ⭐ ✨</div>
        <div class="reward-points">Bonus +${points} pts</div>
      </div>
    `;
    document.body.appendChild(layer);

    for (let i = 0; i < 18; i++) {
      const dot = document.createElement("span");
      dot.className = "confetti-dot";
      dot.style.left = (50 + (Math.random() * 50 - 25)) + "%";
      dot.style.top = (46 + (Math.random() * 20 - 10)) + "%";
      dot.style.setProperty("--dx", (Math.random() * 180 - 90) + "px");
      dot.style.setProperty("--dy", (Math.random() * -160 - 40) + "px");
      dot.style.animationDelay = (Math.random() * 120) + "ms";
      layer.appendChild(dot);
    }

    setTimeout(() => layer.remove(), 1400);
  }

  
  function openDialogSafely(id) {
    const dlg = $(id);
    if (!dlg) return;
    try {
      if (dlg.open) dlg.close();
      dlg.showModal();
    } catch (e) {
      try {
        dlg.setAttribute("open", "open");
      } catch {}
    }
  }

  function closeDialogSafely(id) {
    const dlg = $(id);
    if (!dlg) return;
    try {
      if (dlg.open) dlg.close();
      else dlg.removeAttribute("open");
    } catch {
      try { dlg.removeAttribute("open"); } catch {}
    }
  }

function showDaySummary(targetDateKey = null) {
    const dk = targetDateKey || (currentPlan ? currentPlan.dateKey : dateKey());
    const logs = getStore(KEYS.logs, []);
    const todayLogs = logs.filter(x => x.dateKey === dk);
    const reward = todayRewardTotal(dk);
    const mathLogs = getStore(KEYS.mathLogs, []);
    const todayMath = mathLogs.find(x => x.dateKey === dk);

    const lastDictation = todayLogs[0];
    const dictLine = lastDictation
      ? `English dictation: ${lastDictation.rightCount}/${lastDictation.total} correct after corrections; ${lastDictation.wrongCount} missed at least once.`
      : "English dictation: no completed record for this day.";

    const wrongWords = lastDictation && Array.isArray(lastDictation.results)
      ? lastDictation.results.filter(r => r.hadWrong).map(r => r.word)
      : [];

    const wrongText = wrongWords.join("\n");
    const wrongLine = wrongWords.length
      ? `<div class="wrong-word-list"><strong>Missed English words: </strong>${wrongWords.map(w => `<span>${esc(w)}</span>`).join("")}</div>
         <textarea id="wrongWordsCopyText" class="input" readonly rows="${Math.min(8, Math.max(3, wrongWords.length + 1))}">${esc(wrongText)}</textarea>
         <button class="secondary full" id="copyWrongWordsBtn">Copy Missed Words</button>`
      : `<div class="muted">Missed English words: none recorded.</div>`;

    const mathLine = todayMath
      ? `Math: ${todayMath.rightCount}/${todayMath.total} correct after corrections; ${todayMath.wrongCount} corrected.`
      : "Math: no completed record for this day.";

    $("daySummaryContent").innerHTML = `
      <div class="summary-date">${esc(dk)}</div>
      <div class="summary-line">${dictLine}</div>
      ${wrongLine}
      <div class="summary-line">${mathLine}</div>
      <div class="summary-reward">Bonus points today: <strong>${reward}</strong></div>
      <div class="muted">Add these points to your family reward system.</div>
    `;
    openDialogSafely("daySummaryDialog");
  }

  function generateMathQuestions(dk = dateKey()) {
    const rand = rng("math-" + dk);
    const questions = [];

    for (let i = 0; i < 3; i++) {
      const a = 2 + Math.floor(rand() * 8);
      const b = 2 + Math.floor(rand() * 8);
      questions.push({
        id: `mul-${dk}-${i}`,
        type: "multiplication",
        title: "One-Digit Multiplication",
        a, b,
        op: "×",
        answer: a * b,
        prompt: `${a} × ${b} = ?`,
        hint: "Think of the multiplication fact first, then write the answer."
      });
    }

    // 5 addition/subtraction, subtraction more: 3 subtraction + 2 addition
    for (let i = 0; i < 3; i++) {
      const a = 1000 + Math.floor(rand() * 900);   // 1000-1899
      const b = 100 + Math.floor(rand() * 900);    // 100-999
      questions.push({
        id: `sub-${dk}-${i}`,
        type: "subtraction",
        title: "3- or 4-Digit Subtraction",
        a, b,
        op: "-",
        answer: a - b,
        prompt: `${a} - ${b} = ?`,
        hint: "Use column subtraction. Borrow from the next place when needed."
      });
    }

    for (let i = 0; i < 2; i++) {
      const a = 100 + Math.floor(rand() * 900);
      const b = 100 + Math.floor(rand() * 900);
      questions.push({
        id: `add-${dk}-${i}`,
        type: "addition",
        title: "3-Digit Addition",
        a, b,
        op: "+",
        answer: a + b,
        prompt: `${a} + ${b} = ?`,
        hint: "Use column addition. Start with ones and carry when the sum reaches 10."
      });
    }

    // Fixed order: multiply first, then mixed add/sub with more subtraction.
    return questions;
  }

  function startMath() {
    const logs = getStore(KEYS.mathLogs, []);
    const old = logs.find(x => x.dateKey === dateKey());
    const saved = loadMathSession();

    mathState = {
      index: 0,
      input: "",
      feedback: "",
      checked: false,
      isRight: false,
      workById: {},
      resultsById: {},
      finished: false,
      questions: generateMathQuestions(dateKey())
    };

    if (old && old.results) old.results.forEach(r => { mathState.resultsById[r.id] = r; });
    if (saved) mathState = { ...mathState, ...saved, questions: generateMathQuestions(dateKey()) };
    renderMath();
  }

  function renderMath() {
    const box = $("mathBox");
    if (!box) return;
    const st = mathState || { questions: [] };

    if (!st.questions.length) {
      box.innerHTML = `<div class="empty">No math questions today.</div>`;
      return;
    }

    if (st.finished) {
      const results = Object.values(st.resultsById || {});
      const right = results.filter(r => r.isRight).length;
      const wrong = results.filter(r => r.hadWrong).length;
      box.innerHTML = `
        <div class="section-title">Math Complete 🎉</div>
        <p class="muted">This math session had ${st.questions.length} questions. ${right} correct after corrections; ${wrong} corrected.</p>
        <button class="primary full" id="showDaySummaryBtn">View Today Summary</button>
      `;
      return;
    }

    const q = st.questions[st.index];
    const old = st.resultsById[q.id];
    if (old && !st.input) st.input = old.input || "";

    box.innerHTML = `
      <div class="muted">Question ${st.index + 1} of ${st.questions.length}</div><div class="reward-mini">Bonus today: ${todayRewardTotal()} pts</div>
      <span class="badge week">${q.title}</span>
      <div class="math-problem">${q.prompt}</div>
      <div class="math-hint">${q.hint}</div>

      <div class="math-work-card">
        <div class="handwriting-head">
          <div>
            <div class="handwriting-title">Workspace</div>
            <div class="muted">Use this space for column work, carrying, and borrowing.</div>
          </div>
          <button class="mini-action" id="clearMathWorkBtn">Clear</button>
        </div>
        <canvas id="mathCanvas" class="math-canvas" data-question-id="${esc(q.id)}"></canvas>
      </div>

      <input id="mathInput" class="input" inputmode="numeric" autocomplete="off" placeholder="Enter answer" value="${esc(st.input)}" />

      ${st.feedback === "wrong" ? `<div class="bad">Almost. Check your work and correct it.</div><div class="muted">Correct answer: ${q.answer}</div>` : ""}
      ${st.checked && st.isRight ? `<div class="ok">Correct!</div>` : ""}

      <div class="dictation-nav">
        <button class="secondary" id="prevMathBtn" ${st.index === 0 ? "disabled" : ""}>Previous</button>
        ${st.checked && st.isRight ? `<button class="primary" id="nextMathBtn">${st.index + 1 >= st.questions.length ? "Finish Math" : "Next"}</button>` : `<button class="primary" id="checkMathBtn">${st.feedback === "wrong" ? "I fixed it. Check again" : "Submit"}</button>`}
      </div>
    `;

    const input = $("mathInput");
    if (input) {
      input.focus();
      input.addEventListener("input", e => {
        st.input = e.target.value.replace(/[^\d-]/g, "");
        e.target.value = st.input;
        if (st.feedback === "wrong") {
          st.checked = false;
          st.isRight = false;
        }
      });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          if (st.checked && st.isRight) nextMath();
          else checkMath();
        }
      });
    }

    setupMathCanvas();
  }

  function setupMathCanvas() {
    const canvas = $("mathCanvas");
    if (!canvas || !mathState) return;

    const q = mathState.questions[mathState.index];
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resizeCanvas(retry = 0) {
      const rect = canvas.getBoundingClientRect();
      if ((rect.width < 2 || rect.height < 2) && retry < 6) {
        requestAnimationFrame(() => resizeCanvas(retry + 1));
        return;
      }
      const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 320);
      const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 180);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawSaved();
    }

    function drawPaper() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = "rgba(181, 106, 51, 0.14)";
      ctx.lineWidth = 1;
      const gap = 38;
      for (let y = gap; y < rect.height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(12, y);
        ctx.lineTo(rect.width - 12, y);
        ctx.stroke();
      }
      for (let x = gap; x < rect.width; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, 12);
        ctx.lineTo(x, rect.height - 12);
        ctx.stroke();
      }
    }

    function redrawSaved() {
      drawPaper();
      const data = mathState.workById[q.id];
      if (data) {
        const img = new Image();
        img.onload = () => {
          const rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = data;
      }
    }
    requestAnimationFrame(() => resizeCanvas());

    let drawing = false;
    let last = null;

    function pointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      last = pointFromEvent(e);
    }

    function moveDraw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pointFromEvent(e);
      ctx.strokeStyle = "#2F2A25";
      ctx.lineWidth = 4.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }

    function endDraw(e) {
      if (!drawing) return;
      e && e.preventDefault && e.preventDefault();
      drawing = false;
      last = null;
      try {
        mathState.workById[q.id] = canvas.toDataURL("image/png");
      } catch {}
    }

    canvas.addEventListener("pointerdown", startDraw);
    canvas.addEventListener("pointermove", moveDraw);
    canvas.addEventListener("pointerup", endDraw);
    canvas.addEventListener("pointercancel", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", moveDraw, { passive: false });
    canvas.addEventListener("touchend", endDraw, { passive: false });

    const clearBtn = $("clearMathWorkBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        delete mathState.workById[q.id];
        drawPaper();
      });
    }

    window.addEventListener("resize", resizeCanvas, { once: true });
  }

  function checkMath() {
    const st = mathState;
    const q = st.questions[st.index];
    const answer = parseInt(st.input, 10);
    const isRight = answer === q.answer;
    const previous = st.resultsById[q.id] || {};
    const result = {
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      answer: q.answer,
      input: st.input,
      isRight,
      hadWrong: previous.hadWrong || !isRight,
      work: st.workById[q.id] || previous.work || ""
    };

    st.resultsById[q.id] = result;

    if (!isRight) {
      st.checked = false;
      st.isRight = false;
      st.feedback = "wrong";
      renderMath();
      return;
    }

    st.checked = true;
    st.isRight = true;
    st.feedback = "right";
    if (!previous.hadWrong && !previous.rewardChecked) {
      const reward = awardRandomPoints("math", q.prompt);
      st.resultsById[q.id] = { ...st.resultsById[q.id], rewardChecked: true, rewardPoints: reward };
    }
    renderMath();
  }

  function nextMath() {
    const st = mathState;
    if (!st) return;
    if (st.index + 1 >= st.questions.length) {
      st.finished = true;
      const results = Object.values(st.resultsById || {});
      const rightCount = results.filter(r => r.isRight).length;
      const wrongCount = results.filter(r => r.hadWrong).length;
      const logs = getStore(KEYS.mathLogs, []).filter(x => x.dateKey !== dateKey());
      logs.unshift({ dateKey: dateKey(), total: st.questions.length, rightCount, wrongCount, results, createdAt: new Date().toISOString() });
      setStore(KEYS.mathLogs, logs.slice(0, 100));
      saveMathSession();
      renderMath();
      return;
    }
    st.index += 1;
    const q = st.questions[st.index];
    const old = (st.resultsById || {})[q.id];
    st.input = old ? (old.input || "") : "";
    st.checked = !!(old && old.isRight);
    st.isRight = !!(old && old.isRight);
    st.feedback = st.checked ? "right" : "";
    saveMathSession();
    renderMath();
  }

  function prevMath() {
    const st = mathState;
    if (!st || st.index <= 0) return;
    st.index -= 1;
    const q = st.questions[st.index];
    const old = (st.resultsById || {})[q.id];
    st.input = old ? (old.input || "") : "";
    st.checked = !!(old && old.isRight);
    st.isRight = !!(old && old.isRight);
    st.feedback = st.checked ? "right" : "";
    saveMathSession();
    renderMath();
  }

  function showHistory() {
    const logs = getStore(KEYS.logs, []);
    const mathLogs = getStore(KEYS.mathLogs, []);
    const rewards = getStore(KEYS.rewards, []);
    const dates = Array.from(new Set([...logs.map(x => x.dateKey), ...mathLogs.map(x => x.dateKey), ...rewards.map(x => x.dateKey), dateKey()]))
      .filter(Boolean).sort().reverse().slice(0, 14);

    $("historyContent").innerHTML = dates.map(dk => {
      const log = logs.find(x => x.dateKey === dk);
      const math = mathLogs.find(x => x.dateKey === dk);
      const reward = todayRewardTotal(dk);
      const wrongWords = log && Array.isArray(log.results) ? log.results.filter(r => r.hadWrong).map(r => r.word) : [];
      return `
        <div class="history-item">
          <div class="history-date">${esc(dk)}</div>
          <div class="muted">English: ${log ? `${log.rightCount}/${log.total}, missed ${wrongWords.length}` : "no completed record"}</div>
          ${wrongWords.length ? `<div class="history-wrongs">${wrongWords.map(w => `<span>${esc(w)}</span>`).join("")}</div>` : ""}
          <div class="muted">Math: ${math ? `${math.rightCount}/${math.total}, corrected ${math.wrongCount}` : "no completed record"}</div>
          <div class="muted">Bonus points: ${reward}</div>
          <button class="mini-action" data-summary-date="${esc(dk)}">View Summary</button>
        </div>`;
    }).join("");
    openDialogSafely("historyDialog");
  }

function renderHeader() {
    $("todayLine").textContent = currentPlan.dateKey;
    $("planTitle").textContent = currentPlan.title;
    $("planDesc").textContent = currentPlan.desc;
    $("taskCount").textContent = currentPlan.words.length;
  }

  function renderHome() {
    $("newCount").textContent = currentPlan.newWords.length;
    $("reviewCount").textContent = currentPlan.reviewWords.length;
    $("wrongCountHome").textContent = Object.keys(getWrongbook()).length;
    $("logCountHome").textContent = getStore(KEYS.logs, []).length;
    if ($("rewardTodayHome")) $("rewardTodayHome").textContent = todayRewardTotal(currentPlan.dateKey);
    $("todayWords").innerHTML = currentPlan.words.length
      ? currentPlan.words.map(w => wordItem(w)).join("")
      : `<div class="empty">No review words today. Check the review list or continue on the next study day.</div>`;
  }

  function renderStudy() {
    const words = currentPlan.words || [];

    if (!words.length) {
      $("studyCards").innerHTML = `<div class="card empty">No words to study or review today.</div>`;
      $("finishStudyBtn").style.display = "none";
      return;
    }

    if (!studyState || studyState.dateKey !== currentPlan.dateKey || studyState.mode !== currentPlan.mode) {
      const saved = loadStudySession();
      studyState = {
        dateKey: currentPlan.dateKey,
        mode: currentPlan.mode,
        index: 0,
        handwritingById: {},
        examplesHeardById: {},
        examplePlayingKey: "",
        ...(saved || {}),
        examplePlayingKey: ""
      };
    }

    if (studyState.index >= words.length) studyState.index = words.length - 1;
    if (studyState.index < 0) studyState.index = 0;

    const word = words[studyState.index];
    const examples = getStudyExamples(word);
    const examplesComplete = areStudyExamplesComplete(word.id, examples.length);
    const exampleHtml = examples.length
      ? `<div class="examples"><div class="example-title">Examples:</div><ol>${examples.map((ex, i) => `<li><span>${esc(ex)}</span> <button class="example-speak" data-study-example-index="${i}" ${studyState.examplePlayingKey ? "disabled" : ""}>🔊</button></li>`).join("")}</ol></div>`
      : "";
    const pattern = word.pattern ? `<div class="muted">Spelling hint: ${esc(word.pattern)}</div>` : "";

    $("studyCards").innerHTML = `
      <div class="card study-pager-card">
        <div class="study-progress">Word ${studyState.index + 1} of ${words.length}</div>
        ${badge(word)}
        <div class="word study-big-word">${esc(word.word)}</div>

        ${pattern}
        ${exampleHtml}

        <div class="card-actions">
          <button class="mini-action" data-speak="${esc(word.audioText || word.word)}">🔊 Word Audio</button>
          <button class="mini-action" data-wrong="${esc(word.id)}">Add to Review List</button>
        </div>

        <div class="study-handwriting-card">
          <div class="handwriting-head">
            <div>
              <div class="handwriting-title">Handwriting Practice</div>
              <div class="muted">Write this word once to strengthen spelling memory.</div>
            </div>
            <button class="mini-action" id="clearStudyHandwritingBtn">Clear</button>
          </div>
          <canvas id="studyCanvas" class="study-canvas" data-word-id="${esc(word.id)}"></canvas>
        </div>

        <div class="study-nav">
          <button class="secondary" id="prevStudyBtn" ${studyState.index === 0 ? "disabled" : ""}>Previous</button>
          <button class="primary" id="nextStudyBtn" ${examplesComplete ? "" : "disabled"}>${studyState.index + 1 >= words.length ? "Finish Study" : "Next"}</button>
        </div>
      </div>
    `;

    $("finishStudyBtn").style.display = "none";
    requestAnimationFrame(() => setupStudyCanvas());
  }

  function startDictation() {
    const saved = loadDictationSession();
    const base = {
      index: 0,
      input: "",
      checked: false,
      isRight: false,
      feedback: "",
      handwritingById: {},
      resultsById: {},
      finished: false,
      words: currentPlan.dictationWords
    };
    dictationState = saved ? { ...base, ...saved, words: currentPlan.dictationWords } : base;
    renderDictation();
  }

  function setupStudyCanvas() {
    const canvas = $("studyCanvas");
    if (!canvas || !studyState || !currentPlan) return;
    const word = (currentPlan.words || [])[studyState.index];
    if (!word) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resizeCanvas(retry = 0) {
      const rect = canvas.getBoundingClientRect();
      if ((rect.width < 2 || rect.height < 2) && retry < 6) {
        requestAnimationFrame(() => resizeCanvas(retry + 1));
        return;
      }
      const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 320);
      const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 180);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawSaved();
    }

    function drawPaper() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = "rgba(181, 106, 51, 0.16)";
      ctx.lineWidth = 1;
      const baseY = rect.height * 0.64;
      const midY = rect.height * 0.42;
      ctx.beginPath(); ctx.moveTo(16, baseY); ctx.lineTo(rect.width - 16, baseY); ctx.stroke();
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(16, midY); ctx.lineTo(rect.width - 16, midY); ctx.stroke();
      ctx.setLineDash([]);
    }

    function redrawSaved() {
      drawPaper();
      const data = studyState.handwritingById[word.id];
      if (data) {
        const img = new Image();
        img.onload = () => {
          const rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = data;
      }
    }
    requestAnimationFrame(() => resizeCanvas());
    let drawing = false;
    let last = null;

    function pointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    }

    function startDraw(e) { e.preventDefault(); drawing = true; last = pointFromEvent(e); }
    function moveDraw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pointFromEvent(e);
      ctx.strokeStyle = "#2F2A25";
      ctx.lineWidth = 4.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    }
    function endDraw(e) {
      if (!drawing) return;
      e && e.preventDefault && e.preventDefault();
      drawing = false;
      last = null;
      try {
        studyState.handwritingById[word.id] = canvas.toDataURL("image/png");
        saveStudySession();
      } catch {}
    }

    canvas.addEventListener("pointerdown", startDraw);
    canvas.addEventListener("pointermove", moveDraw);
    canvas.addEventListener("pointerup", endDraw);
    canvas.addEventListener("pointercancel", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", moveDraw, { passive: false });
    canvas.addEventListener("touchend", endDraw, { passive: false });

    const clearBtn = $("clearStudyHandwritingBtn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      delete studyState.handwritingById[word.id];
      saveStudySession();
      drawPaper();
    });

    window.addEventListener("resize", resizeCanvas, { once: true });
  }

  function nextStudyWord() {
    if (!studyState || !currentPlan) return;
    const words = currentPlan.words || [];
    const word = words[studyState.index];
    if (word && !areStudyExamplesComplete(word.id, getStudyExamples(word).length)) {
      toast("Listen to all three examples first.");
      return;
    }
    if (studyState.index + 1 >= words.length) {
      markLearned();
      switchView("home");
      return;
    }
    studyState.index += 1;
    saveStudySession();
    renderStudy();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function prevStudyWord() {
    if (!studyState || studyState.index <= 0) return;
    studyState.index -= 1;
    saveStudySession();
    renderStudy();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setupHandwritingCanvas() {
    const canvas = $("handwritingCanvas");
    if (!canvas || !dictationState) return;

    const word = dictationState.words[dictationState.index];
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resizeCanvas(retry = 0) {
      const rect = canvas.getBoundingClientRect();
      if ((rect.width < 2 || rect.height < 2) && retry < 6) {
        requestAnimationFrame(() => resizeCanvas(retry + 1));
        return;
      }
      const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 320);
      const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 180);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawSaved();
    }

    function drawPaper() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = "rgba(181, 106, 51, 0.16)";
      ctx.lineWidth = 1;
      const rows = 3;
      for (let i = 1; i <= rows; i++) {
        const y = (rect.height / (rows + 1)) * i;
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(rect.width - 14, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(91, 67, 160, 0.18)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(18, rect.height * 0.5);
      ctx.lineTo(rect.width - 18, rect.height * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function redrawSaved() {
      drawPaper();
      const data = dictationState.handwritingById[word.id];
      if (data) {
        const img = new Image();
        img.onload = () => {
          const rect = canvas.getBoundingClientRect();
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = data;
      }
    }
    requestAnimationFrame(() => resizeCanvas());

    let drawing = false;
    let last = null;

    function pointFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return {
        x: p.clientX - rect.left,
        y: p.clientY - rect.top
      };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      last = pointFromEvent(e);
    }

    function moveDraw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pointFromEvent(e);
      ctx.strokeStyle = "#2F2A25";
      ctx.lineWidth = 4.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }

    function endDraw(e) {
      if (!drawing) return;
      e && e.preventDefault && e.preventDefault();
      drawing = false;
      last = null;
      try {
        dictationState.handwritingById[word.id] = canvas.toDataURL("image/png");
      } catch {}
    }

    canvas.addEventListener("pointerdown", startDraw);
    canvas.addEventListener("pointermove", moveDraw);
    canvas.addEventListener("pointerup", endDraw);
    canvas.addEventListener("pointercancel", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", moveDraw, { passive: false });
    canvas.addEventListener("touchend", endDraw, { passive: false });

    const clearBtn = $("clearHandwritingBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        delete dictationState.handwritingById[word.id];
        drawPaper();
      });
    }

    window.addEventListener("resize", resizeCanvas, { once: true });
  }

function renderDictation() {
    const box = $("dictationBox");
    const st = dictationState || { words: [] };

    if (!st.words.length) {
      box.innerHTML = `<div class="section-title">No words for dictation today</div><p class="muted">If it is Sunday and there are no missed words this week, take a break.</p><button class="primary full" data-jump="home">Back Home</button>`;
      return;
    }

    if (st.finished) {
      const results = Object.values(st.resultsById || {});
      const right = results.filter(r => r.isRight).length;
      const wrong = results.filter(r => r.hadWrong).length;
      box.innerHTML = `<div class="section-title">Complete 🎉</div><p class="muted">This dictation had ${st.words.length} words. ${right} correct after corrections; ${wrong} missed at least once.</p><button class="primary full" id="showDaySummaryBtn">View Today Summary</button><button class="secondary full" data-jump="wrongbook">View Review List</button>`;
      return;
    }

    const word = st.words[st.index];
    const old = (st.resultsById || {})[word.id];
    if (old && !st.input) st.input = old.input || "";

    box.innerHTML = `
      <div class="muted">Word ${st.index + 1} of ${st.words.length}</div><div class="reward-mini">Bonus today: ${todayRewardTotal(currentPlan.dateKey)} pts</div>
      <div style="margin: 10px 0;">${badge(word)}</div><div class="dictation-mode-note">${currentPlan && currentPlan.mode === "saturday" ? "Test mode: word only" : "Study mode: example + word"}</div>
      <div class="dictation-audio-only">
        <div class="dictation-icon">🔊</div>
        <div class="muted">${currentPlan && currentPlan.mode === "saturday" ? "Saturday test: listen to the word, then type the spelling" : "Study dictation: listen to the example first, then the target word"}</div>
      </div>
      <button class="secondary full" id="playDictationPromptBtn">Play Audio</button>

      <div class="handwriting-card">
        <div class="handwriting-head">
          <div>
            <div class="handwriting-title">Handwriting Pad</div>
            <div class="muted">Use Apple Pencil or your finger here before typing the spelling.</div>
          </div>
          <button class="mini-action" id="clearHandwritingBtn">Clear</button>
        </div>
        <canvas id="handwritingCanvas" class="handwriting-canvas" data-word-id="${esc(word.id)}"></canvas>
      </div>

      <input id="dictationInput" class="input" autocomplete="off" autocapitalize="none" placeholder="Enter the spelling" value="${esc(st.input)}" />
      ${st.feedback === "wrong" ? `<div class="bad">Almost. Correct it before moving on.</div><div class="muted">Correct answer: ${esc(word.word)}</div>` : ""}
      ${st.checked && st.isRight ? `<div class="ok">Correct!</div>` : ""}
      <div class="dictation-nav">
        <button class="secondary" id="prevDictationBtn" ${st.index === 0 ? "disabled" : ""}>Previous</button>
        ${st.checked && st.isRight ? `<button class="primary" id="nextDictationBtn">${st.index + 1 >= st.words.length ? "Finish" : "Next"}</button>` : `<button class="primary" id="checkDictationBtn">${st.feedback === "wrong" ? "I fixed it. Check again" : "Submit"}</button>`}
      </div>
    `;

    const input = $("dictationInput");
    if (input) {
      input.focus();
      input.addEventListener("input", e => {
        st.input = e.target.value;
        if (st.feedback === "wrong") {
          st.checked = false;
          st.isRight = false;
        }
      });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          if (st.checked && st.isRight) nextDictation();
          else checkDictation();
        }
      });
    }

    requestAnimationFrame(() => setupHandwritingCanvas());
  }

  function checkDictation() {
    const st = dictationState;
    const word = st.words[st.index];
    const isRight = checkAnswer(st.input, word);
    const previous = st.resultsById[word.id] || {};
    const result = {
      id: word.id,
      word: word.word,
      level: word.level,
      taskType: word.taskType,
      cn: word.cn,
      input: st.input,
      isRight,
      hadWrong: previous.hadWrong || !isRight,
      handwriting: st.handwritingById[word.id] || previous.handwriting || ""
    };

    if (!isRight && !previous.hadWrong) addWrong(word, st.input);
    st.resultsById[word.id] = result;

    if (!isRight) {
      st.checked = false;
      st.isRight = false;
      st.feedback = "wrong";
      saveDictationSession();
      renderDictation();
      return;
    }

    st.checked = true;
    st.isRight = true;
    st.feedback = "right";
    if (!previous.hadWrong && !previous.rewardChecked) {
      const reward = awardRandomPoints("english", word.word);
      st.resultsById[word.id] = { ...st.resultsById[word.id], rewardChecked: true, rewardPoints: reward };
    }
    saveDictationSession();
    renderDictation();
  }

  function nextDictation() {
    const st = dictationState;
    if (!st) return;
    if (st.index + 1 >= st.words.length) {
      st.finished = true;
      const results = Object.values(st.resultsById || {});
      const rightCount = results.filter(r => r.isRight).length;
      const wrongCount = results.filter(r => r.hadWrong).length;
      saveLog({ dateKey: currentPlan.dateKey, weekKey: currentPlan.weekKey, mode: currentPlan.mode, title: currentPlan.title, total: st.words.length, rightCount, wrongCount, results });
      saveDictationSession();
      renderAll(false);
      renderDictation();
      return;
    }
    st.index += 1;
    const word = st.words[st.index];
    const old = (st.resultsById || {})[word.id];
    st.input = old ? (old.input || "") : "";
    st.checked = !!(old && old.isRight);
    st.isRight = !!(old && old.isRight);
    st.feedback = st.checked ? "right" : "";
    saveDictationSession();
    renderDictation();
  }

  function prevDictation() {
    const st = dictationState;
    if (!st || st.index <= 0) return;
    st.index -= 1;
    const word = st.words[st.index];
    const old = (st.resultsById || {})[word.id];
    st.input = old ? (old.input || "") : "";
    st.checked = !!(old && old.isRight);
    st.isRight = !!(old && old.isRight);
    st.feedback = st.checked ? "right" : "";
    saveDictationSession();
    renderDictation();
  }

  function renderWrongbook() {
    const items = Object.values(getWrongbook()).sort((a, b) => {
      const diff = (b.wrongCount || 0) - (a.wrongCount || 0);
      if (diff) return diff;
      return String(b.lastWrongAt || "").localeCompare(String(a.lastWrongAt || ""));
    });

    $("wrongbookList").innerHTML = items.length
      ? items.map(w => `
        <div class="card">
          ${wordItem(w, false)}
          <div class="muted">Mistakes: ${w.wrongCount || 0}${w.lastWrongDateKey ? " | Latest: " + w.lastWrongDateKey : ""}</div>
          <div class="card-actions">
            <button class="mini-action" data-speak="${esc(w.audioText || w.word)}">🔊 Speak</button>
            <button class="mini-action" data-remove-wrong="${esc(w.id)}">Mastered, Remove</button>
          </div>
        </div>`).join("")
      : `<div class="card empty">No review words yet. Nice work!</div>`;
  }

  function renderStats() {
    const learned = getStore(KEYS.learned, {});
    const learnedEntries = Object.values(learned).map(readLearnedEntry);
    const learnedDays = learnedEntries.filter(entry => entry.ids.length).length;
    const learnedWords = new Set(learnedEntries.flatMap(entry => entry.ids)).size;
    const wrongCount = Object.keys(getWrongbook()).length;
    const logs = getStore(KEYS.logs, []);
    $("learnedDays").textContent = learnedDays;
    $("learnedWords").textContent = learnedWords;
    $("wrongCountStats").textContent = wrongCount;
    $("dictationTimes").textContent = logs.length;
    $("recentLogs").innerHTML = logs.length
      ? logs.slice(0, 10).map(log => `<div class="word-item"><strong>${esc(log.title || log.dateKey)}</strong><div class="muted">${esc(log.dateKey)} | Correct ${log.rightCount} / ${log.total}, missed ${log.wrongCount}</div></div>`).join("")
      : `<div class="empty">No dictation records yet.</div>`;
  }

  function renderAll(rebuildPlan = true) {
    if (rebuildPlan || !currentPlan) currentPlan = getPlan();
    clearTodayProgressIfStale(currentPlan);
    renderHeader();
    renderHome();
    renderStudy();
    renderWrongbook();
    renderStats();
  }

  function switchView(view) {
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
    if (view === "study") requestAnimationFrame(() => renderStudy());
    if (view === "study") requestAnimationFrame(() => renderStudy());
    if (view === "dictation") startDictation();
    if (view === "math") startMath();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindEvents() {
    document.body.addEventListener("click", e => {
      if (e.target.closest("#showHomeSummaryBtn")) {
        e.preventDefault();
        return showDaySummary();
      }

      if (e.target.closest("#showHistoryBtn")) {
        e.preventDefault();
        return showHistory();
      }

      const copyWrongWordsBtn = e.target.closest("#copyWrongWordsBtn");
      if (copyWrongWordsBtn) {
        e.preventDefault();
        const text = $("wrongWordsCopyText") ? $("wrongWordsCopyText").value : "";
        if (text) navigator.clipboard?.writeText(text);
        toast(text ? "Missed words copied" : "No missed words to copy");
        return;
      }

      const studyExampleBtn = e.target.closest("[data-study-example-index]");
      if (studyExampleBtn) {
        e.preventDefault();
        return playStudyExample(parseInt(studyExampleBtn.dataset.studyExampleIndex, 10));
      }

      const summaryDateBtn = e.target.closest("[data-summary-date]");
      if (summaryDateBtn) {
        e.preventDefault();
        closeDialogSafely("historyDialog");
        return showDaySummary(summaryDateBtn.dataset.summaryDate);
      }

      const tab = e.target.closest(".tab");
      if (tab) return switchView(tab.dataset.view);
      const jump = e.target.closest("[data-jump]");
      if (jump) return switchView(jump.dataset.jump);
      const speakBtn = e.target.closest("[data-speak]");
      if (speakBtn) {
        if (studyState && studyState.examplePlayingKey) { toast("Wait for the example to finish."); return; }
        return speak(speakBtn.dataset.speak);
      }
      const wrongBtn = e.target.closest("[data-wrong]");
      if (wrongBtn) {
        const word = currentPlan.words.find(w => w.id === wrongBtn.dataset.wrong) || WORDS.find(w => w.id === wrongBtn.dataset.wrong);
        if (word) { addWrong(word, ""); toast("Added to review list"); renderAll(false); }
        return;
      }
      const removeBtn = e.target.closest("[data-remove-wrong]");
      if (removeBtn) return removeWrong(removeBtn.dataset.removeWrong);
      if (e.target.id === "playDictationPromptBtn") return speakDictationPrompt(dictationState.words[dictationState.index]);
      if (e.target.id === "prevDictationBtn") return prevDictation();
      if (e.target.id === "checkDictationBtn") return checkDictation();
      if (e.target.id === "nextDictationBtn") return nextDictation();
      const prevStudyBtn = e.target.closest("#prevStudyBtn");
      if (prevStudyBtn) {
        e.preventDefault();
        return prevStudyWord();
      }
      const nextStudyBtn = e.target.closest("#nextStudyBtn");
      if (nextStudyBtn) {
        e.preventDefault();
        return nextStudyWord();
      }
      if (e.target.id === "prevMathBtn") return prevMath();
      if (e.target.id === "checkMathBtn") return checkMath();
      if (e.target.id === "nextMathBtn") return nextMath();
      if (e.target.id === "showDaySummaryBtn") return showDaySummary();
    });

    $("finishStudyBtn").addEventListener("click", markLearned);

    const providerEl = $("ttsProvider");
    const accentEl = $("voiceAccent");
    const rateEl = $("voiceRate");
    const repeatEl = $("voiceRepeat");

    if (providerEl) {
      providerEl.value = getStore(VOICE_KEYS.provider, "elevenlabs");
      providerEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.provider, e.target.value);
        refreshVoices();
        toast(e.target.value === "elevenlabs" ? "Switched to ElevenLabs" : "Switched to device speech");
      });
    }

    if (accentEl) {
      accentEl.value = getStore(VOICE_KEYS.accent, "en-US");
      accentEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.accent, e.target.value);
        refreshVoices();
        toast("Accent updated");
      });
    }

    if (rateEl) {
      rateEl.value = getStore(VOICE_KEYS.rate, "0.82");
      rateEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.rate, e.target.value);
        toast("Speed updated");
      });
    }

    if (repeatEl) {
      repeatEl.value = getStore(VOICE_KEYS.repeat, "2");
      repeatEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.repeat, e.target.value);
        toast("Repeat count updated");
      });
    }

    refreshVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
      setTimeout(refreshVoices, 600);
      setTimeout(refreshVoices, 1500);
    }
    $("resetBtn").addEventListener("click", () => {
      if (confirm("Clear all local learning data? This will delete check-ins, review words, and dictation records.")) {
        Object.values(KEYS).forEach(k => localStorage.removeItem(k));
        toast("Cleared");
        seedInitialWrongbook();
        renderAll();
      }
    });
    
    const homeSummaryBtn = $("showHomeSummaryBtn");
    if (homeSummaryBtn) homeSummaryBtn.addEventListener("click", () => showDaySummary());

    const historyBtn = $("showHistoryBtn");
    if (historyBtn) historyBtn.addEventListener("click", () => showHistory());

    $("installHelpBtn").addEventListener("click", () => $("installDialog").showModal());
    $("closeInstallDialog").addEventListener("click", () => $("installDialog").close());
    if ($("closeDaySummaryDialog")) $("closeDaySummaryDialog").addEventListener("click", () => closeDialogSafely("daySummaryDialog"));
    if ($("closeHistoryDialog")) $("closeHistoryDialog").addEventListener("click", () => closeDialogSafely("historyDialog"));
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  seedInitialWrongbook();
  migrateWordContent();
  restoreWrongbookFromLogs();
  bindEvents();
  renderAll();
})();
