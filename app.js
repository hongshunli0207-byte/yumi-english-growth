(() => {
  const WORDS = window.YUMI_WORDS || [];
  const COURSE = window.YUMI_COURSE || { courseStartDate: "2026-06-01", schedule: [], seedWrongWords: [] };

  const KEYS = {
    learned: "YUMI_PWA_LEARNED",
    wrongbook: "YUMI_PWA_WRONGBOOK",
    logs: "YUMI_PWA_DICTATION_LOGS",
    seeded: "YUMI_PWA_SEEDED_WRONGBOOK_V3_20260604",
    contentMigrated: "YUMI_PWA_CONTENT_MIGRATED_V6"
  };

  let currentPlan = null;
  let dictationState = null;

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
    const wk = `第 ${pos.week} 周`;

    if (pos.dayOfWeek >= 1 && pos.dayOfWeek <= 5) {
      const courseDay = getCourseDay(pos.week, pos.dayIndex);
      const newWords = courseDay ? courseDay.words.map(w => ({ ...w, taskType: "new" })) : [];
      const reviewWords = getYesterdayWrongWords(date);
      return {
        mode: "weekday",
        dateKey: dk,
        weekKey: wk,
        title: `${wk}${courseDay ? " " + courseDay.dayName : ""}：10 个新词 + 昨天全部错词`,
        desc: "新词固定为 7 个基础词 + 3 个挑战词；昨天错了几个，今天就全部加入复习。",
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
        title: `${wk} 周六听写：本周 50 个新词`,
        desc: "今天不学新词，只听写周一到周五的 35 个基础词 + 15 个挑战词。",
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
      title: `${wk} 周日复盘：集中搞定本周错词`,
      desc: "今天不学新词，只复习这一周听写或学习中错过的词。",
      newWords: [],
      reviewWords: weekWrong,
      words: weekWrong,
      dictationWords: weekWrong
    };
  }

  function badge(word) {
    let label = word.level === "challenge" ? "挑战词" : "基础词";
    let cls = word.level === "challenge" ? "challenge" : "";
    if (word.taskType === "review") { label = "昨天错词"; cls = "review"; }
    if (word.taskType === "weeklyDictation") { label = "周六听写"; cls = "week"; }
    if (word.taskType === "weekWrong") { label = "本周错词"; cls = "review"; }
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function wordItem(word, withActions = false) {
    const examples = Array.isArray(word.examples) && word.examples.length ? word.examples : [word.example].filter(Boolean);
    const exampleHtml = examples.length
      ? `<div class="examples"><div class="example-title">例句：</div><ol>${examples.map(ex => `<li><span>${esc(ex)}</span> <button class="example-speak" data-speak="${esc(ex)}">🔊</button></li>`).join("")}</ol></div>`
      : "";
    const pattern = word.pattern ? `<div class="muted">拼写提示：${esc(word.pattern)}</div>` : "";

    return `
      <div class="word-item">
        ${badge(word)}
        <div class="word">${esc(word.word)}</div>
        <div class="cn">${esc(word.cn)}</div>
        ${pattern}
        ${exampleHtml}
        ${withActions ? `
          <div class="card-actions">
            <button class="mini-action" data-speak="${esc(word.audioText || word.word)}">🔊 发音</button>
            <button class="mini-action" data-wrong="${esc(word.id)}">加入错题本</button>
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
      if (voiceName) voiceName.textContent = "当前声音：ElevenLabs 真人发音；网络失败时自动切回本机发音。";
      return;
    }

    if (!("speechSynthesis" in window)) return;
    availableVoices = window.speechSynthesis.getVoices() || [];
    const candidates = availableVoices.filter(v => (v.lang || "").toLowerCase().startsWith(setting.accent.toLowerCase().slice(0, 2)));
    selectedVoice = (candidates.length ? candidates : availableVoices)
      .sort((a, b) => scoreVoice(b, setting.accent) - scoreVoice(a, setting.accent))[0] || null;

    if (voiceName) {
      voiceName.textContent = selectedVoice
        ? `当前声音：${selectedVoice.name}（${selectedVoice.lang}）`
        : "当前设备没有可用的英语朗读声音";
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
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      refreshVoices();

      let remaining = Math.max(1, setting.repeat || 1);
      const playNext = () => {
        remaining -= 1;
        if (remaining <= 0) return;
        setTimeout(() => speakOnce(spoken, setting, playNext), 260);
      };

      speakOnce(spoken, setting, playNext);
    } else {
      navigator.clipboard?.writeText(spoken);
      toast("已复制单词");
    }
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
      throw new Error(detail || "ElevenLabs 发音失败");
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
        toast("真人发音失败，已切回本机发音");
        speakBrowser(spoken, setting);
        return;
      }
    }

    speakBrowser(spoken, setting);
  }


  function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function speakDictationPrompt(word) {
    const target = String(word.audioText || word.word || "").replace("/", " or ");
    const example = Array.isArray(word.examples) && word.examples.length ? word.examples[0] : word.example;

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

  function markLearned() {
    const learned = getStore(KEYS.learned, {});
    const ids = currentPlan.words.map(w => w.id);
    learned[currentPlan.dateKey] = Array.from(new Set([...(learned[currentPlan.dateKey] || []), ...ids]));
    setStore(KEYS.learned, learned);
    toast("今日学习完成");
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
    $("todayWords").innerHTML = currentPlan.words.length
      ? currentPlan.words.map(w => wordItem(w)).join("")
      : `<div class="empty">今天没有可复习错词。可以看看错题本，或下一个学习日继续新词。</div>`;
  }

  function renderStudy() {
    $("studyCards").innerHTML = currentPlan.words.length
      ? currentPlan.words.map(w => `<div class="card">${wordItem(w, true)}</div>`).join("")
      : `<div class="card empty">今天没有可复习错词。</div>`;
    $("finishStudyBtn").style.display = currentPlan.words.length ? "block" : "none";
  }

  function startDictation() {
    dictationState = {
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
    renderDictation();
  }

  
  function setupHandwritingCanvas() {
    const canvas = $("handwritingCanvas");
    if (!canvas || !dictationState) return;

    const word = dictationState.words[dictationState.index];
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
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

    resizeCanvas();

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
      box.innerHTML = `<div class="section-title">今天没有可听写的词</div><p class="muted">如果是周日且本周没有错词，就可以休息一下。</p><button class="primary full" data-jump="home">回到首页</button>`;
      return;
    }

    if (st.finished) {
      const results = Object.values(st.resultsById || {});
      const right = results.filter(r => r.isRight).length;
      const wrong = results.filter(r => r.hadWrong).length;
      box.innerHTML = `<div class="section-title">完成啦 🎉</div><p class="muted">本次听写 ${st.words.length} 个，最终正确 ${right} 个，曾经错过 ${wrong} 个。</p><button class="primary full" data-jump="home">回到首页</button><button class="secondary full" data-jump="wrongbook">查看错题本</button>`;
      return;
    }

    const word = st.words[st.index];
    const old = (st.resultsById || {})[word.id];
    if (old && !st.input) st.input = old.input || "";

    box.innerHTML = `
      <div class="muted">第 ${st.index + 1} / ${st.words.length} 个</div>
      <div style="margin: 10px 0;">${badge(word)}</div><div class="dictation-mode-note">${currentPlan && currentPlan.mode === "saturday" ? "考试模式：只念单词" : "学习模式：例句 + 单词"}</div>
      <div class="dictation-audio-only">
        <div class="dictation-icon">🔊</div>
        <div class="muted">${currentPlan && currentPlan.mode === "saturday" ? "周六测试：只听单词，然后输入拼写" : "学习听写：先听例句，再听目标单词"}</div>
      </div>
      <button class="secondary full" id="playDictationPromptBtn">发音</button>

      <div class="handwriting-card">
        <div class="handwriting-head">
          <div>
            <div class="handwriting-title">手写板</div>
            <div class="muted">可以用 Apple Pencil 或手指先写在这里，再输入拼写。</div>
          </div>
          <button class="mini-action" id="clearHandwritingBtn">清空</button>
        </div>
        <canvas id="handwritingCanvas" class="handwriting-canvas" data-word-id="${esc(word.id)}"></canvas>
      </div>

      <input id="dictationInput" class="input" autocomplete="off" autocapitalize="none" placeholder="请输入英文拼写" value="${esc(st.input)}" />
      ${st.feedback === "wrong" ? `<div class="bad">还差一点。请改正后再继续。</div><div class="muted">正确答案：${esc(word.word)}</div>` : ""}
      ${st.checked && st.isRight ? `<div class="ok">正确！</div>` : ""}
      <div class="dictation-nav">
        <button class="secondary" id="prevDictationBtn" ${st.index === 0 ? "disabled" : ""}>上一个</button>
        ${st.checked && st.isRight ? `<button class="primary" id="nextDictationBtn">${st.index + 1 >= st.words.length ? "完成" : "下一个"}</button>` : `<button class="primary" id="checkDictationBtn">${st.feedback === "wrong" ? "我改好了，再检查" : "提交"}</button>`}
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

    setupHandwritingCanvas();
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
      renderDictation();
      return;
    }

    st.checked = true;
    st.isRight = true;
    st.feedback = "right";
    renderDictation();
  }

  function nextDictation() {
    const st = dictationState;
    if (st.index + 1 >= st.words.length) {
      st.finished = true;
      const results = Object.values(st.resultsById || {});
      const rightCount = results.filter(r => r.isRight).length;
      const wrongCount = results.filter(r => r.hadWrong).length;
      saveLog({ dateKey: currentPlan.dateKey, weekKey: currentPlan.weekKey, mode: currentPlan.mode, title: currentPlan.title, total: st.words.length, rightCount, wrongCount, results });
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
          <div class="muted">错误次数：${w.wrongCount || 0}${w.lastWrongDateKey ? "｜最近：" + w.lastWrongDateKey : ""}</div>
          <div class="card-actions">
            <button class="mini-action" data-speak="${esc(w.audioText || w.word)}">🔊 发音</button>
            <button class="mini-action" data-remove-wrong="${esc(w.id)}">我掌握了，移除</button>
          </div>
        </div>`).join("")
      : `<div class="card empty">目前没有错题，漂亮！</div>`;
  }

  function renderStats() {
    const learned = getStore(KEYS.learned, {});
    const learnedDays = Object.keys(learned).length;
    const learnedWords = new Set(Object.values(learned).flat()).size;
    const wrongCount = Object.keys(getWrongbook()).length;
    const logs = getStore(KEYS.logs, []);
    $("learnedDays").textContent = learnedDays;
    $("learnedWords").textContent = learnedWords;
    $("wrongCountStats").textContent = wrongCount;
    $("dictationTimes").textContent = logs.length;
    $("recentLogs").innerHTML = logs.length
      ? logs.slice(0, 10).map(log => `<div class="word-item"><strong>${esc(log.title || log.dateKey)}</strong><div class="muted">${esc(log.dateKey)}｜正确 ${log.rightCount} / ${log.total}，错误 ${log.wrongCount}</div></div>`).join("")
      : `<div class="empty">还没有听写记录。</div>`;
  }

  function renderAll(rebuildPlan = true) {
    if (rebuildPlan || !currentPlan) currentPlan = getPlan();
    renderHeader();
    renderHome();
    renderStudy();
    renderWrongbook();
    renderStats();
  }

  function switchView(view) {
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
    if (view === "dictation") startDictation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindEvents() {
    document.body.addEventListener("click", e => {
      const tab = e.target.closest(".tab");
      if (tab) return switchView(tab.dataset.view);
      const jump = e.target.closest("[data-jump]");
      if (jump) return switchView(jump.dataset.jump);
      const speakBtn = e.target.closest("[data-speak]");
      if (speakBtn) return speak(speakBtn.dataset.speak);
      const wrongBtn = e.target.closest("[data-wrong]");
      if (wrongBtn) {
        const word = currentPlan.words.find(w => w.id === wrongBtn.dataset.wrong) || WORDS.find(w => w.id === wrongBtn.dataset.wrong);
        if (word) { addWrong(word, ""); toast("已加入错题本"); renderAll(false); }
        return;
      }
      const removeBtn = e.target.closest("[data-remove-wrong]");
      if (removeBtn) return removeWrong(removeBtn.dataset.removeWrong);
      if (e.target.id === "playDictationPromptBtn") return speakDictationPrompt(dictationState.words[dictationState.index]);
      if (e.target.id === "prevDictationBtn") return prevDictation();
      if (e.target.id === "checkDictationBtn") return checkDictation();
      if (e.target.id === "nextDictationBtn") return nextDictation();
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
        toast(e.target.value === "elevenlabs" ? "已切换为真人发音" : "已切换为本机发音");
      });
    }

    if (accentEl) {
      accentEl.value = getStore(VOICE_KEYS.accent, "en-US");
      accentEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.accent, e.target.value);
        refreshVoices();
        toast("发音口音已更新");
      });
    }

    if (rateEl) {
      rateEl.value = getStore(VOICE_KEYS.rate, "0.82");
      rateEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.rate, e.target.value);
        toast("语速已更新");
      });
    }

    if (repeatEl) {
      repeatEl.value = getStore(VOICE_KEYS.repeat, "2");
      repeatEl.addEventListener("change", e => {
        setStore(VOICE_KEYS.repeat, e.target.value);
        toast("重复次数已更新");
      });
    }

    refreshVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
      setTimeout(refreshVoices, 600);
      setTimeout(refreshVoices, 1500);
    }
    $("resetBtn").addEventListener("click", () => {
      if (confirm("确认清空本机学习数据？这会删除打卡、错题和听写记录。")) {
        Object.values(KEYS).forEach(k => localStorage.removeItem(k));
        toast("已清空");
        seedInitialWrongbook();
        renderAll();
      }
    });
    $("installHelpBtn").addEventListener("click", () => $("installDialog").showModal());
    $("closeInstallDialog").addEventListener("click", () => $("installDialog").close());
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  seedInitialWrongbook();
  migrateWordContent();
  bindEvents();
  renderAll();
})();
