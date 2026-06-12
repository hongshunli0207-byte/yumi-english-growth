const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const LIBRARY_DIR = process.env.YUMI_LIBRARY_DIR ||
  "F:\\\u6865\u6881\u4e66\\1_\u6865\u6881\u4e66\u301047\u5957\u3011\\33.\u79d1\u666e\u539f\u7248learning ladders1-3\u7ea7\u5168\u5957\u7535\u5b50\u7248pdf30\u4e2a+\u97f3\u989129\u4e2a";
const DEFAULT_OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
let runtimeOpenAIKey = "";
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
const pdfCache = new Map();

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const MEDIA_TYPES = {
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg"
};

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(json);
}

function getOpenAIKey() {
  return runtimeOpenAIKey || DEFAULT_OPENAI_API_KEY;
}

function getBookById(bookId) {
  return getBooks().find(item => item.id === bookId);
}

function getPdfInput(book) {
  const cached = pdfCache.get(book.pdfPath);
  if (cached) return cached;
  const base64 = fs.readFileSync(book.pdfPath).toString("base64");
  const input = {
    type: "input_file",
    filename: book.pdfName,
    file_data: `data:application/pdf;base64,${base64}`
  };
  pdfCache.set(book.pdfPath, input);
  return input;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 30 * 1024 * 1024) {
        reject(new Error("Request is too large. Record a shorter clip."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("Invalid JSON body.")); }
    });
    req.on("error", reject);
  });
}

function cleanTitle(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/\u6807\u9898\u65e0\u97f3/g, "")
    .replace(/\u65e0\u97f3/g, "")
    .replace(/\d+\u9875\u9ad8\u97f3/g, "")
    .replace(/[．.。]/g, "")
    .replace(/[-_\s]+$/g, "")
    .trim();
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    if (entry.isFile()) out.push(full);
  }
  return out;
}

function scanLibrary(limit = 5) {
  const files = listFiles(LIBRARY_DIR);
  const groups = new Map();

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (![".pdf", ".mp3", ".m4a", ".aac", ".wav"].includes(ext)) continue;
    const title = cleanTitle(path.basename(filePath));
    if (!title) continue;
    const level = path.relative(LIBRARY_DIR, path.dirname(filePath)).split(path.sep)[0] || "1";
    const key = `${level}:${title}`;
    const item = groups.get(key) || { title, level, pdf: null, audio: null };
    if (ext === ".pdf") item.pdf = filePath;
    else if (!item.audio) item.audio = filePath;
    groups.set(key, item);
  }

  return Array.from(groups.values())
    .filter(item => item.pdf && item.audio)
    .sort((a, b) => Number(a.level) - Number(b.level) || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, limit)
    .map((item, index) => ({
      id: `book-${index + 1}`,
      title: item.title,
      level: item.level,
      pdfUrl: `/api/file?kind=pdf&id=book-${index + 1}`,
      audioUrl: `/api/file?kind=audio&id=book-${index + 1}`,
      pdfName: path.basename(item.pdf),
      audioName: path.basename(item.audio),
      pdfPath: item.pdf,
      audioPath: item.audio
    }));
}

let cachedBooks = null;
function getBooks() {
  if (!cachedBooks) cachedBooks = scanLibrary(5);
  return cachedBooks;
}

function getCoachSystemPrompt() {
  return [
    "You are an AI Reading Coach for a 7-year-old child learning English.",
    "Be warm, brief, and specific. Never sound like an exam machine.",
    "Use simple English for child-facing messages. Use Chinese for parent-facing notes and reports.",
    "Ask only one question at a time.",
    "If the child answer is too short, guide her to a complete sentence and a because sentence.",
    "Do not invent book content. Use only the passage and transcript provided.",
    "For reading feedback, correct at most one priority word or phrase.",
    "Do not give pronunciation scores. Say 'try this word' instead of scoring.",
    "Return valid JSON only."
  ].join("\n");
}

async function callOpenAIJson(payload) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set. Add it in PowerShell, then restart local-server.js.");
    err.statusCode = 400;
    throw err;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    const err = new Error(text || `OpenAI error ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = JSON.parse(text);
  const output = data.output_text || (data.output || [])
    .flatMap(item => item.content || [])
    .map(item => item.text || "")
    .join("");
  return JSON.parse(output);
}

async function callOpenAIJsonWithContent(content) {
  return callOpenAIJson({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content: getCoachSystemPrompt()
      },
      {
        role: "user",
        content
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "reading_coach_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            child_message: { type: "string" },
            parent_note_zh: { type: "string" },
            priority_word: { type: "string" },
            question: { type: "string" },
            suggested_answer_starter: { type: "string" },
            report_zh: { type: "string" },
            vocab_words: { type: "array", items: { type: "string" } }
          },
          required: [
            "child_message",
            "parent_note_zh",
            "priority_word",
            "question",
            "suggested_answer_starter",
            "report_zh",
            "vocab_words"
          ]
        }
      }
    }
  });
}

async function coachJson(task, input) {
  return callOpenAIJson({
    model: TEXT_MODEL,
    input: [
      { role: "system", content: getCoachSystemPrompt() },
      { role: "user", content: `Task: ${task}\n\n${JSON.stringify(input, null, 2)}` }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "reading_coach_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            child_message: { type: "string" },
            parent_note_zh: { type: "string" },
            priority_word: { type: "string" },
            question: { type: "string" },
            suggested_answer_starter: { type: "string" },
            report_zh: { type: "string" },
            vocab_words: { type: "array", items: { type: "string" } }
          },
          required: [
            "child_message",
            "parent_note_zh",
            "priority_word",
            "question",
            "suggested_answer_starter",
            "report_zh",
            "vocab_words"
          ]
        }
      }
    }
  });
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match || !match[2]) throw new Error("Missing audio recording.");
  return {
    mime: match[1] || "audio/webm",
    buffer: Buffer.from(match[3], "base64")
  };
}

async function transcribeAudio(dataUrl, referenceText) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set. Add it in PowerShell, then restart local-server.js.");
    err.statusCode = 400;
    throw err;
  }

  const audio = parseDataUrl(dataUrl);
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "json");
  form.append("prompt", `A child is reading this passage aloud. Passage: ${String(referenceText || "").slice(0, 1200)}`);
  form.append("file", new Blob([audio.buffer], { type: audio.mime }), `reading.${audio.mime.includes("mp4") ? "mp4" : "webm"}`);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}` },
    body: form
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error(text || `OpenAI transcription error ${response.status}`);
    err.statusCode = response.status;
    throw err;
  }
  const data = JSON.parse(text);
  return data.text || "";
}

async function handleAi(req, res, url) {
  try {
    const body = await readJson(req);

    if (url.pathname === "/api/ai/check-reading") {
      const transcript = await transcribeAudio(body.audioDataUrl, body.referenceText);
      const coach = await coachJson("Check the child's oral reading against the passage. Find only one priority word or phrase to practice. Do not score pronunciation.", {
        bookTitle: body.bookTitle,
        passage: body.referenceText,
        transcript
      });
      sendJson(res, 200, { transcript, coach });
      return;
    }

    if (url.pathname === "/api/ai/question") {
      const coach = await coachJson("Ask one child-friendly reading comprehension question based only on the passage. Prefer What happened, Why, feeling, what would you do, or tell me about a time when.", {
        bookTitle: body.bookTitle,
        passage: body.referenceText
      });
      sendJson(res, 200, { coach });
      return;
    }

    if (url.pathname === "/api/ai/answer") {
      const coach = await coachJson("Respond to the child's answer. If it is short, guide her to a full sentence and a because sentence. Ask only one follow-up question.", {
        bookTitle: body.bookTitle,
        passage: body.referenceText,
        question: body.question,
        childAnswer: body.childAnswer
      });
      sendJson(res, 200, { coach });
      return;
    }

    if (url.pathname === "/api/ai/report") {
      const coach = await coachJson("Write a concise Chinese parent report for this reading session.", {
        bookTitle: body.bookTitle,
        passage: body.referenceText,
        transcript: body.transcript,
        readingFeedback: body.readingFeedback,
        question: body.question,
        childAnswer: body.childAnswer,
        answerFeedback: body.answerFeedback
      });
      sendJson(res, 200, { coach });
      return;
    }

    sendJson(res, 404, { error: "AI endpoint not found" });
  } catch (err) {
    sendJson(res, err.statusCode || 500, { error: err.message });
  }
}

async function handleCoach(req, res, url) {
  try {
    const body = await readJson(req);
    const book = getBookById(body.bookId);
    if (!book) {
      sendJson(res, 404, { error: "Book not found" });
      return;
    }

    if (url.pathname === "/api/coach/page") {
      const transcript = await transcribeAudio(body.audioDataUrl, `Book: ${book.title}. Page ${body.pageNumber}.`);
      const coach = await callOpenAIJsonWithContent([
        getPdfInput(book),
        {
          type: "input_text",
          text: [
            `Book title: ${book.title}`,
            `The child just read page ${body.pageNumber}.`,
            `Child transcript: ${transcript}`,
            "Use the PDF as the book source. Focus on the current page if you can identify it.",
            "Give the child one warm reading correction, teach one useful word, and ask one comprehension question.",
            "Do not score. Correct at most one priority word or phrase. Do not mention that you are reading a PDF."
          ].join("\n")
        }
      ]);
      sendJson(res, 200, { transcript, coach });
      return;
    }

    if (url.pathname === "/api/coach/answer") {
      const coach = await callOpenAIJsonWithContent([
        getPdfInput(book),
        {
          type: "input_text",
          text: [
            `Book title: ${book.title}`,
            `Current page: ${body.pageNumber}`,
            `AI question: ${body.question}`,
            `Child answer: ${body.childAnswer}`,
            "Respond like a kind reading teacher. If the answer is short, help the child make a complete sentence with because.",
            "Ask only one follow-up question."
          ].join("\n")
        }
      ]);
      sendJson(res, 200, { coach });
      return;
    }

    if (url.pathname === "/api/coach/answer-audio") {
      const childAnswer = await transcribeAudio(body.audioDataUrl, `Book: ${book.title}. Child is answering: ${body.question || ""}`);
      const coach = await callOpenAIJsonWithContent([
        getPdfInput(book),
        {
          type: "input_text",
          text: [
            `Book title: ${book.title}`,
            `Current page: ${body.pageNumber}`,
            `AI question: ${body.question}`,
            `Child answer transcript: ${childAnswer}`,
            "Respond like a kind reading teacher. If the answer is short, help the child make a complete sentence with because.",
            "Ask only one follow-up question."
          ].join("\n")
        }
      ]);
      sendJson(res, 200, { childAnswer, coach });
      return;
    }

    if (url.pathname === "/api/coach/report") {
      const coach = await callOpenAIJsonWithContent([
        getPdfInput(book),
        {
          type: "input_text",
          text: [
            `Book title: ${book.title}`,
            `Pages read today: ${body.pagesRead}`,
            `Session notes JSON: ${JSON.stringify(body.sessionNotes || [])}`,
            "Write a Chinese parent report.",
            "Include: reading content, oral reading performance, wrong words, comprehension, expression issues, review words, tomorrow suggestion."
          ].join("\n")
        }
      ]);
      sendJson(res, 200, { coach, emailTo: "hongshunli0207@gmail.com" });
      return;
    }

    sendJson(res, 404, { error: "Coach endpoint not found" });
  } catch (err) {
    sendJson(res, err.statusCode || 500, { error: err.message });
  }
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/local-reader.html" : pathname;
  const target = path.resolve(ROOT_DIR, "." + decodeURIComponent(safePath));
  if (!isInside(ROOT_DIR, target) && target !== path.join(ROOT_DIR, "local-reader.html")) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    res.writeHead(200, { "content-type": STATIC_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(target).pipe(res);
  });
}

function streamMedia(req, res, book, kind) {
  const filePath = kind === "pdf" ? book.pdfPath : book.audioPath;
  if (!filePath || !isInside(LIBRARY_DIR, filePath)) {
    sendJson(res, 404, { error: "File not found" });
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }

    const type = MEDIA_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "content-type": type,
        "content-length": end - start + 1,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "accept-ranges": "bytes"
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "content-type": type,
      "content-length": stat.size,
      "accept-ranges": "bytes",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname.startsWith("/api/ai/")) {
    handleAi(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/coach/")) {
    handleCoach(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/settings/openai-key") {
    readJson(req)
      .then(body => {
        const key = String(body.apiKey || "").trim();
        if (!key.startsWith("sk-")) {
          sendJson(res, 400, { error: "This does not look like an OpenAI API key." });
          return;
        }
        runtimeOpenAIKey = key;
        sendJson(res, 200, { ok: true, aiReady: true });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  if (url.pathname === "/api/books") {
    try {
      cachedBooks = null;
      sendJson(res, 200, { libraryDir: LIBRARY_DIR, books: getBooks(), aiReady: Boolean(getOpenAIKey()) });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  if (url.pathname === "/api/file") {
    const id = url.searchParams.get("id");
    const kind = url.searchParams.get("kind");
    const book = getBooks().find(item => item.id === id);
    if (!book || !["pdf", "audio"].includes(kind)) {
      sendJson(res, 404, { error: "Book file not found" });
      return;
    }
    streamMedia(req, res, book, kind);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Yumi local reader: http://localhost:${PORT}/local-reader.html`);
  console.log(`Library: ${LIBRARY_DIR}`);
  console.log(`OpenAI: ${getOpenAIKey() ? "ready" : "missing OPENAI_API_KEY"}`);
});
