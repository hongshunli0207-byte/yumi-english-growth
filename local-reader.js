(function () {
  const STORE_KEY = "YUMI_LOCAL_OPENAI_KEY";
  const DAILY_PAGE_GOAL = 20;

  const state = {
    books: [],
    current: null,
    pageNumber: 1,
    bodyStartPage: 3,
    pageRecorder: null,
    pageChunks: [],
    answerRecorder: null,
    answerChunks: [],
    transcript: "",
    currentQuestion: "",
    sessionNotes: [],
    aiReady: false
  };

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[ch]));
  }

  function setStatus(message) {
    $("recordStatus").textContent = message;
  }

  function speak(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    utterance.pitch = 1.03;
    window.speechSynthesis.speak(utterance);
  }

  function setAiReady(ready) {
    state.aiReady = ready;
    $("aiStatus").textContent = ready ? "OpenAI status: ready" : "OpenAI status: key needed";
    $("keyDetails").open = !ready;
    updateButtons();
  }

  function pageState() {
    return state.pageRecorder ? state.pageRecorder.state : "inactive";
  }

  function answerState() {
    return state.answerRecorder ? state.answerRecorder.state : "inactive";
  }

  function updateButtons() {
    const hasBook = Boolean(state.current);
    const isPageRecording = pageState() === "recording";
    const isPagePaused = pageState() === "paused";
    const isAnswerRecording = answerState() === "recording";

    $("startPageBtn").disabled = !hasBook || !state.aiReady || isPageRecording || isPagePaused || isAnswerRecording;
    $("pausePageBtn").disabled = !isPageRecording && !isPagePaused;
    $("pausePageBtn").textContent = isPagePaused ? "Resume" : "Pause";
    $("endPageBtn").disabled = !isPageRecording && !isPagePaused;
    $("answerBtn").disabled = !hasBook || !state.aiReady || !state.currentQuestion || isAnswerRecording || isPageRecording || isPagePaused;
    $("endAnswerBtn").disabled = !isAnswerRecording;
    $("finishBtn").disabled = !hasBook || !state.aiReady || state.sessionNotes.length === 0 || isPageRecording || isPagePaused || isAnswerRecording;
    $("prevPageBtn").disabled = !hasBook || state.pageNumber <= 1 || isPageRecording || isPagePaused || isAnswerRecording;
    $("nextPageBtn").disabled = !hasBook || isPageRecording || isPagePaused || isAnswerRecording;
  }

  function renderBooks() {
    const list = $("bookList");
    if (!state.books.length) {
      list.innerHTML = '<p class="status">No PDF+audio books found.</p>';
      return;
    }

    list.innerHTML = state.books.map(book => `
      <button class="book-item ${state.current && state.current.id === book.id ? "active" : ""}" data-id="${esc(book.id)}">
        <strong>${esc(book.title)}</strong>
        <span>Level ${esc(book.level)} · ${esc(book.pdfName)}</span>
      </button>
    `).join("");

    list.querySelectorAll(".book-item").forEach(btn => {
      btn.addEventListener("click", () => selectBook(btn.dataset.id));
    });
  }

  function showPdfPage() {
    if (!state.current) return;
    $("pageNumber").textContent = String(state.pageNumber);
    $("pdfFrame").src = `${state.current.pdfUrl}#page=${state.pageNumber}&view=Fit`;
    updateButtons();
  }

  function setPage(pageNumber) {
    state.pageNumber = Math.max(1, Number(pageNumber) || 1);
    state.currentQuestion = "";
    $("questionBox").textContent = "AI will speak after End Page.";
    $("coachFeedback").textContent = "Press Start for this page.";
    showPdfPage();
  }

  function selectBook(id) {
    const book = state.books.find(item => item.id === id);
    if (!book) return;

    state.current = book;
    state.bodyStartPage = Number($("bodyStartPageInput").value) || 3;
    state.pageNumber = state.bodyStartPage;
    state.sessionNotes = [];
    state.currentQuestion = "";
    state.transcript = "";

    $("levelTag").textContent = `Level ${book.level}`;
    $("bookTitle").textContent = book.title;
    $("bookMeta").textContent = `${book.pdfName} · AI reads this PDF in the background`;
    $("coachFeedback").textContent = "This book opens at the body start page. Use Cover if you want the child to read the title first.";
    $("questionBox").textContent = "AI will speak after End Page.";
    $("transcriptBox").textContent = "Transcript appears after End Page.";
    $("emailReportLink").hidden = true;
    setStatus(`Ready at page ${state.pageNumber}. Goal: about ${DAILY_PAGE_GOAL} pages today.`);
    showPdfPage();
    renderBooks();
  }

  async function loadBooks() {
    $("bookList").innerHTML = '<p class="status">Scanning library...</p>';
    try {
      const res = await fetch("/api/books", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.books = data.books || [];
      $("libraryPath").textContent = data.libraryDir || "";
      setAiReady(Boolean(data.aiReady));
      renderBooks();
      if (state.books[0]) selectBook(state.books[0].id);
      const savedKey = localStorage.getItem(STORE_KEY);
      if (savedKey && !data.aiReady) await saveApiKey(savedKey, true);
    } catch (err) {
      $("libraryPath").textContent = "Scan failed";
      $("bookList").innerHTML = `<p class="status">${esc(err.message)}</p>`;
      setAiReady(false);
    }
  }

  function createRecorder(onStop) {
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const options = {};
      if (MediaRecorder.isTypeSupported("audio/webm")) options.mimeType = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/mp4")) options.mimeType = "audio/mp4";
      const recorder = new MediaRecorder(stream, options);
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach(track => track.stop());
        onStop();
      });
      return recorder;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function formatCoach(coach) {
    const parts = [];
    if (coach.child_message) parts.push(coach.child_message);
    if (coach.priority_word) parts.push(`Try this word: ${coach.priority_word}`);
    if (coach.vocab_words && coach.vocab_words.length) parts.push(`Word to learn: ${coach.vocab_words[0]}`);
    if (coach.suggested_answer_starter) parts.push(`Sentence starter: ${coach.suggested_answer_starter}`);
    if (coach.parent_note_zh) parts.push(`Parent note: ${coach.parent_note_zh}`);
    return parts.filter(Boolean).join("\n\n") || "AI did not return feedback.";
  }

  async function startPage() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("This browser cannot record here. On iPad, microphone may require HTTPS.");
      return;
    }

    window.speechSynthesis && window.speechSynthesis.cancel();
    state.pageChunks = [];
    state.pageRecorder = await createRecorder(() => {
      const blob = new Blob(state.pageChunks, { type: state.pageRecorder.mimeType || "audio/webm" });
      $("recordPlayback").src = URL.createObjectURL(blob);
      $("recordPlayback").hidden = false;
      processPage(blob).catch(err => {
        $("coachFeedback").textContent = err.message;
        speak("I could not check that page. Please try again.");
        setStatus("AI check failed. You can try this page again.");
        updateButtons();
      });
    });
    state.pageRecorder.addEventListener("dataavailable", event => {
      if (event.data.size) state.pageChunks.push(event.data);
    });
    state.pageRecorder.start();
    setStatus(`Recording page ${state.pageNumber}. Press End Page when the child finishes.`);
    $("coachFeedback").textContent = "Listening...";
    updateButtons();
  }

  function togglePause() {
    if (!state.pageRecorder) return;
    if (state.pageRecorder.state === "recording") {
      state.pageRecorder.pause();
      setStatus(`Paused on page ${state.pageNumber}. Press Resume or End Page.`);
    } else if (state.pageRecorder.state === "paused") {
      state.pageRecorder.resume();
      setStatus(`Recording page ${state.pageNumber}. Press End Page when finished.`);
    }
    updateButtons();
  }

  function endPage() {
    if (state.pageRecorder && (state.pageRecorder.state === "recording" || state.pageRecorder.state === "paused")) {
      state.pageRecorder.stop();
      setStatus("Sending this page to AI...");
      updateButtons();
    }
  }

  async function processPage(blob) {
    const audioDataUrl = await blobToDataUrl(blob);
    $("coachFeedback").textContent = "AI is checking the reading and preparing a voice question...";
    const data = await postJson("/api/coach/page", {
      bookId: state.current.id,
      pageNumber: state.pageNumber,
      audioDataUrl
    });

    const coach = data.coach || {};
    const feedback = formatCoach(coach);
    state.transcript = data.transcript || "";
    state.currentQuestion = coach.question || "";
    $("transcriptBox").textContent = state.transcript ? `Reading: ${state.transcript}` : "No transcript returned.";
    $("coachFeedback").textContent = feedback;
    $("questionBox").textContent = state.currentQuestion ? "AI asked a question out loud. Press Answer to reply." : "No question returned.";

    state.sessionNotes.push({
      page: state.pageNumber,
      transcript: state.transcript,
      feedback,
      question: state.currentQuestion,
      childAnswer: "",
      answerFeedback: ""
    });

    speak(`${coach.child_message || ""} ${coach.priority_word ? "Try this word: " + coach.priority_word + "." : ""} ${coach.vocab_words && coach.vocab_words[0] ? "Word to learn: " + coach.vocab_words[0] + "." : ""} ${state.currentQuestion || ""}`);
    setStatus(`Page ${state.pageNumber} finished. AI asked a question. Press Answer when the child replies.`);
    updateButtons();
  }

  async function startAnswer() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("This browser cannot record answers here.");
      return;
    }

    window.speechSynthesis && window.speechSynthesis.cancel();
    state.answerChunks = [];
    state.answerRecorder = await createRecorder(() => {
      const blob = new Blob(state.answerChunks, { type: state.answerRecorder.mimeType || "audio/webm" });
      processAnswer(blob).catch(err => {
        $("coachFeedback").textContent = err.message;
        speak("I could not hear the answer clearly. Please try again.");
        updateButtons();
      });
    });
    state.answerRecorder.addEventListener("dataavailable", event => {
      if (event.data.size) state.answerChunks.push(event.data);
    });
    state.answerRecorder.start();
    setStatus("Listening to the child's answer. Press End Answer when finished.");
    $("coachFeedback").textContent = "Listening to answer...";
    updateButtons();
  }

  function endAnswer() {
    if (state.answerRecorder && state.answerRecorder.state === "recording") {
      state.answerRecorder.stop();
      setStatus("Sending the answer to AI...");
      updateButtons();
    }
  }

  async function processAnswer(blob) {
    const audioDataUrl = await blobToDataUrl(blob);
    $("coachFeedback").textContent = "AI is listening to the answer...";
    const data = await postJson("/api/coach/answer-audio", {
      bookId: state.current.id,
      pageNumber: state.pageNumber,
      question: state.currentQuestion,
      audioDataUrl
    });

    const coach = data.coach || {};
    const childAnswer = data.childAnswer || "";
    const feedback = formatCoach(coach);
    $("coachFeedback").textContent = feedback;
    if (coach.question) state.currentQuestion = coach.question;
    $("questionBox").textContent = state.currentQuestion ? "AI spoke. Press Answer to reply again, or go to the next page." : "No follow-up question.";
    $("transcriptBox").textContent = [`Reading: ${state.transcript || ""}`, `Answer: ${childAnswer}`].join("\n\n");

    const note = state.sessionNotes[state.sessionNotes.length - 1];
    if (note) {
      note.childAnswer = childAnswer;
      note.answerFeedback = feedback;
    }

    speak(`${coach.child_message || ""} ${coach.suggested_answer_starter ? "Try saying: " + coach.suggested_answer_starter + "." : ""} ${state.currentQuestion || ""}`);
    setStatus("AI responded. Continue answering, or go to the next page.");
    updateButtons();
  }

  function setNewPage(pageNumber) {
    state.pageNumber = Math.max(1, Number(pageNumber) || 1);
    state.currentQuestion = "";
    $("questionBox").textContent = "AI will speak after End Page.";
    $("coachFeedback").textContent = "Press Start for this page.";
    showPdfPage();
  }

  function goCover() {
    setNewPage(1);
    setStatus("Cover mode. The child can read the title, then press Start Body.");
  }

  function goBody() {
    state.bodyStartPage = Number($("bodyStartPageInput").value) || 3;
    setNewPage(state.bodyStartPage);
    setStatus(`Body mode. Starting at page ${state.bodyStartPage}.`);
  }

  async function finishToday() {
    const btn = $("finishBtn");
    btn.dataset.oldText = btn.textContent;
    btn.textContent = "Writing...";
    btn.disabled = true;
    try {
      const data = await postJson("/api/coach/report", {
        bookId: state.current.id,
        pagesRead: state.sessionNotes.map(note => note.page),
        sessionNotes: state.sessionNotes
      });
      const report = (data.coach && data.coach.report_zh) || formatCoach(data.coach || {});
      const subject = encodeURIComponent(`Yumi Reading Report - ${state.current.title}`);
      const body = encodeURIComponent(report);
      const link = $("emailReportLink");
      link.href = `mailto:${data.emailTo || "hongshunli0207@gmail.com"}?subject=${subject}&body=${body}`;
      link.hidden = false;
      $("coachFeedback").textContent = "Today's reading is finished. I opened an email draft with the parent report.";
      setStatus("Report ready. Opening an email draft for the parent.");
      speak("Great reading today. We are finished.");
      window.location.href = link.href;
    } catch (err) {
      $("coachFeedback").textContent = err.message;
    } finally {
      btn.textContent = btn.dataset.oldText || "Finish Today";
      updateButtons();
    }
  }

  async function saveApiKey(keyOverride, silent) {
    const btn = $("saveKeyBtn");
    const apiKey = keyOverride || $("apiKeyInput").value.trim();
    if (!silent) {
      btn.dataset.oldText = btn.textContent;
      btn.textContent = "Saving...";
      btn.disabled = true;
    }
    try {
      const data = await postJson("/api/settings/openai-key", { apiKey });
      localStorage.setItem(STORE_KEY, apiKey);
      $("apiKeyInput").value = "";
      setAiReady(Boolean(data.aiReady));
      if (!silent) $("coachFeedback").textContent = "Key saved on this device. Press Start when ready.";
    } catch (err) {
      setAiReady(false);
      if (!silent) $("coachFeedback").textContent = err.message;
    } finally {
      if (!silent) {
        btn.textContent = btn.dataset.oldText || "Save on this device";
        updateButtons();
      }
    }
  }

  $("refreshBtn").addEventListener("click", loadBooks);
  $("startPageBtn").addEventListener("click", () => startPage().catch(err => {
    setStatus(`Recording failed: ${err.message}`);
    updateButtons();
  }));
  $("pausePageBtn").addEventListener("click", togglePause);
  $("endPageBtn").addEventListener("click", endPage);
  $("answerBtn").addEventListener("click", () => startAnswer().catch(err => {
    setStatus(`Answer recording failed: ${err.message}`);
    updateButtons();
  }));
  $("endAnswerBtn").addEventListener("click", endAnswer);
  $("prevPageBtn").addEventListener("click", () => setNewPage(state.pageNumber - 1));
  $("nextPageBtn").addEventListener("click", () => setNewPage(state.pageNumber + 1));
  $("coverBtn").addEventListener("click", goCover);
  $("bodyBtn").addEventListener("click", goBody);
  $("bodyStartPageInput").addEventListener("change", () => {
    state.bodyStartPage = Number($("bodyStartPageInput").value) || 3;
  });
  $("finishBtn").addEventListener("click", finishToday);
  $("saveKeyBtn").addEventListener("click", () => saveApiKey());

  loadBooks();
})();
