/**
 * Narrator Audio System — EXO WORLDS
 *
 * Features:
 *  - OFF by default; first click is the user gesture that unlocks Web Audio
 *  - 0.8 s delay after slide transition before playback begins
 *  - 300 ms fade-out when changing slides
 *  - Web Audio API: decodes MP3, analyses RMS to detect silent-gap phrase boundaries
 *  - requestAnimationFrame caption driver that follows audio.currentTime (never drifts)
 *  - Fallback: proportional character-count spread if analysis fails
 *  - Manual cues: if slide JSON has a `cues` array, use it instead of auto-detection
 *  - Play / Pause / Replay controls exposed for the UI
 *  - sessionStorage persistence of on/off choice
 *  - Debug overlay toggled with D key: shows currentTime + detected boundaries
 *  - Quiet failure on missing MP3: toast notice, falls back to timed typing
 */

import { setSfxEnabled, setNarratorSpeaking, stopAllSfx, startBgMusic } from './sfx.js';

// ─── State ────────────────────────────────────────────────────────────────────
// Narrator Audio starts ON ([ON]) every time the site opens unless visitor turned it OFF in sessionStorage
let isEnabled = sessionStorage.getItem('exo_audio_enabled') !== 'false';
let isUnlocked = false; // Whether first user gesture has occurred
let toastCallback = null;

// HTMLAudioElement for playback (clock source)
let audio = new Audio();
audio.preload = 'auto';

// Web Audio context — created lazily on first user gesture
let audioCtx = null;

// Per-slide analysis cache: { src → { duration, boundaries: [t0, t1, …] } }
const analysisCache = new Map();

// Current slide state
let currentSlideId = null;
let currentSrc = null;         // e.g. "audio/ch1-s01.mp3"
let currentSlideData = null;   // { text, phrases, breakMs, cues?, rolling? }
let startDelayTimer = null;    // setTimeout handle for 0.8 s delay
let fadeTimer = null;          // setInterval handle for 300 ms fade-out
let playbackToken = 0;         // cancels stale async audio loads on slide change

// Caption driver state
let captionRafId = null;
let captionSlideData = null;   // snapshot used by the rAF loop
let captionBoundaries = null;  // [t0, t1, …] in seconds (N-1 values for N phrases)
let captionWindows = null;     // optional per-phrase [{ speechStart, speechEnd }] for c3-s05
let captionPaused = false;
let captionPausedAt = 0;       // audio.currentTime when paused

// Callbacks
let onAudioEndedCb = null;     // notifies chapter1/2 when playback ends
let onTypingDoneCb = null;     // notifies when both audio + captions are finished
let onAudioFallbackCb = null;  // notifies chapter2 when audio file is missing/unavailable

// Debug
let debugVisible = false;

// ─── Init ────────────────────────────────────────────────────────────────────
export function initNarrator(options = {}) {
  toastCallback = options.showToast || null;

  // Sync SFX enabled state
  setSfxEnabled(isEnabled);

  // Restore CC button text
  _updateAudioButtonUI();

  // Setup gesture unlocker and sound hint
  _setupUnlockListeners();

  // Audio button: toggle on/off
  const audioBtn = document.getElementById('audioBtn');
  if (audioBtn) audioBtn.addEventListener('click', () => toggleAudio());

  // Play/Pause button
  const ppBtn = document.getElementById('narratorPlayPauseBtn');
  if (ppBtn) ppBtn.addEventListener('click', () => togglePlayPause());

  // Replay button
  const replayBtn = document.getElementById('narratorReplayBtn');
  if (replayBtn) replayBtn.addEventListener('click', () => replaySlide());

  // Audio ended
  audio.addEventListener('ended', _onAudioEnded);

  // Audio load error (file missing / network issue)
  audio.addEventListener('error', _onAudioError);

  // Debug overlay — D key
  document.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') {
      if (!e.target.matches('input, textarea')) _toggleDebug();
    }
  });

  _buildDebugOverlay();
}

/**
 * Sets up first user gesture unlock listener across the whole window
 */
function _setupUnlockListeners() {
  const hintEl = document.getElementById('audioHint');
  if (hintEl) {
    if (isEnabled && !isUnlocked) {
      hintEl.style.display = 'block';
    } else {
      hintEl.style.display = 'none';
    }
  }

  function handleFirstGesture() {
    if (isUnlocked) return;
    isUnlocked = true;

    if (hintEl) {
      hintEl.style.display = 'none';
    }

    _ensureAudioCtx();
    if (isEnabled) startBgMusic();

    // Defer slightly so capture-phase clicks on Next/Topic buttons update currentSrc first
    const unlockedSrc = currentSrc;
    setTimeout(() => {
      if (isEnabled && currentSrc && currentSrc === unlockedSrc && currentSlideData && audio.paused) {
        _cancelDelay();
        _beginSlidePlayback(currentSrc, currentSlideData);
      }
    }, 40);

    window.removeEventListener('click', handleFirstGesture, true);
    window.removeEventListener('touchstart', handleFirstGesture, true);
    window.removeEventListener('keydown', handleFirstGesture, true);
  }

  window.addEventListener('click', handleFirstGesture, true);
  window.addEventListener('touchstart', handleFirstGesture, true);
  window.addEventListener('keydown', handleFirstGesture, true);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Called by chapter1.js / chapter2.js every time a new slide is loaded */
export function setActiveAudioSlide(slideId, slideData) {
  // slideData: { text, phrases, breakMs, cues?, audio (src path), rolling? }
  playbackToken++;
  _cancelDelay();
  _fadeOutAndStop();

  currentSlideId = slideId;
  currentSlideData = slideData;
  const src = slideData && slideData.audio ? './' + slideData.audio : null;

  // Prologue pages or silent slides (no audio path — fail quietly)
  if (!src || slideId === 'hero' || slideId === 'tribute' || slideId === 'hub') {
    currentSrc = null;
    _stopCaptionDriver();
    return;
  }

  currentSrc = src;
  _stopCaptionDriver();

  if (isEnabled) {
    if (isUnlocked) {
      _ensureAudioCtx();
      // 0.8 s delay
      const expectedToken = playbackToken;
      startDelayTimer = setTimeout(() => {
        if (expectedToken === playbackToken && isEnabled && currentSrc === src) {
          _beginSlidePlayback(src, slideData);
        }
      }, 800);
    }
    // If not yet unlocked by a user gesture, the gesture handler will start playback as soon as user clicks/taps/keys anywhere
  }
  // If audio is OFF we just leave it; chapter1.js runs timed typing on its own
}

/** Toggle narrator on/off — the first click is the user gesture */
export function toggleAudio() {
  isEnabled = !isEnabled;
  sessionStorage.setItem('exo_audio_enabled', isEnabled ? 'true' : 'false');
  isUnlocked = true; // Button click is explicitly a user gesture
  const hintEl = document.getElementById('audioHint');
  if (hintEl) hintEl.style.display = 'none';

  setSfxEnabled(isEnabled);
  _ensureAudioCtx(); // gesture unlocks Web Audio
  _updateAudioButtonUI();

  if (isEnabled) {
    // Start current slide's audio from the beginning
    if (currentSrc && currentSlideData) {
      _cancelDelay();
      startDelayTimer = setTimeout(() => _beginSlidePlayback(currentSrc, currentSlideData), 800);
    }
  } else {
    _cancelDelay();
    _fadeOutAndStop();
    _stopCaptionDriver();
    stopAllSfx(true);
  }

  return isEnabled;
}

export function isAudioEnabled() { return isEnabled; }

/** Returns current audio duration (0 if unknown) */
export function getAudioDuration() {
  if (audio && !isNaN(audio.duration) && audio.duration > 0) return audio.duration;
  return 0;
}

/** Pause / resume the current clip */
export function togglePlayPause() {
  if (!isEnabled || !currentSrc) return;
  if (audio.paused) {
    captionPaused = false;
    audio.play().catch(() => {});
    setNarratorSpeaking(true);
    _startCaptionDriver();
  } else {
    captionPaused = true;
    captionPausedAt = audio.currentTime;
    audio.pause();
    setNarratorSpeaking(false);
    _stopCaptionDriver();
  }
  _updatePlayPauseBtn();
}

/** Restart the current clip (and caption) from time 0 */
export function replaySlide() {
  if (!isEnabled || !currentSrc || !currentSlideData) return;
  _stopCaptionDriver();
  audio.currentTime = 0;
  captionPaused = false;
  audio.play().catch(() => {});
  setNarratorSpeaking(true);
  _startCaptionDriver();
  _updatePlayPauseBtn();
}

/** Register callback for when audio+captions both finish */
export function setAudioEndedCallback(cb) { onAudioEndedCb = cb; }

/** Register callback for when audio fails to load and captions should continue via timer */
export function setAudioFallbackCallback(cb) { onAudioFallbackCb = cb; }

/** Immediately stop current narrator audio and caption loop (e.g., user selects topic button) */
export function stopNarratorAudio() {
  playbackToken++;
  currentSrc = null;
  _cancelDelay();
  _fadeOutAndStop();
  _stopCaptionDriver();
  _updatePlayPauseBtn();
}

// ─── Internal playback ────────────────────────────────────────────────────────

function _beginSlidePlayback(src, slideData) {
  const token = ++playbackToken;
  _stopCaptionDriver();

  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  audio.pause();
  audio.src = src;
  audio.currentTime = 0;
  audio.volume = 1.0;

  // Try to decode + analyse to get phrase boundaries, then play
  _getOrAnalyse(src, slideData).then(boundaries => {
    if (token !== playbackToken || !isEnabled || currentSrc !== src) return;

    captionBoundaries = boundaries;
    captionWindows    = (analysisCache.get(src) && analysisCache.get(src).windows) || null;
    captionSlideData  = slideData;
    captionPaused     = false;

    _debugLog(src, slideData, boundaries);

    audio.play().then(() => {
      if (token !== playbackToken) {
        audio.pause();
        return;
      }
      setNarratorSpeaking(true);
      _startCaptionDriver();
      _updatePlayPauseBtn();
    }).catch(err => {
      if (token !== playbackToken) return;
      if (err && err.name === 'AbortError') return;
      if (err && err.name === 'NotAllowedError') {
        setNarratorSpeaking(false);
        isUnlocked = false;
        _setupUnlockListeners();
        return;
      }
      setNarratorSpeaking(false);
      _onAudioError(err);
    });
  });
}

function _fadeOutAndStop() {
  setNarratorSpeaking(false);
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  if (!audio.paused) {
    const startVol = audio.volume;
    const steps = 10;
    let step = 0;
    fadeTimer = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        audio.pause();
        audio.volume = 1.0;
      }
    }, 30); // ~300 ms total
  }
}

function _cancelDelay() {
  if (startDelayTimer) { clearTimeout(startDelayTimer); startDelayTimer = null; }
}

function _ensureAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

// ─── Phrase-boundary analysis ─────────────────────────────────────────────────
/**
 * Returns a promise that resolves to an array of boundary times in seconds.
 * For N phrases there are N-1 boundaries.
 * Order of preference:
 *   1. Manual cues array in slideData
 *   2. Cached result
 *   3. Web Audio RMS silence detection
 *   4. Proportional character-count fallback
 */
async function _getOrAnalyse(src, slideData) {
  const phrases = slideData.phrases || [slideData.text];
  const N = phrases.length;

  // 1. Manual cues
  if (slideData.cues && slideData.cues.length >= N - 1) {
    return slideData.cues.slice(0, N - 1);
  }

  // 2. Cache
  if (analysisCache.has(src)) {
    return analysisCache.get(src).boundaries;
  }

  // 3. Web Audio decode + RMS silence detection
  if (audioCtx && N > 1) {
    try {
      const ab = await _fetchArrayBuffer(src);
      const decoded = await audioCtx.decodeAudioData(ab);
      const duration = decoded.duration;

      if (slideData.id === 'c3-s05') {
        const res = _detectClosingWindows(decoded, phrases, slideData.breakMs || []);
        analysisCache.set(src, { duration, boundaries: res.boundaries, windows: res.windows });
        return res.boundaries;
      }

      const boundaries = _detectSilences(decoded, N - 1);
      analysisCache.set(src, { duration, boundaries });
      return boundaries;
    } catch (e) {
      // fall through to proportional
    }
  }

  // 4. Proportional fallback: use audio duration if known, else estimate from bitrate
  const dur = (!isNaN(audio.duration) && audio.duration > 0) ? audio.duration
            : _estimateDuration(slideData);
  if (slideData.id === 'c3-s05') {
    const res = _proportionalClosingWindows(phrases, slideData.breakMs || [], dur);
    analysisCache.set(src, { duration: dur, boundaries: res.boundaries, windows: res.windows });
    return res.boundaries;
  }
  const boundaries = _proportionalBoundaries(phrases, slideData.breakMs || [], dur);
  analysisCache.set(src, { duration: dur, boundaries });
  return boundaries;
}

async function _fetchArrayBuffer(src) {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.arrayBuffer();
}

/**
 * Find the N strongest silent gaps in the decoded audio buffer.
 * Returns sorted boundary times (the midpoint of each gap).
 */
function _detectSilences(decoded, count) {
  const ch = decoded.getChannelData(0);
  const sr = decoded.sampleRate;
  const windowSz = Math.round(sr * 0.03); // 30 ms RMS window
  const minGapSamples = Math.round(sr * 0.45); // 0.45 s min gap length

  // Compute RMS per window
  const numWindows = Math.floor(ch.length / windowSz);
  const rms = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let sum = 0;
    const off = w * windowSz;
    for (let s = 0; s < windowSz; s++) sum += ch[off + s] ** 2;
    rms[w] = Math.sqrt(sum / windowSz);
  }

  // Adaptive threshold: 8% of median RMS (ignores quiet passages in loud files)
  const sorted = Float32Array.from(rms).sort();
  const median = sorted[Math.floor(sorted.length * 0.65)];
  const threshold = median * 0.10;

  // Find contiguous silent regions
  const gaps = [];
  let inGap = false;
  let gapStart = 0;

  for (let w = 0; w < numWindows; w++) {
    if (rms[w] <= threshold) {
      if (!inGap) { inGap = true; gapStart = w; }
    } else {
      if (inGap) {
        const gapSamples = (w - gapStart) * windowSz;
        if (gapSamples >= minGapSamples) {
          const midSec = ((gapStart + (w - gapStart) / 2) * windowSz) / sr;
          gaps.push({ t: midSec, len: gapSamples });
        }
        inGap = false;
      }
    }
  }

  if (gaps.length === 0) {
    // No silence found — use proportional fallback inside the duration
    return _proportionalBoundaries(
      Array(count + 1).fill('x'), [], decoded.duration
    );
  }

  // Pick the `count` longest gaps
  gaps.sort((a, b) => b.len - a.len);
  const chosen = gaps.slice(0, count).map(g => g.t).sort((a, b) => a - b);

  // If we got fewer gaps than needed, pad with proportional points
  while (chosen.length < count) {
    chosen.push(decoded.duration * (chosen.length + 1) / (count + 1));
    chosen.sort((a, b) => a - b);
  }

  return chosen;
}

/** Proportional: distribute phrase boundaries by character count + break durations */
function _proportionalBoundaries(phrases, breakMs, totalDur) {
  const breakTotSec = (breakMs || []).reduce((s, v) => s + v / 1000, 0);
  const speechDur   = Math.max(1, totalDur - breakTotSec);
  const totalChars  = phrases.reduce((s, p) => s + p.length, 0) || 1;

  const boundaries = [];
  let elapsed = 0;

  for (let i = 0; i < phrases.length - 1; i++) {
    const phraseDur  = (phrases[i].length / totalChars) * speechDur;
    const breakAfter = (breakMs && breakMs[i]) ? breakMs[i] / 1000 : 0;
    elapsed += phraseDur + breakAfter;
    boundaries.push(elapsed);
  }

  return boundaries;
}

/** Tight speech-window proportional fallback scoped to c3-s05 */
function _proportionalClosingWindows(phrases, breakMs, totalDur) {
  const breakTotSec = (breakMs || []).reduce((s, v) => s + v / 1000, 0);
  const speechDur   = Math.max(1, totalDur - breakTotSec);
  const totalChars  = phrases.reduce((s, p) => s + p.length, 0) || 1;

  const windows = [];
  const boundaries = [];
  let t = 0;

  for (let i = 0; i < phrases.length; i++) {
    const phraseDur = (phrases[i].length / totalChars) * speechDur;
    const start = t;
    const end = start + phraseDur;
    windows.push({ speechStart: start, speechEnd: end });
    const breakAfter = (breakMs && breakMs[i]) ? breakMs[i] / 1000 : 0;
    t = end + breakAfter;
    if (i < phrases.length - 1) {
      boundaries.push(Math.max(end, t - 0.05));
    }
  }

  return { boundaries, windows };
}

/**
 * Expected-position-guided silence matcher for c3-s05 so intra-paragraph
 * breaths in the long body sentence never steal boundaries from the 3 opening phrases.
 */
function _detectClosingWindows(decoded, phrases, breakMs) {
  const ch = decoded.getChannelData(0);
  const sr = decoded.sampleRate;
  const windowSz = Math.round(sr * 0.03);
  const minGapSamples = Math.round(sr * 0.35);

  const numWindows = Math.floor(ch.length / windowSz);
  const rms = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let sum = 0;
    const off = w * windowSz;
    for (let s = 0; s < windowSz; s++) sum += ch[off + s] ** 2;
    rms[w] = Math.sqrt(sum / windowSz);
  }

  const sorted = Float32Array.from(rms).sort();
  const median = sorted[Math.floor(sorted.length * 0.65)] || 0.02;
  const threshold = Math.max(0.002, median * 0.12);

  let firstSpeechSec = 0;
  for (let w = 0; w < numWindows; w++) {
    if (rms[w] > threshold) {
      firstSpeechSec = (w * windowSz) / sr;
      break;
    }
  }
  let lastSpeechSec = decoded.duration;
  for (let w = numWindows - 1; w >= 0; w--) {
    if (rms[w] > threshold) {
      lastSpeechSec = Math.min(decoded.duration, ((w + 1) * windowSz) / sr);
      break;
    }
  }

  const gaps = [];
  let inGap = false;
  let gapStart = 0;
  for (let w = 0; w < numWindows; w++) {
    const tSec = (w * windowSz) / sr;
    if (tSec < firstSpeechSec || tSec > lastSpeechSec) continue;
    if (rms[w] <= threshold) {
      if (!inGap) { inGap = true; gapStart = w; }
    } else if (inGap) {
      const gapSamples = (w - gapStart) * windowSz;
      if (gapSamples >= minGapSamples) {
        const startSec = (gapStart * windowSz) / sr;
        const endSec = (w * windowSz) / sr;
        gaps.push({
          startSec,
          endSec,
          midSec: (startSec + endSec) / 2,
          durSec: endSec - startSec
        });
      }
      inGap = false;
    }
  }

  const N = phrases.length;
  const activeSpan = Math.max(2, lastSpeechSec - firstSpeechSec);
  const prop = _proportionalClosingWindows(phrases, breakMs, activeSpan);
  const expectedGaps = prop.boundaries.map(b => firstSpeechSec + b);

  const used = new Set();
  const chosenGaps = [];
  let minAllowed = firstSpeechSec + 0.35;

  for (let i = 0; i < N - 1; i++) {
    const targetT = expectedGaps[i];
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let g = 0; g < gaps.length; g++) {
      if (used.has(g)) continue;
      const gap = gaps[g];
      if (gap.startSec < minAllowed) continue;
      const dist = Math.abs(gap.midSec - targetT);
      if (dist > 3.2) continue;
      const score = gap.durSec - dist * 0.28;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = g;
      }
    }

    if (bestIdx >= 0) {
      used.add(bestIdx);
      const g = gaps[bestIdx];
      chosenGaps.push(g);
      minAllowed = g.endSec + 0.35;
    } else {
      const fallbackStart = Math.max(minAllowed, targetT - 0.25);
      const fallbackEnd = Math.min(lastSpeechSec - 0.3, fallbackStart + 0.4);
      chosenGaps.push({
        startSec: fallbackStart,
        endSec: fallbackEnd,
        midSec: (fallbackStart + fallbackEnd) / 2,
        durSec: fallbackEnd - fallbackStart
      });
      minAllowed = fallbackEnd + 0.35;
    }
  }

  const windows = [];
  const boundaries = [];
  for (let i = 0; i < N; i++) {
    const speechStart = i === 0 ? firstSpeechSec : chosenGaps[i - 1].endSec;
    const speechEnd = i === N - 1 ? lastSpeechSec : chosenGaps[i].startSec;
    windows.push({
      speechStart,
      speechEnd: Math.max(speechStart + 0.25, speechEnd)
    });
    if (i < N - 1) {
      boundaries.push(Math.max(0, chosenGaps[i].endSec - 0.04));
    }
  }

  return { boundaries, windows };
}

function _estimateDuration(slideData) {
  // 150 wpm average speech → chars per second ≈ 12.5
  const textLen = (slideData.text || '').length;
  const breakSec = (slideData.breakMs || []).reduce((s, v) => s + v / 1000, 0);
  return (textLen / 12.5) + breakSec;
}

// ─── requestAnimationFrame caption driver ─────────────────────────────────────
/**
 * Drives caption display against audio.currentTime.
 * Each phrase is typed character-by-character. Progress within a phrase is
 * mapped linearly between its start boundary and the next boundary (or the
 * end of the audio).
 */
function _spawnRollingFadeOut(prevText) {
  const row = document.getElementById('dialogueRow');
  if (!row || !prevText) return;
  row.querySelectorAll('.subtitle-ghost').forEach(el => el.remove());
  const ghost = document.createElement('p');
  ghost.className = 'subtitle-text subtitle-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = prevText;
  row.appendChild(ghost);
  requestAnimationFrame(() => {
    ghost.classList.add('fading');
  });
  setTimeout(() => {
    if (ghost.parentNode) ghost.remove();
  }, 420);
}

function _emitPhraseStart(slideId, phraseIndex, phrase) {
  window.dispatchEvent(new CustomEvent('exo:phrase-start', {
    detail: { slideId, phraseIndex, phrase }
  }));
}

function _startCaptionDriver() {
  _stopCaptionDriver();

  const subEl = document.getElementById('subtitleText');
  if (!subEl || !captionSlideData) return;

  const phrases    = captionSlideData.phrases || [captionSlideData.text];
  const boundaries = captionBoundaries || [];
  const isRolling  = Boolean(captionSlideData.rolling);
  const activeSlideId = currentSlideId;

  // Phrase start times (the previous boundary, or 0 for the first)
  const phStart = [0, ...boundaries];
  // Phrase end times (the next boundary, or Infinity for the last)
  const phEnd   = [...boundaries, Infinity];

  subEl.textContent = '';
  let lastDisplayed = '';
  let lastPhraseIdx = -1;

  function frame() {
    if (!captionRafId) return; // stopped externally

    const t = audio.currentTime;
    let display = '';
    let activeIdx = 0;
    let activeProgress = 0;

    if (isRolling) {
      for (let i = 0; i < phrases.length; i++) {
        const start = phStart[i];
        const end = phEnd[i] === Infinity
          ? (audio.duration > 0 ? audio.duration : start + 60)
          : phEnd[i];
        if (t >= start) {
          activeIdx = i;
        }
        if (t >= start && t < end) {
          const win = (activeSlideId === 'c3-s05' && captionWindows && captionWindows[i]) ? captionWindows[i] : null;
          const wStart = win ? win.speechStart : start;
          const wEnd = win ? win.speechEnd : end;
          activeProgress = Math.max(0, Math.min(1, (t - wStart) / Math.max(0.1, wEnd - wStart)));
          const chars = Math.round(activeProgress * phrases[i].length);
          display = phrases[i].slice(0, chars);
          break;
        } else if (t >= end && i === phrases.length - 1) {
          activeProgress = 1;
          display = phrases[i];
        }
      }

      if (activeIdx !== lastPhraseIdx) {
        if (lastPhraseIdx >= 0 && phrases[lastPhraseIdx]) {
          _spawnRollingFadeOut(phrases[lastPhraseIdx]);
        }
        lastPhraseIdx = activeIdx;
        _emitPhraseStart(activeSlideId, activeIdx, phrases[activeIdx]);
      }

      if (activeSlideId === 'c3-s05') {
        window.dispatchEvent(new CustomEvent('exo:phrase-progress', {
          detail: { slideId: activeSlideId, phraseIndex: activeIdx, progress: activeProgress }
        }));
      }
    } else {
      for (let i = 0; i < phrases.length; i++) {
        const start = phStart[i];
        const end   = phEnd[i] === Infinity
          ? (audio.duration > 0 ? audio.duration : start + 60)
          : phEnd[i];

        if (t < start) break; // not yet

        if (t >= end) {
          display += (i > 0 ? ' ' : '') + phrases[i];
          activeIdx = i;
        } else {
          const progress = (t - start) / (end - start);
          const chars = Math.round(progress * phrases[i].length);
          display += (i > 0 ? ' ' : '') + phrases[i].slice(0, chars);
          activeIdx = i;
          break;
        }
      }

      if (activeIdx !== lastPhraseIdx && phrases[activeIdx]) {
        lastPhraseIdx = activeIdx;
        _emitPhraseStart(activeSlideId, activeIdx, phrases[activeIdx]);
      }
    }

    if (display !== lastDisplayed) {
      subEl.textContent = display;
      lastDisplayed = display;
    }

    // Update debug overlay
    _updateDebugOverlay(t, boundaries);

    captionRafId = requestAnimationFrame(frame);
  }

  captionRafId = requestAnimationFrame(frame);
}

function _stopCaptionDriver() {
  if (captionRafId) { cancelAnimationFrame(captionRafId); captionRafId = null; }
}

// ─── Audio events ─────────────────────────────────────────────────────────────
function _onAudioEnded() {
  setNarratorSpeaking(false);
  _stopCaptionDriver();
  _updatePlayPauseBtn();

  // Ensure captions are fully shown
  const subEl = document.getElementById('subtitleText');
  if (subEl && captionSlideData) {
    if (captionSlideData.rolling && captionSlideData.phrases && captionSlideData.phrases.length) {
      subEl.textContent = captionSlideData.phrases[captionSlideData.phrases.length - 1];
    } else {
      subEl.textContent = captionSlideData.text || '';
    }
  }

  window.dispatchEvent(new CustomEvent('exo:audio-ended', { detail: { slideId: currentSlideId } }));
  if (onAudioEndedCb) onAudioEndedCb();
}

function _onAudioError(err) {
  if (err && err.name === 'AbortError') return;
  setNarratorSpeaking(false);
  _stopCaptionDriver();
  if (isEnabled && currentSrc && audio.getAttribute('src')) {
    if (toastCallback) toastCallback(`Audio unavailable — narration continues as captions`);
    window.dispatchEvent(new CustomEvent('exo:audio-fallback', {
      detail: { slideId: currentSlideId, slideData: currentSlideData }
    }));
    if (onAudioFallbackCb) onAudioFallbackCb(currentSlideId, currentSlideData);
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function _updateAudioButtonUI() {
  const btn = document.getElementById('audioBtn');
  if (!btn) return;
  btn.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
  btn.innerHTML = isEnabled ? '&#10074;&#10074; NARRATOR [ON]' : '&#9654; NARRATOR [OFF]';
  _updatePlayPauseBtn();
}

function _updatePlayPauseBtn() {
  const btn = document.getElementById('narratorPlayPauseBtn');
  if (!btn) return;
  btn.style.display = isEnabled ? 'inline-flex' : 'none';
  btn.textContent = audio.paused ? '▶' : '⏸';
  btn.title = audio.paused ? 'Play' : 'Pause';
}

// ─── Debug overlay ────────────────────────────────────────────────────────────
function _buildDebugOverlay() {
  if (document.getElementById('narratorDebug')) return;
  const el = document.createElement('div');
  el.id = 'narratorDebug';
  el.style.cssText = [
    'position:fixed', 'bottom:200px', 'right:14px', 'z-index:9999',
    'background:rgba(2,3,10,0.88)', 'color:#8fd3ff',
    'font:700 11px/1.6 monospace', 'padding:10px 14px', 'border-radius:10px',
    'border:1px solid rgba(143,211,255,0.3)', 'display:none',
    'pointer-events:none', 'max-width:320px', 'word-break:break-all'
  ].join(';');
  document.body.appendChild(el);
}

function _toggleDebug() {
  debugVisible = !debugVisible;
  const el = document.getElementById('narratorDebug');
  if (el) el.style.display = debugVisible ? 'block' : 'none';
}

function _updateDebugOverlay(t, boundaries) {
  if (!debugVisible) return;
  const el = document.getElementById('narratorDebug');
  if (!el) return;
  const src = currentSrc ? currentSrc.split('/').pop() : '—';
  const dur = audio.duration ? audio.duration.toFixed(2) : '?';
  const bStr = boundaries.map(b => b.toFixed(2)).join(' | ') || '(none)';
  el.innerHTML =
    `FILE: ${src}<br>` +
    `TIME: ${t.toFixed(3)} / ${dur}s<br>` +
    `PHRASES: ${captionSlideData ? (captionSlideData.phrases || []).length : '?'}<br>` +
    `BOUNDARIES: ${bStr}`;
}

function _debugLog(src, slideData, boundaries) {
  const phrases = slideData.phrases || [slideData.text];
  const dur = audio.duration || '(pending)';
  console.debug(
    `[Narrator] ${src.split('/').pop()} | dur=${dur} | ` +
    `phrases=${phrases.length} | boundaries=[${boundaries.map(b => b.toFixed(2)).join(', ')}]`
  );
}
