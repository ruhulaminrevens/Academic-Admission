// ---- Worker core: constants, errors, response helpers, validation, crypto ----
let ENV = {};
const SIZE_LIMIT = 5 * 1024 * 1024;
const FILE_TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };
const DEFAULT_EDITORIAL_URL = 'https://raw.githubusercontent.com/ruhulaminrevens/Academic-Admission/main/data/editorial.json';
const encoder = new TextEncoder();

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function required(condition, status, message) {
  if (!condition) throw new RequestError(status, message);
}

function clean(value, max, min = 0) {
  const text = typeof value === 'string' ? value.trim() : '';
  required(text.length >= min && text.length <= max, 400, `Use ${min}–${max} characters.`);
  return text;
}

function safeLink(value) {
  const text = clean(value, 600);
  if (!text) return '';
  const href = httpsHref(text);
  required(href, 400, 'Enter a valid HTTPS link.');
  return href;
}

// ---------- security headers ----------

function contentSecurityPolicy(url) {
  const ancestors = ENV.FRAME_ANCESTORS || "'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com";
  const rules = [
    "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
    "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "media-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'self'", `frame-ancestors ${ancestors}`,
  ];
  if (url?.protocol === 'https:') rules.push('upgrade-insecure-requests');
  return rules.join('; ');
}

function commonHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

function response(body, type, options = {}) {
  const { headers: extra, cache = 'no-store', ...init } = options;
  return new Response(body, { ...init, headers: { 'Content-Type': type, 'Cache-Control': cache, ...commonHeaders(), ...extra } });
}

function json(data, status = 200, headers) {
  return response(JSON.stringify(data), 'application/json; charset=utf-8', { status, headers });
}

function noContent() {
  return response(null, 'text/plain', { status: 204 });
}

function textResponse(body, type, cache = 'public, max-age=3600', extra = {}) {
  return response(body, type, { cache, headers: { 'Cross-Origin-Resource-Policy': 'cross-origin', ...extra } });
}

// ---------- request body ----------

async function readBytes(request, limit) {
  required(request.body && Number(request.headers.get('content-length') || 0) <= limit, 413, 'Upload exceeds the allowed size.');
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RequestError(413, 'Upload exceeds the allowed size.');
    }
    parts.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function input(request, limit = 20000) {
  required(request.headers.get('content-type')?.startsWith('application/json'), 415, 'Expected JSON.');
  let value;
  try { value = JSON.parse(new TextDecoder().decode(await readBytes(request, limit))); }
  catch (error) { if (error instanceof RequestError) throw error; }
  required(value && typeof value === 'object' && !Array.isArray(value), 400, 'Invalid JSON.');
  return value;
}

// ---------- crypto ----------

const toHex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

function siteOrigin(url) {
  try { if (ENV.SITE_URL) return new URL(ENV.SITE_URL).origin; } catch {}
  return url.origin;
}
