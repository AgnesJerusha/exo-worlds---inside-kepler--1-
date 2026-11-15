/**
 * 3D Exoplanet (Three.js with procedural procedural terrain and cloud textures)
 */
let animId = null;
let isVisible = false;

export function initPlanet() {
  const cv = document.getElementById('planet3d');
  if (!cv || typeof THREE === 'undefined') return;

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = new Uint8Array(512);
  {
    const a = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    for (let i = 0; i < 512; i++) P[i] = a[i & 255];
  }

  const H = (a, b, c) => P[P[P[a & 255] + (b & 255)] + (c & 255)] / 255;
  const sm = t => t * t * (3 - 2 * t);
  const mx = (a, b, t) => a + (b - a) * t;

  function vn(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const L = k => mx(
      mx(H(xi, yi, zi + k), H(xi + 1, yi, zi + k), u),
      mx(H(xi, yi + 1, zi + k), H(xi + 1, yi + 1, zi + k), u),
      v
    );
    return mx(L(0), L(1), w);
  }

  const fbm = (x, y, z, o) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < o; i++) {
      s += a * vn(x * f, y * f, z * f);
      f *= 2.03;
      a *= 0.5;
    }
    return s;
  };

  const TW = 1024, TH = 512;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH;
    const x = c.getContext('2d');
    return [c, x, x.createImageData(TW, TH)];
  };

  const [cC, cX, cI] = mk(), [bC, bX, bI] = mk(), [rC, rX, rI] = mk(), [kC, kX, kI] = mk();
  const SEA = 0.5;
  const lerp3 = (a, b, t) => [mx(a[0], b[0], t), mx(a[1], b[1], t), mx(a[2], b[2], t)];

  for (let j = 0; j < TH; j++) {
    for (let i = 0; i < TW; i++) {
      const lon = (i / TW) * 6.28319;
      const lat = (j / TH - 0.5) * 3.14159;
      const cl = Math.cos(lat);
      const x = cl * Math.cos(lon), y = Math.sin(lat), z = cl * Math.sin(lon);
      const o = (j * TW + i) * 4;
      const h = fbm(x * 2.3 + 5, y * 2.3, z * 2.3, 6);
      const det = fbm(x * 14, y * 14, z * 14, 3);
      const moist = fbm(x * 3 + 20, y * 3, z * 3, 3);

      let c, rough = 0.85;
      if (h < SEA) {
        const d = Math.min(1, (SEA - h) / 0.22);
        c = lerp3([40, 106, 124], [6, 20, 42], Math.pow(d, 0.6));
        rough = 0.22 + 0.2 * d;
      } else {
        const t = (h - SEA) / (1 - SEA);
        const forest = lerp3([34, 70, 44], [88, 110, 62], moist * 1.3 - 0.2);
        const dry = lerp3([126, 118, 80], [132, 102, 78], t);
        c = lerp3(forest, dry, Math.min(1, Math.max(0, t * 1.7 - 0.35 + (0.5 - moist) * 0.6)));
        if (t > 0.62) c = lerp3(c, [148, 140, 132], Math.min(1, (t - 0.62) * 4));
        if (t < 0.035) c = lerp3([168, 154, 118], c, t / 0.035);
        const sh = 0.9 + 0.2 * det;
        c = [c[0] * sh, c[1] * sh, c[2] * sh];
      }

      const ice = Math.max(0, Math.min(1, (Math.abs(y) - 0.83 - 0.08 * det) * 14));
      if (ice > 0) {
        c = lerp3(c, [236, 243, 250], ice);
        rough = mx(rough, 0.5, ice);
      }

      cI.data[o] = c[0];
      cI.data[o + 1] = c[1];
      cI.data[o + 2] = c[2];
      cI.data[o + 3] = 255;

      const hb = fbm(x * 2.3 + 5, y * 2.3, z * 2.3, 3);
      const bh = (hb < SEA ? SEA : hb) * 255;
      bI.data[o] = bI.data[o + 1] = bI.data[o + 2] = bh;
      bI.data[o + 3] = 255;

      const rv = rough * 255;
      rI.data[o] = rI.data[o + 1] = rI.data[o + 2] = rv;
      rI.data[o + 3] = 255;

      const wx = fbm(x * 2 + 40, y * 2, z * 2, 3) * 1.6;
      const cd = Math.max(0, Math.min(1, (fbm(x * 3.4 + wx, y * 6 + wx, z * 3.4, 5) - 0.5) * 3.4));
      kI.data[o] = kI.data[o + 1] = kI.data[o + 2] = 255;
      kI.data[o + 3] = cd * 165;
    }
  }

  cX.putImageData(cI, 0, 0);
  bX.putImageData(bI, 0, 0);
  rX.putImageData(rI, 0, 0);
  kX.putImageData(kI, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.z = 3.9;

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(-5, 2.2, 4);
  scene.add(sun, new THREE.AmbientLight(0x1b2c4a, 0.3));

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const T = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = aniso;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  };

  const grp = new THREE.Group();
  grp.rotation.z = 0.38;
  scene.add(grp);

  const geo = new THREE.SphereGeometry(1, 128, 128);
  const surface = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: T(cC, true),
      bumpMap: T(bC),
      bumpScale: 0.45,
      roughnessMap: T(rC),
      metalness: 0
    })
  );

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 96, 96),
    new THREE.MeshStandardMaterial({
      map: T(kC, true),
      transparent: true,
      depthWrite: false,
      roughness: 1
    })
  );
  grp.add(surface, clouds);

  const sunDir = new THREE.Vector3(-5, 2.2, 4).normalize();
  const glow = (r, side, pw, k) =>
    new THREE.Mesh(
      new THREE.SphereGeometry(r, 96, 96),
      new THREE.ShaderMaterial({
        uniforms: { sd: { value: sunDir }, col: { value: new THREE.Color(0x7fc4c0) } },
        side,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader:
          'varying vec3 n;varying vec3 v;void main(){n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
        fragmentShader:
          'uniform vec3 sd;uniform vec3 col;varying vec3 n;varying vec3 v;void main(){float d=dot(normalize(n),v);float f=' +
          (side === THREE.BackSide ? 'pow(max(.74-d,0.),' + pw + ')' : 'pow(1.-max(d,0.),' + pw + ')') +
          ';float lit=smoothstep(-.3,.55,dot(normalize(n),sd));gl_FragColor=vec4(col*f*lit*' +
          k +
          ',f*lit);}'
      })
    );
  scene.add(glow(1.006, THREE.FrontSide, '4.2', '0.5'));

  function fit() {
    const w = cv.clientWidth;
    renderer.setSize(w, w, false);
  }
  new ResizeObserver(fit).observe(cv);
  fit();

  if (cv.parentNode) {
    cv.parentNode.classList.add('loaded');
  }

  // Optimize performance: pause Three.js render loop when offscreen
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        isVisible = e.isIntersecting;
      });
    },
    { threshold: 0.1 }
  );
  observer.observe(cv);

  let last = performance.now();
  function loop(t) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    if (!isVisible) return;

    surface.rotation.y += dt * 0.05;
    clouds.rotation.y += dt * 0.065;
    renderer.render(scene, camera);
  }
  animId = requestAnimationFrame(loop);
}
