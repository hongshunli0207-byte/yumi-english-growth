const crypto = require("crypto");

const CACHE = new Map();

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

    if (!apiKey) {
      return json(500, {
        error: "Missing ELEVENLABS_API_KEY. Please set it in Netlify Environment variables."
      });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const text = String(body.text || "").trim();
    if (!text) {
      return json(400, { error: "Missing text" });
    }

    // This app only needs single words or very short phrases.
    if (text.length > 80) {
      return json(400, { error: "Text too long for this learning app" });
    }

    const normalized = text.replace(/\s+/g, " ");
    const cacheKey = crypto.createHash("sha1")
      .update(`${voiceId}|${modelId}|${normalized}`)
      .digest("hex");

    if (CACHE.has(cacheKey)) {
      const cached = CACHE.get(cacheKey);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
          "X-Yumi-TTS-Cache": "hit"
        },
        body: cached,
        isBase64Encoded: true
      };
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text: normalized,
        model_id: modelId,
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.85,
          style: 0.15,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return json(response.status, {
        error: "ElevenLabs API error",
        status: response.status,
        detail: errText.slice(0, 500)
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    // Small in-memory cache for warm function instances.
    CACHE.set(cacheKey, base64Audio);
    if (CACHE.size > 200) {
      const firstKey = CACHE.keys().next().value;
      CACHE.delete(firstKey);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Yumi-TTS-Cache": "miss"
      },
      body: base64Audio,
      isBase64Encoded: true
    };
  } catch (error) {
    return json(500, {
      error: "TTS function failed",
      detail: error && error.message ? error.message : String(error)
    });
  }
};
