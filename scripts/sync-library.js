const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_LIBRARY_DIR =
  "F:\\\u6865\u6881\u4e66\\1_\u6865\u6881\u4e66\u301047\u5957\u3011\\33.\u79d1\u666e\u539f\u7248learning ladders1-3\u7ea7\u5168\u5957\u7535\u5b50\u7248pdf30\u4e2a+\u97f3\u989129\u4e2a";

const LIBRARY_DIR = process.env.YUMI_LIBRARY_DIR || DEFAULT_LIBRARY_DIR;
const OUT_FILE = process.env.YUMI_LIBRARY_INDEX ||
  path.join(__dirname, "..", "data", "library-index.json");

const AUDIO_EXTS = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg"]);
const BOOK_EXTS = new Set([".pdf"]);

function cleanTitle(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/\u6807\u9898\u65e0\u97f3/g, "")
    .replace(/\u65e0\u97f3/g, "")
    .replace(/\d+\u9875\u9ad8\u97f3/g, "")
    .replace(/[\uFF0E.\u3002]/g, "")
    .replace(/[-_\s]+$/g, "")
    .trim();
}

function stableId(parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function fileInfo(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase(),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

function scanLibrary() {
  const startedAt = new Date().toISOString();
  if (!fs.existsSync(LIBRARY_DIR)) {
    throw new Error(`Library directory not found: ${LIBRARY_DIR}`);
  }

  const groups = new Map();
  const orphanFiles = [];
  const files = listFiles(LIBRARY_DIR).map(fileInfo);

  for (const file of files) {
    if (!BOOK_EXTS.has(file.ext) && !AUDIO_EXTS.has(file.ext)) continue;
    const title = cleanTitle(file.name);
    const level = path.relative(LIBRARY_DIR, path.dirname(file.path)).split(path.sep)[0] || "unknown";
    const key = `${level}:${title}`;
    const group = groups.get(key) || {
      id: stableId([level, title]),
      title,
      level,
      files: [],
      pdf: null,
      audio: null
    };
    group.files.push(file);
    if (BOOK_EXTS.has(file.ext)) group.pdf = file;
    if (AUDIO_EXTS.has(file.ext) && !group.audio) group.audio = file;
    groups.set(key, group);
  }

  const books = [];
  for (const group of groups.values()) {
    if (!group.pdf || !group.audio) {
      orphanFiles.push(...group.files);
      continue;
    }
    books.push({
      id: group.id,
      title: group.title,
      level: group.level,
      status: "indexed",
      hasPdf: Boolean(group.pdf),
      hasAudio: Boolean(group.audio),
      pdf: group.pdf,
      audio: group.audio,
      sourceDir: path.dirname(group.pdf.path),
      updatedAt: new Date(Math.max(
        new Date(group.pdf.modifiedAt).getTime(),
        new Date(group.audio.modifiedAt).getTime()
      )).toISOString()
    });
  }

  books.sort((a, b) => {
    const levelDiff = Number(a.level) - Number(b.level);
    return levelDiff || a.title.localeCompare(b.title, "zh-Hans-CN");
  });

  return {
    scan: {
      id: stableId([LIBRARY_DIR, startedAt]),
      libraryDir: LIBRARY_DIR,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalFiles: files.length,
      pairedBooks: books.length,
      orphanFiles: orphanFiles.length
    },
    books,
    orphanFiles
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function supabaseRequest(method, table, body, query = "") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { skipped: true };

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}${query}`, {
    method,
    headers: {
      "apikey": key,
      "authorization": `Bearer ${key}`,
      "content-type": "application/json",
      "prefer": "resolution=merge-duplicates,return=minimal"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    throw new Error(`Supabase ${table} failed: ${response.status} ${await response.text()}`);
  }
  return { skipped: false };
}

async function syncSupabase(index) {
  const scan = index.scan;
  const books = index.books.map(book => ({
    id: book.id,
    title: book.title,
    level: String(book.level),
    status: book.status,
    source_dir: book.sourceDir,
    updated_at: book.updatedAt
  }));

  const bookFiles = index.books.flatMap(book => [
    {
      id: stableId([book.id, "pdf", book.pdf.path]),
      book_id: book.id,
      kind: "pdf",
      file_name: book.pdf.name,
      local_path: book.pdf.path,
      size_bytes: book.pdf.size,
      modified_at: book.pdf.modifiedAt
    },
    {
      id: stableId([book.id, "audio", book.audio.path]),
      book_id: book.id,
      kind: "audio",
      file_name: book.audio.name,
      local_path: book.audio.path,
      size_bytes: book.audio.size,
      modified_at: book.audio.modifiedAt
    }
  ]);

  await supabaseRequest("POST", "library_scan_runs", {
    id: scan.id,
    library_dir: scan.libraryDir,
    started_at: scan.startedAt,
    finished_at: scan.finishedAt,
    total_files: scan.totalFiles,
    paired_books: scan.pairedBooks,
    orphan_files: scan.orphanFiles
  });

  if (books.length) await supabaseRequest("POST", "books", books, "?on_conflict=id");
  if (bookFiles.length) await supabaseRequest("POST", "book_files", bookFiles, "?on_conflict=id");

  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function main() {
  const index = scanLibrary();
  ensureDir(OUT_FILE);
  fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2), "utf8");
  const didSync = await syncSupabase(index);

  console.log(`Library: ${index.scan.libraryDir}`);
  console.log(`Paired books: ${index.scan.pairedBooks}`);
  console.log(`Orphan files: ${index.scan.orphanFiles}`);
  console.log(`Index written: ${OUT_FILE}`);
  console.log(didSync ? "Supabase sync: done" : "Supabase sync: skipped (missing env vars)");
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
