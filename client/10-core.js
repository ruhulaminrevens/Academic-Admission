// ---- Client core: state, DOM helpers, API, toasts, dialogs ----
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const html = (strings, ...values) => strings.reduce((out, text, i) => out + text + (i < values.length ? values[i] : ''), '');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const debounce = (fn, wait = 200) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; };
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

const S = { session: { signedIn: false, profile: null, rank: 0, can: {} }, site: {}, version: '', installPrompt: null, path: location.pathname, loadId: 0 };
const ctxNow = () => ({ now: Date.now(), user: { signedIn: S.session.signedIn, profile: S.session.profile, rank: S.session.rank || 0 }, settings: S.site || {} });

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', headers: { ...(options.headers || {}) }, credentials: 'same-origin' };
  if (options.body !== undefined) {
    if (options.raw) init.body = options.body;
    else { init.body = JSON.stringify(options.body); init.headers['Content-Type'] = 'application/json'; }
  }
  let res;
  try { res = await fetch('/api' + path, init); }
  catch { throw new ApiError(0, 'Network error. Check your connection and try again.'); }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401) S.session = { ...S.session, signedIn: false };
    throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status}).`);
  }
  return data;
}

// ---------- toasts ----------
function toast(message, kind = 'info', ms = 4200) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast toast--' + kind;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info', 18)}<span></span><button type="button" aria-label="Dismiss">${icon('close', 14)}</button>`;
  el.querySelector('span').textContent = message;
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.querySelector('button').addEventListener('click', remove);
  host.appendChild(el);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(remove, ms);
}
const fail = error => toast(error?.message || 'Something went wrong.', 'error', 6000);

// run an async action on a button with a busy state
async function busy(button, task) {
  if (button?.disabled) return;
  if (button) { button.disabled = true; button.classList.add('is-busy'); }
  try { return await task(); }
  catch (error) { fail(error); }
  finally { if (button) { button.disabled = false; button.classList.remove('is-busy'); } }
}

// ---------- dialogs ----------
function openDialog(content, { label = 'Dialog', wide = false } = {}) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog' + (wide ? ' dialog--wide' : '');
    dialog.setAttribute('aria-label', label);
    dialog.innerHTML = content;
    document.body.appendChild(dialog);
    let result = false;
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('click', event => { if (event.target.closest('[data-close]')) dialog.close(); });
    dialog.showModal();
    dialog._finish = value => { result = value; dialog.close(); };
    const first = $('[autofocus], input, textarea, select, button.btn--primary', dialog);
    if (first) first.focus();
    dialog.dispatchEvent(new CustomEvent('ready'));
    resolve.dialog = dialog;
    openDialog.last = dialog;
  });
}

function formDialog({ title, text = '', fields = [], submit = 'Save', danger = false }) {
  const field = f => {
    const common = `name="${esc(f.name)}" ${f.required ? 'required' : ''} ${f.max ? `maxlength="${f.max}"` : ''} ${f.min ? `minlength="${f.min}"` : ''}`;
    let control;
    if (f.type === 'select') control = `<select ${common}>${f.options.map(o => `<option value="${esc(o.value ?? o)}">${esc(o.label ?? o)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') control = `<textarea ${common} placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
    else control = `<input ${common} type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
    return `<label>${esc(f.label)}${control}</label>`;
  };
  const promise = openDialog(`<form method="dialog" class="dialog-body"><h2>${esc(title)}</h2>${text ? `<p class="muted">${esc(text)}</p>` : ''}
    ${fields.map(field).join('')}<div class="dialog-foot"><button class="btn btn--ghost" type="button" data-close>Cancel</button>
    <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="submit">${esc(submit)}</button></div></form>`, { label: title });
  const dialog = openDialog.last;
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    dialog._finish(data);
  });
  return promise;
}

const confirmDialog = (title, text, confirm = 'Confirm', danger = false) =>
  formDialog({ title, text, submit: confirm, danger }).then(Boolean);

// ---------- formatting / misc ----------
const clock = {
  time: ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' }),
};
const absoluteUrl = path => path.startsWith('http') ? path : location.origin + path;
const compactNumber = n => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const percent = (a, b) => b ? Math.round((a / b) * 100) : 0;
const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};
