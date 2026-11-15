/**
 * Chapter 2 Visual Engine — INSIDE KEPLER
 * - c2-s01: Shared NASA Kepler 3D model (assets/kepler.glb) tilted ~27 deg & slowly revolving
 * - c2-s02: Two-button topic choice screen
 * - c2-s03: Optics & 42-CCD Focal Plane + Charge Counter + Digital Readout (phrase-synced)
 * - c2-s04: Attitude Control (X/Y/Z gizmo, wheels, thrusters, solar pressure) + 4-Stage Pipeline + Transit Curve (phrase-synced)
 * - c2-s05: Anatomy of the Spacecraft (transparent iframe ./anatomy/index.html)
 * - c2-s06: Mission Challenges (4 reaction wheels, July 2012 / May 2013 failures, drift/jitter, PRECISION LOST)
 * - c2-s07: K2 Revival (Sun + Ecliptic balance, 80-day wedges, 19 CAMPAIGNS, RETIRED OCTOBER 30, 2018)
 */

import { setStarfieldOpacity } from './starfield.js';
import { getSharedKeplerModel } from './visuals.js';

let activeSlideId = null;
let activePhraseIndex = 0;
let onNavigateCallback = null;
let isRunning = false;
let rafId = null;
let lastTime = performance.now();
let slideElapsed = 0;
let phraseStartTime = 0;

// 3D state for c2-s01
let ch2Renderer = null;
let ch2Scene = null;
let ch2Camera = null;
let ch2KeplerGroup = null;
let ch2KeplerInitDone = false;

// Animated state for c2-s03 (optics)
let photons = [];
let dataStreams = [];
let chargeValue = 0;

// Animated state for c2-s04 (precision)
let wheelAngle04 = 0;
let thrusterPuffs04 = [];

// Animated state for c2-s06 (challenges)
let wheelAngles06 = [0, 0, 0, 0];
let wheelSpeeds06 = [4.6, 4.6, 4.6, 4.6];
let jitterStars06 = [];

// Animated state for c2-s07 (K2)
let k2CampaignsCount = 0;
let k2WheelAngle = 0;
let k2Thrusters = [];

export function initChapter2Visuals(options = {}) {
  onNavigateCallback = typeof options.onNavigate === 'function' ? options.onNavigate : null;

  // Bind slide buttons
  document.querySelectorAll('[data-ch2-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-ch2-nav');
      if (targetId && onNavigateCallback) {
        onNavigateCallback(targetId);
      }
    });
  });

  // Listen to phrase-start custom events emitted by narrator.js and chapter2.js
  window.addEventListener('exo:phrase-start', (e) => {
    if (!e.detail) return;
    const { slideId, phraseIndex } = e.detail;
    if (slideId === activeSlideId) {
      activePhraseIndex = phraseIndex;
      phraseStartTime = slideElapsed;
    }
  });

  // Pre-seed stars for jitter visual on c2-s06
  jitterStars06 = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.8 + Math.random() * 1.4,
    a: 0.3 + Math.random() * 0.55
  }));

  window.addEventListener('resize', handleResize, { passive: true });
}

function handleResize() {
  if (ch2Renderer && ch2Camera) {
    const canvas = document.getElementById('ch2KeplerCanvas');
    if (canvas && canvas.parentElement) {
      const w = canvas.parentElement.clientWidth || window.innerWidth;
      const h = canvas.parentElement.clientHeight || window.innerHeight;
      ch2Renderer.setSize(w, h);
      ch2Camera.aspect = w / h;
      ch2Camera.updateProjectionMatrix();
    }
  }
}

export function startChapter2VisualLoop() {
  if (isRunning) return;
  isRunning = true;
  lastTime = performance.now();
  loop();
}

export function stopChapter2VisualLoop() {
  isRunning = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function setChapter2VisualSlide(slideId) {
  activeSlideId = slideId;
  activePhraseIndex = 0;
  slideElapsed = 0;
  phraseStartTime = 0;

  // Reset per-slide simulation counters
  photons = [];
  dataStreams = [];
  chargeValue = 0;
  wheelSpeeds06 = [4.6, 4.6, 4.6, 4.6];
  k2CampaignsCount = 0;
  thrusterPuffs04 = [];
  k2Thrusters = [];

  // Toggle slide panels
  document.querySelectorAll('.ch2-slide-panel').forEach(panel => {
    const match = panel.getAttribute('data-ch2-slide') === slideId;
    panel.classList.toggle('active', match);
  });

  // Starfield visibility
  if (slideId === 'c2-s01' || slideId === 'c2-s05') {
    setStarfieldOpacity(0.75);
  } else if (slideId === 'c2-s06') {
    setStarfieldOpacity(0.22);
  } else {
    setStarfieldOpacity(0.35);
  }

  // Lazy-init 3D Kepler on c2-s01
  if (slideId === 'c2-s01') {
    ensureKepler3DStage();
  }

  // Lazy-load Anatomy iframe on c2-s05
  if (slideId === 'c2-s05') {
    const frame = document.getElementById('anatomyFrame');
    if (frame && (!frame.getAttribute('src') || frame.getAttribute('src') === 'about:blank')) {
      frame.setAttribute('src', './anatomy/index.html');
    }
  }

  startChapter2VisualLoop();
}

function ensureKepler3DStage() {
  if (ch2KeplerInitDone) {
    handleResize();
    return;
  }
  const canvas = document.getElementById('ch2KeplerCanvas');
  if (!canvas || typeof THREE === 'undefined') return;
  ch2KeplerInitDone = true;

  const parent = canvas.parentElement;
  const w = (parent && parent.clientWidth) || window.innerWidth;
  const h = (parent && parent.clientHeight) || window.innerHeight;

  ch2Renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  ch2Renderer.setClearColor(0x000000, 0);
  ch2Renderer.setSize(w, h);
  ch2Renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  ch2Renderer.toneMapping = THREE.ACESFilmicToneMapping;
  ch2Renderer.toneMappingExposure = 1.15;
  ch2Renderer.outputEncoding = THREE.sRGBEncoding;

  ch2Scene = new THREE.Scene();
  ch2Camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 500);
  ch2Camera.position.set(0, 2, 42);

  ch2KeplerGroup = new THREE.Group();
  ch2KeplerGroup.rotation.z = (27 * Math.PI) / 180;
  ch2KeplerGroup.rotation.x = (14 * Math.PI) / 180;
  ch2Scene.add(ch2KeplerGroup);

  const keyLight = new THREE.DirectionalLight(0xffecd2, 2.3);
  keyLight.position.set(14, 18, 16);
  ch2Scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8fd3ff, 1.9);
  rimLight.position.set(-16, -8, -14);
  ch2Scene.add(rimLight);

  const fillLight = new THREE.AmbientLight(0x18243b, 1.0);
  ch2Scene.add(fillLight);

  // Reuse the already-loaded Chapter 1 Kepler GLTF instance
  getSharedKeplerModel().then(sharedModel => {
    if (sharedModel && ch2KeplerGroup) {
      const cloned = sharedModel.clone(true);
      cloned.scale.multiplyScalar(0.95);
      ch2KeplerGroup.add(cloned);
    } else if (typeof THREE.GLTFLoader !== 'undefined') {
      const loader = new THREE.GLTFLoader();
      if (typeof THREE.DRACOLoader !== 'undefined') {
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/');
        loader.setDRACOLoader(dracoLoader);
      }
      loader.load('./assets/kepler.glb', gltf => {
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        m.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        m.scale.setScalar(26 / maxDim);
        ch2KeplerGroup.add(m);
      });
    }
  });
}

function loop() {
  if (!isRunning) return;
  rafId = requestAnimationFrame(loop);

  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  slideElapsed += dt;

  if (activeSlideId === 'c2-s01' && ch2Renderer && ch2Scene && ch2Camera) {
    if (ch2KeplerGroup) {
      ch2KeplerGroup.rotation.y += dt * 0.28;
      ch2KeplerGroup.position.y = Math.sin(slideElapsed * 0.9) * 0.45;
    }
    ch2Renderer.render(ch2Scene, ch2Camera);
  } else if (activeSlideId === 'c2-s03') {
    drawOpticsCanvas(dt);
  } else if (activeSlideId === 'c2-s04') {
    drawPrecisionCanvas(dt);
  } else if (activeSlideId === 'c2-s06') {
    drawChallengesCanvas(dt);
  } else if (activeSlideId === 'c2-s07') {
    drawK2Canvas(dt);
  }
}

// ─── Canvas Helper ────────────────────────────────────────────────────────────
function prepCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

// ─── c2-s03: Optics & 42-CCD Focal Plane ──────────────────────────────────────
function drawOpticsCanvas(dt) {
  const prep = prepCanvas('ch2OpticsCanvas');
  if (!prep) return;
  const { ctx, w, h } = prep;
  const phase = activePhraseIndex; // 0: rays->mirror, 1: converge->42 CCDs, 2: photons & charge, 3: data streams

  const cy = h * 0.50;
  const mirrorX = w * 0.56;
  const mirrorH = Math.min(h * 0.62, 260);
  const focalX = w * 0.30;

  // Telescope optical axis & subtle barrel guide
  ctx.save();
  ctx.strokeStyle = 'rgba(143, 211, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(w * 0.05, cy);
  ctx.lineTo(w * 0.88, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Subtle barrel silhouette
  ctx.strokeStyle = 'rgba(160, 200, 255, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.12, cy - mirrorH * 0.56);
  ctx.lineTo(mirrorX + 22, cy - mirrorH * 0.56);
  ctx.moveTo(w * 0.12, cy + mirrorH * 0.56);
  ctx.lineTo(mirrorX + 22, cy + mirrorH * 0.56);
  ctx.stroke();

  // Concave Primary Mirror (1.4m)
  const mirrorGrad = ctx.createLinearGradient(mirrorX - 24, cy - mirrorH / 2, mirrorX + 18, cy + mirrorH / 2);
  mirrorGrad.addColorStop(0, '#8fd3ff');
  mirrorGrad.addColorStop(0.5, '#eef3fb');
  mirrorGrad.addColorStop(1, '#4b82b8');

  ctx.strokeStyle = mirrorGrad;
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(143, 211, 255, 0.55)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(mirrorX - 18, cy - mirrorH / 2);
  ctx.quadraticCurveTo(mirrorX + 34, cy, mirrorX - 18, cy + mirrorH / 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Mirror label
  ctx.fillStyle = 'rgba(185, 198, 220, 0.85)';
  ctx.font = '700 10px Syncopate, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1.4M PRIMARY MIRROR', mirrorX + 6, cy + mirrorH / 2 + 24);

  // Parallel incoming starlight rays from left -> mirror -> focal plane
  const rayOffsets = [-0.40, -0.25, -0.10, 0.10, 0.25, 0.40];
  const rayReveal = Math.min(1, slideElapsed * 1.4);

  rayOffsets.forEach((off, idx) => {
    const y = cy + off * mirrorH;
    // Curve offset at mirror
    const curveShift = 18 * (1 - 4 * off * off);
    const hitX = mirrorX - 18 + curveShift;

    // Incoming parallel ray
    const inEndX = w * 0.06 + (hitX - w * 0.06) * rayReveal;
    ctx.strokeStyle = 'rgba(143, 211, 255, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, y);
    ctx.lineTo(inEndX, y);
    ctx.stroke();

    // Reflected converging ray (appears as phase >= 0 settles / phase >= 1)
    const convergeProgress = phase >= 1 ? 1 : Math.max(0, (slideElapsed - 0.55) * 1.5);
    if (convergeProgress > 0) {
      const targetY = cy + off * 48;
      const rx = hitX + (focalX - hitX) * convergeProgress;
      const ry = y + (targetY - y) * convergeProgress;
      ctx.strokeStyle = phase >= 1 ? 'rgba(255, 178, 122, 0.72)' : 'rgba(143, 211, 255, 0.42)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(hitX, y);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }

    // Animated starlight pulse traveling along ray
    const pulseT = ((slideElapsed * 0.6 + idx * 0.14) % 1);
    const px = w * 0.06 + (hitX - w * 0.06) * pulseT;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // 42-CCD Focal Plane Mosaic (drawn at focalX, or expanded inset on right-center for clarity)
  // Draw compact detector at prime focus
  ctx.fillStyle = '#0e172c';
  ctx.strokeStyle = phase >= 1 ? '#ffb27a' : 'rgba(143, 211, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(focalX - 8, cy - 34, 16, 68, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 178, 122, 0.85)';
  ctx.font = '700 9.5px Syncopate, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FOCAL PLANE', focalX, cy - 46);

  // Magnified 42-CCD Mosaic Panel on the right (lights up from phase >= 1)
  const mosaicX = w * 0.76;
  const mosaicY = cy - 10;
  const cellSize = Math.min(18, Math.max(12, w * 0.015));
  const gap = 3;
  const cols = 7;
  const rows = 6; // 7 x 6 = 42 CCD detectors!
  const gridW = cols * (cellSize + gap) - gap;
  const gridH = rows * (cellSize + gap) - gap;
  const gx0 = mosaicX - gridW / 2;
  const gy0 = mosaicY - gridH / 2;

  // Connector callout from prime focus to magnified mosaic
  if (phase >= 1) {
    ctx.strokeStyle = 'rgba(255, 178, 122, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(focalX + 8, cy - 28);
    ctx.lineTo(gx0 - 12, gy0);
    ctx.moveTo(focalX + 8, cy + 28);
    ctx.lineTo(gx0 - 12, gy0 + gridH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Mosaic backing glass
  ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
  ctx.strokeStyle = phase >= 1 ? 'rgba(143, 211, 255, 0.55)' : 'rgba(160, 200, 255, 0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(gx0 - 14, gy0 - 28, gridW + 28, gridH + 62, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = phase >= 1 ? '#8fd3ff' : 'rgba(185, 198, 220, 0.45)';
  ctx.font = '700 9.5px Syncopate, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('42 CCD MOSAIC (95 MP)', mosaicX, gy0 - 10);

  // Spawn photons in phase >= 2
  if (phase >= 2) {
    if (Math.random() < 0.45) {
      photons.push({
        x: gx0 + Math.random() * gridW,
        y: gy0 - 20,
        tx: gx0 + Math.random() * gridW,
        ty: gy0 + Math.random() * gridH,
        life: 0,
        max: 0.45 + Math.random() * 0.25
      });
    }
    chargeValue = Math.min(94600, chargeValue + dt * 24500);
  }

  // Draw 42 CCD squares
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = gx0 + c * (cellSize + gap);
      const cyCell = gy0 + r * (cellSize + gap);
      const wave = Math.sin(slideElapsed * 4.5 + r * 0.8 + c * 0.6) * 0.5 + 0.5;

      let fill = 'rgba(20, 32, 58, 0.85)';
      let stroke = 'rgba(143, 211, 255, 0.25)';

      if (phase === 1) {
        fill = `rgba(143, 211, 255, ${0.15 + wave * 0.18})`;
        stroke = 'rgba(143, 211, 255, 0.6)';
      } else if (phase >= 2) {
        const hot = wave > 0.65;
        fill = hot
          ? `rgba(255, 178, 122, ${0.45 + wave * 0.45})`
          : `rgba(143, 211, 255, ${0.35 + wave * 0.45})`;
        stroke = hot ? '#ffb27a' : '#8fd3ff';
      }

      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.fillRect(cx, cyCell, cellSize, cellSize);
      ctx.strokeRect(cx, cyCell, cellSize, cellSize);
    }
  }

  // Draw arriving photons
  photons = photons.filter(p => p.life < p.max);
  photons.forEach(p => {
    p.life += dt;
    const t = Math.min(1, p.life / p.max);
    const px = p.x + (p.tx - p.x) * t;
    const py = p.y + (p.ty - p.y) * t;
    ctx.fillStyle = '#ffb27a';
    ctx.beginPath();
    ctx.arc(px, py, 2.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Tiny Charge Counter (Phase >= 2)
  ctx.fillStyle = phase >= 2 ? '#ffb27a' : 'rgba(185, 198, 220, 0.45)';
  ctx.font = '700 11px Manrope, sans-serif';
  ctx.textAlign = 'center';
  const chargeText = phase >= 2
    ? `CHARGE: ${Math.round(chargeValue).toLocaleString()} e⁻  ·  84 PPM`
    : 'CHARGE: STANDBY';
  ctx.fillText(chargeText, mosaicX, gy0 + gridH + 22);

  // Digital Data Streams flowing out (Phase >= 3)
  if (phase >= 3) {
    if (Math.random() < 0.35) {
      const vals = ['0.999916', '1.000000', '0.999914', '84 ppm', '010110', '1.000002', '0.999918'];
      dataStreams.push({
        x: gx0 + gridW + 16,
        y: gy0 + Math.random() * gridH,
        speed: 85 + Math.random() * 55,
        label: vals[Math.floor(Math.random() * vals.length)],
        alpha: 1
      });
    }
  }

  ctx.font = '600 11px monospace';
  ctx.textAlign = 'left';
  dataStreams = dataStreams.filter(d => d.x < w - 16 && d.alpha > 0.04);
  dataStreams.forEach(d => {
    d.x += d.speed * dt;
    d.alpha = Math.max(0, 1 - (d.x - (gx0 + gridW)) / (w - (gx0 + gridW)));
    ctx.fillStyle = `rgba(143, 211, 255, ${d.alpha * 0.9})`;
    ctx.fillText(d.label, d.x, d.y);
  });

  ctx.restore();
}

// ─── c2-s04: Attitude Control + 4-Stage Pipeline + Transit Curve ──────────────
function drawPrecisionCanvas(dt) {
  const prep = prepCanvas('ch2PrecisionCanvas');
  if (!prep) return;
  const { ctx, w, h } = prep;
  const phase = activePhraseIndex; // 0: stabilization, 1: pipeline, 2: light curve, 3: false positives removed

  wheelAngle04 += dt * 3.8;
  ctx.save();

  // Left: Kepler silhouette + 3-axis X/Y/Z gizmo + 3 spinning wheels + thruster puffs + sunlight pressure
  const kx = w * 0.21;
  const ky = h * 0.42;

  // Solar photon pressure arrows from left-top
  for (let i = -1; i <= 1; i++) {
    const ay = ky - 36 + i * 24;
    const shift = ((slideElapsed * 40 + i * 10) % 28);
    ctx.strokeStyle = 'rgba(255, 178, 122, 0.72)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(kx - 115 + shift, ay);
    ctx.lineTo(kx - 75 + shift, ay);
    ctx.lineTo(kx - 82 + shift, ay - 4);
    ctx.moveTo(kx - 75 + shift, ay);
    ctx.lineTo(kx - 82 + shift, ay + 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffb27a';
  ctx.font = '700 9px Syncopate, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SUNLIGHT PRESSURE', kx - 95, ky - 72);

  // Kepler silhouette
  ctx.save();
  ctx.translate(kx, ky);
  ctx.rotate(-0.22);
  ctx.fillStyle = 'rgba(18, 28, 52, 0.9)';
  ctx.strokeStyle = '#8fd3ff';
  ctx.lineWidth = 1.8;
  // Barrel
  ctx.beginPath();
  ctx.roundRect(-22, -52, 44, 72, 6);
  ctx.fill();
  ctx.stroke();
  // Bus
  ctx.fillStyle = 'rgba(30, 44, 76, 0.95)';
  ctx.beginPath();
  ctx.roundRect(-28, 20, 56, 26, 4);
  ctx.fill();
  ctx.stroke();
  // Solar wing
  ctx.fillStyle = 'rgba(255, 178, 122, 0.22)';
  ctx.strokeStyle = '#ffb27a';
  ctx.beginPath();
  ctx.roundRect(-58, 12, 26, 36, 3);
  ctx.fill();
  ctx.stroke();

  // Thruster puffs at bus corners
  if (Math.random() < 0.14) {
    thrusterPuffs04.push({ x: 28, y: 38, vx: 22, vy: 8, life: 0, max: 0.65 });
  }
  thrusterPuffs04 = thrusterPuffs04.filter(p => p.life < p.max);
  thrusterPuffs04.forEach(p => {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const a = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(143, 211, 255, ${a * 0.65})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 + (1 - a) * 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Three-axis X / Y / Z Gizmo
  const gx = kx + 86;
  const gy = ky - 18;
  const axes = [
    { dx: 36, dy: 0, label: 'X', color: '#8fd3ff' },
    { dx: 0, dy: -36, label: 'Y', color: '#ffb27a' },
    { dx: -24, dy: 20, label: 'Z', color: '#eef3fb' }
  ];
  axes.forEach(ax => {
    ctx.strokeStyle = ax.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + ax.dx, gy + ax.dy);
    ctx.stroke();
    ctx.fillStyle = ax.color;
    ctx.font = '700 10px Syncopate, sans-serif';
    ctx.fillText(ax.label, gx + ax.dx * 1.25, gy + ax.dy * 1.25 + 3);
  });

  // 3 spinning reaction wheels beneath silhouette
  for (let i = 0; i < 3; i++) {
    const wx = kx - 36 + i * 36;
    const wy = ky + 82;
    drawWheelDisc(ctx, wx, wy, 12, wheelAngle04 + i * 0.9, '#8fd3ff');
  }
  ctx.fillStyle = 'rgba(185, 198, 220, 0.85)';
  ctx.font = '700 9px Syncopate, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('3-AXIS REACTION WHEELS', kx, ky + 112);

  // Right side: 4-Stage Pipeline (lights up in order)
  const stages = ['Pixel measurements', 'Calibration', 'Noise removal', 'Light curve'];
  const pipeStartX = w * 0.42;
  const pipeEndX = w * 0.94;
  const pipeY = h * 0.28;
  const stepW = (pipeEndX - pipeStartX) / (stages.length - 1);

  const litStages = phase === 0 ? 1 : phase === 1 ? 3 : 4;

  // Connector lines
  for (let i = 0; i < stages.length - 1; i++) {
    const x1 = pipeStartX + i * stepW;
    const x2 = pipeStartX + (i + 1) * stepW;
    const active = i + 1 < litStages;
    ctx.strokeStyle = active ? '#8fd3ff' : 'rgba(160, 200, 255, 0.22)';
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x1 + 42, pipeY);
    ctx.lineTo(x2 - 42, pipeY);
    ctx.stroke();
  }

  stages.forEach((label, idx) => {
    const sx = pipeStartX + idx * stepW;
    const isLit = idx < litStages;
    ctx.fillStyle = isLit ? 'rgba(143, 211, 255, 0.16)' : 'rgba(14, 20, 38, 0.72)';
    ctx.strokeStyle = isLit ? '#8fd3ff' : 'rgba(160, 200, 255, 0.22)';
    ctx.lineWidth = isLit ? 1.8 : 1;
    ctx.beginPath();
    ctx.roundRect(sx - 56, pipeY - 22, 112, 44, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLit ? '#eef3fb' : 'rgba(185, 198, 220, 0.5)';
    ctx.font = '600 11px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, pipeY + 4);
  });

  // Bottom-right: Transit Light Curve Plot
  const plotX = w * 0.41;
  const plotY = h * 0.44;
  const plotW = w * 0.53;
  const plotH = h * 0.38;

  ctx.fillStyle = 'rgba(10, 15, 30, 0.8)';
  ctx.strokeStyle = phase >= 2 ? 'rgba(143, 211, 255, 0.42)' : 'rgba(160, 200, 255, 0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(plotX, plotY, plotW, plotH, 14);
  ctx.fill();
  ctx.stroke();

  // Baseline
  const baseLineY = plotY + plotH * 0.34;
  const dipY = plotY + plotH * 0.72;
  ctx.strokeStyle = 'rgba(143, 211, 255, 0.2)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(plotX + 24, baseLineY);
  ctx.lineTo(plotX + plotW - 24, baseLineY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Drawn light curve (draws cleanly in phase >= 2)
  const curveDraw = phase >= 2 ? Math.min(1, (slideElapsed - phraseStartTime) * 0.9 + 0.35) : 0.25;
  ctx.strokeStyle = phase >= 2 ? '#8fd3ff' : 'rgba(143, 211, 255, 0.35)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  const samples = 90;
  const maxSamples = Math.floor(samples * curveDraw);
  for (let i = 0; i <= maxSamples; i++) {
    const t = i / samples;
    const x = plotX + 24 + t * (plotW - 48);
    // Transit dip centered at t = 0.5
    const dist = Math.abs(t - 0.5);
    let dip = 0;
    if (dist < 0.12) {
      dip = Math.cos((dist / 0.12) * (Math.PI / 2));
      dip = Math.pow(dip, 1.5);
    }
    const y = baseLineY + dip * (dipY - baseLineY);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // TRANSIT SIGNAL marker (phase >= 2)
  if (phase >= 2 && curveDraw > 0.65) {
    const midX = plotX + plotW * 0.5;
    ctx.strokeStyle = '#ffb27a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(midX, baseLineY);
    ctx.lineTo(midX, dipY);
    ctx.stroke();

    ctx.fillStyle = '#ffb27a';
    ctx.beginPath();
    ctx.arc(midX, dipY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '700 10px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TRANSIT SIGNAL', midX, dipY + 20);
  }

  // FALSE POSITIVES REMOVED stamp (phase >= 3)
  if (phase >= 3) {
    ctx.save();
    ctx.translate(plotX + plotW - 118, plotY + 34);
    ctx.rotate(-0.04);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
    ctx.strokeStyle = '#ffb27a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-96, -14, 192, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb27a';
    ctx.font = '700 9px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FALSE POSITIVES REMOVED', 0, 3.5);
    ctx.restore();
  }

  ctx.restore();
}

// ─── c2-s06: Mission Challenges (4 Wheels + Failures + Drift + PRECISION LOST) ──
function drawChallengesCanvas(dt) {
  const prep = prepCanvas('ch2ChallengesCanvas');
  if (!prep) return;
  const { ctx, w, h } = prep;
  const phase = activePhraseIndex; // 0: 4 spin, 1: Jul 2012 wheel1 amber, 2: May 2013 wheel2 amber, 3: wobble/jitter, 4: PRECISION LOST

  ctx.save();

  // Subtle jittering starfield in background when phase >= 3
  const jitterAmp = phase >= 3 ? 2.4 : 0.0;
  jitterStars06.forEach((s, idx) => {
    const jx = jitterAmp ? Math.sin(slideElapsed * 28 + idx) * jitterAmp : 0;
    const jy = jitterAmp ? Math.cos(slideElapsed * 23 + idx * 1.3) * jitterAmp : 0;
    ctx.fillStyle = `rgba(238, 243, 251, ${s.a * 0.55})`;
    ctx.beginPath();
    ctx.arc(s.x * w + jx, s.y * h + jy, s.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Kepler silhouette behind reaction wheels (wobbles & drifts in phase >= 3)
  const driftX = phase >= 3 ? Math.sin(slideElapsed * 1.4) * 28 + 18 : 0;
  const driftY = phase >= 3 ? Math.cos(slideElapsed * 1.1) * 14 - 8 : 0;
  const wobbleRot = phase >= 3 ? Math.sin(slideElapsed * 2.2) * 0.14 + 0.08 : -0.06;

  ctx.save();
  ctx.translate(w * 0.5 + driftX, h * 0.36 + driftY);
  ctx.rotate(wobbleRot);
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = phase >= 3 ? '#ffb27a' : '#8fd3ff';
  ctx.fillStyle = 'rgba(20, 34, 62, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-42, -90, 84, 130, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-52, 40, 104, 42, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-96, 20, 40, 60, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Update wheel speeds smoothly
  const targets = [
    phase >= 1 ? 0 : 4.8,
    phase >= 2 ? 0 : 4.8,
    4.8,
    4.8
  ];
  for (let i = 0; i < 4; i++) {
    wheelSpeeds06[i] += (targets[i] - wheelSpeeds06[i]) * Math.min(1, dt * 3.5);
    wheelAngles06[i] += wheelSpeeds06[i] * dt;
  }

  // Draw 4 reaction wheels in a row
  const rowW = Math.min(w * 0.72, 680);
  const startX = w * 0.5 - rowW / 2;
  const step = rowW / 3;
  const wheelY = h * 0.41;
  const radius = Math.min(44, w * 0.05);

  for (let i = 0; i < 4; i++) {
    const wx = startX + i * step;
    const isFailed = (i === 0 && phase >= 1) || (i === 1 && phase >= 2);
    const color = isFailed ? '#ffb27a' : '#8fd3ff';

    drawWheelDisc(ctx, wx, wheelY, radius, wheelAngles06[i], color, isFailed);

    ctx.fillStyle = color;
    ctx.font = '700 11px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`WHEEL ${i + 1}`, wx, wheelY + radius + 24);
  }

  // Thin timeline below with JULY 2012 & MAY 2013
  const tlY = h * 0.67;
  const tlLeft = w * 0.24;
  const tlRight = w * 0.76;
  ctx.strokeStyle = 'rgba(160, 200, 255, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tlLeft, tlY);
  ctx.lineTo(tlRight, tlY);
  ctx.stroke();

  const markers = [
    { x: w * 0.36, label: 'JULY 2012', active: phase >= 1 },
    { x: w * 0.64, label: 'MAY 2013', active: phase >= 2 }
  ];
  markers.forEach(m => {
    ctx.fillStyle = m.active ? '#ffb27a' : 'rgba(143, 211, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(m.x, tlY, m.active ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();

    if (m.active) {
      ctx.strokeStyle = 'rgba(255, 178, 122, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, tlY, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = m.active ? '#ffb27a' : 'rgba(185, 198, 220, 0.55)';
    ctx.font = '700 11px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, m.x, tlY + 28);
  });

  // PRECISION LOST stamp (phase >= 4)
  if (phase >= 4) {
    ctx.save();
    ctx.translate(w * 0.5, h * 0.19);
    ctx.fillStyle = 'rgba(10, 15, 30, 0.92)';
    ctx.strokeStyle = '#ffb27a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-124, -18, 248, 36, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffb27a';
    ctx.font = '700 12px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRECISION LOST', 0, 4.5);
    ctx.restore();
  }

  ctx.restore();
}

// ─── c2-s07: The K2 Revival ───────────────────────────────────────────────────
function drawK2Canvas(dt) {
  const prep = prepCanvas('ch2K2Canvas');
  if (!prep) return;
  const { ctx, w, h } = prep;
  const phase = activePhraseIndex; // 0 & 1: Sun + Ecliptic + pressure, 2: wedges, 3: 19 CAMPAIGNS, 4: RETIRED OCTOBER 30, 2018

  k2WheelAngle += dt * 4.2;
  ctx.save();

  const eclipticY = h * 0.48;

  // Ecliptic horizontal line
  ctx.strokeStyle = 'rgba(143, 211, 255, 0.32)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(w * 0.12, eclipticY);
  ctx.lineTo(w * 0.92, eclipticY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(143, 211, 255, 0.78)';
  ctx.font = '700 10px Syncopate, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ECLIPTIC', w * 0.92, eclipticY - 12);

  // Sun on the left
  const sunX = w * 0.14;
  const sunR = Math.min(44, w * 0.048);
  const sunGlow = ctx.createRadialGradient(sunX, eclipticY, sunR * 0.2, sunX, eclipticY, sunR * 2.6);
  sunGlow.addColorStop(0, '#fff3d6');
  sunGlow.addColorStop(0.35, '#ffb27a');
  sunGlow.addColorStop(1, 'rgba(255, 178, 122, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, eclipticY, sunR * 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd9a8';
  ctx.beginPath();
  ctx.arc(sunX, eclipticY, sunR * 0.72, 0, Math.PI * 2);
  ctx.fill();

  // Soft arrows of sunlight pressure balancing Kepler
  const keplerX = w * 0.36;
  for (let i = -1; i <= 1; i++) {
    const ay = eclipticY + i * 24;
    const shift = ((slideElapsed * 42 + i * 8) % 34);
    ctx.strokeStyle = 'rgba(255, 178, 122, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sunX + sunR + 12 + shift, ay);
    ctx.lineTo(keplerX - 58 + shift * 0.35, ay);
    ctx.lineTo(keplerX - 65 + shift * 0.35, ay - 4);
    ctx.moveTo(keplerX - 58 + shift * 0.35, ay);
    ctx.lineTo(keplerX - 65 + shift * 0.35, ay + 4);
    ctx.stroke();
  }

  // Kepler balanced on the Ecliptic
  ctx.save();
  ctx.translate(keplerX, eclipticY);
  const microRoll = Math.sin(slideElapsed * 1.4) * 0.025;
  ctx.rotate(microRoll);
  ctx.fillStyle = 'rgba(18, 28, 52, 0.92)';
  ctx.strokeStyle = '#8fd3ff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(-24, -40, 48, 66, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 178, 122, 0.25)';
  ctx.strokeStyle = '#ffb27a';
  ctx.beginPath();
  ctx.roundRect(-42, -16, 16, 42, 3);
  ctx.fill();
  ctx.stroke();

  // Two spinning wheels inside Kepler
  drawWheelDisc(ctx, -10, 40, 10, k2WheelAngle, '#8fd3ff');
  drawWheelDisc(ctx, 14, 40, 10, -k2WheelAngle, '#8fd3ff');

  // Small thruster puffs
  if (Math.random() < 0.12) {
    k2Thrusters.push({ x: 24, y: 20, vx: 20, vy: 12, life: 0, max: 0.55 });
  }
  k2Thrusters = k2Thrusters.filter(p => p.life < p.max);
  k2Thrusters.forEach(p => {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const a = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(143, 211, 255, ${a * 0.7})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 + (1 - a) * 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Phrase >= 2: Sky band along the ecliptic fills with successive 80-day campaign wedges
  const bandX0 = w * 0.49;
  const bandW = w * 0.42;
  const totalWedges = 19;
  if (phase === 2) {
    k2CampaignsCount = Math.min(12, Math.floor((slideElapsed - phraseStartTime) * 4.2) + 2);
  } else if (phase >= 3) {
    k2CampaignsCount = Math.min(19, Math.max(k2CampaignsCount, Math.floor(k2CampaignsCount + dt * 14)));
    if (k2CampaignsCount < 19 && phase >= 3) {
      k2CampaignsCount = Math.min(19, Math.floor(12 + (slideElapsed - phraseStartTime) * 7));
    }
  }

  const wedgeW = bandW / totalWedges;
  for (let i = 0; i < totalWedges; i++) {
    const wx = bandX0 + i * wedgeW;
    const filled = phase >= 2 && i < k2CampaignsCount;
    ctx.fillStyle = filled ? 'rgba(143, 211, 255, 0.24)' : 'rgba(14, 20, 38, 0.38)';
    ctx.strokeStyle = filled ? 'rgba(143, 211, 255, 0.75)' : 'rgba(160, 200, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx + 2, eclipticY - 46);
    ctx.lineTo(wx + wedgeW - 2, eclipticY - 46);
    ctx.lineTo(wx + wedgeW - 5, eclipticY + 46);
    ctx.lineTo(wx + 5, eclipticY + 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  if (phase >= 2) {
    ctx.fillStyle = 'rgba(185, 198, 220, 0.8)';
    ctx.font = '600 11px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('80-day observing campaigns along the ecliptic', bandX0 + bandW / 2, eclipticY + 72);
  }

  // Phrase >= 3: Counter reaches 19 CAMPAIGNS
  if (phase >= 3) {
    ctx.fillStyle = '#8fd3ff';
    ctx.font = '700 22px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.min(19, Math.max(1, k2CampaignsCount))} CAMPAIGNS`, bandX0 + bandW / 2, eclipticY - 78);
  }

  // Phrase >= 4: Quiet end card RETIRED OCTOBER 30, 2018 in ember
  if (phase >= 4) {
    ctx.fillStyle = '#ffb27a';
    ctx.font = '700 13px Syncopate, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RETIRED OCTOBER 30, 2018', w * 0.5, h * 0.78);
  }

  ctx.restore();
}

function drawWheelDisc(ctx, cx, cy, r, angle, color, isFailed = false) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = isFailed ? 'rgba(255, 178, 122, 0.16)' : 'rgba(14, 20, 38, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2.5, r * 0.16), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
