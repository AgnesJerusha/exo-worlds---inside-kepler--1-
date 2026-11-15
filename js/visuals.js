/**
 * Chapter 1 Visual Engine — Majestic Barred Spiral Milky Way & NASA Kepler 3D Visuals
 * - 200,000 - 220,000 Point Refined Barred Spiral Galaxy (s01 - s03)
 * - Clear Left/Right Separation for Scientific Challenge (s04, s05: 3D Star on Left, SVG Transit Panel on Right)
 * - Historical Borucki Ken Burns & "No." Typography Crossfade (s06, s07)
 * - Film-Quality Cape Canaveral Rocket Launch with Particle Plume & Pad Smoke (s08)
 * - Clear Left/Right Separation for Orbital Mechanics (s09: Orbit Diagram on Left, 3D Kepler on Right)
 * - Interactive NASA Kepler 3D Model with DRACOLoader, OrbitControls, Hotspots & 150k Counter (s07, s09, s10)
 */

import { setStarfieldOpacity } from './starfield.js';
import { playRocketLaunch, stopRocketLaunch } from './sfx.js';

let canvas, renderer, scene, camera, orbitControls;
let galaxyPoints = null;
let coreHazeSprite = null;
let discHazeSprite = null;
let starSystemGroup = null;
let centralStarMesh = null;
let coronaSprite = null;
let systemPlanets = [];
let keplerModel = null;
let keplerContainer = null;
let starfield150kPoints = null;
let constellationsGroup = null;
let keplerFovPoints = null;
let isConstellationBuilt = false;
let isKeplerLoaded = false;
let isDraggingKepler = false;

let animId = null;
let isRunning = false;
let currentSlideId = null;

let targetCamera = { x: 0, y: 155, z: 275, rx: -0.52, ry: 0 };
let currentCamera = { x: 0, y: 155, z: 275, rx: -0.52, ry: 0 };
let mouseParallax = { x: 0, y: 0, tx: 0, ty: 0 };

// Galaxy & scene opacity parameters (interpolated smoothly)
let galaxyOpacity = 1.0;
let starSystemOpacity = 0.0;
let currentStarSystemOpacity = 0.0;
let keplerOpacity = 0.0;

// Subsystem animation states
let countdownStep = 0;
let countdownTimer = null;
let rocketAnimActive = false;
let rocketLiftoffTriggered = false;
let orbitAnimActive = false;
let starCounterTimer = null;
let starCounterRafId = null;
let visualSubTimers = [];
let keplerTargetPos = { x: 0, y: 0, z: 0 };
let keplerTargetScale = 1.0;
let s07InteractiveShown = false;

export function initVisualStage() {
  canvas = document.getElementById('chVisualCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3000);
  camera.position.set(0, 155, 275);

  // OrbitControls for interactive slide 10
  if (typeof THREE.OrbitControls !== 'undefined') {
    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.enableZoom = false;
    orbitControls.enablePan = false;
    orbitControls.autoRotate = true;
    orbitControls.autoRotateSpeed = 0.65;
    orbitControls.enabled = false; // Enabled on draggable slide s07

    orbitControls.addEventListener('start', () => {
      isDraggingKepler = true;
      orbitControls.autoRotate = false; // Pauses auto-rotate while dragging
    });
    orbitControls.addEventListener('end', () => {
      isDraggingKepler = false;
      orbitControls.autoRotate = true;
    });
  }

  // 1. Build Majestic Clean Milky Way
  buildMajesticMilkyWay();

  // 2. Build Star System & Transit
  buildStarSystem();

  // 3. Build 150k Starfield for Slide 10
  build150kStarfield();
  buildConstellationsCygnusLyra();

  // 4. Load Real NASA Kepler 3D Model via DRACOLoader
  loadNASAKeplerModel();

  // 5. Mouse Parallax
  window.addEventListener('pointermove', e => {
    mouseParallax.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseParallax.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // 6. Phrase-synced choreography for s07 ("No." -> team -> blueprint -> 3D Kepler)
  window.addEventListener('exo:phrase-start', e => {
    if (!e.detail || currentSlideId !== 's07' || e.detail.slideId !== 's07') return;
    applyNoSequenceStep(e.detail.phraseIndex, Boolean(e.detail.instant));
  });

  window.addEventListener('resize', onWindowResize, { passive: true });
}

function onWindowResize() {
  if (!renderer || !camera || !canvas) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

/**
 * Soft Circular Star Sprite Texture
 */
function createStarSprite() {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.2, 'rgba(235, 245, 255, 0.85)');
  grad.addColorStop(0.45, 'rgba(143, 211, 255, 0.35)');
  grad.addColorStop(0.75, 'rgba(100, 170, 255, 0.08)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(cv);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Large Soft Nebulous Glow Sprite
 */
function createHazeSprite(colorHex) {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, colorHex);
  grad.addColorStop(0.35, 'rgba(143, 211, 255, 0.1)');
  grad.addColorStop(0.75, 'rgba(30, 60, 120, 0.02)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(cv);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 2. CLEAN & MAJESTIC BARRED SPIRAL MILKY WAY GALAXY
 * - Clean density (210,000 on desktop, 110,000 on mobile)
 * - 4 logarithmic spiral arms with pitch 13.2 deg
 * - Smooth 3D central bar-shaped bulge blending softly without rings
 * - Authentic colors: warm core (#ffe9c4), pale blue-white mid-disc, pink HII knots, dim blue halo
 * - Tilted ~58 degrees
 */
function buildMajesticMilkyWay() {
  const isMobile = window.innerWidth < 768;
  const count = isMobile ? 110000 : 210000;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const maxRadius = 270;
  const pitchRad = (13.2 * Math.PI) / 180;
  const tanPitch = Math.tan(pitchRad);

  const armOffsets = [0, Math.PI, Math.PI * 0.52, Math.PI * 1.52];
  const armIntensities = [1.0, 1.0, 0.72, 0.68];

  const colCore = new THREE.Color(0xffe9c4);
  const colCoreGold = new THREE.Color(0xffcb85);
  const colMidDisc = new THREE.Color(0xd2e7ff);
  const colArmEdge = new THREE.Color(0x8fb8ff);
  const colHIIKnot = new THREE.Color(0xff8fb5);
  const colOuterDim = new THREE.Color(0x3d64a0);

  let pIdx = 0, cIdx = 0;

  function gaussianRnd() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  for (let i = 0; i < count; i++) {
    const pType = Math.random();
    let x, y, z;
    const clr = new THREE.Color();
    let ptSize = 0.95 + Math.random() * 1.35; // Crisp pinprick star sizing

    if (pType < 0.25) {
      // 1. Central Bulge & Bar
      const barAngle = 0.52;
      const u = (Math.random() - 0.5) * 2;
      const barLength = 45 * Math.pow(Math.abs(u), 1.25) * Math.sign(u);
      const barWidth = 16 * gaussianRnd() * (1 - Math.abs(barLength) / 55);
      const barHeight = 12 * gaussianRnd() * (1 - Math.abs(barLength) / 55);

      const bx = barLength * Math.cos(barAngle) - barWidth * Math.sin(barAngle);
      const bz = barLength * Math.sin(barAngle) + barWidth * Math.cos(barAngle);

      x = bx + gaussianRnd() * 3.5;
      z = bz + gaussianRnd() * 3.5;
      y = barHeight;

      const dist = Math.sqrt(x * x + z * z);
      clr.copy(colCore).lerp(colCoreGold, Math.min(1, dist / 42));
      if (Math.random() < 0.03) ptSize *= 1.6;

    } else if (pType < 0.8) {
      // 2. 4 Spiral Arms
      const armIdx = Math.floor(Math.random() * 4);
      const armBaseAngle = armOffsets[armIdx];
      const armWeight = armIntensities[armIdx];

      const r = 24 + Math.pow(Math.random(), 1.55) * (maxRadius - 24);
      const spiralTheta = Math.log(r / 22) / tanPitch + armBaseAngle;

      const armWidth = (9.0 + (r / maxRadius) * 28) * armWeight;
      const spread = gaussianRnd() * armWidth * 0.42;

      // Low frequency organic clumping without dense blobs
      const noise = Math.sin(r * 0.09) * 0.18 + Math.cos(r * 0.04 + spiralTheta) * 0.12;
      const finalTheta = spiralTheta + spread / r + noise;

      x = Math.cos(finalTheta) * r;
      z = Math.sin(finalTheta) * r;

      const thickness = (15 * Math.exp(-r / 130) + 2.0);
      y = gaussianRnd() * thickness * 0.45;

      const normR = (r - 24) / (maxRadius - 24);

      if (Math.random() < 0.012) {
        clr.copy(colHIIKnot);
        ptSize *= 2.0;
      } else if (normR < 0.35) {
        clr.copy(colCoreGold).lerp(colMidDisc, normR / 0.35);
      } else if (normR < 0.75) {
        clr.copy(colMidDisc).lerp(colArmEdge, (normR - 0.35) / 0.4);
      } else {
        clr.copy(colArmEdge).lerp(colOuterDim, (normR - 0.75) / 0.25);
      }

    } else {
      // 3. Ambient Disc between arms
      const r = Math.pow(Math.random(), 1.3) * maxRadius;
      const th = Math.random() * Math.PI * 2;

      x = Math.cos(th) * r;
      z = Math.sin(th) * r;

      const thickness = (12 * Math.exp(-r / 120) + 1.8);
      y = gaussianRnd() * thickness * 0.42;

      clr.copy(colMidDisc).lerp(colOuterDim, r / maxRadius);
      ptSize *= 0.8;
    }

    positions[pIdx] = x;
    positions[pIdx + 1] = y;
    positions[pIdx + 2] = z;

    colors[cIdx] = clr.r;
    colors[cIdx + 1] = clr.g;
    colors[cIdx + 2] = clr.b;

    sizes[i] = ptSize;

    pIdx += 3;
    cIdx += 3;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const galaxyMaterial = new THREE.PointsMaterial({
    size: 1.25,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
    map: createStarSprite()
  });

  galaxyPoints = new THREE.Points(geometry, galaxyMaterial);

  // Tilt galaxy ~58 degrees
  galaxyPoints.rotation.x = (58 * Math.PI) / 180;
  galaxyPoints.rotation.z = (18 * Math.PI) / 180;
  scene.add(galaxyPoints);

  // Subtle core haze
  const hazeTex = createHazeSprite('rgba(255, 233, 196, 0.22)');
  const hazeMat = new THREE.SpriteMaterial({
    map: hazeTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.35
  });
  coreHazeSprite = new THREE.Sprite(hazeMat);
  coreHazeSprite.scale.set(110, 80, 1);
  galaxyPoints.add(coreHazeSprite);

  // Soft disc haze
  const discHazeTex = createHazeSprite('rgba(143, 211, 255, 0.1)');
  const discHazeMat = new THREE.SpriteMaterial({
    map: discHazeTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.22
  });
  discHazeSprite = new THREE.Sprite(discHazeMat);
  discHazeSprite.scale.set(380, 320, 1);
  discHazeSprite.position.y = -2;
  galaxyPoints.add(discHazeSprite);
}

/**
 * 3. STAR SYSTEM & PLANETARY TRANSIT
 * - Central star with realistic corona
 * - Positioned on LEFT side of screen on slides 4 & 5 to avoid overlapping the transit panel
 */
function buildStarSystem() {
  starSystemGroup = new THREE.Group();
  starSystemGroup.position.set(0, 0, 0);
  starSystemGroup.visible = false;

  // Central Sun
  const starGeo = new THREE.SphereGeometry(7.8, 48, 48);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  centralStarMesh = new THREE.Mesh(starGeo, starMat);
  starSystemGroup.add(centralStarMesh);

  // Corona Glow
  const coronaCanvas = document.createElement('canvas');
  coronaCanvas.width = 256;
  coronaCanvas.height = 256;
  const cctx = coronaCanvas.getContext('2d');
  const grad = cctx.createRadialGradient(128, 128, 15, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 235, 190, 0.95)');
  grad.addColorStop(0.25, 'rgba(255, 178, 122, 0.55)');
  grad.addColorStop(0.55, 'rgba(143, 211, 255, 0.22)');
  grad.addColorStop(0.85, 'rgba(80, 150, 255, 0.05)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, 256, 256);

  const coronaTex = new THREE.CanvasTexture(coronaCanvas);
  const coronaMat = new THREE.SpriteMaterial({
    map: coronaTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.92
  });
  coronaSprite = new THREE.Sprite(coronaMat);
  coronaSprite.scale.set(50, 50, 1);
  starSystemGroup.add(coronaSprite);

  // Light
  const sunLight = new THREE.PointLight(0xfff3df, 2.4, 500);
  starSystemGroup.add(sunLight);

  // Planets
  const planetDefs = [
    { name: 'Rocky Planet', dist: 24, radius: 1.0, speed: 1.3, color: 0xc47e5a },
    { name: 'Earth-size Transit World', dist: 42, radius: 1.3, speed: 0.82, color: 0x4896b8, isTransitTarget: true },
    { name: 'Gas Giant', dist: 66, radius: 3.2, speed: 0.48, color: 0xd4a373 },
    { name: 'Outer Ice World', dist: 95, radius: 1.8, speed: 0.3, color: 0xa8d5e5 }
  ];

  systemPlanets = [];

  planetDefs.forEach(def => {
    // Orbit line
    const orbitPoints = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(Math.cos(th) * def.dist, 0, Math.sin(th) * def.dist));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0x8fd3ff,
      transparent: true,
      opacity: 0.16
    });
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    starSystemGroup.add(orbitLine);

    // Planet Mesh
    const pivot = new THREE.Group();
    starSystemGroup.add(pivot);

    const pGeo = new THREE.SphereGeometry(def.radius, 32, 32);
    const pMat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: 0.5,
      metalness: 0.1
    });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    pMesh.position.set(def.dist, 0, 0);
    pivot.add(pMesh);

    systemPlanets.push({
      pivot,
      mesh: pMesh,
      speed: def.speed,
      angle: def.isTransitTarget ? 0 : Math.random() * Math.PI * 2,
      isTransitTarget: !!def.isTransitTarget
    });
  });

  scene.add(starSystemGroup);
}

/**
 * 150,000 Starfield for Slide 10
 */
function build150kStarfield() {
  const count = 150000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const colPale = new THREE.Color(0xdbe9ff);
  const colAmber = new THREE.Color(0xffd4a3);

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 1200;
    const y = (Math.random() - 0.5) * 800;
    const z = -250 - Math.random() * 450;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const clr = Math.random() < 0.2 ? colAmber : colPale;
    colors[i * 3] = clr.r;
    colors[i * 3 + 1] = clr.g;
    colors[i * 3 + 2] = clr.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 1.15,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  starfield150kPoints = new THREE.Points(geometry, mat);
  starfield150kPoints.visible = false;
  scene.add(starfield150kPoints);
}

/**
 * 4. REAL NASA KEPLER 3D MODEL
 */

/**
 * Helper: creates a 2D canvas text sprite for constellation star labels & FOV label
 */
function createTextSprite(text, fontSize = 28, color = '#8fd3ff', isBold = false) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.font = `${isBold ? '700' : '600'} ${fontSize}px "Syncopate", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(cv);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(16, 4, 1);
  return sprite;
}

/**
 * 3. CYGNUS AND LYRA CONSTELLATIONS WITH KEPLER FIELD OF VIEW (Slide 10)
 * Uses real relative sky positions projected onto a flat view:
 * Cygnus: Deneb, Sadr, Albireo, Gienah, Delta Cygni
 * Lyra: Vega, Zeta1 Lyrae, Delta2 Lyrae, Sulafat, Sheliak
 * Between them: Kepler FOV (centre ~ RA 19h22m40s, Dec +44d30m, ~12 deg across, labelled KEPLER'S FIELD)
 * Inside FOV: Points object lighting up gradually to 150,000 points
 */
function buildConstellationsCygnusLyra() {
  constellationsGroup = new THREE.Group();
  constellationsGroup.position.set(0, 0, 0);
  constellationsGroup.visible = false;
  scene.add(constellationsGroup);

  // Star data: RA (deg), Dec (deg), size, color
  // Projection centered comfortably between top header and bottom HUD
  const RA0 = 295.0;
  const DEC0 = 37.2;
  const cosDec0 = Math.cos(DEC0 * Math.PI / 180);
  const SCALE = 2.0;

  function project(raDeg, decDeg) {
    const x = -(raDeg - RA0) * cosDec0 * SCALE;
    const y = (decDeg - DEC0) * SCALE;
    return new THREE.Vector3(x, y, 0);
  }

  // Constellation Stars
  const starsData = [
    // Cygnus
    { id: 'Deneb', name: 'DENEB', ra: 310.3583, dec: 45.2833, size: 2.2, color: 0xffffff, labelOffset: [0, 2.2, 0] },
    { id: 'Sadr', name: 'SADR', ra: 305.5583, dec: 40.2500, size: 1.8, color: 0xffeed0, labelOffset: [0, 2.0, 0] },
    { id: 'Albireo', name: 'ALBIREO', ra: 292.6792, dec: 27.9667, size: 1.7, color: 0xffb27a, labelOffset: [0, -2.2, 0] },
    { id: 'Gienah', name: 'GIENAH', ra: 311.5542, dec: 33.9667, size: 1.7, color: 0xd2e7ff, labelOffset: [-3.8, 0, 0] },
    { id: 'DeltaCyg', name: 'DELTA CYGNI', ra: 296.2500, dec: 45.1333, size: 1.6, color: 0xd2e7ff, labelOffset: [0, 2.0, 0] },
    // Lyra
    { id: 'Vega', name: 'VEGA', ra: 279.2500, dec: 38.7833, size: 2.4, color: 0xdbe9ff, labelOffset: [0, 2.4, 0] },
    { id: 'Zeta1Lyr', name: 'ZETA1 LYRAE', ra: 281.2500, dec: 37.6000, size: 1.4, color: 0xdbe9ff, labelOffset: [3.8, 0.4, 0] },
    { id: 'Delta2Lyr', name: 'DELTA2 LYRAE', ra: 283.6250, dec: 36.9000, size: 1.4, color: 0xffeed0, labelOffset: [4.2, 0, 0] },
    { id: 'Sulafat', name: 'SULAFAT', ra: 284.7500, dec: 32.6833, size: 1.6, color: 0xdbe9ff, labelOffset: [0, -2.0, 0] },
    { id: 'Sheliak', name: 'SHELIAK', ra: 282.5000, dec: 33.3667, size: 1.6, color: 0xdbe9ff, labelOffset: [-3.8, -1.2, 0] }
  ];

  const starPositions = {};
  const starSpriteTex = createStarSprite();

  starsData.forEach(s => {
    const pos = project(s.ra, s.dec);
    starPositions[s.id] = pos;

    // Glowing Star Mesh / Sprite
    const spriteMat = new THREE.SpriteMaterial({
      map: starSpriteTex,
      color: s.color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(s.size * 3.4, s.size * 3.4, 1);
    constellationsGroup.add(sprite);

    // Label Sprite
    const labelSprite = createTextSprite(s.name, 24, '#8fd3ff', true);
    labelSprite.position.set(pos.x + s.labelOffset[0], pos.y + s.labelOffset[1], pos.z);
    labelSprite.scale.set(14, 3.5, 1);
    constellationsGroup.add(labelSprite);
  });

  // Constellation Lines:
  // Cygnus: Deneb to Sadr, Sadr to Albireo, Delta Cygni to Sadr, Sadr to Gienah.
  const cygnusLinePairs = [
    ['Deneb', 'Sadr'],
    ['Sadr', 'Albireo'],
    ['DeltaCyg', 'Sadr'],
    ['Sadr', 'Gienah']
  ];

  // Lyra: Vega to Zeta1, Zeta1 to Delta2, Delta2 to Sulafat, Sulafat to Sheliak, Sheliak to Zeta1.
  const lyraLinePairs = [
    ['Vega', 'Zeta1Lyr'],
    ['Zeta1Lyr', 'Delta2Lyr'],
    ['Delta2Lyr', 'Sulafat'],
    ['Sulafat', 'Sheliak'],
    ['Sheliak', 'Zeta1Lyr']
  ];

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x8fd3ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    linewidth: 2
  });

  [...cygnusLinePairs, ...lyraLinePairs].forEach(pair => {
    const p1 = starPositions[pair[0]];
    const p2 = starPositions[pair[1]];
    if (!p1 || !p2) return;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const lineMesh = new THREE.Line(lineGeo, lineMat);
    constellationsGroup.add(lineMesh);
  });

  // Constellation Names fading in: CYGNUS & LYRA
  const cygnusTitle = createTextSprite('CYGNUS', 32, '#ffb27a', true);
  const cygnusCenter = project(305.5, 42.0);
  cygnusTitle.position.set(cygnusCenter.x - 3, cygnusCenter.y + 14, 0);
  cygnusTitle.scale.set(22, 5.5, 1);
  constellationsGroup.add(cygnusTitle);

  const lyraTitle = createTextSprite('LYRA', 32, '#ffb27a', true);
  const lyraCenter = project(282.5, 36.0);
  lyraTitle.position.set(lyraCenter.x + 3, lyraCenter.y + 11, 0);
  lyraTitle.scale.set(20, 5, 1);
  constellationsGroup.add(lyraTitle);

  // Kepler Field of View Outline:
  // Centre about RA 19h22m40s (290.6667 deg), Dec +44d30m (44.5 deg), ~12 degrees across
  const fovCenter = project(290.6667, 44.5);
  const fovRadius = (12.0 / 2) * SCALE; // ~14.4 units radius
  const fovSegments = 72;
  const fovPoints = [];
  for (let i = 0; i <= fovSegments; i++) {
    const theta = (i / fovSegments) * Math.PI * 2;
    fovPoints.push(new THREE.Vector3(
      fovCenter.x + Math.cos(theta) * fovRadius,
      fovCenter.y + Math.sin(theta) * fovRadius,
      0
    ));
  }
  const fovGeo = new THREE.BufferGeometry().setFromPoints(fovPoints);
  const fovMat = new THREE.LineBasicMaterial({
    color: 0xffb27a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
  });
  const fovLine = new THREE.Line(fovGeo, fovMat);
  constellationsGroup.add(fovLine);

  // Kepler FOV Label: KEPLER'S FIELD
  const fovLabel = createTextSprite("KEPLER'S FIELD", 26, '#ffb27a', true);
  fovLabel.position.set(fovCenter.x, fovCenter.y + fovRadius + 2.4, 0);
  fovLabel.scale.set(20, 5, 1);
  constellationsGroup.add(fovLabel);

  // Inside Kepler FOV: 150,000 tiny points lighting up gradually
  const kCount = 150000;
  const kPositions = new Float32Array(kCount * 3);
  const kColors = new Float32Array(kCount * 3);
  const cGold = new THREE.Color(0xffd4a3);
  const cBlue = new THREE.Color(0xdbe9ff);

  for (let i = 0; i < kCount; i++) {
    // Uniform disc distribution inside fovRadius
    const r = Math.sqrt(Math.random()) * (fovRadius * 0.96);
    const theta = Math.random() * Math.PI * 2;
    kPositions[i * 3] = fovCenter.x + Math.cos(theta) * r;
    kPositions[i * 3 + 1] = fovCenter.y + Math.sin(theta) * r;
    kPositions[i * 3 + 2] = (Math.random() - 0.5) * 4;

    const clr = Math.random() < 0.25 ? cGold : cBlue;
    kColors[i * 3] = clr.r;
    kColors[i * 3 + 1] = clr.g;
    kColors[i * 3 + 2] = clr.b;
  }

  const kGeo = new THREE.BufferGeometry();
  kGeo.setAttribute('position', new THREE.BufferAttribute(kPositions, 3));
  kGeo.setAttribute('color', new THREE.BufferAttribute(kColors, 3));
  // Set drawRange to 0 initially so points light up gradually while counter rises
  kGeo.setDrawRange(0, 0);

  const kMat = new THREE.PointsMaterial({
    size: 0.9,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  keplerFovPoints = new THREE.Points(kGeo, kMat);
  constellationsGroup.add(keplerFovPoints);

  isConstellationBuilt = true;
}

let keplerLoadResolvers = [];

export function getSharedKeplerModel() {
  if (isKeplerLoaded && keplerModel) {
    return Promise.resolve(keplerModel);
  }
  return new Promise(resolve => {
    keplerLoadResolvers.push(resolve);
  });
}

function loadNASAKeplerModel() {
  keplerContainer = new THREE.Group();
  keplerContainer.visible = false;
  scene.add(keplerContainer);

  const keyLight = new THREE.DirectionalLight(0xffecd2, 2.2);
  keyLight.position.set(12, 18, 14);
  keplerContainer.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8fd3ff, 1.8);
  rimLight.position.set(-16, -10, -12);
  keplerContainer.add(rimLight);

  const fillLight = new THREE.AmbientLight(0x18243b, 0.95);
  keplerContainer.add(fillLight);

  if (typeof THREE.GLTFLoader === 'undefined') return;

  const loader = new THREE.GLTFLoader();

  if (typeof THREE.DRACOLoader !== 'undefined') {
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);
  }

  loader.load(
    './assets/kepler.glb',
    gltf => {
      keplerModel = gltf.scene;

      const box = new THREE.Box3().setFromObject(keplerModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      keplerModel.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = 28 / maxDim;
      keplerModel.scale.setScalar(scaleFactor);

      keplerModel.traverse(child => {
        if (child.isMesh) {
          if (child.material) {
            child.material.roughness = Math.min(child.material.roughness, 0.45);
            child.material.metalness = Math.max(child.material.metalness, 0.65);
          }
        }
      });

      keplerContainer.rotation.x = (18 * Math.PI) / 180;
      keplerContainer.rotation.y = (-25 * Math.PI) / 180;

      keplerContainer.add(keplerModel);
      isKeplerLoaded = true;
      keplerLoadResolvers.forEach(r => r(keplerModel));
      keplerLoadResolvers = [];
    },
    undefined,
    err => {
      console.warn('Could not load assets/kepler.glb', err);
      keplerLoadResolvers.forEach(r => r(null));
      keplerLoadResolvers = [];
    }
  );
}

/**
 * Slide-specific choreography & transitions
 */
export function setVisualSlide(slideId) {
  const prevSlideId = currentSlideId;
  currentSlideId = slideId;
  hideAllOverlays();
  startVisualLoop();

  // If leaving interactive orbitControls (s07), smoothly capture current camera position before easing to next slide
  if (prevSlideId === 's07' && orbitControls && orbitControls.enabled) {
    currentCamera.x = camera.position.x;
    currentCamera.y = camera.position.y;
    currentCamera.z = camera.position.z;
    currentCamera.rx = camera.rotation.x;
    currentCamera.ry = camera.rotation.y;
    orbitControls.enabled = false;
  }

  const isNarrow = window.innerWidth < 900;

  // Default targets (lerped smoothly in renderFrame)
  if (starSystemGroup) {
    starSystemGroup.position.set(isNarrow ? 0 : -24, isNarrow ? 5 : 0, 0);
  }
  keplerTargetPos = { x: 0, y: 0, z: 0 };
  keplerTargetScale = 1.0;

  if (slideId === 's01') {
    if (starSystemGroup) starSystemGroup.position.set(0, 0, 0);
    setStarfieldOpacity(0.3);
    targetCamera = { x: 0, y: 155, z: 275, rx: -0.52, ry: 0 };
    galaxyOpacity = 0.95;
    starSystemOpacity = 0.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

  } else if (slideId === 's02') {
    if (starSystemGroup) starSystemGroup.position.set(0, 0, 0);
    setStarfieldOpacity(0.22);
    targetCamera = { x: 35, y: 75, z: 165, rx: -0.42, ry: 0.22 };
    galaxyOpacity = 0.95;
    starSystemOpacity = 0.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

  } else if (slideId === 's03') {
    if (starSystemGroup) starSystemGroup.position.set(0, 0, 0);
    setStarfieldOpacity(0.18);
    targetCamera = { x: 0, y: 26, z: 80, rx: -0.28, ry: 0 };
    galaxyOpacity = 0.22;
    starSystemOpacity = 1.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

  } else if (slideId === 's04') {
    setStarfieldOpacity(0.12);
    targetCamera = { x: 0, y: 18, z: isNarrow ? 82 : 70, rx: -0.22, ry: 0 };
    galaxyOpacity = 0.0;
    starSystemOpacity = 1.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

    showOverlay('transitPanel');
    startTransitAnimation(false);

  } else if (slideId === 's05') {
    setStarfieldOpacity(0.12);
    targetCamera = { x: 0, y: 18, z: isNarrow ? 82 : 70, rx: -0.22, ry: 0 };
    galaxyOpacity = 0.0;
    starSystemOpacity = 1.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

    showOverlay('transitPanel');
    startTransitAnimation(true);

  } else if (slideId === 's06') {
    setStarfieldOpacity(0.18);
    galaxyOpacity = 0.0;
    starSystemOpacity = 0.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

    showOverlay('boruckiOverlay');

  } else if (slideId === 's07') {
    setStarfieldOpacity(0.2);
    targetCamera = { x: 0, y: 0, z: isNarrow ? 54 : 46, rx: 0, ry: 0 };
    galaxyOpacity = 0.0;
    starSystemOpacity = 0.0;
    keplerOpacity = 1.0;

    playNoSequence();

  } else if (slideId === 's08') {
    setStarfieldOpacity(0.32);
    galaxyOpacity = 0.0;
    starSystemOpacity = 0.0;
    keplerOpacity = 0.0;
    if (orbitControls) orbitControls.enabled = false;

    showOverlay('rocketOverlay');
    startCapeCanaveralLaunch();

  } else if (slideId === 's09') {
    setStarfieldOpacity(0.24);
    galaxyOpacity = 0.0;
    starSystemOpacity = 0.0;
    keplerOpacity = 1.0;

    targetCamera = { x: 0, y: 0, z: isNarrow ? 64 : 52, rx: 0, ry: 0 };
    keplerTargetPos = { x: isNarrow ? 0 : 24, y: isNarrow ? -7 : 0, z: 0 };
    keplerTargetScale = isNarrow ? 0.62 : 0.78;

    if (keplerContainer) {
      keplerContainer.visible = true;
    }

    if (orbitControls) orbitControls.enabled = false;

    showOverlay('orbitOverlay');
    showOverlay('nasaModelCredit');
    startOrbitDiagramAnimation();

  } else if (slideId === 's10') {
    setStarfieldOpacity(0.85);
    targetCamera = { x: 0, y: -1.5, z: isNarrow ? 74 : 64, rx: 0, ry: 0 };
    galaxyOpacity = 0.0;
    starSystemOpacity = 0.0;
    keplerOpacity = 0.0;

    if (keplerContainer) {
      keplerContainer.visible = false;
    }
    if (orbitControls) orbitControls.enabled = false;

    if (constellationsGroup) {
      constellationsGroup.visible = true;
      fadeInConstellations();
    }

    showOverlay('starCounterWrap');
    startStarCounter();
  }
}

/**
 * Smoothly fades in Cygnus & Lyra constellation stars, lines, titles, and FOV outline
 */
function fadeInConstellations() {
  if (!constellationsGroup) return;
  const startTime = performance.now();
  const duration = 2200;

  function step() {
    if (currentSlideId !== 's10' || !constellationsGroup) return;
    const elapsed = performance.now() - startTime;
    const p = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - p, 2);

    constellationsGroup.traverse(child => {
      if (child.material) {
        if (child.isSprite) {
          // Stars & labels
          child.material.opacity = ease * 0.95;
        } else if (child.isLine) {
          // Constellation lines & FOV ring
          child.material.opacity = ease * 0.75;
        } else if (child.isPoints && child === keplerFovPoints) {
          child.material.opacity = ease * 0.85;
        }
      }
    });

    if (p < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

/**
 * Minimal compatible helper allowing Chapter 3 (c3-s04) to reuse
 * the Chapter 1 Milky Way scene cleanly without duplicating geometry.
 */
export function setChapter3MilkyWayMode(active, options = {}) {
  const ch1 = document.getElementById('chapter-1');
  if (ch1) {
    ch1.classList.toggle('ch3-galaxy-backdrop', Boolean(active));
  }
  if (!active) {
    if (galaxyPoints && galaxyPoints.material) {
      galaxyPoints.material.size = 1.25;
    }
    if (coreHazeSprite && coreHazeSprite.material) coreHazeSprite.material.opacity = 0.35;
    if (discHazeSprite && discHazeSprite.material) discHazeSprite.material.opacity = 0.22;
    return;
  }

  currentSlideId = 'c3-s04';
  hideAllOverlays();
  if (orbitControls) orbitControls.enabled = false;
  if (keplerContainer) keplerContainer.visible = false;
  if (starSystemGroup) starSystemGroup.visible = false;
  starSystemOpacity = 0.0;
  keplerOpacity = 0.0;

  setStarfieldOpacity(options.starfieldOpacity !== undefined ? options.starfieldOpacity : 0.28);
  galaxyOpacity = options.galaxyOpacity !== undefined ? options.galaxyOpacity : 0.95;

  if (options.camera) {
    targetCamera = {
      x: options.camera.x ?? 0,
      y: options.camera.y ?? 155,
      z: options.camera.z ?? 275,
      rx: options.camera.rx ?? -0.52,
      ry: options.camera.ry ?? 0
    };
  }
  if (options.snapCamera && options.camera) {
    currentCamera = { ...targetCamera };
  }

  if (galaxyPoints && galaxyPoints.material) {
    galaxyPoints.material.size = options.brighten ? 1.55 : 1.25;
  }
  if (coreHazeSprite && coreHazeSprite.material) {
    coreHazeSprite.material.opacity = options.brighten ? 0.52 : 0.35;
  }
  if (discHazeSprite && discHazeSprite.material) {
    discHazeSprite.material.opacity = options.brighten ? 0.34 : 0.22;
  }

  startVisualLoop();
}

function hideAllOverlays() {
  visualSubTimers.forEach(t => clearTimeout(t));
  visualSubTimers = [];

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (starCounterTimer) {
    clearInterval(starCounterTimer);
    starCounterTimer = null;
  }
  if (starCounterRafId) {
    cancelAnimationFrame(starCounterRafId);
    starCounterRafId = null;
  }

  const overlayIds = [
    'transitPanel',
    'boruckiOverlay',
    'noSeqOverlay',
    'rocketOverlay',
    'orbitOverlay',
    'keplerHotspots',
    'starCounterWrap',
    'nasaModelCredit'
  ];

  overlayIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const cd = document.getElementById('countdownDisplay');
  if (cd) cd.classList.remove('show');

  const no1 = document.getElementById('noWord1');
  const no2 = document.getElementById('noWord2');
  const team = document.getElementById('teamCrossfade');
  const blueprint = document.getElementById('blueprintBox');
  if (no1) no1.classList.remove('show');
  if (no2) no2.classList.remove('show');
  if (team) team.classList.remove('show');
  if (blueprint) blueprint.classList.remove('show');

  if (starfield150kPoints) starfield150kPoints.visible = false;
  if (constellationsGroup) constellationsGroup.visible = false;
  if (keplerContainer) keplerContainer.visible = false;

  s07InteractiveShown = false;
  rocketAnimActive = false;
  rocketLiftoffTriggered = false;
  stopRocketLaunch(0.1);
  orbitAnimActive = false;
}

function showOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

/**
 * Slide 04 & 05: Transit SVG Light Curve Sync
 */
function startTransitAnimation(showDipMarker = false) {
  const path = document.getElementById('transitCurvePath');
  const marker = document.getElementById('transitDipMarker');

  if (marker) {
    marker.classList.toggle('active', showDipMarker);
  }

  if (path) {
    path.style.transition = 'none';
    path.style.strokeDasharray = '1000';
    path.style.strokeDashoffset = '1000';
    path.getBoundingClientRect();
    path.style.transition = 'stroke-dashoffset 3.2s cubic-bezier(0.22, 1, 0.36, 1)';
    path.style.strokeDashoffset = '0';
  }
}

/**
 * Slide 07: "No." Sequence -> Team Photo -> Blueprint -> Interactive 3D Kepler
 * Syncs with spoken phrases via exo:phrase-start (and resets cleanly on slide leave)
 */
function playNoSequence() {
  s07InteractiveShown = false;
  showOverlay('noSeqOverlay');
  applyNoSequenceStep(0, false);
}

function applyNoSequenceStep(phraseIndex, instant = false) {
  if (currentSlideId !== 's07') return;

  const no1 = document.getElementById('noWord1');
  const no2 = document.getElementById('noWord2');
  const team = document.getElementById('teamCrossfade');
  const blueprint = document.getElementById('blueprintBox');

  if (instant || phraseIndex >= 4) {
    if (no1) no1.classList.remove('show');
    if (no2) no2.classList.remove('show');
    if (team) team.classList.remove('show');
    if (blueprint) blueprint.classList.remove('show');

    if (!s07InteractiveShown && keplerContainer) {
      s07InteractiveShown = true;
      keplerContainer.visible = true;
      keplerContainer.position.set(0, 0, 0);
      keplerContainer.scale.setScalar(window.innerWidth < 900 ? 0.8 : 1.0);
      if (orbitControls) {
        orbitControls.enabled = true;
        camera.position.set(0, 0, window.innerWidth < 900 ? 54 : 46);
        camera.lookAt(0, 0, 0);
      }
      showOverlay('keplerHotspots');
      showOverlay('nasaModelCredit');
    }
    return;
  }

  if (phraseIndex === 0) {
    if (no1) no1.classList.add('show');
    if (no2) no2.classList.remove('show');
    if (team) team.classList.remove('show');
    if (blueprint) blueprint.classList.remove('show');
  } else if (phraseIndex === 1) {
    if (no1) no1.classList.add('show');
    if (no2) no2.classList.add('show');
    if (team) team.classList.remove('show');
    if (blueprint) blueprint.classList.remove('show');
  } else if (phraseIndex === 2) {
    if (no1) no1.classList.remove('show');
    if (no2) no2.classList.remove('show');
    if (team) team.classList.add('show');
    if (blueprint) blueprint.classList.remove('show');
  } else if (phraseIndex === 3) {
    if (no1) no1.classList.remove('show');
    if (no2) no2.classList.remove('show');
    if (team) team.classList.remove('show');
    if (blueprint) blueprint.classList.add('show');
  }
}

/**
 * 5. POLISHED CAPE CANAVERAL LAUNCH (Slide 08)
 * - HiDPI crisp canvas, atmospheric horizon glow, 3-2-1-LIFTOFF, gentle shake, particle plume, soft fade-out
 */
function startCapeCanaveralLaunch() {
  const cv = document.getElementById('rocketCanvas');
  const cd = document.getElementById('countdownDisplay');
  if (!cv || !cd) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  rocketAnimActive = true;
  rocketLiftoffTriggered = false;
  countdownStep = 3;

  cd.textContent = '3';
  cd.classList.add('show');

  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (currentSlideId !== 's08') {
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    countdownStep--;
    if (countdownStep > 0) {
      cd.textContent = String(countdownStep);
    } else if (countdownStep === 0) {
      cd.textContent = 'LIFTOFF';
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      cd.classList.remove('show');
    }
  }, 950);

  let rx = w / 2;
  let ry = h * 0.72;
  let rvy = 0;
  let rAcc = 0.08;
  const particles = [];
  const smoke = [];

  function rocketFrame() {
    if (!rocketAnimActive || currentSlideId !== 's08') return;
    ctx.clearRect(0, 0, w, h);

    const padY = h * 0.76;

    // Launchpad Horizon & Floodlights
    const horizGrad = ctx.createLinearGradient(0, padY - 60, 0, h);
    horizGrad.addColorStop(0, 'rgba(20, 35, 60, 0.38)');
    horizGrad.addColorStop(1, 'rgba(2, 3, 10, 0.92)');
    ctx.fillStyle = horizGrad;
    ctx.fillRect(0, padY, w, h - padY);

    // Floodlight beams
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#8fd3ff';
    ctx.beginPath();
    ctx.moveTo(rx - 120, h);
    ctx.lineTo(rx - 20, ry);
    ctx.lineTo(rx - 10, ry);
    ctx.lineTo(rx - 80, h);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(rx + 120, h);
    ctx.lineTo(rx + 20, ry);
    ctx.lineTo(rx + 10, ry);
    ctx.lineTo(rx + 80, h);
    ctx.fill();
    ctx.restore();

    // Rocket Ignition & Liftoff
    if (countdownStep <= 0) {
      if (!rocketLiftoffTriggered) {
        rocketLiftoffTriggered = true;
        playRocketLaunch();
      }
      rAcc += 0.012;
      rvy += rAcc;
      ry -= rvy;

      // Camera shake
      const shakeAmt = Math.max(0, 5.5 - rvy * 0.14);
      if (shakeAmt > 0.5) {
        cv.style.transform = `translate(${(Math.random() - 0.5) * shakeAmt}px, ${(Math.random() - 0.5) * shakeAmt}px)`;
      } else {
        cv.style.transform = 'none';
      }

      // Fire Flame Particles (Intense Core + Orange Fringe)
      for (let i = 0; i < 9; i++) {
        particles.push({
          x: rx + (Math.random() - 0.5) * 12,
          y: ry + 32,
          vx: (Math.random() - 0.5) * 4,
          vy: 6 + Math.random() * 10,
          radius: 4 + Math.random() * 9,
          life: 1.0,
          color: Math.random() < 0.55 ? '#ffeed0' : (Math.random() < 0.7 ? '#ff9a4a' : '#ff5a2a')
        });
      }

      // Billowing Smoke Particles
      if (ry > padY - 250) {
        for (let i = 0; i < 4; i++) {
          smoke.push({
            x: rx + (Math.random() - 0.5) * 28,
            y: padY + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 7,
            vy: -1 - Math.random() * 3,
            radius: 14 + Math.random() * 18,
            maxRadius: 40 + Math.random() * 30,
            life: 1.0
          });
        }
      }
    }

    // Render Smoke
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.x += s.vx;
      s.y += s.vy;
      s.life -= 0.014;
      s.radius += 0.6;

      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life * 0.35);
      ctx.fillStyle = '#6e7a90';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (s.life <= 0) smoke.splice(i, 1);
    }

    // Render Flame Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.032;
      p.radius *= 0.96;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (p.life <= 0) particles.splice(i, 1);
    }

    // Render Rocket Body (Sleek Delta II silhouette)
    ctx.save();
    ctx.fillStyle = '#eef3fb';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 38);
    ctx.lineTo(rx + 7, ry + 28);
    ctx.lineTo(rx - 7, ry + 28);
    ctx.closePath();
    ctx.fill();

    // Rocket Fins
    ctx.fillStyle = '#8fd3ff';
    ctx.beginPath();
    ctx.moveTo(rx - 7, ry + 16);
    ctx.lineTo(rx - 15, ry + 32);
    ctx.lineTo(rx - 7, ry + 28);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(rx + 7, ry + 16);
    ctx.lineTo(rx + 15, ry + 32);
    ctx.lineTo(rx + 7, ry + 28);
    ctx.fill();
    ctx.restore();

    // Fade gently into deep space after clearing orbit
    if (ry < -80) {
      stopRocketLaunch(0.25);
      ctx.clearRect(0, 0, w, h);
      cv.style.transform = 'none';
      const ov = document.getElementById('rocketOverlay');
      if (ov) ov.classList.remove('active');
      return;
    }

    requestAnimationFrame(rocketFrame);
  }

  requestAnimationFrame(rocketFrame);
}

/**
 * 5. ORBITAL MECHANICS (Slide 09: HiDPI-crisp LEFT diagram)
 */
function startOrbitDiagramAnimation() {
  const cv = document.getElementById('orbitCanvas');
  if (!cv) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.parentElement ? cv.parentElement.clientWidth : 540;
  const h = cv.parentElement ? cv.parentElement.clientHeight : 440;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  orbitAnimActive = true;
  let angle = 0;

  function orbitFrame() {
    if (!orbitAnimActive || currentSlideId !== 's09') return;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.48;
    const cy = h * 0.5;
    const r = Math.min(w, h) * 0.36;

    angle += 0.007;

    // Orbit Ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(143, 211, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Central Sun
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcf70';
    ctx.shadowColor = '#ffb27a';
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#eef3fb';
    ctx.font = '10px "Syncopate", sans-serif';
    ctx.fillText('SUN', cx - 12, cy - 22);

    // Earth
    const ex = cx + Math.cos(angle) * r;
    const ey = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(ex, ey, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#6ab8ff';
    ctx.fill();

    ctx.fillStyle = '#eef3fb';
    ctx.font = '9.5px "Syncopate", sans-serif';
    ctx.fillText('EARTH (365 DAYS)', ex + 12, ey + 4);

    // Kepler (Trailing behind Earth)
    const kAngle = angle - 0.42;
    const kx = cx + Math.cos(kAngle) * r;
    const ky = cy + Math.sin(kAngle) * r;

    // Trailing arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, kAngle, angle, false);
    ctx.strokeStyle = 'rgba(255, 178, 122, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(kx, ky, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb27a';
    ctx.shadowColor = '#ffb27a';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ffb27a';
    ctx.font = '9.5px "Syncopate", sans-serif';
    ctx.fillText('KEPLER (372-DAY TRAIL)', kx + 12, ky + 4);

    requestAnimationFrame(orbitFrame);
  }

  requestAnimationFrame(orbitFrame);
}

/**
 * Slide 10: 150,000 Starfield Counter
 */
function startStarCounter() {
  const numEl = document.getElementById('counterNum');
  if (!numEl) return;

  numEl.textContent = '0';
  const target = 150000;
  const duration = 2800;
  const start = performance.now();
  if (keplerFovPoints && keplerFovPoints.geometry) {
    keplerFovPoints.geometry.setDrawRange(0, 0);
  }

  function update() {
    const elapsed = performance.now() - start;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 3);
    const val = Math.floor(ease * target);
    numEl.textContent = val.toLocaleString();

    // Tiny points inside Kepler FOV light up gradually while counter rises
    if (keplerFovPoints && keplerFovPoints.geometry) {
      keplerFovPoints.geometry.setDrawRange(0, val);
    }

    if (progress < 1 && currentSlideId === 's10') {
      starCounterRafId = requestAnimationFrame(update);
    } else {
      starCounterRafId = null;
    }
  }

  starCounterRafId = requestAnimationFrame(update);
}

/**
 * Master Animation Render Loop
 */
export function startVisualLoop() {
  if (isRunning) return;
  isRunning = true;
  lastTime = performance.now();
  renderFrame();
}

export function stopVisualLoop() {
  isRunning = false;
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

let lastTime = performance.now();

function renderFrame() {
  if (!isRunning) return;
  animId = requestAnimationFrame(renderFrame);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // 1. Camera Motion & Parallax
  if (!orbitControls || !orbitControls.enabled) {
    const camEase = 0.045;
    currentCamera.x += (targetCamera.x - currentCamera.x) * camEase;
    currentCamera.y += (targetCamera.y - currentCamera.y) * camEase;
    currentCamera.z += (targetCamera.z - currentCamera.z) * camEase;
    currentCamera.rx += (targetCamera.rx - currentCamera.rx) * camEase;
    currentCamera.ry += (targetCamera.ry - currentCamera.ry) * camEase;

    mouseParallax.x += (mouseParallax.tx - mouseParallax.x) * 0.06;
    mouseParallax.y += (mouseParallax.ty - mouseParallax.y) * 0.06;

    const pFactor = currentSlideId === 's10' ? 0.35 : 1.0;
    camera.position.set(
      currentCamera.x + mouseParallax.x * 12 * pFactor,
      currentCamera.y - mouseParallax.y * 8 * pFactor,
      currentCamera.z
    );
    camera.rotation.set(
      currentCamera.rx + mouseParallax.y * 0.04,
      currentCamera.ry - mouseParallax.x * 0.05,
      0
    );
  } else {
    orbitControls.update();
  }

  // 2. Barred Spiral Galaxy Motion & Opacity
  if (galaxyPoints) {
    galaxyPoints.rotation.y += dt * 0.016;
    galaxyPoints.material.opacity += (galaxyOpacity - galaxyPoints.material.opacity) * 0.06;
  }

  // 3. Star System Smooth Fade, Motion & Transit
  if (starSystemGroup) {
    currentStarSystemOpacity += (starSystemOpacity - currentStarSystemOpacity) * Math.min(1, dt * 4.5);
    const isVisible = currentStarSystemOpacity > 0.015;
    starSystemGroup.visible = isVisible;

    if (isVisible) {
      if (coronaSprite) {
        const cScale = 50 + Math.sin(now * 0.003) * 2.5;
        coronaSprite.scale.set(cScale, cScale, 1);
        coronaSprite.material.opacity = 0.92 * currentStarSystemOpacity;
      }

      systemPlanets.forEach(p => {
        p.angle += dt * p.speed * 0.55;
        p.pivot.rotation.y = p.angle;
        p.mesh.rotation.y += dt * 0.8;
      });
    }
  }

  // 4. Kepler 3D Model Smooth Positioning & Auto-Rotation
  if (keplerContainer && keplerContainer.visible) {
    if (currentSlideId === 's09') {
      keplerContainer.position.x += (keplerTargetPos.x - keplerContainer.position.x) * Math.min(1, dt * 5);
      keplerContainer.position.y += (keplerTargetPos.y - keplerContainer.position.y) * Math.min(1, dt * 5);
      keplerContainer.position.z += (keplerTargetPos.z - keplerContainer.position.z) * Math.min(1, dt * 5);
      const curS = keplerContainer.scale.x;
      const nxtS = curS + (keplerTargetScale - curS) * Math.min(1, dt * 5);
      keplerContainer.scale.setScalar(nxtS);
      keplerContainer.rotation.y += dt * 0.22;
    } else if (currentSlideId === 's07') {
      if (!orbitControls || !orbitControls.enabled) {
        keplerContainer.rotation.y += dt * 0.22;
      }
      updateHotspotPositions();
    }
  }

  // 5. Constellation slow drift on Slide 10
  if (constellationsGroup && constellationsGroup.visible && currentSlideId === 's10') {
    constellationsGroup.rotation.z = Math.sin(now * 0.00015) * 0.03;
    constellationsGroup.position.x = Math.sin(now * 0.0002) * 0.6;
    constellationsGroup.position.y = Math.cos(now * 0.0002) * 0.4;
  }

  renderer.render(scene, camera);
}

/**
 * Calculates 2D screen positions for Kepler 3D hotspot labels
 */
function updateHotspotPositions() {
  if (!keplerModel || !camera) return;

  const solarObj = keplerModel.getObjectByName('shiny_panel');
  const dishObj = keplerModel.getObjectByName('dish_AO');
  const photoObj = keplerModel.getObjectByName('tex_01.001') || keplerModel.getObjectByName('tex_01');

  const spots = [
    { id: 'hotspotSolar', obj: solarObj, fallback: new THREE.Vector3(-8, 3, 0) },
    { id: 'hotspotAntenna', obj: dishObj, fallback: new THREE.Vector3(-3, -12, -6) },
    { id: 'hotspotPhotometer', obj: photoObj, fallback: new THREE.Vector3(2, 12, 0) }
  ];

  const wp = new THREE.Vector3();

  spots.forEach(s => {
    const el = document.getElementById(s.id);
    if (!el) return;

    if (s.obj) {
      s.obj.getWorldPosition(wp);
    } else {
      wp.copy(s.fallback).applyMatrix4(keplerContainer.matrixWorld);
    }

    wp.project(camera);

    if (wp.z > 1.0) {
      el.style.opacity = '0';
      return;
    }

    el.style.opacity = '1';
    // Clamp to viewport edges to prevent clipping
    const x = Math.min(window.innerWidth - 250, Math.max(30, (wp.x * 0.5 + 0.5) * window.innerWidth));
    const y = Math.min(window.innerHeight - 200, Math.max(90, (-wp.y * 0.5 + 0.5) * window.innerHeight));

    el.style.transform = `translate(${x}px, ${y}px)`;
  });
}
