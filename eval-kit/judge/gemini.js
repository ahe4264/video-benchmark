// Thin wrapper around the Gemini API for the judge: key loading, video upload (cached),
// JSON-schema calls with retries, and a token-usage log.
//
// Key: put GEMINI_API_KEY=... in video-benchmark/.env (one level above this folder).
// Model: GEMINI_MODEL in the same file, or pass { model } per call.
const fs = require('fs');
const path = require('path');
const { GoogleGenAI, createPartFromUri } = require('@google/genai');

// eval-kit/.env, else the repo-root .env one level further up.
const ENV = [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')].find((f) => fs.existsSync(f)) || path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV)) process.loadEnvFile(ENV);
if (!process.env.GEMINI_API_KEY) throw new Error(`GEMINI_API_KEY not set — add it to ${ENV}`);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview'; // the model the v2 results used
const CACHE_DIR = path.join(__dirname, 'cache');
const FILES = path.join(CACHE_DIR, 'files.json');
const USAGE = path.join(CACHE_DIR, 'usage.jsonl');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readCache = () => (fs.existsSync(FILES) ? JSON.parse(fs.readFileSync(FILES, 'utf8')) : {});

// Upload a local video once; reuse it until the Files API expires it (~48h).
async function uploadVideo(file) {
  const abs = path.resolve(file);
  const st = fs.statSync(abs);
  const key = `${abs}|${st.size}|${st.mtimeMs}`;
  const cache = readCache();
  const hit = cache[key];
  if (hit && Date.parse(hit.expirationTime) - Date.now() > 3600e3) {
    try { const f = await ai.files.get({ name: hit.name }); if (f.state === 'ACTIVE') return f; } catch {}
  }
  let f = await ai.files.upload({ file: abs, config: { mimeType: 'video/mp4', displayName: require('crypto').createHash('sha1').update(abs).digest('hex').slice(0, 12) /* blind: no system name */ } });
  while (f.state === 'PROCESSING') { await sleep(3000); f = await ai.files.get({ name: f.name }); }
  if (f.state !== 'ACTIVE') throw new Error(`upload of ${abs} ended in state ${f.state}`);
  const fresh = readCache();
  fresh[key] = { name: f.name, uri: f.uri, mimeType: f.mimeType, expirationTime: f.expirationTime };
  fs.writeFileSync(FILES, JSON.stringify(fresh, null, 2));
  return f;
}

const videoPart = (f) => createPartFromUri(f.uri, f.mimeType);
const imagePart = (file) => ({
  inlineData: { data: fs.readFileSync(file).toString('base64'), mimeType: /\.png$/i.test(file) ? 'image/png' : 'image/jpeg' },
});

// Call the model with a list of parts and get back parsed JSON matching `schema`.
// Explicit context cache for a shared prefix (system prompt + parts, e.g. one lesson's video). With a cache, a
// request may not set its own system instruction, and media resolution must be set on the cached part itself.
async function createCache({ parts, system, model = DEFAULT_MODEL, ttlSeconds = 1800, tag = '' }) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ai.caches.create({ model, config: { contents: [{ role: 'user', parts }], systemInstruction: system, ttl: `${ttlSeconds}s`, displayName: tag.slice(0, 60) } });
    } catch (e) {
      const status = e.status || e.code;
      const network = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(`${e.message} ${e.cause && e.cause.code}`);
      if (!([429, 500, 502, 503, 504].includes(status) || network) || attempt >= 6) throw e;
      await sleep(Math.min(120e3, 5000 * 2 ** (attempt - 1)));
    }
  }
}
const deleteCache = (name) => ai.caches.delete({ name }).catch(() => {});

async function generateJSON({ parts, schema, system, model = DEFAULT_MODEL, temperature = 0.2, tag = '', mediaResolution, cachedContent }) {
  const config = { responseMimeType: 'application/json', responseJsonSchema: schema, temperature };
  if (cachedContent) config.cachedContent = cachedContent;
  else {
    if (system) config.systemInstruction = system;
    if (mediaResolution) config.mediaResolution = mediaResolution;
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config });
      fs.appendFileSync(USAGE, JSON.stringify({ t: new Date().toISOString(), model, tag, usage: res.usageMetadata }) + '\n');
      return { json: JSON.parse(res.text), usage: res.usageMetadata, model };
    } catch (e) {
      const status = e.status || e.code;
      const network = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(`${e.message} ${e.cause && e.cause.code}`);
      const retryable = [429, 500, 502, 503, 504].includes(status) || e instanceof SyntaxError || network;
      if (!retryable || attempt >= 6) throw e;
      const wait = Math.min(120e3, 5000 * 2 ** (attempt - 1));
      console.warn(`[${tag}] ${status || e.name}; retry ${attempt} in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

module.exports = { ai, uploadVideo, videoPart, imagePart, generateJSON, createCache, deleteCache, DEFAULT_MODEL };
