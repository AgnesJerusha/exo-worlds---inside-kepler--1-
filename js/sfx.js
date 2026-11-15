/**
 * Web Audio Procedural Sound Effects & Ambient Music Engine — EXO WORLDS
 *
 * - SFX_VOLUME: procedural sound effects master volume.
 * - BG_MUSIC_FILE / BG_MUSIC_VOLUME: background music path (audio/bg-music.mp3)
 *   playing at a mild volume and ducking gently while the narrator speaks.
 *   If audio/bg-music.mp3 is still empty, playback fails silently with no errors.
 */

export const SFX_VOLUME = 0.32; // Master SFX volume setting
export const BG_MUSIC_FILE = './audio/bg-music.mp3'; // Replace empty audio/bg-music.mp3 with your track
export const BG_MUSIC_VOLUME = 0.12; // Mild background music volume

let audioCtx = null;
let masterGain = null;
let duckGain = null;
let isAudioEnabled = true;
let isNarratorActive = false;

// Active SFX nodes references to allow clean stopping/fading
let activeWarp = null;
let activeRocket = null;

// Mild background music player state
let bgAudio = null;
let bgFadeTimer = null;
let bgUnavailable = false;

/**
 * Returns or initializes the shared AudioContext for SFX
 */
export function getSfxAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      _setupMasterChain();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function _setupMasterChain() {
  if (!audioCtx) return;
  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(isAudioEnabled ? SFX_VOLUME : 0, audioCtx.currentTime);

  duckGain = audioCtx.createGain();
  duckGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

  duckGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);
}

function _ensureBgAudio() {
  if (bgAudio || bgUnavailable) return bgAudio;
  bgAudio = new Audio(BG_MUSIC_FILE);
  bgAudio.loop = true;
  bgAudio.preload = 'metadata';
  bgAudio.volume = 0;

  bgAudio.addEventListener('error', () => {
    // Gracefully stay silent while placeholder file is empty
    bgUnavailable = true;
    _clearBgFade();
  });

  return bgAudio;
}

function _clearBgFade() {
  if (bgFadeTimer) {
    clearInterval(bgFadeTimer);
    bgFadeTimer = null;
  }
}

function _fadeBgVolume(targetVol, durationMs = 700, pauseAtZero = false) {
  if (!bgAudio || bgUnavailable) return;
  _clearBgFade();
  const startVol = bgAudio.volume;
  const steps = Math.max(4, Math.round(durationMs / 35));
  let step = 0;
  bgFadeTimer = setInterval(() => {
    step++;
    const p = Math.min(1, step / steps);
    bgAudio.volume = Math.max(0, Math.min(1, startVol + (targetVol - startVol) * p));
    if (p >= 1) {
      _clearBgFade();
      if (pauseAtZero && targetVol <= 0.001) {
        bgAudio.pause();
      }
    }
  }, 35);
}

/**
 * Start mild background music after user gesture (ignored silently if file is empty)
 */
export function startBgMusic() {
  if (!isAudioEnabled || bgUnavailable) return;
  const el = _ensureBgAudio();
  if (!el) return;

  const target = isNarratorActive ? BG_MUSIC_VOLUME * 0.45 : BG_MUSIC_VOLUME;
  if (el.paused) {
    el.volume = 0;
    el.play().then(() => {
      _fadeBgVolume(target, 1200, false);
    }).catch(() => {
      // Placeholder empty or awaiting gesture — fail silently
    });
  } else {
    _fadeBgVolume(target, 500, false);
  }
}

export function stopBgMusic(immediate = false) {
  if (!bgAudio) return;
  if (immediate) {
    _clearBgFade();
    bgAudio.pause();
    bgAudio.volume = 0;
  } else {
    _fadeBgVolume(0, 450, true);
  }
}

/**
 * Set master audio enabled state (controlled by Narrator Audio button)
 */
export function setSfxEnabled(enabled) {
  isAudioEnabled = !!enabled;
  if (!isAudioEnabled) {
    stopAllSfx(true); // immediate stop
    stopBgMusic(false);
  } else {
    startBgMusic();
  }
  if (audioCtx && masterGain) {
    const t = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(isAudioEnabled ? SFX_VOLUME : 0, t + 0.05);
  }
}

/**
 * Duck sound effects (~40%) and background music (~45%) while narrator speaks
 */
export function setNarratorSpeaking(isSpeaking) {
  isNarratorActive = Boolean(isSpeaking);
  if (audioCtx && duckGain) {
    const t = audioCtx.currentTime;
    duckGain.gain.cancelScheduledValues(t);
    duckGain.gain.setValueAtTime(duckGain.gain.value, t);
    const target = isNarratorActive ? 0.4 : 1.0;
    duckGain.gain.linearRampToValueAtTime(target, t + 0.15);
  }
  if (bgAudio && !bgUnavailable && !bgAudio.paused && isAudioEnabled) {
    _fadeBgVolume(isNarratorActive ? BG_MUSIC_VOLUME * 0.45 : BG_MUSIC_VOLUME, 450, false);
  }
}

/**
 * Helper to build noise buffers (white, pink, brown)
 */
function createNoiseBuffer(ctx, type = 'white', seconds = 4) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'brown') {
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Compensate for brown noise attenuation
    }
  }
  return buffer;
}

/**
 * a) Smooth Cinematic Space Warp Sound Effect
 * Warm sub-bass swell + silky filtered wind sweep + gentle harmonic fifth shimmer
 * @param {number} durationMs - total warp duration in ms (matching visual warp animation, e.g. 1900ms)
 */
export function playHyperspaceWarp(durationMs = 1900) {
  if (!isAudioEnabled) return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;

  stopHyperspaceWarp(0.05);

  const dur = durationMs / 1000;
  const now = ctx.currentTime;
  const warpNodes = [];

  // Master envelope for the warp transition (smooth swell in -> peak near arrival -> warm release)
  const warpOut = ctx.createGain();
  warpOut.gain.setValueAtTime(0.0001, now);
  warpOut.gain.linearRampToValueAtTime(0.9, now + dur * 0.48);
  warpOut.gain.linearRampToValueAtTime(1.0, now + dur * 0.82);
  warpOut.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.65);
  warpOut.connect(duckGain);

  // Subtle centered stereo warmth
  let outBus = warpOut;
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(-0.18, now);
    panner.pan.linearRampToValueAtTime(0.18, now + dur * 0.85);
    panner.pan.linearRampToValueAtTime(0, now + dur + 0.4);
    panner.connect(warpOut);
    outBus = panner;
  }

  // 1. Silky warm wind rush (brown noise shaped by a smooth low-pass filter, no harsh hiss)
  const windBuf = createNoiseBuffer(ctx, 'brown', dur + 0.8);
  const windSource = ctx.createBufferSource();
  windSource.buffer = windBuf;

  const windLp = ctx.createBiquadFilter();
  windLp.type = 'lowpass';
  windLp.Q.value = 0.85;
  windLp.frequency.setValueAtTime(110, now);
  windLp.frequency.exponentialRampToValueAtTime(640, now + dur * 0.82);
  windLp.frequency.exponentialRampToValueAtTime(140, now + dur + 0.6);

  const windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.001, now);
  windGain.gain.linearRampToValueAtTime(0.55, now + dur * 0.5);
  windGain.gain.linearRampToValueAtTime(0.7, now + dur * 0.82);
  windGain.gain.linearRampToValueAtTime(0.0001, now + dur + 0.6);

  windSource.connect(windLp);
  windLp.connect(windGain);
  windGain.connect(outBus);
  windSource.start(now);
  windSource.stop(now + dur + 0.68);
  warpNodes.push(windSource);

  // 2. Warm ethereal harmonic chord swell (open fifth + octave: A2 110Hz, E3 164.81Hz, A3 220Hz)
  const shimmerLp = ctx.createBiquadFilter();
  shimmerLp.type = 'lowpass';
  shimmerLp.frequency.setValueAtTime(320, now);
  shimmerLp.frequency.exponentialRampToValueAtTime(880, now + dur * 0.78);
  shimmerLp.frequency.exponentialRampToValueAtTime(360, now + dur + 0.6);
  shimmerLp.connect(outBus);

  const chordFreqs = [
    { start: 110, peak: 110, gain: 0.18, type: 'sine' },
    { start: 164.81, peak: 164.81, gain: 0.13, type: 'sine' },
    { start: 220, peak: 220, gain: 0.10, type: 'triangle' },
    { start: 329.63, peak: 329.63, gain: 0.05, type: 'sine' }
  ];

  chordFreqs.forEach((voice, idx) => {
    const osc = ctx.createOscillator();
    osc.type = voice.type;
    osc.frequency.setValueAtTime(voice.start * 0.96, now);
    osc.frequency.exponentialRampToValueAtTime(voice.peak, now + dur * 0.75);
    osc.detune.setValueAtTime((idx % 2 === 0 ? -4 : 4), now);

    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(0.0001, now);
    vGain.gain.linearRampToValueAtTime(voice.gain, now + dur * 0.35 + idx * 0.08);
    vGain.gain.linearRampToValueAtTime(voice.gain * 1.15, now + dur * 0.85);
    vGain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.62);

    osc.connect(vGain);
    vGain.connect(shimmerLp);
    osc.start(now);
    osc.stop(now + dur + 0.68);
    warpNodes.push(osc);
  });

  // 3. Soft deep sub-bass pulse (pure sine 38 Hz -> 56 Hz -> 36 Hz)
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(38, now);
  subOsc.frequency.linearRampToValueAtTime(56, now + dur * 0.75);
  subOsc.frequency.linearRampToValueAtTime(36, now + dur + 0.55);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.001, now);
  subGain.gain.linearRampToValueAtTime(0.38, now + dur * 0.35);
  subGain.gain.linearRampToValueAtTime(0.45, now + dur * 0.78);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.6);

  subOsc.connect(subGain);
  subGain.connect(warpOut);
  subOsc.start(now);
  subOsc.stop(now + dur + 0.68);
  warpNodes.push(subOsc);

  activeWarp = {
    gainNode: warpOut,
    nodes: warpNodes,
    stopTimer: setTimeout(() => {
      activeWarp = null;
    }, (dur + 0.7) * 1000)
  };
}

export function stopHyperspaceWarp(fadeSec = 0.3) {
  if (!activeWarp) return;
  if (activeWarp.stopTimer) clearTimeout(activeWarp.stopTimer);
  if (audioCtx && activeWarp.gainNode) {
    const t = audioCtx.currentTime;
    activeWarp.gainNode.gain.cancelScheduledValues(t);
    activeWarp.gainNode.gain.setValueAtTime(activeWarp.gainNode.gain.value, t);
    activeWarp.gainNode.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
    const nodes = activeWarp.nodes;
    setTimeout(() => {
      nodes.forEach(n => {
        try { n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
    }, fadeSec * 1000 + 50);
  }
  activeWarp = null;
}

/**
 * b) Rocket Launch Sound Effect
 * - Ignition crackle: burst of high-passed noise (~0.6s)
 * - Roar: grows over ~3s (brown noise LP 150 Hz -> 900 Hz with rising gain)
 * - Low rumble around 40 to 70 Hz with slow tremolo
 * - Rising air-rush layer
 * - Keeps going while rocket rises, cuts with 0.2s fade at hard cut to black
 */
export function playRocketLaunch() {
  if (!isAudioEnabled) return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;

  stopRocketLaunch(0.05);

  const now = ctx.currentTime;
  const rocketNodes = [];

  const rocketOut = ctx.createGain();
  rocketOut.gain.setValueAtTime(1.0, now);
  rocketOut.connect(duckGain);

  // 1. Ignition crackle: burst of high-passed noise, about 0.6 s
  const crackleBuf = createNoiseBuffer(ctx, 'white', 1.0);
  const crackleSource = ctx.createBufferSource();
  crackleSource.buffer = crackleBuf;

  const crackleHp = ctx.createBiquadFilter();
  crackleHp.type = 'highpass';
  crackleHp.frequency.setValueAtTime(1800, now);

  const crackleGain = ctx.createGain();
  crackleGain.gain.setValueAtTime(0.001, now);
  crackleGain.gain.linearRampToValueAtTime(0.55, now + 0.05);
  crackleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

  crackleSource.connect(crackleHp);
  crackleHp.connect(crackleGain);
  crackleGain.connect(rocketOut);
  crackleSource.start(now);
  crackleSource.stop(now + 0.65);
  rocketNodes.push(crackleSource);

  // 2. Roar that grows over ~3 seconds (brown noise through low-pass sweeping 150 Hz -> 900 Hz with rising gain)
  // Continuous buffer looped or long enough (e.g. 15s)
  const brownBuf = createNoiseBuffer(ctx, 'brown', 16.0);
  const roarSource = ctx.createBufferSource();
  roarSource.buffer = brownBuf;
  roarSource.loop = true;

  const roarLp = ctx.createBiquadFilter();
  roarLp.type = 'lowpass';
  roarLp.frequency.setValueAtTime(150, now);
  roarLp.frequency.exponentialRampToValueAtTime(900, now + 3.2);

  const roarGain = ctx.createGain();
  roarGain.gain.setValueAtTime(0.05, now);
  roarGain.gain.linearRampToValueAtTime(0.75, now + 3.0);

  roarSource.connect(roarLp);
  roarLp.connect(roarGain);
  roarGain.connect(rocketOut);
  roarSource.start(now + 0.1);
  rocketNodes.push(roarSource);

  // 3. Low rumble around 40 to 70 Hz with slow tremolo
  const rumbleOsc = ctx.createOscillator();
  rumbleOsc.type = 'sawtooth';
  rumbleOsc.frequency.setValueAtTime(45, now);
  rumbleOsc.frequency.linearRampToValueAtTime(65, now + 3.5);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(110, now);

  // Slow tremolo: ~4-5 Hz amplitude modulation
  const tremoloLfo = ctx.createOscillator();
  tremoloLfo.frequency.setValueAtTime(4.5, now);

  const tremoloDepth = ctx.createGain();
  tremoloDepth.gain.setValueAtTime(0.18, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.2, now);
  rumbleGain.gain.linearRampToValueAtTime(0.65, now + 3.0);

  tremoloLfo.connect(tremoloDepth);
  tremoloDepth.connect(rumbleGain.gain);

  rumbleOsc.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(rocketOut);

  rumbleOsc.start(now);
  tremoloLfo.start(now);
  rocketNodes.push(rumbleOsc, tremoloLfo);

  // 4. Rising air-rush layer (bandpass filtered white noise rising in frequency and volume)
  const airBuf = createNoiseBuffer(ctx, 'white', 16.0);
  const airSource = ctx.createBufferSource();
  airSource.buffer = airBuf;
  airSource.loop = true;

  const airBp = ctx.createBiquadFilter();
  airBp.type = 'bandpass';
  airBp.Q.value = 1.8;
  airBp.frequency.setValueAtTime(300, now);
  airBp.frequency.exponentialRampToValueAtTime(1400, now + 4.5);

  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0.001, now);
  airGain.gain.linearRampToValueAtTime(0.35, now + 3.5);

  airSource.connect(airBp);
  airBp.connect(airGain);
  airGain.connect(rocketOut);
  airSource.start(now + 0.3);
  rocketNodes.push(airSource);

  activeRocket = {
    gainNode: rocketOut,
    nodes: rocketNodes
  };
}

/**
 * Cuts rocket sound with 0.2 second fade (e.g. at the hard cut to black or slide exit)
 */
export function stopRocketLaunch(fadeSec = 0.2) {
  if (!activeRocket) return;
  if (audioCtx && activeRocket.gainNode) {
    const t = audioCtx.currentTime;
    activeRocket.gainNode.gain.cancelScheduledValues(t);
    activeRocket.gainNode.gain.setValueAtTime(activeRocket.gainNode.gain.value, t);
    activeRocket.gainNode.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
    const nodes = activeRocket.nodes;
    setTimeout(() => {
      nodes.forEach(n => {
        try { n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
    }, fadeSec * 1000 + 50);
  }
  activeRocket = null;
}

/**
 * Stop all active procedural sound effects
 */
export function stopAllSfx(immediate = false) {
  const fade = immediate ? 0.02 : 0.2;
  stopHyperspaceWarp(fade);
  stopRocketLaunch(fade);
}
