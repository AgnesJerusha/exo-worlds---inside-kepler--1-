/**
 * Chapter 3 Controller & Visual Engine — DISCOVERIES AND LEGACY
 * - Loads data/chapter3.json (c3-s01 to c3-s05 across 3 sections)
 * - Reuses parseBreakTaggedText, rolling captions, CC toggle, Narrator audio-sync,
 *   procedural planet generator style, Chapter 1 Kepler GLTF, and Chapter 1 Milky Way scene.
 * - Pauses all 3D/2D loops when inactive or off-tab; respects prefers-reduced-motion.
 */

import {
  setActiveAudioSlide,
  isAudioEnabled,
  stopNarratorAudio
} from './narrator.js';
import { setStarfieldOpacity } from './starfield.js';
import { parseBreakTaggedText } from './chapter2.js';
import { getSharedKeplerModel, setChapter3MilkyWayMode } from './visuals.js';

let chapter3Data = null;
let currentSlideIndex = 0;
let currentSectionNumber = -1;
let currentSlide = null;

let isChapterIntroActive = false;
let isTitleCardActive = false;
let isTyping = false;
let typeTimeouts = [];
let phaseSequenceTimers = [];
let activeSubTimers = [];
let pendingPhaseCallback = null;

// Callbacks from main.js
let onTypingCompleteCallback = null;
let onSlideChangeCallback = null;
let onTitleCardStateChange = null;
let onReplayJourneyCallback = null;

// Visual engine state
let activeVisualSlideId = null;
let activePhraseIndex = 0;
let phraseStartElapsed = 0;
let slideElapsed = 0;
let visualRafId = null;
let lastFrameTime = performance.now();
const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Slide 1 (c3-s01): 4,000-dot Exoplanet Cloud ─────────────────────────────
let s1Renderer = null, s1Scene = null, s1Camera = null;
let s1Points = null, s1Uniforms = null;
let s1FeaturedMeshes = [];
let s1CloudGroup = null;
let s1FadeTarget = 0, s1FadeCurrent = 0;
let s1PullbackActive = false;
let s1CounterStarted = false;
let s1CounterRaf = null;
let s1LabelsRevealed = false;
let s1LegendRevealed = false;

// ─── Slide 2 (c3-s02): Two Procedural Planets + Habitable Zone ───────────────
let s2Worlds = [];
let s2Initialized = false;
let s2SelectedWorldId = null;
let s2TypeTimer = null;

// ─── Slide 3 (c3-s03): Handover (Kepler -> Archive -> TESS & JWST) ────────────
let s3Renderer = null, s3Scene = null, s3Camera = null;
let s3KeplerGroup = null, s3TessGroup = null, s3JwstGroup = null;
let s3StreamPoints = null, s3StreamSeeds = [], s3StreamPositions = null;
let s3Raycaster = null, s3Pointer = null;
let s3HoveredTarget = null, s3SelectedTarget = null;
let s3RoleTypeTimer = null, s3RetiredTimer = null;
let s3KeplerOpacity = 0, s3StreamOpacity = 0, s3TessAlpha = 0, s3JwstAlpha = 0;
let s3TessRevealed = false, s3JwstRevealed = false, s3RetiredShown = false;

// ─── Slide 4 (c3-s04): Legacy Path Over Milky Way ────────────────────────────
let s4NodesLit = 0;
let s4PathProgress = 0;
let s4TargetProgress = 0;
let s4Dissolving = false;
let s4DissolveAlpha = 1;
let s4Sparks = [];

// ─── Slide 5 (c3-s05): Closing Card ──────────────────────────────────────────
let s5BodyTimer = null;
let s5BodyTyped = false;
let s5CtaRevealed = false;

export async function initChapter3(callbacks = {}) {
  onTypingCompleteCallback = callbacks.onTypingComplete || null;
  onSlideChangeCallback = callbacks.onSlideChange || null;
  onTitleCardStateChange = callbacks.onTitleCardStateChange || null;
  onReplayJourneyCallback = callbacks.onReplayJourney || null;

  try {
    const res = await fetch('./data/chapter3.json');
    const raw = await res.json();
    raw.slides = (raw.slides || []).map(slide => {
      const parsed = parseBreakTaggedText(slide.rawText || slide.text || '', slide.phrases, slide.breakMs);
      return {
        ...slide,
        text: parsed.cleanText,
        phrases: parsed.phrases.filter(Boolean),
        breakMs: parsed.breakMs
      };
    });
    chapter3Data = raw;
  } catch (err) {
    console.error('Failed to load data/chapter3.json', err);
  }

  _bindSlideEvents();
  _setupClosingButtons();

  window.addEventListener('exo:phrase-start', (e) => {
    if (!e.detail || !currentSlide || e.detail.slideId !== currentSlide.id) return;
    _handlePhraseEvent(e.detail.slideId, e.detail.phraseIndex);
  });

  window.addEventListener('exo:phrase-progress', (e) => {
    if (!e.detail || !currentSlide || e.detail.slideId !== 'c3-s05' || currentSlide.id !== 'c3-s05') return;
    _syncClosingPhraseProgress(e.detail.phraseIndex, e.detail.progress);
  });

  window.addEventListener('exo:audio-ended', (e) => {
    if (!e.detail || !currentSlide || e.detail.slideId !== currentSlide.id) return;
    if (currentSlide.id === 'c3-s05') _revealClosingActions();
    _checkAllDone();
  });

  window.addEventListener('exo:audio-fallback', (e) => {
    if (!e.detail || !currentSlide || e.detail.slideId !== currentSlide.id) return;
    if (currentSlide.rolling) {
      _clearAllTyping();
      _typeRollingPhrasesOffline(currentSlide);
    }
  });

  window.addEventListener('resize', _handleResize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) _stopVisualLoop();
    else if (activeVisualSlideId) _startVisualLoop();
  });
}

export function getChapter3Data() { return chapter3Data; }
export function getChapter3TotalSlides() { return chapter3Data ? chapter3Data.slides.length : 5; }
export function getCurrentChapter3SlideIndex() { return currentSlideIndex; }
export function getCurrentChapter3SlideId() { return currentSlide ? currentSlide.id : null; }

export function getChapter3SlideIndexById(slideId) {
  if (!chapter3Data) return -1;
  return chapter3Data.slides.findIndex(s => s.id === slideId);
}

export function isChapter3TypingActive() {
  return isChapterIntroActive || isTitleCardActive || isTyping;
}

export function startChapter3Cinematic(onReady) {
  currentSlideIndex = 0;
  currentSectionNumber = -1;

  const flash = document.getElementById('ch3SectionFlash');
  if (flash) {
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');
  }

  _playChapter3IntroCard(() => {
    _loadSlide(0, true, onReady);
  });
}

export function goToChapter3Slide(index) {
  if (!chapter3Data || index < 0 || index >= chapter3Data.slides.length) return;
  const nextSlide = chapter3Data.slides[index];
  const sectionChanged = currentSectionNumber !== nextSlide.section && !nextSlide.hideHeader;
  currentSlideIndex = index;

  if (sectionChanged) {
    _playSectionTitleCard(nextSlide, () => _loadSlide(index, false));
  } else {
    _loadSlide(index, false);
  }
}

export function exitChapter3() {
  _clearAllTyping();
  _clearSubTimers();
  pendingPhaseCallback = null;
  _hideAllChapter3Overlays();
  _stopVisualLoop();
  setChapter3MilkyWayMode(false);
  activeVisualSlideId = null;
  currentSectionNumber = -1;
  isChapterIntroActive = false;
  isTitleCardActive = false;
  _notifyTitleCardState();
}

export function completeChapter3TypingInstantly() {
  if (isChapterIntroActive) {
    _clearAllTyping();
    const intro = document.getElementById('ch3IntroOverlay');
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
    const overlay = document.getElementById('ch3TitleCardOverlay');
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
    for (let i = activePhraseIndex; i <= lastIdx; i++) {
      _handlePhraseEvent(currentSlide.id, i, true);
    }
  }
  if (currentSlide.id === 'c3-s05') {
    _revealClosingActions();
  }
  isTyping = false;
  _checkAllDone();
}

function _notifyTitleCardState() {
  if (!onTitleCardStateChange) return;
  const hiddenBySlide = Boolean(currentSlide && currentSlide.hideMenu);
  onTitleCardStateChange(isChapterIntroActive || isTitleCardActive || hiddenBySlide);
}

function _playChapter3IntroCard(onComplete) {
  _clearAllTyping();
  isChapterIntroActive = true;
  pendingPhaseCallback = () => {
    const firstSec = chapter3Data && chapter3Data.sections && chapter3Data.sections[0];
    _updatePersistentHeader(
      firstSec ? firstSec.title : 'A UNIVERSE UNVEILED',
      firstSec ? firstSec.subtitle : 'Discoveries that changed our cosmic perspective.'
    );
    if (onComplete) onComplete();
  };
  _notifyTitleCardState();

  const overlay = document.getElementById('ch3IntroOverlay');
  if (!overlay) {
    isChapterIntroActive = false;
    _notifyTitleCardState();
    const cb = pendingPhaseCallback;
    pendingPhaseCallback = null;
    if (cb) cb();
    return;
  }

  const holdMs = (chapter3Data && chapter3Data.timings && chapter3Data.timings.introHoldMs) || 2650;
  const glideMs = (chapter3Data && chapter3Data.timings && chapter3Data.timings.introGlideMs) || 850;

  overlay.classList.remove('glide', 'revealed');
  overlay.classList.add('active');

  const t1 = setTimeout(() => overlay.classList.add('revealed'), 60);
  phaseSequenceTimers.push(t1);

  const t2 = setTimeout(() => {
    const firstSec = chapter3Data && chapter3Data.sections && chapter3Data.sections[0];
    _updatePersistentHeader(
      firstSec ? firstSec.title : 'A UNIVERSE UNVEILED',
      firstSec ? firstSec.subtitle : 'Discoveries that changed our cosmic perspective.'
    );
    overlay.classList.add('glide');
    const t3 = setTimeout(() => {
      overlay.classList.remove('active', 'revealed', 'glide');
      isChapterIntroActive = false;
      _notifyTitleCardState();
      const cb = pendingPhaseCallback;
      pendingPhaseCallback = null;
      if (cb) cb();
    }, glideMs);
    phaseSequenceTimers.push(t3);
  }, holdMs);
  phaseSequenceTimers.push(t2);
}

function _playSectionTitleCard(slide, onComplete) {
  _clearAllTyping();
  isTitleCardActive = true;
  currentSectionNumber = slide.section;
  pendingPhaseCallback = () => {
    _updatePersistentHeader(slide.title, slide.sectionSubtitle);
    if (onComplete) onComplete();
  };
  _notifyTitleCardState();

  const overlay = document.getElementById('ch3TitleCardOverlay');
  const titleEl = document.getElementById('ch3TitleCardTitle');
  const subEl = document.getElementById('ch3TitleCardSub');
  const flash = document.getElementById('ch3SectionFlash');
  const holdMs = (chapter3Data && chapter3Data.timings && chapter3Data.timings.sectionCardHoldMs) || 2200;

  if (flash) {
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');
  }
  if (titleEl) titleEl.textContent = slide.title;
  if (subEl) subEl.textContent = slide.sectionSubtitle;

  if (overlay) {
    overlay.classList.add('active');
    const t1 = setTimeout(() => overlay.classList.add('revealed'), 50);
    phaseSequenceTimers.push(t1);
  }

  const t2 = setTimeout(() => {
    _updatePersistentHeader(slide.title, slide.sectionSubtitle);
    if (overlay) {
      overlay.classList.remove('revealed');
      const t3 = setTimeout(() => {
        overlay.classList.remove('active');
        isTitleCardActive = false;
        _notifyTitleCardState();
        const cb = pendingPhaseCallback;
        pendingPhaseCallback = null;
        if (cb) cb();
      }, 500);
      phaseSequenceTimers.push(t3);
    } else {
      isTitleCardActive = false;
      _notifyTitleCardState();
      const cb = pendingPhaseCallback;
      pendingPhaseCallback = null;
      if (cb) cb();
    }
  }, holdMs);
  phaseSequenceTimers.push(t2);
}

function _updatePersistentHeader(title, subtitle, hide = false) {
  const wrap = document.getElementById('ch3PersistentHeader');
  const b = document.getElementById('ch3Badge');
  const t = document.getElementById('ch3SectionTitle');
  const s = document.getElementById('ch3SectionSubtitle');
  if (wrap) wrap.classList.toggle('ch3-header-hidden', Boolean(hide));
  if (b) b.textContent = 'CHAPTER 3';
  if (t) t.textContent = title || '';
  if (s) s.textContent = subtitle || '';
}

function _loadSlide(index, isFirstSlide, onReady = null) {
  if (!chapter3Data) return;
  currentSlide = chapter3Data.slides[index];
  if (!currentSlide) return;

  if (isFirstSlide) {
    _playSectionTitleCard(currentSlide, () => {
      _loadSlideContent(index);
      if (onReady) onReady();
    });
  } else {
    _loadSlideContent(index);
  }
}

function _loadSlideContent(index) {
  _clearAllTyping();
  _clearSubTimers();
  isTyping = false;

  _updatePersistentHeader(currentSlide.title, currentSlide.sectionSubtitle, currentSlide.hideHeader);
  _notifyTitleCardState();
  _setVisualSlide(currentSlide);

  const subEl = document.getElementById('subtitleText');
  const factEl = document.getElementById('factText');
  const factRow = document.getElementById('factRow');
  const bottomCard = document.getElementById('bottomCard');
  const dialogueRow = document.getElementById('dialogueRow');

  if (subEl) subEl.textContent = '';
  if (factEl) factEl.textContent = '';
  if (factRow) factRow.classList.add('hidden');
  if (dialogueRow) dialogueRow.querySelectorAll('.subtitle-ghost').forEach(el => el.remove());

  const hasCaption = Boolean(currentSlide.rolling && currentSlide.phrases && currentSlide.phrases.length > 0);
  if (bottomCard) {
    bottomCard.classList.toggle('deck-hidden', !hasCaption);
    bottomCard.classList.toggle('rolling-mode', hasCaption);
  }

  if (currentSlide.audio) {
    setActiveAudioSlide(currentSlide.id, currentSlide);
    if (!isAudioEnabled()) {
      _typeRollingPhrasesOffline(currentSlide);
    }
  } else {
    setActiveAudioSlide(currentSlide.id, null);
    _checkAllDone();
  }

  if (onSlideChangeCallback) onSlideChangeCallback(index, currentSlide);
}

// ─── Offline Rolling Typing Fallback ─────────────────────────────────────────
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

  const phrases = slide.phrases || [slide.text];
  const breakMs = slide.breakMs || [];
  const CHAR_MS = (chapter3Data && chapter3Data.timings && chapter3Data.timings.offlineCharMs) || 34;

  isTyping = true;

  function typePhrase(phraseIdx) {
    if (!isTyping) return;
    if (phraseIdx >= phrases.length) {
      isTyping = false;
      if (slide.id === 'c3-s05') _revealClosingActions();
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
        if (slide.id === 'c3-s05') {
          window.dispatchEvent(new CustomEvent('exo:phrase-progress', {
            detail: { slideId: slide.id, phraseIndex: phraseIdx, progress: charIdx / Math.max(1, phrase.length) }
          }));
        }
        const ch = phrase[charIdx - 1];
        const extra = /[.!?]/.test(ch) ? 140 : /[,;:]/.test(ch) ? 75 : 0;
        const t = setTimeout(nextChar, prefersReducedMotion ? 8 : CHAR_MS + extra);
        typeTimeouts.push(t);
      } else {
        if (slide.id === 'c3-s05') {
          window.dispatchEvent(new CustomEvent('exo:phrase-progress', {
            detail: { slideId: slide.id, phraseIndex: phraseIdx, progress: 1 }
          }));
        }
        const gap = breakMs[phraseIdx] || 1000;
        const t = setTimeout(() => typePhrase(phraseIdx + 1), Math.max(450, gap));
        typeTimeouts.push(t);
      }
    }
    nextChar();
  }

  typePhrase(0);
}

// ─── Phrase Event Dispatcher for Slide Visual Sync ───────────────────────────
function _handlePhraseEvent(slideId, phraseIndex, instant = false) {
  activePhraseIndex = phraseIndex;
  phraseStartElapsed = slideElapsed;
  const slide = currentSlide;
  if (!slide) return;
  const cfg = slide.config || {};

  if (slideId === 'c3-s01') {
    if (phraseIndex >= 0) {
      s1FadeTarget = 1;
      if (instant) s1FadeCurrent = 1;
    }
    if (phraseIndex >= 1 && !s1CounterStarted) {
      s1CounterStarted = true;
      _animateExoplanetCounter(
        cfg.confirmedExoplanets || 2700,
        cfg.confirmedSuffix || '+',
        instant ? 10 : ((chapter3Data && chapter3Data.timings && chapter3Data.timings.counterDurationMs) || 2200)
      );
    }
    if (phraseIndex >= 2 && !s1LabelsRevealed) {
      s1LabelsRevealed = true;
      const svg = document.getElementById('ch3LeaderSvg');
      if (svg) svg.classList.add('visible');
    }
    if (phraseIndex >= 3 && !s1LegendRevealed) {
      s1LegendRevealed = true;
      s1PullbackActive = true;
      const legend = document.getElementById('ch3S01Legend');
      if (legend) legend.classList.add('visible');
    }
  } else if (slideId === 'c3-s03') {
    if (phraseIndex >= 0) {
      s3KeplerOpacity = 1;
      const lblK = document.getElementById('ch3HoKepler');
      if (lblK) lblK.classList.add('visible');
    }
    if (phraseIndex >= 1) {
      s3StreamOpacity = 1;
    }
    if (phraseIndex >= 2) {
      if (!s3TessRevealed) {
        s3TessRevealed = true;
        s3TessAlpha = 1;
        _revealTargetLabel('ch3HoTess', 'TESS', 'NEARBY STARS', instant);
      }
      if (!s3JwstRevealed) {
        const delay = instant ? 0 : 1200;
        const t = setTimeout(() => {
          s3JwstRevealed = true;
          s3JwstAlpha = 1;
          _revealTargetLabel('ch3HoJwst', 'JWST', 'ATMOSPHERES OF DISTANT WORLDS', instant);
        }, delay);
        activeSubTimers.push(t);
      }
    }
    if (phraseIndex >= 3 && !s3RetiredShown) {
      s3RetiredShown = true;
      const el = document.getElementById('ch3HoRetired');
      if (el) _typeIntoElement(el, cfg.retiredLabel || 'RETIRED OCTOBER 30, 2018', instant ? 0 : 28, t => activeSubTimers.push(t));
    }
  } else if (slideId === 'c3-s04') {
    const nodes = cfg.nodes || [];
    if (phraseIndex === 0) {
      s4NodesLit = Math.max(s4NodesLit, 1);
      s4TargetProgress = 0.28;
      if (instant) {
        s4NodesLit = 2;
      } else {
        const n2 = nodes[1];
        const t = setTimeout(() => { s4NodesLit = Math.max(s4NodesLit, 2); }, (n2 && n2.subDelayMs) || 1900);
        activeSubTimers.push(t);
      }
    } else if (phraseIndex === 1) {
      s4NodesLit = Math.max(s4NodesLit, 3);
      s4TargetProgress = 0.72;
      if (instant) {
        s4NodesLit = 4;
      } else {
        const n4 = nodes[3];
        const t = setTimeout(() => { s4NodesLit = Math.max(s4NodesLit, 4); }, (n4 && n4.subDelayMs) || 1900);
        activeSubTimers.push(t);
      }
    } else if (phraseIndex === 2) {
      s4NodesLit = 5;
      s4TargetProgress = 1.0;
    } else if (phraseIndex === 3) {
      s4NodesLit = 5;
      s4TargetProgress = 1.0;
      setChapter3MilkyWayMode(true, {
        camera: cfg.cameraPullback || { x: 0, y: 175, z: 315, rx: -0.54, ry: 0 }
      });
    } else if (phraseIndex >= 4) {
      s4NodesLit = 5;
      s4TargetProgress = 1.0;
      if (!s4Dissolving) {
        s4Dissolving = true;
        _spawnPathDissolveSparks();
        setChapter3MilkyWayMode(true, {
          camera: cfg.cameraPullback || { x: 0, y: 175, z: 315, rx: -0.54, ry: 0 },
          brighten: true,
          galaxyOpacity: 1.0
        });
      }
    }
  } else if (slideId === 'c3-s05') {
    const h0 = document.getElementById('ch3CloseH1');
    const h1 = document.getElementById('ch3CloseH2');
    const h2 = document.getElementById('ch3CloseH3');
    const bodyEl = document.getElementById('ch3CloseBody');
    const finalEl = document.getElementById('ch3CloseFinal');
    const footerEl = document.getElementById('ch3CloseYears');

    if (phraseIndex >= 0 && h0) h0.classList.add('visible');
    if (phraseIndex >= 1 && h1) h1.classList.add('visible');
    if (phraseIndex >= 2 && h2) h2.classList.add('visible');
    if (phraseIndex >= 3 && bodyEl && instant) {
      s5BodyTyped = true;
      bodyEl.textContent = cfg.body || '';
    }
    if (phraseIndex >= 4) {
      if (bodyEl) bodyEl.textContent = cfg.body || '';
      s5BodyTyped = true;
      if (finalEl) finalEl.classList.add('visible');
      if (footerEl) footerEl.classList.add('visible');
    }
  }
}

function _syncClosingPhraseProgress(phraseIndex, progress) {
  if (!currentSlide || currentSlide.id !== 'c3-s05') return;
  const cfg = currentSlide.config || {};
  const bodyEl = document.getElementById('ch3CloseBody');
  if (!bodyEl) return;

  if (phraseIndex === 3) {
    const bodyCopy = cfg.body || '';
    const chars = Math.round(Math.max(0, Math.min(1, progress)) * bodyCopy.length);
    const nextText = bodyCopy.slice(0, chars);
    if (bodyEl.textContent !== nextText) {
      bodyEl.textContent = nextText;
    }
    if (chars >= bodyCopy.length) s5BodyTyped = true;
  } else if (phraseIndex >= 4) {
    const bodyCopy = cfg.body || '';
    if (bodyEl.textContent !== bodyCopy) {
      bodyEl.textContent = bodyCopy;
    }
    s5BodyTyped = true;
  }
}

// ─── Visual Slide Setup & Loop ───────────────────────────────────────────────
function _setVisualSlide(slide) {
  const slideId = slide.id;
  activeVisualSlideId = slideId;
  activePhraseIndex = 0;
  slideElapsed = 0;
  phraseStartElapsed = 0;

  document.querySelectorAll('.ch3-slide-panel').forEach(panel => {
    panel.classList.toggle('active', panel.getAttribute('data-ch3-slide') === slideId);
  });

  if (slideId !== 'c3-s04') {
    setChapter3MilkyWayMode(false);
  }

  if (slideId === 'c3-s01') {
    setStarfieldOpacity(0.18);
    _initOrResetS01(slide);
  } else if (slideId === 'c3-s02') {
    setStarfieldOpacity(0.32);
    _initOrResetS02(slide);
  } else if (slideId === 'c3-s03') {
    setStarfieldOpacity(0.28);
    _initOrResetS03(slide);
  } else if (slideId === 'c3-s04') {
    _initOrResetS04(slide);
  } else if (slideId === 'c3-s05') {
    setStarfieldOpacity(0.42);
    _initOrResetS05(slide);
  }

  _startVisualLoop();
}

function _startVisualLoop() {
  if (visualRafId) return;
  lastFrameTime = performance.now();
  const tick = (now) => {
    if (!activeVisualSlideId) {
      visualRafId = null;
      return;
    }
    visualRafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    slideElapsed += dt;

    if (activeVisualSlideId === 'c3-s01') _renderS01(dt);
    else if (activeVisualSlideId === 'c3-s02') _renderS02(dt);
    else if (activeVisualSlideId === 'c3-s03') _renderS03(dt);
    else if (activeVisualSlideId === 'c3-s04') _renderS04(dt);
  };
  visualRafId = requestAnimationFrame(tick);
}

function _stopVisualLoop() {
  if (visualRafId) {
    cancelAnimationFrame(visualRafId);
    visualRafId = null;
  }
}

// ─── c3-s01: 4,000-Dot Exoplanet Volume ──────────────────────────────────────
function _initOrResetS01(slide) {
  const cfg = slide.config || {};
  s1FadeTarget = 0;
  s1FadeCurrent = prefersReducedMotion ? 1 : 0;
  s1PullbackActive = false;
  s1CounterStarted = false;
  s1LabelsRevealed = false;
  s1LegendRevealed = false;
  if (s1CounterRaf) { cancelAnimationFrame(s1CounterRaf); s1CounterRaf = null; }

  const counterWrap = document.getElementById('ch3S01Counter');
  const counterNum = document.getElementById('ch3S01CounterNum');
  const counterLabel = document.getElementById('ch3S01CounterLabel');
  const legend = document.getElementById('ch3S01Legend');
  const svg = document.getElementById('ch3LeaderSvg');

  if (counterWrap) counterWrap.classList.remove('visible');
  if (counterNum) counterNum.textContent = '0';
  if (counterLabel) counterLabel.textContent = cfg.confirmedLabel || 'CONFIRMED EXOPLANETS';
  if (legend) {
    legend.classList.remove('visible');
    _populateS01Legend(legend, cfg);
  }
  if (svg) svg.classList.remove('visible');

  if (s1Renderer) {
    if (s1Camera) s1Camera.position.set(0, 0, cfg.cameraStartZ || 78);
    _resizeRenderer(s1Renderer, s1Camera, document.getElementById('ch3PointsCanvas'));
    return;
  }

  const canvas = document.getElementById('ch3PointsCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  s1Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  s1Renderer.setClearColor(0x000000, 0);
  s1Renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  s1Renderer.setSize(w, h, false);

  s1Scene = new THREE.Scene();
  s1Camera = new THREE.PerspectiveCamera(48, w / h, 0.5, 600);
  s1Camera.position.set(0, 0, cfg.cameraStartZ || 78);

  s1CloudGroup = new THREE.Group();
  s1Scene.add(s1CloudGroup);

  const count = cfg.pointCount || 4000;
  const radius = cfg.volumeRadius || 120;
  const depth = cfg.volumeDepth || 160;
  const classes = cfg.sizeClasses || [
    { label: 'SMALL', weight: 0.36, color: '#7ab8ff', size: 1.35 },
    { label: 'EARTH-SIZE', weight: 0.30, color: '#4fd1c5', size: 1.85 },
    { label: 'LARGER', weight: 0.22, color: '#ffb27a', size: 2.65 },
    { label: 'GIANT', weight: 0.12, color: '#fff3e0', size: 3.55 }
  ];

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const cumulative = [];
  let sum = 0;
  classes.forEach(c => { sum += c.weight || 0.25; cumulative.push(sum); });

  const tmpCol = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = Math.pow(Math.random(), 0.45) * radius;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.72;
    positions[i * 3 + 2] = (Math.random() - 0.5) * depth;

    const roll = Math.random() * sum;
    let cls = classes[classes.length - 1];
    for (let k = 0; k < cumulative.length; k++) {
      if (roll <= cumulative[k]) { cls = classes[k]; break; }
    }
    tmpCol.set(cls.color);
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
    sizes[i] = (cls.size || 2) * (0.85 + Math.random() * 0.35);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  s1Uniforms = {
    uOpacity: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: s1Uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (180.0 / max(18.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vColor, core * uOpacity);
      }
    `
  });

  s1Points = new THREE.Points(geo, mat);
  s1CloudGroup.add(s1Points);

  // Two pulsing featured worlds (Kepler-22b & Kepler-186f)
  const featured = cfg.featured || [
    { id: 'kepler-22b', label: 'Kepler-22b', pos: [-22, 11, 14], color: '#4fd1c5' },
    { id: 'kepler-186f', label: 'Kepler-186f', pos: [21, -8, 8], color: '#ffb27a' }
  ];
  s1FeaturedMeshes = [];
  featured.forEach(item => {
    const markerGrp = new THREE.Group();
    markerGrp.position.set(item.pos[0], item.pos[1], item.pos[2]);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 16),
      new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0 })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.05, 32),
      new THREE.MeshBasicMaterial({ color: item.color, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    markerGrp.add(core, ring);
    s1CloudGroup.add(markerGrp);
    s1FeaturedMeshes.push({ id: item.id, label: item.label, color: item.color, group: markerGrp, core, ring });
  });
}

function _populateS01Legend(container, cfg) {
  const classes = cfg.sizeClasses || [];
  const tags = cfg.legendTags || ['SIZES', 'ORBITAL PERIODS', 'COMPOSITIONS'];
  const dotsHtml = classes.map(c => {
    const px = Math.max(6, Math.round((c.size || 2) * 3.2));
    return `<span class="ch3-legend-class"><i class="ch3-legend-dot" style="width:${px}px;height:${px}px;background:${c.color};box-shadow:0 0 8px ${c.color}"></i>${c.label}</span>`;
  }).join('');
  container.innerHTML = `<div class="ch3-legend-classes">${dotsHtml}</div><div class="ch3-legend-tags">${tags.join(' · ')}</div>`;
}

function _animateExoplanetCounter(target, suffix, durationMs) {
  const wrap = document.getElementById('ch3S01Counter');
  const numEl = document.getElementById('ch3S01CounterNum');
  if (wrap) wrap.classList.add('visible');
  if (!numEl) return;

  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / Math.max(10, durationMs));
    const ease = 1 - Math.pow(1 - p, 3);
    const val = Math.round(ease * target);
    numEl.textContent = val.toLocaleString() + (p >= 1 ? suffix : '');
    if (p < 1 && activeVisualSlideId === 'c3-s01') {
      s1CounterRaf = requestAnimationFrame(step);
    } else {
      numEl.textContent = target.toLocaleString() + suffix;
      s1CounterRaf = null;
    }
  }
  s1CounterRaf = requestAnimationFrame(step);
}

function _renderS01(dt) {
  if (!s1Renderer || !s1Scene || !s1Camera) return;
  const cfg = (currentSlide && currentSlide.config) || {};

  s1FadeCurrent += (s1FadeTarget - s1FadeCurrent) * Math.min(1, dt * 2.5);
  if (s1Uniforms) s1Uniforms.uOpacity.value = s1FadeCurrent;

  const targetZ = s1PullbackActive
    ? (cfg.cameraPullbackZ || 108)
    : Math.max(cfg.cameraDriftZ || 38, (cfg.cameraStartZ || 78) - slideElapsed * (prefersReducedMotion ? 0 : 2.1));
  s1Camera.position.z += (targetZ - s1Camera.position.z) * Math.min(1, dt * 1.4);

  if (s1CloudGroup && !prefersReducedMotion) {
    s1CloudGroup.rotation.y += dt * (cfg.rotationSpeed || 0.032);
    s1CloudGroup.rotation.x = Math.sin(slideElapsed * 0.14) * 0.06;
  }

  // Featured dots pulse & SVG leader lines
  const w = window.innerWidth;
  const h = window.innerHeight;
  const v = new THREE.Vector3();
  const svg = document.getElementById('ch3LeaderSvg');

  s1FeaturedMeshes.forEach((item, idx) => {
    item.group.lookAt(s1Camera.position);
    const pulse = 1 + (prefersReducedMotion ? 0 : Math.sin(slideElapsed * 3.4 + idx) * 0.18);
    item.ring.scale.setScalar(pulse);
    item.core.material.opacity = s1LabelsRevealed ? s1FadeCurrent : s1FadeCurrent * 0.35;
    item.ring.material.opacity = s1LabelsRevealed ? 0.78 * s1FadeCurrent : 0;

    if (svg && s1LabelsRevealed) {
      item.group.getWorldPosition(v);
      v.project(s1Camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const dx = idx === 0 ? -74 : 74;
      const dy = idx === 0 ? -42 : 42;
      const lx = Math.max(96, Math.min(w - 140, sx + dx));
      const ly = Math.max(120, Math.min(h - 210, sy + dy));

      const lineEl = document.getElementById(idx === 0 ? 'ch3LeadLine1' : 'ch3LeadLine2');
      const txtEl = document.getElementById(idx === 0 ? 'ch3LeadText1' : 'ch3LeadText2');
      if (lineEl) {
        lineEl.setAttribute('x1', sx.toFixed(1));
        lineEl.setAttribute('y1', sy.toFixed(1));
        lineEl.setAttribute('x2', lx.toFixed(1));
        lineEl.setAttribute('y2', ly.toFixed(1));
      }
      if (txtEl) {
        txtEl.setAttribute('x', (lx + (idx === 0 ? -6 : 6)).toFixed(1));
        txtEl.setAttribute('y', (ly - 6).toFixed(1));
        txtEl.setAttribute('text-anchor', idx === 0 ? 'end' : 'start');
        txtEl.textContent = item.label;
      }
    }
  });

  s1Renderer.render(s1Scene, s1Camera);
}

// ─── c3-s02: Two Interactive Procedural Planets ──────────────────────────────
function _buildProceduralPlanetInstance(canvas, planetCfg) {
  if (!canvas || typeof THREE === 'undefined') return null;

  // Seeded value noise matching js/planet.js
  let seed = planetCfg.seed || 22;
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
  const vn = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    const L = k => mx(
      mx(H(xi, yi, zi + k), H(xi + 1, yi, zi + k), u),
      mx(H(xi, yi + 1, zi + k), H(xi + 1, yi + 1, zi + k), u),
      v
    );
    return mx(L(0), L(1), w);
  };
  const fbm = (x, y, z, o) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < o; i++) { s += a * vn(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
    return s;
  };
  const lerp3 = (a, b, t) => [mx(a[0], b[0], t), mx(a[1], b[1], t), mx(a[2], b[2], t)];

  const TW = 512, TH = 256;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const x = c.getContext('2d');
    return [c, x, x.createImageData(TW, TH)];
  };
  const [cC, cX, cI] = mk(), [bC, bX, bI] = mk(), [rC, rX, rI] = mk(), [kC, kX, kI] = mk();

  const isRust = planetCfg.palette === 'rustOlive';
  const SEA = isRust ? 0.41 : 0.57;

  for (let j = 0; j < TH; j++) {
    for (let i = 0; i < TW; i++) {
      const lon = (i / TW) * 6.28319;
      const lat = (j / TH - 0.5) * 3.14159;
      const cl = Math.cos(lat);
      const x = cl * Math.cos(lon), y = Math.sin(lat), z = cl * Math.sin(lon);
      const o = (j * TW + i) * 4;
      const h = fbm(x * 2.4 + 5, y * 2.4, z * 2.4, 5);
      const det = fbm(x * 13, y * 13, z * 13, 3);
      const moist = fbm(x * 3.2 + 20, y * 3.2, z * 3.2, 3);

      let c, rough = 0.85;
      if (!isRust) {
        // Kepler-22b: Blue-teal ocean world with island archipelagos
        if (h < SEA) {
          const d = Math.min(1, (SEA - h) / 0.28);
          c = lerp3([52, 168, 178], [8, 36, 74], Math.pow(d, 0.58));
          rough = 0.18 + 0.18 * d;
        } else {
          const t = (h - SEA) / (1 - SEA);
          c = lerp3([48, 134, 128], [156, 172, 152], Math.min(1, t * 1.4));
          c = c.map(v => v * (0.9 + 0.2 * det));
        }
      } else {
        // Kepler-186f: Rust-and-olive rocky habitable-zone world
        if (h < SEA) {
          const d = Math.min(1, (SEA - h) / 0.22);
          c = lerp3([58, 78, 66], [18, 32, 38], Math.pow(d, 0.65));
          rough = 0.28 + 0.22 * d;
        } else {
          const t = (h - SEA) / (1 - SEA);
          const olive = lerp3([72, 92, 54], [108, 114, 68], moist * 1.2);
          const rust = lerp3([158, 82, 54], [194, 108, 72], t);
          c = lerp3(olive, rust, Math.min(1, Math.max(0, t * 1.4 + (0.5 - moist) * 0.5)));
          c = c.map(v => v * (0.88 + 0.22 * det));
        }
      }

      const ice = Math.max(0, Math.min(1, (Math.abs(y) - 0.85 - 0.07 * det) * 14));
      if (ice > 0) {
        c = lerp3(c, [234, 240, 248], ice);
        rough = mx(rough, 0.5, ice);
      }

      cI.data[o] = c[0]; cI.data[o + 1] = c[1]; cI.data[o + 2] = c[2]; cI.data[o + 3] = 255;
      const hb = (h < SEA ? SEA : h) * 255;
      bI.data[o] = bI.data[o + 1] = bI.data[o + 2] = hb; bI.data[o + 3] = 255;
      const rv = rough * 255;
      rI.data[o] = rI.data[o + 1] = rI.data[o + 2] = rv; rI.data[o + 3] = 255;

      const wx = fbm(x * 2 + 40, y * 2, z * 2, 3) * 1.6;
      const cd = Math.max(0, Math.min(1, (fbm(x * 3.5 + wx, y * 5.8 + wx, z * 3.5, 4) - (isRust ? 0.53 : 0.49)) * 3.4));
      kI.data[o] = isRust ? 248 : 255; kI.data[o + 1] = isRust ? 236 : 255; kI.data[o + 2] = isRust ? 226 : 255;
      kI.data[o + 3] = cd * (isRust ? 140 : 185);
    }
  }

  cX.putImageData(cI, 0, 0); bX.putImageData(bI, 0, 0); rX.putImageData(rI, 0, 0); kX.putImageData(kI, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  camera.position.z = 3.7;

  const sun = new THREE.DirectionalLight(isRust ? 0xffd7b0 : 0xfff3e0, 2.15);
  sun.position.set(-4.5, 2.2, 4.0);
  scene.add(sun, new THREE.AmbientLight(0x1b2c4a, 0.35));

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const makeTex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = aniso;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  };

  const grp = new THREE.Group();
  grp.rotation.z = planetCfg.tiltZ || 0.3;
  scene.add(grp);

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshStandardMaterial({
      map: makeTex(cC, true),
      bumpMap: makeTex(bC, false),
      bumpScale: 0.38,
      roughnessMap: makeTex(rC, false),
      metalness: 0.02
    })
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.015, 64, 64),
    new THREE.MeshStandardMaterial({
      map: makeTex(kC, true),
      transparent: true,
      depthWrite: false,
      roughness: 1
    })
  );
  grp.add(surface, clouds);

  const sunDir = new THREE.Vector3(-4.5, 2.2, 4.0).normalize();
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.02, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: { sd: { value: sunDir }, col: { value: new THREE.Color(planetCfg.atmosphereColor || '#8fd3ff') } },
      side: THREE.FrontSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: 'varying vec3 n;varying vec3 v;void main(){n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader: 'uniform vec3 sd;uniform vec3 col;varying vec3 n;varying vec3 v;void main(){float d=dot(normalize(n),v);float f=pow(1.-max(d,0.),4.0);float lit=smoothstep(-.3,.55,dot(normalize(n),sd));gl_FragColor=vec4(col*f*lit*0.58,f*lit);}'
    })
  );
  scene.add(rim);

  const state = {
    id: planetCfg.id,
    config: planetCfg,
    renderer,
    scene,
    camera,
    grp,
    surface,
    clouds,
    dragging: false,
    lastX: 0,
    lastY: 0,
    velX: 0,
    velY: 0
  };

  // Drag rotation on the canvas
  canvas.addEventListener('pointerdown', (e) => {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    _selectWorld(planetCfg.id);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.velY = dx * 0.008;
    state.velX = dy * 0.008;
    surface.rotation.y += state.velY;
    clouds.rotation.y += state.velY * 1.1;
    grp.rotation.x = Math.max(-0.8, Math.min(0.8, grp.rotation.x + state.velX));
  });
  const endDrag = () => { state.dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const size = canvas.clientWidth || 260;
  renderer.setSize(size, size, false);
  return state;
}

function _initOrResetS02(slide) {
  const cfg = slide.config || {};
  const planets = cfg.planets || [];

  // Position habitable zone band and markers from JSON config
  const band = document.getElementById('ch3HzBand');
  if (band) {
    const startPct = cfg.habitableZoneStartPct ?? 42;
    const endPct = cfg.habitableZoneEndPct ?? 72;
    band.style.left = `${startPct}%`;
    band.style.width = `${Math.max(8, endPct - startPct)}%`;
  }
  const m22 = document.getElementById('ch3HzMarker22b');
  const m186 = document.getElementById('ch3HzMarker186f');
  if (m22 && planets[0]) m22.style.left = `${planets[0].hzPositionPct ?? 52}%`;
  if (m186 && planets[1]) m186.style.left = `${planets[1].hzPositionPct ?? 64}%`;

  const noteEl = document.getElementById('ch3ConceptNote');
  const scaleEl = document.getElementById('ch3HzScaleLabel');
  if (noteEl) noteEl.textContent = cfg.disclaimer || "ARTIST'S CONCEPT, NOT A PHOTOGRAPH";
  if (scaleEl) scaleEl.textContent = cfg.diagramScaleLabel || 'NOT TO SCALE';

  if (!s2Initialized && planets.length >= 2) {
    s2Initialized = true;
    const p1 = _buildProceduralPlanetInstance(document.getElementById('ch3Planet22bCanvas'), planets[0]);
    const p2 = _buildProceduralPlanetInstance(document.getElementById('ch3Planet186fCanvas'), planets[1]);
    s2Worlds = [p1, p2].filter(Boolean);
  }

  s2SelectedWorldId = null;
  document.querySelectorAll('.ch3-planet-slot, .ch3-hz-marker').forEach(el => el.classList.remove('selected'));
  const d1 = document.getElementById('ch3Planet22bDesc');
  const d2 = document.getElementById('ch3Planet186fDesc');
  if (d1) d1.textContent = '';
  if (d2) d2.textContent = '';
}

function _selectWorld(worldId) {
  if (!currentSlide || currentSlide.id !== 'c3-s02') return;
  const planets = (currentSlide.config && currentSlide.config.planets) || [];
  const target = planets.find(p => p.id === worldId);
  if (!target) return;

  if (s2SelectedWorldId === worldId) return;
  s2SelectedWorldId = worldId;

  document.querySelectorAll('.ch3-planet-slot, .ch3-hz-marker').forEach(el => {
    el.classList.toggle('selected', el.getAttribute('data-world') === worldId);
  });

  const targetDescEl = document.getElementById(worldId === 'kepler-22b' ? 'ch3Planet22bDesc' : 'ch3Planet186fDesc');
  const otherDescEl = document.getElementById(worldId === 'kepler-22b' ? 'ch3Planet186fDesc' : 'ch3Planet22bDesc');
  if (otherDescEl) otherDescEl.textContent = '';
  if (s2TypeTimer) clearTimeout(s2TypeTimer);
  if (targetDescEl) {
    _typeIntoElement(targetDescEl, target.description, 22, t => { s2TypeTimer = t; });
  }
}

function _renderS02(dt) {
  s2Worlds.forEach(w => {
    if (!w) return;
    const spin = prefersReducedMotion ? 0 : (w.config.spinSpeed || 0.05);
    if (!w.dragging) {
      w.surface.rotation.y += dt * spin + w.velY;
      w.clouds.rotation.y += dt * (spin * 1.25) + w.velY * 1.1;
      w.velX *= 0.92;
      w.velY *= 0.92;
    }
    const sz = w.renderer.domElement.clientWidth || 260;
    if (w.renderer.domElement.width !== sz * w.renderer.getPixelRatio()) {
      w.renderer.setSize(sz, sz, false);
    }
    w.renderer.render(w.scene, w.camera);
  });
}

// ─── c3-s03: The Handover (Kepler -> Stream -> TESS & JWST) ──────────────────
function _buildProceduralTess() {
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc2d0e4, metalness: 0.72, roughness: 0.3 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x163868, metalness: 0.4, roughness: 0.35, emissive: 0x0a1c3a, emissiveIntensity: 0.4 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x8fd3ff, metalness: 0.85, roughness: 0.12, emissive: 0x4ba3df, emissiveIntensity: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x263144, metalness: 0.5, roughness: 0.55 });

  // Slim octagonal/box spacecraft bus
  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), bodyMat);
  grp.add(bus);

  // Sunshade plate
  const shield = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 3.0), darkMat);
  shield.position.y = 0.85;
  grp.add(shield);

  // Two deployed solar wings
  [-1, 1].forEach(side => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.45), solarMat);
    wing.position.set(side * 3.3, 0, 0);
    grp.add(wing);
  });

  // Camera plate + 4 optical camera barrels
  const camPlate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.6), darkMat);
  camPlate.position.set(0, 1.25, 0);
  grp.add(camPlate);

  const offsets = [[-0.65, -0.38], [0.65, -0.38], [-0.65, 0.38], [0.65, 0.38]];
  offsets.forEach(([ox, oz]) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.31, 0.95, 16), bodyMat);
    barrel.position.set(ox, 1.75, oz);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), lensMat);
    lens.position.set(ox, 2.23, oz);
    grp.add(barrel, lens);
  });

  grp.rotation.set(0.35, -0.5, 0.15);
  return grp;
}

function _buildProceduralJwst() {
  const grp = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf4c563, metalness: 0.92, roughness: 0.16, emissive: 0x422a08, emissiveIntensity: 0.25 });
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0x9aaec8, metalness: 0.78, roughness: 0.28, side: THREE.DoubleSide });
  const shieldWarmMat = new THREE.MeshStandardMaterial({ color: 0xc292a4, metalness: 0.75, roughness: 0.3, side: THREE.DoubleSide });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x1b2333, metalness: 0.5, roughness: 0.5 });

  // 5-layer diamond kapton sunshield
  const shape = new THREE.Shape();
  shape.moveTo(0, 4.4);
  shape.lineTo(2.7, 0.4);
  shape.lineTo(0, -3.6);
  shape.lineTo(-2.7, 0.4);
  shape.closePath();
  const shieldGeo = new THREE.ShapeGeometry(shape);

  for (let l = 0; l < 5; l++) {
    const layer = new THREE.Mesh(shieldGeo, l === 4 ? shieldWarmMat : shieldMat);
    layer.rotation.x = Math.PI / 2;
    layer.position.y = -1.1 - l * 0.16;
    layer.scale.setScalar(1 - l * 0.04);
    grp.add(layer);
  }

  // 18 gold hexagonal primary mirror segments in 2 rings
  const hexGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 6);
  hexGeo.rotateX(Math.PI / 2);
  const mirrorRoot = new THREE.Group();
  mirrorRoot.position.set(0, 1.35, 0.3);

  const hexR = 0.78;
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      const s = -q - r;
      const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (dist === 0 || dist > 2) continue; // 18 segments (ring 1 = 6, ring 2 = 12)
      const hx = hexR * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
      const hy = hexR * (1.5 * r);
      const seg = new THREE.Mesh(hexGeo, goldMat);
      seg.position.set(hx * 0.56, hy * 0.56, 0);
      mirrorRoot.add(seg);
    }
  }
  grp.add(mirrorRoot);

  // Secondary mirror & tripod struts
  const sec = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12), goldMat);
  sec.rotation.x = Math.PI / 2;
  sec.position.set(0, 1.35, 2.9);
  grp.add(sec);

  const strutTargets = [[0, 2.7], [-1.3, 0.4], [1.3, 0.4]];
  strutTargets.forEach(([sx, sy]) => {
    const start = new THREE.Vector3(sx, sy, 0.35);
    const end = new THREE.Vector3(0, 1.35, 2.88);
    const len = start.distanceTo(end);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), strutMat);
    strut.position.copy(start).lerp(end, 0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    grp.add(strut);
  });

  grp.rotation.set(0.24, -0.58, 0.08);
  return grp;
}

function _tryLoadOptionalGlb(path, onLoaded) {
  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') return;
  fetch(path, { method: 'HEAD' }).then(res => {
    if (!res.ok) return;
    const loader = new THREE.GLTFLoader();
    if (typeof THREE.DRACOLoader !== 'undefined') {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/gltf/');
      loader.setDRACOLoader(draco);
    }
    loader.load(path, gltf => onLoaded(gltf.scene), undefined, () => {});
  }).catch(() => {});
}

function _initOrResetS03(slide) {
  const cfg = slide.config || {};
  s3KeplerOpacity = 0;
  s3StreamOpacity = 0;
  s3TessAlpha = 0;
  s3JwstAlpha = 0;
  s3TessRevealed = false;
  s3JwstRevealed = false;
  s3RetiredShown = false;
  s3HoveredTarget = null;
  s3SelectedTarget = null;

  ['ch3HoKepler', 'ch3HoTess', 'ch3HoJwst'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible', 'active');
  });
  const retEl = document.getElementById('ch3HoRetired');
  const roleEl = document.getElementById('ch3HoRoleBox');
  const tessTitle = document.getElementById('ch3HoTessTitle');
  const tessSub = document.getElementById('ch3HoTessSub');
  const jwstTitle = document.getElementById('ch3HoJwstTitle');
  const jwstSub = document.getElementById('ch3HoJwstSub');
  const kLabel = document.getElementById('ch3HoKeplerName');
  const kYears = document.getElementById('ch3HoKeplerYears');

  if (retEl) retEl.textContent = '';
  if (roleEl) roleEl.textContent = '';
  if (tessTitle) tessTitle.textContent = '';
  if (tessSub) tessSub.textContent = '';
  if (jwstTitle) jwstTitle.textContent = '';
  if (jwstSub) jwstSub.textContent = '';
  if (kLabel) kLabel.textContent = cfg.keplerLabel || 'KEPLER';
  if (kYears) kYears.textContent = cfg.keplerYears || '2009 TO 2018';

  if (s3Renderer) {
    _resizeRenderer(s3Renderer, s3Camera, document.getElementById('ch3HandoverCanvas'));
    return;
  }

  const canvas = document.getElementById('ch3HandoverCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  s3Renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  s3Renderer.setClearColor(0x000000, 0);
  s3Renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  s3Renderer.outputEncoding = THREE.sRGBEncoding;
  s3Renderer.setSize(w, h, false);

  s3Scene = new THREE.Scene();
  s3Camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 300);
  s3Camera.position.set(0, 0, 44);

  const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.1);
  keyLight.position.set(12, 14, 18);
  const rimLight = new THREE.DirectionalLight(0x8fd3ff, 1.5);
  rimLight.position.set(-14, -8, -10);
  s3Scene.add(keyLight, rimLight, new THREE.AmbientLight(0x223254, 0.85));

  // Left: Kepler silhouette
  s3KeplerGroup = new THREE.Group();
  s3KeplerGroup.position.set(-16.5, 0, 0);
  s3KeplerGroup.scale.setScalar(0.36);
  s3Scene.add(s3KeplerGroup);

  getSharedKeplerModel().then(shared => {
    if (shared && s3KeplerGroup) {
      const clone = shared.clone(true);
      clone.traverse(n => {
        if (n.isMesh && n.material) {
          n.material = new THREE.MeshStandardMaterial({
            color: 0x7cb8e8,
            emissive: 0x265c8c,
            emissiveIntensity: 0.45,
            roughness: 0.6,
            metalness: 0.3,
            transparent: true,
            opacity: 0.65
          });
        }
      });
      s3KeplerGroup.add(clone);
    } else if (s3KeplerGroup) {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(4.5, 5.2, 14, 8),
        new THREE.MeshStandardMaterial({ color: 0x7cb8e8, emissive: 0x265c8c, emissiveIntensity: 0.45, transparent: true, opacity: 0.65 })
      );
      s3KeplerGroup.add(body);
    }
  });

  // Upper Right: TESS
  s3TessGroup = _buildProceduralTess();
  s3TessGroup.position.set(15.5, 6.4, 0);
  s3TessGroup.userData.targetId = 'tess';
  s3Scene.add(s3TessGroup);

  const tessCfg = (cfg.targets || []).find(t => t.id === 'tess');
  if (tessCfg && tessCfg.modelPath) {
    _tryLoadOptionalGlb('./' + tessCfg.modelPath, loaded => {
      while (s3TessGroup.children.length) s3TessGroup.remove(s3TessGroup.children[0]);
      const box = new THREE.Box3().setFromObject(loaded);
      const sz = box.getSize(new THREE.Vector3());
      const ctr = box.getCenter(new THREE.Vector3());
      loaded.position.sub(ctr);
      loaded.scale.setScalar(6.5 / Math.max(sz.x, sz.y, sz.z, 0.001));
      s3TessGroup.add(loaded);
    });
  }

  // Lower Right: JWST
  s3JwstGroup = _buildProceduralJwst();
  s3JwstGroup.position.set(15.5, -6.4, 0);
  s3JwstGroup.scale.setScalar(0.95);
  s3JwstGroup.userData.targetId = 'jwst';
  s3Scene.add(s3JwstGroup);

  const jwstCfg = (cfg.targets || []).find(t => t.id === 'jwst');
  if (jwstCfg && jwstCfg.modelPath) {
    _tryLoadOptionalGlb('./' + jwstCfg.modelPath, loaded => {
      while (s3JwstGroup.children.length) s3JwstGroup.remove(s3JwstGroup.children[0]);
      const box = new THREE.Box3().setFromObject(loaded);
      const sz = box.getSize(new THREE.Vector3());
      const ctr = box.getCenter(new THREE.Vector3());
      loaded.position.sub(ctr);
      loaded.scale.setScalar(7.5 / Math.max(sz.x, sz.y, sz.z, 0.001));
      s3JwstGroup.add(loaded);
    });
  }

  // Archive river of glowing light-curve dots
  const pCount = cfg.streamParticleCount || 420;
  s3StreamPositions = new Float32Array(pCount * 3);
  const pColors = new Float32Array(pCount * 3);
  s3StreamSeeds = [];
  const colBlue = new THREE.Color('#8fd3ff');
  const colGold = new THREE.Color('#ffb27a');

  for (let i = 0; i < pCount; i++) {
    const branch = i % 2 === 0 ? 1 : -1;
    const t = Math.random();
    s3StreamSeeds.push({ t, branch, speed: 0.14 + Math.random() * 0.14, jitter: (Math.random() - 0.5) * 0.9, phase: Math.random() * 6.28 });
    const c = branch > 0 ? colBlue : colGold;
    pColors[i * 3] = c.r; pColors[i * 3 + 1] = c.g; pColors[i * 3 + 2] = c.b;
  }

  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(s3StreamPositions, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

  const sMat = new THREE.PointsMaterial({
    size: 0.42,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  s3StreamPoints = new THREE.Points(sGeo, sMat);
  s3Scene.add(s3StreamPoints);

  // Raycasting for TESS & JWST
  s3Raycaster = new THREE.Raycaster();
  s3Pointer = new THREE.Vector2();

  canvas.addEventListener('pointermove', (e) => {
    if (activeVisualSlideId !== 'c3-s03') return;
    const rect = canvas.getBoundingClientRect();
    s3Pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s3Pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    s3Raycaster.setFromCamera(s3Pointer, s3Camera);
    const hits = s3Raycaster.intersectObjects([s3TessGroup, s3JwstGroup], true);
    let found = null;
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.targetId) obj = obj.parent;
      if (obj) found = obj.userData.targetId;
    }
    canvas.style.cursor = found ? 'pointer' : 'default';
    if (found !== s3HoveredTarget) {
      s3HoveredTarget = found;
      if (found) _selectHandoverTarget(found);
    }
  });

  canvas.addEventListener('click', (e) => {
    if (activeVisualSlideId !== 'c3-s03') return;
    const rect = canvas.getBoundingClientRect();
    s3Pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s3Pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    s3Raycaster.setFromCamera(s3Pointer, s3Camera);
    const hits = s3Raycaster.intersectObjects([s3TessGroup, s3JwstGroup], true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.targetId) obj = obj.parent;
      if (obj && obj.userData.targetId) _selectHandoverTarget(obj.userData.targetId);
    }
  });
}

function _revealTargetLabel(boxId, title, subtitle, instant) {
  const box = document.getElementById(boxId);
  if (box) box.classList.add('visible');
  const titleEl = document.getElementById(boxId + 'Title');
  const subEl = document.getElementById(boxId + 'Sub');
  if (titleEl) _typeIntoElement(titleEl, title, instant ? 0 : 32, t => activeSubTimers.push(t));
  if (subEl) _typeIntoElement(subEl, subtitle, instant ? 0 : 24, t => activeSubTimers.push(t));
}

function _selectHandoverTarget(targetId) {
  if (!currentSlide || currentSlide.id !== 'c3-s03') return;
  if (s3SelectedTarget === targetId) return;
  s3SelectedTarget = targetId;

  const tessBox = document.getElementById('ch3HoTess');
  const jwstBox = document.getElementById('ch3HoJwst');
  if (tessBox) tessBox.classList.toggle('active', targetId === 'tess');
  if (jwstBox) jwstBox.classList.toggle('active', targetId === 'jwst');

  const targets = (currentSlide.config && currentSlide.config.targets) || [];
  const info = targets.find(t => t.id === targetId);
  const roleBox = document.getElementById('ch3HoRoleBox');
  if (roleBox && info) {
    if (s3RoleTypeTimer) clearTimeout(s3RoleTypeTimer);
    _typeIntoElement(roleBox, info.role, 20, t => { s3RoleTypeTimer = t; });
  }
}

function _renderS03(dt) {
  if (!s3Renderer || !s3Scene || !s3Camera) return;
  const isNarrow = window.innerWidth < 760;
  s3Camera.position.z = isNarrow ? 58 : 44;

  // Responsive horizontal layout
  const leftX = isNarrow ? -11.5 : -16.5;
  const rightX = isNarrow ? 11.5 : 15.5;
  if (s3KeplerGroup) {
    s3KeplerGroup.position.x = leftX;
    if (!prefersReducedMotion) s3KeplerGroup.rotation.y += dt * 0.16;
  }
  if (s3TessGroup) {
    s3TessGroup.position.x = rightX;
    if (!prefersReducedMotion) s3TessGroup.rotation.y += dt * 0.35;
    const sc = s3SelectedTarget === 'tess' ? 1.15 : 1.0;
    s3TessGroup.scale.lerp(new THREE.Vector3(sc, sc, sc), Math.min(1, dt * 6));
  }
  if (s3JwstGroup) {
    s3JwstGroup.position.x = rightX;
    if (!prefersReducedMotion) s3JwstGroup.rotation.y -= dt * 0.28;
    const sc = (s3SelectedTarget === 'jwst' ? 1.1 : 0.95);
    s3JwstGroup.scale.lerp(new THREE.Vector3(sc, sc, sc), Math.min(1, dt * 6));
  }

  // Update archive stream along curving split paths
  if (s3StreamPoints && s3StreamPositions) {
    s3StreamPoints.material.opacity += (s3StreamOpacity * 0.9 - s3StreamPoints.material.opacity) * Math.min(1, dt * 3);
    for (let i = 0; i < s3StreamSeeds.length; i++) {
      const s = s3StreamSeeds[i];
      if (!prefersReducedMotion) s.t = (s.t + dt * s.speed) % 1;
      const u = s.t;
      const x = (leftX + 3) + u * ((rightX - 3) - (leftX + 3));
      const splitT = Math.max(0, (u - 0.32) / 0.68);
      const yTarget = s.branch * 6.4 * Math.pow(splitT, 1.35);
      const wave = Math.sin(u * 12 + s.phase + slideElapsed * 2.5) * 0.55;
      s3StreamPositions[i * 3] = x;
      s3StreamPositions[i * 3 + 1] = yTarget + wave + s.jitter * (1 - splitT * 0.4);
      s3StreamPositions[i * 3 + 2] = Math.cos(u * 8 + s.phase) * 0.6;
    }
    s3StreamPoints.geometry.attributes.position.needsUpdate = true;
  }

  // Project 3D spacecraft positions cleanly to DOM labels
  _projectToOverlay('ch3HoKepler', new THREE.Vector3(leftX, -6.5, 0), s3Camera);
  _projectToOverlay('ch3HoTess', new THREE.Vector3(rightX, 11.2, 0), s3Camera);
  _projectToOverlay('ch3HoJwst', new THREE.Vector3(rightX, -11.4, 0), s3Camera);

  s3Renderer.render(s3Scene, s3Camera);
}

function _projectToOverlay(elId, worldPos, camera) {
  const el = document.getElementById(elId);
  if (!el || !camera) return;
  const v = worldPos.clone().project(camera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = Math.max(90, Math.min(w - 90, (v.x * 0.5 + 0.5) * w));
  const y = Math.max(115, Math.min(h - 210, (-v.y * 0.5 + 0.5) * h));
  el.style.left = `${x.toFixed(1)}px`;
  el.style.top = `${y.toFixed(1)}px`;
}

// ─── c3-s04: Legacy Path Over Milky Way Backdrop ─────────────────────────────
function _initOrResetS04(slide) {
  const cfg = slide.config || {};
  s4NodesLit = 0;
  s4PathProgress = prefersReducedMotion ? 1 : 0;
  s4TargetProgress = prefersReducedMotion ? 1 : 0;
  s4Dissolving = false;
  s4DissolveAlpha = 1;
  s4Sparks = [];

  setChapter3MilkyWayMode(true, {
    camera: cfg.cameraClose || { x: 20, y: 95, z: 195, rx: -0.44, ry: 0.12 },
    snapCamera: true,
    galaxyOpacity: 0.95
  });
}

function _spawnPathDissolveSparks() {
  const nodes = (currentSlide && currentSlide.config && currentSlide.config.nodes) || [];
  const cv = document.getElementById('ch3PathCanvas');
  const w = cv ? cv.width : window.innerWidth;
  const h = cv ? cv.height : window.innerHeight;
  s4Sparks = [];
  for (let i = 0; i < 140; i++) {
    const t = i / 140;
    const pt = _sampleNodeSpline(nodes, t, w, h);
    s4Sparks.push({
      x: pt.x + (Math.random() - 0.5) * 14,
      y: pt.y + (Math.random() - 0.5) * 14,
      vx: (Math.random() - 0.5) * 22,
      vy: -10 - Math.random() * 28,
      r: 1 + Math.random() * 2.2,
      life: 1
    });
  }
}

function _sampleNodeSpline(nodes, t, w, h) {
  if (!nodes.length) return { x: w * 0.5, y: h * 0.5 };
  const pts = nodes.map(n => ({ x: n.x * w, y: n.y * h }));
  const seg = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
  const localT = (t * (pts.length - 1)) - seg;
  const p0 = pts[Math.max(0, seg - 1)];
  const p1 = pts[seg];
  const p2 = pts[Math.min(pts.length - 1, seg + 1)];
  const p3 = pts[Math.min(pts.length - 1, seg + 2)];
  const t2 = localT * localT;
  const t3 = t2 * localT;
  const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * localT + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * localT + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}

function _renderS04(dt) {
  const cv = document.getElementById('ch3PathCanvas');
  if (!cv || !currentSlide || currentSlide.id !== 'c3-s04') return;
  const w = cv.clientWidth || window.innerWidth;
  const h = cv.clientHeight || window.innerHeight;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const nodes = (currentSlide.config && currentSlide.config.nodes) || [];
  if (!nodes.length) return;

  s4PathProgress += (s4TargetProgress - s4PathProgress) * Math.min(1, dt * 1.8);
  if (s4Dissolving) {
    s4DissolveAlpha = Math.max(0, s4DissolveAlpha - dt * 0.45);
  }

  // Draw glowing curve across Milky Way
  if (s4PathProgress > 0.01 && s4DissolveAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = s4DissolveAlpha;
    const steps = 90;
    const maxStep = Math.max(2, Math.floor(steps * s4PathProgress));

    ctx.beginPath();
    for (let i = 0; i <= maxStep; i++) {
      const pt = _sampleNodeSpline(nodes, i / steps, w, h);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    const grad = ctx.createLinearGradient(nodes[0].x * w, 0, nodes[nodes.length - 1].x * w, 0);
    grad.addColorStop(0, 'rgba(143, 211, 255, 0.85)');
    grad.addColorStop(0.55, 'rgba(255, 178, 122, 0.92)');
    grad.addColorStop(1, 'rgba(255, 243, 224, 0.98)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#8fd3ff';
    ctx.shadowBlur = 16;
    ctx.stroke();

    // Draw lit nodes & clean small labels
    nodes.forEach((n, idx) => {
      if (idx >= s4NodesLit) return;
      const nx = n.x * w;
      const ny = n.y * h;
      const isEmber = idx >= 2;
      const col = isEmber ? '#ffb27a' : '#8fd3ff';

      ctx.beginPath();
      ctx.arc(nx, ny, 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(nx, ny, 10 + Math.sin(slideElapsed * 3 + idx) * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = s4DissolveAlpha * 0.45;
      ctx.stroke();

      ctx.globalAlpha = s4DissolveAlpha;
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#eef3fb';
      ctx.font = `700 ${w < 640 ? 9 : 11}px "Syncopate", sans-serif`;
      ctx.textAlign = 'center';
      const labelY = idx % 2 === 0 ? ny - 18 : ny + 26;
      ctx.fillText(n.label, Math.max(88, Math.min(w - 88, nx)), labelY);
    });
    ctx.restore();
  }

  // Dissolve sparks drifting into galaxy
  if (s4Sparks.length) {
    ctx.save();
    s4Sparks.forEach(sp => {
      if (!prefersReducedMotion) {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.life = Math.max(0, sp.life - dt * 0.35);
      }
      if (sp.life <= 0) return;
      ctx.globalAlpha = sp.life * 0.9;
      ctx.fillStyle = '#fff3dc';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

// ─── c3-s05: Closing Card ────────────────────────────────────────────────────
function _initOrResetS05(slide) {
  const cfg = slide.config || {};
  s5BodyTyped = false;
  s5CtaRevealed = false;
  if (s5BodyTimer) { clearTimeout(s5BodyTimer); s5BodyTimer = null; }

  const headlines = cfg.headlines || ['ONE TELESCOPE.', 'THOUSANDS OF WORLDS.', 'A UNIVERSE OF POSSIBILITIES.'];
  const h1 = document.getElementById('ch3CloseH1');
  const h2 = document.getElementById('ch3CloseH2');
  const h3 = document.getElementById('ch3CloseH3');
  const bodyEl = document.getElementById('ch3CloseBody');
  const finalEl = document.getElementById('ch3CloseFinal');
  const yearsEl = document.getElementById('ch3CloseYears');
  const actionsEl = document.getElementById('ch3CloseActions');
  const creditEl = document.getElementById('ch3CloseCredit');

  if (h1) { h1.textContent = headlines[0] || ''; h1.classList.remove('visible'); }
  if (h2) { h2.textContent = headlines[1] || ''; h2.classList.remove('visible'); }
  if (h3) { h3.textContent = headlines[2] || ''; h3.classList.remove('visible'); }
  if (bodyEl) bodyEl.textContent = '';
  if (finalEl) { finalEl.textContent = cfg.closingLine || "THE JOURNEY DOESN'T END HERE."; finalEl.classList.remove('visible'); }
  if (yearsEl) { yearsEl.textContent = cfg.footerYears || 'KEPLER SPACE TELESCOPE • 2009 to 2018'; yearsEl.classList.remove('visible'); }
  if (actionsEl) actionsEl.classList.remove('visible');
  if (creditEl) creditEl.textContent = cfg.creditLine || 'Team Dormant, NASA Space Apps Challenge 2026. Data and imagery: NASA/Kepler.';
}

function _revealClosingActions() {
  if (s5CtaRevealed) return;
  s5CtaRevealed = true;
  const actionsEl = document.getElementById('ch3CloseActions');
  const delay = (currentSlide && currentSlide.config && currentSlide.config.ctaShowDelayMs) || 450;
  const t = setTimeout(() => {
    if (actionsEl && currentSlide && currentSlide.id === 'c3-s05') {
      actionsEl.classList.add('visible');
    }
  }, delay);
  activeSubTimers.push(t);
}

function _setupClosingButtons() {
  const replayBtn = document.getElementById('ch3ReplayBtn');
  const aboutBtn = document.getElementById('ch3AboutBtn');
  const githubLink = document.getElementById('ch3GithubBtn');

  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      stopNarratorAudio();
      exitChapter3();
      if (onReplayJourneyCallback) onReplayJourneyCallback();
    });
  }

  if (aboutBtn) {
    aboutBtn.addEventListener('click', () => {
      const modal = document.getElementById('about');
      if (modal) modal.classList.add('open');
    });
  }

  if (githubLink) {
    const syncHref = () => {
      const contactRepo = document.getElementById('contactRepoLink');
      const fallback = document.getElementById('ghLink');
      const url = (contactRepo && contactRepo.getAttribute('href')) || (fallback && fallback.getAttribute('href')) || '#';
      githubLink.setAttribute('href', url);
    };
    syncHref();
    githubLink.addEventListener('pointerenter', syncHref);
    githubLink.addEventListener('focus', syncHref);
  }
}

// ─── DOM Interaction Bindings ────────────────────────────────────────────────
function _bindSlideEvents() {
  document.querySelectorAll('.ch3-planet-slot, .ch3-hz-marker').forEach(el => {
    const worldId = el.getAttribute('data-world');
    if (!worldId) return;
    el.addEventListener('click', () => _selectWorld(worldId));
    el.addEventListener('pointerenter', () => _selectWorld(worldId));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _selectWorld(worldId);
      }
    });
  });

  const tessBtn = document.getElementById('ch3HoTess');
  const jwstBtn = document.getElementById('ch3HoJwst');
  if (tessBtn) {
    tessBtn.addEventListener('click', () => _selectHandoverTarget('tess'));
    tessBtn.addEventListener('pointerenter', () => _selectHandoverTarget('tess'));
  }
  if (jwstBtn) {
    jwstBtn.addEventListener('click', () => _selectHandoverTarget('jwst'));
    jwstBtn.addEventListener('pointerenter', () => _selectHandoverTarget('jwst'));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function _typeIntoElement(el, text, charMs, trackTimer) {
  if (!el) return;
  if (!charMs || prefersReducedMotion) {
    el.textContent = text;
    return;
  }
  el.textContent = '';
  let i = 0;
  function step() {
    if (i < text.length) {
      el.textContent = text.slice(0, i + 1);
      i++;
      const t = setTimeout(step, charMs);
      if (trackTimer) trackTimer(t);
    }
  }
  step();
}

function _resizeRenderer(renderer, camera, canvas) {
  if (!renderer || !camera || !canvas) return;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function _handleResize() {
  if (s1Renderer && s1Camera) _resizeRenderer(s1Renderer, s1Camera, document.getElementById('ch3PointsCanvas'));
  if (s3Renderer && s3Camera) _resizeRenderer(s3Renderer, s3Camera, document.getElementById('ch3HandoverCanvas'));
}

function _clearAllTyping() {
  typeTimeouts.forEach(t => clearTimeout(t));
  typeTimeouts = [];
  phaseSequenceTimers.forEach(t => clearTimeout(t));
  phaseSequenceTimers = [];
}

function _clearSubTimers() {
  activeSubTimers.forEach(t => clearTimeout(t));
  activeSubTimers = [];
  if (s1CounterRaf) { cancelAnimationFrame(s1CounterRaf); s1CounterRaf = null; }
  if (s2TypeTimer) { clearTimeout(s2TypeTimer); s2TypeTimer = null; }
  if (s3RoleTypeTimer) { clearTimeout(s3RoleTypeTimer); s3RoleTypeTimer = null; }
  if (s3RetiredTimer) { clearTimeout(s3RetiredTimer); s3RetiredTimer = null; }
  if (s5BodyTimer) { clearTimeout(s5BodyTimer); s5BodyTimer = null; }
}

function _hideAllChapter3Overlays() {
  const intro = document.getElementById('ch3IntroOverlay');
  const card = document.getElementById('ch3TitleCardOverlay');
  if (intro) intro.classList.remove('active', 'revealed', 'glide');
  if (card) card.classList.remove('active', 'revealed');
}

function _checkAllDone() {
  if (!isTyping && onTypingCompleteCallback) {
    onTypingCompleteCallback(currentSlideIndex);
  }
}
