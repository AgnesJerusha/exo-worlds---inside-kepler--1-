/**
 * Background Music Controller — EXO WORLDS
 *
 * Manages the looping <audio id="bgMusicAudio"> element in the index.html footer
 * at a low ambient volume, ducks gently while narration speaks, and integrates
 * with the Audio Settings modal and Narrator audio state.
 *
 * Replace the empty placeholder file `audio/bg-music.mp3` with your track.
 */

export const BG_MUSIC_DEFAULT_VOLUME = 0.12; // Mild default ambient volume (12%)
export const BG_MUSIC_MAX_VOLUME = 0.40;     // Gentle cap (40%) so narration stays clear

let bgAudioEl = null;
let bgFadeTimer = null;
let bgUnavailable = false;
let isMasterEnabled = true;
let isBgEnabled = sessionStorage.getItem('exo_bg_enabled') !== 'false';
let isDucked = false;
let isUnlocked = false;
let targetBaseVolume = _readStoredVolume();

function _readStoredVolume() {
  const raw = parseFloat(sessionStorage.getItem('exo_bg_volume'));
  if (!Number.isFinite(raw)) return BG_MUSIC_DEFAULT_VOLUME;
  return Math.max(0, Math.min(BG_MUSIC_MAX_VOLUME, raw));
}

function _effectiveTargetVolume() {
  if (!isMasterEnabled || !isBgEnabled || bgUnavailable) return 0;
  return isDucked ? targetBaseVolume * 0.45 : targetBaseVolume;
}

function _clearFade() {
  if (bgFadeTimer) {
    clearInterval(bgFadeTimer);
    bgFadeTimer = null;
  }
}

function _fadeTo(targetVol, durationMs = 700, pauseWhenZero = false) {
  if (!bgAudioEl || bgUnavailable) return;
  _clearFade();

  const startVol = bgAudioEl.volume;
  const clampedTarget = Math.max(0, Math.min(1, targetVol));
  const steps = Math.max(4, Math.round(durationMs / 35));
  let step = 0;

  bgFadeTimer = setInterval(() => {
    step++;
    const p = Math.min(1, step / steps);
    bgAudioEl.volume = Math.max(0, Math.min(1, startVol + (clampedTarget - startVol) * p));
    if (p >= 1) {
      _clearFade();
      if (pauseWhenZero && clampedTarget <= 0.001) {
        bgAudioEl.pause();
      }
    }
  }, 35);
}

function _syncSettingsUI() {
  const toggleBtn = document.getElementById('bgMusicToggleBtn');
  const slider = document.getElementById('bgMusicVolumeSlider');
  const valueEl = document.getElementById('bgMusicVolumeValue');

  if (toggleBtn) {
    toggleBtn.setAttribute('aria-pressed', isBgEnabled ? 'true' : 'false');
    toggleBtn.textContent = isBgEnabled ? 'MUSIC [ON]' : 'MUSIC [OFF]';
  }
  const pct = Math.round(targetBaseVolume * 100);
  if (slider) {
    slider.value = String(pct);
    slider.disabled = !isBgEnabled;
  }
  if (valueEl) {
    valueEl.textContent = `${pct}%`;
  }
}

/**
 * Initializes the footer <audio id="bgMusicAudio"> element and binds settings controls
 */
export function initBgMusic(options = {}) {
  bgAudioEl = options.element || document.getElementById('bgMusicAudio');
  if (!bgAudioEl) {
    bgAudioEl = document.createElement('audio');
    bgAudioEl.id = 'bgMusicAudio';
    bgAudioEl.src = './audio/bg-music.mp3';
    bgAudioEl.preload = 'metadata';
    const footer = document.getElementById('bottomHud') || document.body;
    footer.appendChild(bgAudioEl);
  }

  bgAudioEl.loop = true;
  bgAudioEl.volume = 0;

  bgAudioEl.addEventListener('error', () => {
    // Gracefully stay silent while placeholder file audio/bg-music.mp3 is empty
    bgUnavailable = true;
    _clearFade();
  });

  // Bind Audio Settings modal controls
  const toggleBtn = document.getElementById('bgMusicToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      setBgMusicEnabled(!isBgEnabled);
    });
  }

  const slider = document.getElementById('bgMusicVolumeSlider');
  if (slider) {
    slider.addEventListener('input', () => {
      const pct = parseFloat(slider.value);
      setBgMusicVolume(Number.isFinite(pct) ? pct / 100 : BG_MUSIC_DEFAULT_VOLUME);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!bgAudioEl || bgUnavailable) return;
    if (document.hidden) {
      if (!bgAudioEl.paused) _fadeTo(0, 250, true);
    } else if (isUnlocked && isMasterEnabled && isBgEnabled && targetBaseVolume > 0) {
      startBgMusic();
    }
  });

  _syncSettingsUI();
}

/**
 * Starts or fades in looping background music after user gesture
 */
export function startBgMusic() {
  isUnlocked = true;
  if (!bgAudioEl || bgUnavailable || !isMasterEnabled || !isBgEnabled || targetBaseVolume <= 0.001) {
    return;
  }

  const target = _effectiveTargetVolume();
  if (bgAudioEl.paused) {
    bgAudioEl.volume = 0;
    bgAudioEl.play().then(() => {
      _fadeTo(target, 1200, false);
    }).catch(() => {
      // Placeholder empty or awaiting user gesture — fail silently
    });
  } else {
    _fadeTo(target, 450, false);
  }
}

export function stopBgMusic(immediate = false) {
  if (!bgAudioEl) return;
  if (immediate) {
    _clearFade();
    bgAudioEl.pause();
    bgAudioEl.volume = 0;
  } else {
    _fadeTo(0, 400, true);
  }
}

export function setBgMusicMasterEnabled(enabled) {
  isMasterEnabled = Boolean(enabled);
  if (!isMasterEnabled) {
    stopBgMusic(false);
  } else if (isUnlocked) {
    startBgMusic();
  }
  _syncSettingsUI();
}

export function setBgMusicEnabled(enabled) {
  isBgEnabled = Boolean(enabled);
  sessionStorage.setItem('exo_bg_enabled', isBgEnabled ? 'true' : 'false');
  isUnlocked = true;
  if (isBgEnabled && isMasterEnabled && targetBaseVolume > 0.001) {
    startBgMusic();
  } else {
    stopBgMusic(false);
  }
  _syncSettingsUI();
}

export function setBgMusicVolume(volume) {
  const clamped = Math.max(0, Math.min(BG_MUSIC_MAX_VOLUME, Number(volume) || 0));
  targetBaseVolume = clamped;
  sessionStorage.setItem('exo_bg_volume', String(clamped));
  isUnlocked = true;

  if (clamped <= 0.001) {
    stopBgMusic(false);
  } else if (isMasterEnabled && isBgEnabled && bgAudioEl && !bgUnavailable) {
    if (bgAudioEl.paused) {
      startBgMusic();
    } else {
      _clearFade();
      bgAudioEl.volume = _effectiveTargetVolume();
    }
  }
  _syncSettingsUI();
}

export function setBgMusicDucked(ducked) {
  isDucked = Boolean(ducked);
  if (bgAudioEl && !bgUnavailable && !bgAudioEl.paused && isMasterEnabled && isBgEnabled) {
    _fadeTo(_effectiveTargetVolume(), 450, false);
  }
}

export function getBgMusicVolume() { return targetBaseVolume; }
export function isBgMusicEnabled() { return isBgEnabled; }
