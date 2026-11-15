/**
 * Starfield & Shooting Stars with Parallax and Hyperspace Transition
 * - Clean, deep, cinematic star density (uncluttered)
 * - Automatic dimming during 3D astronomical simulations
 */
let canvas, ctx, W, H, dpr = 1;
let stars = [];
let shooters = [];
let reduceMotion = false;
let isHyperspace = false;
let hyperspaceProgress = 0; // 0 to 1
let scrollYOffset = 0;
let animId = null;
let isPaused = false;
let globalStarOpacity = 1.0;

export function initStarfield() {
  canvas = document.getElementById('sky');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Deep, subtle star density (1 star per 8500px, avoiding clutter)
    const count = Math.round((W * H) / 8500);
    stars = Array.from({ length: count }, () => {
      const d = Math.random(); // 0 (distant) .. 1 (near)
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        d,
        r: 0.25 + d * 0.75, // Fine pinprick stars (0.25 - 1.0px)
        a: 0.15 + Math.random() * 0.45, // Soft, non-glaring alpha
        tw: 0.4 + Math.random() * 1.8,
        ph: Math.random() * 6.283,
        hue: Math.random() < 0.15 ? 30 : 215
      };
    });
  }

  function spawnShooter() {
    const x = Math.random() * W * 0.75;
    const y = Math.random() * H * 0.4;
    const ang = 0.45 + Math.random() * 0.25;
    shooters.push({
      x,
      y,
      vx: Math.cos(ang) * 6.5,
      vy: Math.sin(ang) * 6.5,
      life: 0,
      max: 90 + Math.random() * 50
    });
  }

  let nextShooter = performance.now() + 4000;

  function frame(now) {
    if (isPaused) {
      animId = requestAnimationFrame(frame);
      return;
    }

    ctx.clearRect(0, 0, W, H);

    // Hyperspace effect
    if (isHyperspace) {
      const cx = W / 2;
      const cy = H / 2;
      const speedMult = 1 + hyperspaceProgress * 35;

      for (const s of stars) {
        const dx = s.x - cx;
        const dy = s.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const streakLen = (dist / 12) * hyperspaceProgress * (s.d * 1.5 + 0.5);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + (dx / dist) * streakLen, s.y + (dy / dist) * streakLen);

        ctx.strokeStyle = `rgba(180, 225, 255, ${0.35 + hyperspaceProgress * 0.55})`;
        ctx.lineWidth = s.r * (1 + hyperspaceProgress * 1.4);
        ctx.stroke();

        s.x += (dx / dist) * (speedMult * (s.d * 0.8 + 0.2));
        s.y += (dy / dist) * (speedMult * (s.d * 0.8 + 0.2));

        if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
          s.x = cx + (Math.random() - 0.5) * 80;
          s.y = cy + (Math.random() - 0.5) * 80;
        }
      }
    } else {
      // Ambient cinematic starfield
      for (const s of stars) {
        const a = s.a * (0.55 + 0.45 * Math.sin((now / 1000) * s.tw + s.ph)) * globalStarOpacity;
        if (a <= 0.01) continue;

        ctx.fillStyle = `hsla(${s.hue}, 70%, ${80 + s.d * 12}%, ${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();

        if (!reduceMotion) {
          s.x -= s.d * 0.02;
          if (s.x < -2) s.x = W + 2;
        }
      }

      // Shooting stars (only occasionally in prologue)
      if (!reduceMotion && now > nextShooter && globalStarOpacity > 0.5) {
        spawnShooter();
        nextShooter = now + 7000 + Math.random() * 8000;
      }

      shooters = shooters.filter(s => s.life < s.max);
      for (const s of shooters) {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        const k = (1 - s.life / s.max) * globalStarOpacity;
        const gr = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 12, s.y - s.vy * 12);
        gr.addColorStop(0, `rgba(255, 255, 255, ${k * 0.9})`);
        gr.addColorStop(1, 'rgba(143, 211, 255, 0)');
        ctx.strokeStyle = gr;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 12, s.y - s.vy * 12);
        ctx.stroke();
      }
    }

    animId = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  animId = requestAnimationFrame(frame);
}

export function setStarfieldOpacity(op) {
  globalStarOpacity = Math.max(0, Math.min(1, op));
}

export function triggerHyperspace(duration = 2000, onComplete) {
  if (reduceMotion) {
    if (onComplete) onComplete();
    return;
  }
  isHyperspace = true;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const p = Math.min(1, elapsed / duration);

    if (p < 0.4) {
      hyperspaceProgress = p / 0.4;
    } else if (p > 0.75) {
      hyperspaceProgress = 1 - (p - 0.75) / 0.25;
    } else {
      hyperspaceProgress = 1;
    }

    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      isHyperspace = false;
      hyperspaceProgress = 0;
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(step);
}
