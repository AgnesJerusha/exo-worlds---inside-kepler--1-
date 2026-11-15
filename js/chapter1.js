/**
 * Chapter 1 Controller — AWAKENING THE COSMOS: THE KEPLER STORY
 *
 * Polished to match Chapter 2 & Chapter 3 flow:
 * - Entry Title Card (blur -> hold ~2.3s -> glide top-left)
 * - Section Title Cards with tracked timers & clean skip support
 * - Smooth rolling captions (up to 3 lines, 0.4s ghost fade-out) synced to voice or offline fallback
 * - Clean compact TELEMETRY fact fade-in when present
 * - Title-card visibility hook for Side Star sub-navigation menu
 */

import { setVisualSlide, startVisualLoop, stopVisualLoop } from './visuals.js';
import {
  setActiveAudioSlide,
  isAudioEnabled
} from './narrator.js';

// ─── State ────────────────────────────────────────────────────────────────────
let chapterData          = null;
let currentSlideIndex    = 0;
let currentSectionNumber = -1;
let currentSlide         = null;

let isChapterIntroActive = false;
let isTitleCardActive    = false;
let isCCEnabled          = sessionStorage.getItem('exo_cc_enabled') !== 'false';

// Offline timed-typing state
let isTyping             = false;
let typeTimeouts         = [];
let phaseSequenceTimers  = [];
let factTimeout          = null;
let pendingPhaseCallback = null;

// Callbacks
let onTypingCompleteCallback = null;
let onSlideChangeCallback    = null;
let onTitleCardStateChange   = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initChapter1(callbacks = {}) {
  onTypingCompleteCallback = callbacks.onTypingComplete || null;
  onSlideChangeCallback    = callbacks.onSlideChange    || null;
  onTitleCardStateChange   = callbacks.onTitleCardStateChange || null;

  try {
    const res = await fetch('./data/chapter1.json');
    chapterData = await res.json();
  } catch (err) {
    console.error('Failed to load data/chapter1.json', err);
  }

  window.addEventListener('exo:audio-ended', (e) => {
    if (!e.detail || !currentSlide || e.detail.slideId !== currentSlide.id) return;
    _checkAllDone();
  });

  window.addEventListener('exo:audio-fallback', (e) => {
    if (!e.detail || !currentSlide || e.detail.slideId !== currentSlide.id) return;
    _clearTypingOnly();
    _typeRollingPhrasesOffline(currentSlide);
  });

  _initCCButton();
}

// ─── Public queries ───────────────────────────────────────────────────────────
export function getChapterData()         { return chapterData; }
export function getTotalSlides()         { return chapterData ? chapterData.slides.length : 10; }
export function getCurrentSlideIndex()   { return currentSlideIndex; }
export function getCurrentSlideId()      { return currentSlide ? currentSlide.id : null; }

export function getChapter1SlideIndexById(slideId) {
  if (!chapterData) return -1;
  return chapterData.slides.findIndex(s => s.id === slideId);
}

/** True while any title card or offline rolling typing is active */
export function isTypingActive() {
  return isChapterIntroActive || isTitleCardActive || isTyping;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
export function startChapter1Cinematic(onReady) {
  currentSlideIndex    = 0;
  currentSectionNumber = -1;
  startVisualLoop();
  setVisualSlide('s01');

  _playChapter1IntroCard(() => {
    _loadSlide(0, true, onReady);
  });
}

export function goToChapterSlide(index) {
  if (!chapterData || index < 0 || index >= chapterData.slides.length) return;

  const nextSlide      = chapterData.slides[index];
  const sectionChanged = currentSectionNumber !== nextSlide.section;
  currentSlideIndex    = index;

  startVisualLoop();

  if (sectionChanged) {
    _playSectionTitleCard(nextSlide, () => _loadSlide(index, false));
  } else {
    _loadSlide(index, false);
  }
}

export function exitChapter1() {
  _clearAllTyping();
  pendingPhaseCallback = null;
  _hideAllChapter1Overlays();
  stopVisualLoop();
  currentSectionNumber = -1;
  isChapterIntroActive = false;
  isTitleCardActive    = false;
  _notifyTitleCardState();
}

// ─── Instant completion (Space / Enter / click) ───────────────────────────────
export function completeTypingInstantly() {
  if (isChapterIntroActive) {
    _clearAllTyping();
    const intro = document.getElementById('ch1IntroOverlay');
    if (intro) intro.classList.remove('active', 'revealed', 'glide');
    isChapterIntroActive = false;
    _notifyTitleCardState();
    const cb = pendingPhaseCallback;
    pendingPhaseCallback = null;
    if (cb) cb();
    return;
  }

  if (isTitleCardActive) {
    _clearAllTyping();
    const overlay = document.getElementById('chTitleCardOverlay');
    if (overlay) overlay.classList.remove('revealed', 'active');
    isTitleCardActive = false;
    _notifyTitleCardState();
    const cb = pendingPhaseCallback;
    pendingPhaseCallback = null;
    if (cb) cb();
    return;
  }

  if (!currentSlide) return;

  _clearAllTyping();

  const subEl = document.getElementById('subtitleText');
  if (subEl && currentSlide.phrases && currentSlide.phrases.length) {
    const lastIdx = currentSlide.phrases.length - 1;
    subEl.textContent = currentSlide.phrases[lastIdx];
    window.dispatchEvent(new CustomEvent('exo:phrase-start', {
      detail: {
        slideId: currentSlide.id,
        phraseIndex: lastIdx,
        phrase: currentSlide.phrases[lastIdx],
        instant: true
      }
    }));
  } else if (subEl) {
    subEl.textContent = currentSlide.text || '';
  }

  const factEl = document.getElementById('factText');
  if (factEl && currentSlide.fact) {
    factEl.textContent = currentSlide.fact;
    factEl.style.opacity = '1';
  }

  isTyping = false;
  _checkAllDone();
}

function _notifyTitleCardState() {
  if (onTitleCardStateChange) {
    onTitleCardStateChange(isChapterIntroActive || isTitleCardActive);
  }
}

// ─── CC toggle ────────────────────────────────────────────────────────────────
function _initCCButton() {
  const ccBtn      = document.getElementById('ccBtn');
  const bottomCard = document.getElementById('bottomCard');

  function update() {
    if (ccBtn) {
      ccBtn.setAttribute('aria-pressed', isCCEnabled ? 'true' : 'false');
      ccBtn.textContent = isCCEnabled ? 'CC [ON]' : 'CC [OFF]';
    }
    if (bottomCard) bottomCard.classList.toggle('cc-hidden', !isCCEnabled);
    sessionStorage.setItem('exo_cc_enabled', isCCEnabled ? 'true' : 'false');
  }

  update();
  if (ccBtn) ccBtn.addEventListener('click', () => { isCCEnabled = !isCCEnabled; update(); });
}

// ─── Chapter 1 Entry Intro Card ───────────────────────────────────────────────
function _playChapter1IntroCard(onComplete) {
  _clearAllTyping();
  const bottomCard = document.getElementById('bottomCard');
  if (bottomCard) bottomCard.classList.add('deck-hidden');
  isChapterIntroActive = true;
  pendingPhaseCallback = () => {
    _updatePersistentHeader('THE MYSTERY OF THE UNIVERSE', 'Is anyone out there?', false);
    if (onComplete) onComplete();
  };
  _notifyTitleCardState();

  const overlay = document.getElementById('ch1IntroOverlay');
  if (!overlay) {
    isChapterIntroActive = false;
    _notifyTitleCardState();
    const cb = pendingPhaseCallback;
    pendingPhaseCallback = null;
    if (cb) cb();
    return;
  }

  _updatePersistentHeader('THE MYSTERY OF THE UNIVERSE', 'Is anyone out there?', true);
  overlay.classList.remove('glide', 'revealed');
  overlay.classList.add('active');

  const t1 = setTimeout(() => overlay.classList.add('revealed'), 60);
  phaseSequenceTimers.push(t1);

  const t2 = setTimeout(() => {
    _updatePersistentHeader('THE MYSTERY OF THE UNIVERSE', 'Is anyone out there?', false);
    overlay.classList.add('glide');
    const t3 = setTimeout(() => {
      overlay.classList.remove('active', 'revealed', 'glide');
      isChapterIntroActive = false;
      _notifyTitleCardState();
      const cb = pendingPhaseCallback;
      pendingPhaseCallback = null;
      if (cb) cb();
    }, 820);
    phaseSequenceTimers.push(t3);
  }, 2350);
  phaseSequenceTimers.push(t2);
}

// ─── Section Title-Card sequence ──────────────────────────────────────────────
function _playSectionTitleCard(slide, onComplete) {
  _clearAllTyping();
  const bottomCard = document.getElementById('bottomCard');
  if (bottomCard) bottomCard.classList.add('deck-hidden');
  isTitleCardActive    = true;
  currentSectionNumber = slide.section;
  pendingPhaseCallback = () => {
    _updatePersistentHeader(slide.title, slide.sectionSubtitle, false);
    if (onComplete) onComplete();
  };
  _notifyTitleCardState();

  const overlay = document.getElementById('chTitleCardOverlay');
  const titleEl = document.getElementById('chTitleCardTitle');
  const subEl   = document.getElementById('chTitleCardSub');
  const flash   = document.getElementById('sectionFlash');

  _updatePersistentHeader(slide.title, slide.sectionSubtitle, true);
  if (flash) { flash.classList.remove('flash'); void flash.offsetWidth; flash.classList.add('flash'); }
  if (titleEl) titleEl.textContent = slide.title;
  if (subEl)   subEl.textContent   = slide.sectionSubtitle;

  if (overlay) {
    overlay.classList.add('active');
    const t1 = setTimeout(() => overlay.classList.add('revealed'), 50);
    phaseSequenceTimers.push(t1);
  }

  const t2 = setTimeout(() => {
    _updatePersistentHeader(slide.title, slide.sectionSubtitle, false);
    if (overlay) {
      overlay.classList.remove('revealed');
      const t3 = setTimeout(() => {
        overlay.classList.remove('active');
        isTitleCardActive = false;
        _notifyTitleCardState();
        const cb = pendingPhaseCallback;
        pendingPhaseCallback = null;
        if (cb) cb();
      }, 480);
      phaseSequenceTimers.push(t3);
    } else {
      isTitleCardActive = false;
      _notifyTitleCardState();
      const cb = pendingPhaseCallback;
      pendingPhaseCallback = null;
      if (cb) cb();
    }
  }, 2050);
  phaseSequenceTimers.push(t2);
}

function _updatePersistentHeader(title, subtitle, hidden = false) {
  const wrap = document.getElementById('chPersistentHeader');
  const t = document.getElementById('chSectionTitle');
  const s = document.getElementById('chSectionSubtitle');
  if (wrap) wrap.classList.toggle('ch1-header-hidden', Boolean(hidden));
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}

// ─── Slide loading ────────────────────────────────────────────────────────────
function _loadSlide(index, isFirstSlide, onReady = null) {
  currentSlide = chapterData.slides[index];
  if (!currentSlide) return;

  if (isFirstSlide) {
    currentSectionNumber = currentSlide.section;
    _loadSlideContent(index);
    if (onReady) onReady();
  } else {
    _loadSlideContent(index);
  }
}

function _loadSlideContent(index) {
  // 1. Visuals
  setVisualSlide(currentSlide.id);

  // 2. Clear previous typing state
  _clearAllTyping();
  isTyping = false;

  // 3. Persistent header
  _updatePersistentHeader(currentSlide.title, currentSlide.sectionSubtitle, false);

  // 4. Rolling Caption & Fact bar layout
  const subEl       = document.getElementById('subtitleText');
  const factEl      = document.getElementById('factText');
  const factRow     = document.getElementById('factRow');
  const bottomCard  = document.getElementById('bottomCard');
  const dialogueRow = document.getElementById('dialogueRow');

  if (subEl)  subEl.textContent  = '';
  if (factEl) {
    factEl.textContent   = '';
    factEl.style.opacity = '0';
  }
  if (dialogueRow) dialogueRow.querySelectorAll('.subtitle-ghost').forEach(el => el.remove());

  const hasFact = Boolean(currentSlide.fact && currentSlide.fact.trim() !== '');
  if (factRow) factRow.classList.toggle('hidden', !hasFact);
  if (bottomCard) {
    bottomCard.classList.remove('deck-hidden');
    bottomCard.classList.add('rolling-mode');
  }

  // 5. Hand off to narrator (triggers audio + rolling rAF captions when ON)
  setActiveAudioSlide(currentSlide.id, currentSlide);

  // 6. When audio is OFF: run rolling timed typing engine matching Ch2/Ch3
  if (!isAudioEnabled()) {
    _typeRollingPhrasesOffline(currentSlide);
  }

  // 7. Fact text fades in cleanly after a short beat (compact, non-jarring)
  if (hasFact && factEl) {
    factTimeout = setTimeout(() => {
      if (!currentSlide || !currentSlide.fact) return;
      factEl.textContent = currentSlide.fact;
      factEl.style.opacity = '1';
    }, 650);
  }

  if (onSlideChangeCallback) onSlideChangeCallback(index, currentSlide);
}

// ─── Offline Rolling Captions (audio OFF or fallback) ────────────────────────
function _spawnOfflineFadeOut(prevText) {
  const row = document.getElementById('dialogueRow');
  if (!row || !prevText) return;
  row.querySelectorAll('.subtitle-ghost').forEach(el => el.remove());
  const ghost = document.createElement('p');
  ghost.className = 'subtitle-text subtitle-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = prevText;
  row.appendChild(ghost);
  requestAnimationFrame(() => ghost.classList.add('fading'));
  const t = setTimeout(() => { if (ghost.parentNode) ghost.remove(); }, 420);
  typeTimeouts.push(t);
}

function _typeRollingPhrasesOffline(slide) {
  const subEl = document.getElementById('subtitleText');
  if (!subEl) return;

  const phrases = (slide.phrases && slide.phrases.length) ? slide.phrases : [slide.text];
  const breakMs = slide.breakMs || [];
  const CHAR_MS = 34;

  isTyping = true;

  function typePhrase(phraseIdx) {
    if (!isTyping) return;
    if (phraseIdx >= phrases.length) {
      isTyping = false;
      _checkAllDone();
      return;
    }

    const phrase = phrases[phraseIdx];
    if (phraseIdx > 0 && phrases[phraseIdx - 1]) {
      _spawnOfflineFadeOut(phrases[phraseIdx - 1]);
    }

    subEl.textContent = '';
    window.dispatchEvent(new CustomEvent('exo:phrase-start', {
      detail: { slideId: slide.id, phraseIndex: phraseIdx, phrase }
    }));

    let charIdx = 0;
    function nextChar() {
      if (!isTyping) return;
      if (charIdx < phrase.length) {
        subEl.textContent = phrase.slice(0, charIdx + 1);
        charIdx++;
        const ch = phrase[charIdx - 1];
        const extra = /[.!?]/.test(ch) ? 140 : /[,;:]/.test(ch) ? 75 : 0;
        const t = setTimeout(nextChar, CHAR_MS + extra);
        typeTimeouts.push(t);
      } else {
        const gap = breakMs[phraseIdx] || 850;
        const t = setTimeout(() => typePhrase(phraseIdx + 1), Math.max(420, gap));
        typeTimeouts.push(t);
      }
    }
    nextChar();
  }

  typePhrase(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _clearTypingOnly() {
  typeTimeouts.forEach(t => clearTimeout(t));
  typeTimeouts = [];
}

function _clearAllTyping() {
  _clearTypingOnly();
  phaseSequenceTimers.forEach(t => clearTimeout(t));
  phaseSequenceTimers = [];
  if (factTimeout) { clearTimeout(factTimeout); factTimeout = null; }
}

function _hideAllChapter1Overlays() {
  const intro = document.getElementById('ch1IntroOverlay');
  const card  = document.getElementById('chTitleCardOverlay');
  if (intro) intro.classList.remove('active', 'revealed', 'glide');
  if (card)  card.classList.remove('active', 'revealed');
}

function _checkAllDone() {
  if (!isTyping && onTypingCompleteCallback) {
    onTypingCompleteCallback(currentSlideIndex);
  }
}
