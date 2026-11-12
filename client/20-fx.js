// ---- Visual effects: WebGL aurora, 3D globe, tilt, reveal, counters, parallax, scroll progress ----

const themeIsLight = () => document.documentElement.getAttribute('data-theme') === 'light';

// ---------- WebGL aurora background ----------
const aurora = (() => {
  const canvas = $('#aurora');
  if (!canvas) return { refresh() {} };
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, powerPreference: 'low-power', premultipliedAlpha: false });
  if (!gl) { canvas.hidden = true; return { refresh() {} }; }
  const vertex = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fragment = `precision mediump float;
uniform vec2 r;uniform float t;uniform float l;uniform vec2 m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;vec2 q=(uv-.5)*vec2(r.x/r.y,1.);
  float s=t*.045;
  vec2 w=vec2(fbm(q*1.5+vec2(s,-s)+m*.15),fbm(q*1.5+vec2(-s,s*1.3)+5.2));
  float f=fbm(q*1.3+w*1.7+vec2(0.,s));
  vec3 c1=mix(vec3(.04,.9,.63),vec3(.02,.6,.45),l);
  vec3 c2=mix(vec3(.13,.83,.93),vec3(.1,.55,.85),l);
  vec3 c3=mix(vec3(.55,.36,.96),vec3(.6,.45,.95),l);
  vec3 c4=mix(vec3(.96,.3,.6),vec3(.98,.55,.75),l);
  vec3 col=mix(c1,c2,smoothstep(.2,.8,f));
  col=mix(col,c3,smoothstep(.35,.95,w.x)*.8);
  col=mix(col,c4,smoothstep(.55,1.,w.y)*.45);
  float vig=smoothstep(1.25,.15,length(q*vec2(.8,1.)));
  float strength=mix(.36,.2,l)*(.45+.75*f)*mix(.55,1.,vig);
  gl_FragColor=vec4(col,strength);
}`;
  const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null; };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) { canvas.hidden = true; return { refresh() {} }; }
  const program = gl.createProgram();
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.hidden = true; return { refresh() {} }; }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const u = name => gl.getUniformLocation(program, name);
  const [uR, uT, uL, uM] = [u('r'), u('t'), u('l'), u('m')];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let width = 0, height = 0, running = false, last = 0, time = Math.random() * 100, light = themeIsLight() ? 1 : 0;

  function resize() {
    const scale = Math.min(0.5, 960 / Math.max(innerWidth, 1));
    width = Math.max(2, Math.round(innerWidth * Math.max(scale, 0.3)));
    height = Math.max(2, Math.round(innerHeight * Math.max(scale, 0.3)));
    canvas.width = width; canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
  function draw() {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uR, width, height); gl.uniform1f(uT, time); gl.uniform1f(uL, light); gl.uniform2f(uM, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 33) return; // ~30fps is plenty for a soft background
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    time += dt;
    mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
    const target = themeIsLight() ? 1 : 0;
    light += (target - light) * 0.12;
    draw();
  }
  function start() { if (running || reduceMotion.matches || document.hidden) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  resize(); draw();
  addEventListener('resize', debounce(() => { resize(); draw(); }, 150));
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener?.('change', () => (reduceMotion.matches ? stop() : start()));
  addEventListener('pointermove', event => { mouse.tx = event.clientX / innerWidth - 0.5; mouse.ty = 0.5 - event.clientY / innerHeight; }, { passive: true });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); canvas.hidden = true; });
  start();
  return { refresh() { light = themeIsLight() ? 1 : 0; draw(); } };
})();

// ---------- 3D globe (canvas) ----------
let globeCleanup = null;
function initGlobe() {
  if (globeCleanup) { globeCleanup(); globeCleanup = null; }
  const canvas = $('#globe');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rad = Math.PI / 180;
  const dots = [];
  const count = innerWidth < 640 ? 520 : 820;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    dots.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius, Math.random()]);
  }
  const place = (lat, lon) => [Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad), Math.cos(lat * rad) * Math.cos(lon * rad)];
  const dhaka = place(23.81, 90.41);
  const cities = [[51.5, -0.12], [40.7, -74], [35.7, 139.7], [25.2, 55.3], [1.35, 103.8], [-33.9, 151.2], [28.6, 77.2], [24.7, 46.7], [52.5, 13.4], [37.6, 127]].map(([la, lo]) => place(la, lo));
  let yaw = -90.41 * rad - 0.35, pitch = 0.42, velocity = 0.0016, dragging = false, lastX = 0, lastY = 0, running = false, visible = true, size = 0, dpr = 1;

  function resize() {
    const box = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    size = Math.max(160, Math.round(box.width));
    canvas.width = size * dpr; canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const rotate = ([x, y, z]) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  };
  function palette() {
    return themeIsLight() ? { dot: '16,120,110', hot: '109,70,230', line: '14,140,160', ring: '15,23,42' } : { dot: '120,255,214', hot: '168,139,250', line: '34,211,238', ring: '255,255,255' };
  }
  function draw(time) {
    const c = palette(), R = size * 0.4, cx = size / 2, cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    const glow = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.35);
    glow.addColorStop(0, `rgba(${c.line},0.16)`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(${c.ring},0.10)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    // latitude rings
    for (const lat of [-60, -30, 0, 30, 60]) {
      ctx.beginPath();
      let started = false;
      for (let lon = 0; lon <= 360; lon += 6) {
        const p = rotate(place(lat, lon));
        if (p[2] < 0) { started = false; continue; }
        const x = cx + p[0] * R, y = cy - p[1] * R;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${c.ring},0.07)`; ctx.stroke();
    }
    // dots
    for (const dot of dots) {
      const p = rotate(dot);
      if (p[2] < -0.05) continue;
      const depth = (p[2] + 1) / 2;
      const r = (0.7 + dot[3] * 0.9) * (0.6 + depth) * (size / 460);
      ctx.fillStyle = `rgba(${c.dot},${(0.12 + depth * 0.7).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx + p[0] * R, cy - p[1] * R, r, 0, 7); ctx.fill();
    }
    // arcs from Dhaka
    const from = rotate(dhaka);
    for (const city of cities) {
      const to = rotate(city);
      if (from[2] < -0.2 && to[2] < -0.2) continue;
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        let v = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
        const len = Math.hypot(...v) || 1;
        const lift = 1 + Math.sin(t * Math.PI) * 0.22;
        v = v.map(x => (x / len) * lift);
        const x = cx + v[0] * R, y = cy - v[1] * R;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(${c.line},${to[2] > 0 || from[2] > 0 ? 0.28 : 0.08})`; ctx.lineWidth = 1; ctx.stroke();
      if (to[2] > 0) { ctx.fillStyle = `rgba(${c.hot},0.85)`; ctx.beginPath(); ctx.arc(cx + to[0] * R, cy - to[1] * R, 2.2 * (size / 460) + 0.6, 0, 7); ctx.fill(); }
    }
    // Dhaka marker
    if (from[2] > -0.1) {
      const x = cx + from[0] * R, y = cy - from[1] * R, pulse = (time / 1000) % 1.6 / 1.6;
      ctx.strokeStyle = `rgba(${c.hot},${(1 - pulse) * 0.8})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 22, 0, 7); ctx.stroke();
      ctx.fillStyle = `rgba(${c.hot},1)`; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
      ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = themeIsLight() ? '#1e1b4b' : '#fff';
      ctx.fillText('Dhaka', x + 10, y - 8);
    }
  }
  function frame(time) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!dragging) { yaw += velocity; velocity += (0.0016 - velocity) * 0.02; }
    draw(time);
  }
  const start = () => { if (!running && visible && !document.hidden && !reduceMotion.matches) { running = true; requestAnimationFrame(frame); } };
  const stop = () => { running = false; };
  const down = event => { dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture?.(event.pointerId); canvas.classList.add('grabbing'); };
  const move = event => {
    if (!dragging) return;
    const dx = event.clientX - lastX, dy = event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
    yaw += dx * 0.006; velocity = dx * 0.0008; pitch = Math.max(-0.9, Math.min(0.9, pitch + dy * 0.004));
    if (!running) draw(performance.now());
  };
  const up = () => { dragging = false; canvas.classList.remove('grabbing'); };
  canvas.addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); });
  observer.observe(canvas);
  const onResize = debounce(() => { resize(); draw(performance.now()); }, 150);
  addEventListener('resize', onResize);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);
  resize(); draw(0); start();
  globeCleanup = () => {
    stop(); observer.disconnect();
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisibility);
  };
}

// ---------- 3D tilt cards ----------
let tiltReady = false;
function initTilt() {
  if (tiltReady) return;
  tiltReady = true;
  let active = null, raf = 0, event = null;
  const apply = () => {
    raf = 0;
    if (!active || !event) return;
    const box = active.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width, py = (event.clientY - box.top) / box.height;
    active.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
    active.style.setProperty('--rx', ((0.5 - py) * 9).toFixed(2) + 'deg');
    active.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    active.style.setProperty('--my', (py * 100).toFixed(1) + '%');
  };
  const reset = el => { for (const name of ['--rx', '--ry']) el.style.setProperty(name, '0deg'); el.classList.remove('tilting'); };
  document.addEventListener('pointermove', e => {
    if (!finePointer.matches || reduceMotion.matches || e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tilt]');
    if (active && active !== el) reset(active);
    active = el || null;
    if (!active) return;
    active.classList.add('tilting');
    event = e;
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (active) reset(active); active = null; }, true);
}

// ---------- reveal on scroll + counters ----------
let revealObserver = null;
function countUp(el) {
  const target = Number(el.dataset.count) || 0;
  if (reduceMotion.matches || target === 0) { el.textContent = target.toLocaleString('en'); return; }
  const start = performance.now(), duration = 1100;
  const tick = now => {
    const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased).toLocaleString('en');
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function initReveal(root = document) {
  const items = $$('[data-reveal]:not(.in), [data-count]:not([data-counted])', root);
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    items.forEach(el => { el.classList.add('in'); if (el.dataset.count) { el.dataset.counted = '1'; countUp(el); } });
    return;
  }
  document.documentElement.classList.add('reveal-ready');
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        el.classList.add('in');
        if (el.dataset.count && !el.dataset.counted) { el.dataset.counted = '1'; countUp(el); }
        revealObserver.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  }
  const siblings = new Map();
  items.forEach(el => {
    const parent = el.parentElement;
    const index = siblings.get(parent) || 0;
    siblings.set(parent, index + 1);
    el.style.setProperty('--d', Math.min(index, 8) * 70 + 'ms');
    revealObserver.observe(el);
  });
  // safety net: never leave content hidden
  setTimeout(() => items.forEach(el => { if (!el.classList.contains('in')) { const box = el.getBoundingClientRect(); if (box.top < innerHeight) el.classList.add('in'); } }), 1600);
}

// ---------- hero parallax, scroll progress, topbar ----------
let parallaxReady = false;
function initScrollFx() {
  if (parallaxReady) return;
  parallaxReady = true;
  const bar = $('#progress i'), top = $('#topbar');
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    top?.classList.toggle('scrolled', scrollY > 8);
    if (!reduceMotion.matches) {
      const stage = $('.hero-stage');
      if (stage && scrollY < innerHeight * 1.2) {
        stage.style.setProperty('--sy', (scrollY * 0.12).toFixed(1) + 'px');
        const copy = $('.hero-copy');
        if (copy) copy.style.setProperty('--sy', (scrollY * -0.05).toFixed(1) + 'px');
      }
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
  document.addEventListener('pointermove', e => {
    if (reduceMotion.matches || !finePointer.matches) return;
    const stage = $('.hero-stage');
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) return;
    stage.style.setProperty('--px', ((e.clientX / innerWidth) - 0.5).toFixed(3));
    stage.style.setProperty('--py', ((e.clientY / innerHeight) - 0.5).toFixed(3));
  }, { passive: true });
}

function initFx(root = document) {
  initReveal(root);
  initGlobe();
  initTilt();
  initScrollFx();
}
