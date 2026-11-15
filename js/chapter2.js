/**
 * Chapter 2 Controller — INSIDE KEPLER
 * - Loads data/chapter2.json (7 slides: c2-s01 to c2-s07 across 3 sections)
 * - Supports <break .../> tag splitting into phrases + breakMs (tags never shown)
 * - Chapter 2 Title Card: black screen, amber CHAPTER 2, large Syncopate Bold INSIDE KEPLER,
 *   subtitle THE TECHNOLOGY BEHIND PLANET DISCOVERY (blur fade-in, ~2.5s hold, glide to top-left)
 * - Section Title Cards with same cinematic feel as Chapter 1
 * - Section 3 Manrope intro text (~4s, no audio) after Section 3 title card
 * - Rolling Captions when Audio OFF (or on audio fallback): shows 1 phrase at a time,
 *   fades previous phrase out over 0.4s, emits exo:phrase-start custom event
 */

import {
  setActiveAudioSlide,
  isAudioEnabled,
  setAudioFallbackCallback,
  stopNarratorAudio
} from './narrator.js';
import {
  initChapter2Visuals,
  setChapter2VisualSlide,
  stopChapter2VisualLoop
} from './visuals-ch2.js';

let chapter2Data = null;
let currentSlideIndex = 0;
let currentSectionNumber = -1;
let currentSlide = null;

let isChapterIntroActive = false;
let isTitleCardActive = false;
let isSectionIntroActive = false;
let isCCEnabled = sessionStorage.getItem('exo_cc_enabled') !== 'false';

// Offline / fallback rolling-typing state
let isTyping = false;
let typeTimeouts = [];
let phaseSequenceTimers = [];

// Callbacks
let onTypingCompleteCallback = null;
let onSlideChangeCallback = null;
let onTitleCardStateChange = null;
let onRequestSlideIdCallback = null;

/**
 * Splits clip text containing <break time="1.2s"/> or [break] tags into clean phrases & breakMs.
 * Break tags are stripped and never displayed.
 */
export function parseBreakTaggedText(rawText, existingPhrases, existingBreakMs) {
  if (Array.isArray(existingPhrases) && existingPhrases.length > 0) {
    return {
      cleanText: existingPhrases.join(' '),
      phrases: existingPhrases.map(p => String(p).replace(/<break[^>]*\/?>|\[break[^\]]*\]/gi, '').trim()),
      breakMs: Array.isArray(existingBreakMs) ? existingBreakMs : []
    };
  }
  const str = String(rawText || '');
  const tagRegex = /<break(?:\s+time=["']?([\d.]+)(m?s)["']?)?\s*\/?>|\[break(?:\s*[:=]\s*([\d.]+)(m?s)?)?\]/gi;
  const phrases = [];
  const breakMs = [];
  let lastIdx = 0;
  let match;

  while ((match = tagRegex.exec(str)) !== null) {
    const part = str.slice(lastIdx, match.index).trim();
    if (part) phrases.push(part);
    const val = parseFloat(match[1] || match[3] || '0.9');
    const unit = (match[2] || match[4] || 's').toLowerCase();
    const ms = unit === 'ms' ? val : Math.round(val * 1000);
    if (part) breakMs.push(ms);
    lastIdx = tagRegex.lastIndex;
  }

  const tail = str.slice(lastIdx).trim();
  if (tail) phrases.push(tail);

  return {
    cleanText: phrases.join(' '),
    phrases: phrases.length ? phrases : [''],
    breakMs
  };
}

export async function initChapter2(callbacks = {}) {
  onTypingCompleteCallback = callbacks.onTypingComplete || null;
  onSlideChangeCallback = callbacks.onSlideChange || null;
  onTitleCardStateChange = callbacks.onTitleCardStateChange || null;
  onRequestSlideIdCallback = callbacks.onNavigateSlideId || null;

  try {
    const res = await fetch('./data/chapter2.json');
    const raw = await res.json();
    raw.slides = (raw.slides || []).map(slide => {
      const parsed = parseBreakTaggedText(slide.text, slide.phrases, slide.breakMs);
      return {
        ...slide,
        text: parsed.cleanText,
        phrases: slide.phrases && slide.phrases.length ? parsed.phrases : parsed.phrases.filter(Boolean),
        breakMs: parsed.breakMs
      };
    });
    chapter2Data = raw;
  } catch (err) {
    console.error('Failed to load data/chapter2.json', err);
  }

  initChapter2Visuals({
    onNavigate: (targetSlideId) => {
      stopNarratorAudio();
      if (onRequestSlideIdCallback) onRequestSlideIdCallback(targetSlideId);
    }
  });

  // Listen for audio completion without overwriting Chapter 1's callback
  window.addEventListener('exo:audio-ended', (e) => {
    if (currentSlide && e.detail && e.detail.slideId === currentSlide.id) {
      _checkAllDone();
    }
  });

  // Fallback when audio file is unavailable so visuals & rolling captions still play smoothly
  setAudioFallbackCallback((slideId, slideData) => {
    if (currentSlide && currentSlide.id === slideId && slideData && slideData.rolling) {
      _clearAllTyping();
      _typeRollingPhrasesOffline(slideData);
    }
  });

  // Listen to CC toggle changes via DOM mutation/click sync
  const ccBtn = document.getElementById('ccBtn');
  if (ccBtn) {
    ccBtn.addEventListener('click', () => {
      isCCEnabled = sessionStorage.getItem('exo_cc_enabled') !== 'false';
    });
  }
}

export function getChapter2Data() { return chapter2Data; }
export function getChapter2TotalSlides() { return chapter2Data ? chapter2Data.slides.length : 7; }
export function getCurrentChapter2SlideIndex() { return currentSlideIndex; }
export function getCurrentChapter2SlideId() { return currentSlide ? currentSlide.id : null; }

export function getChapter2SlideIndexById(slideId) {
  if (!chapter2Data) return -1;
  return chapter2Data.slides.findIndex(s => s.id === slideId);
}

export function isChapter2TypingActive() {
  return isChapterIntroActive || isTitleCardActive || isSectionIntroActive || isTyping;
}

export function startChapter2Cinematic(onReady) {
  currentSlideIndex = 0;
  currentSectionNumber = -1;

  // Soft light flash into Chapter 2
  const flash = document.getElementById('ch2SectionFlash');
  if (flash) {
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');
  }

  _playChapter2IntroCard(() => {
    _loadSlide(0, true, onReady);
  });
}

export function goToChapter2Slide(index) {
  if (!chapter2Data || index < 0 || index >= chapter2Data.slides.length) return;
  const nextSlide = chapter2Data.slides[index];
  const sectionChanged = currentSectionNumber !== nextSlide.section;
  currentSlideIndex = index;

  if (sectionChanged) {
    _playSectionTitleCard(nextSlide, () => {
      if (nextSlide.sectionIntro) {
        _playSectionIntroText(nextSlide.sectionIntro, () => _loadSlide(index, false));
      } else {
        _loadSlide(index, false);
      }
    });
  } else {
    _loadSlide(index, false);
  }
}

export function exitChapter2() {
  _clearAllTyping();
  _hideAllChapter2Overlays();
  stopChapter2VisualLoop();
  currentSectionNumber = -1;
  isChapterIntroActive = false;
  isTitleCardActive = false;
  isSectionIntroActive = false;
  if (onTitleCardStateChange) onTitleCardStateChange(false);
}

export function completeChapter2TypingInstantly() {
  if (isChapterIntroActive) {
    const intro = document.getElementById('ch2IntroOverlay');
    if (intro) intro.classList.remove('active', 'revealed', 'glide');
    isChapterIntroActive = false;
    _notifyTitleCardState();
  }
  if (isTitleCardActive) {
    const overlay = document.getElementById('ch2TitleCardOverlay');
    if (overlay) overlay.classList.remove('revealed', 'active');
    isTitleCardActive = false;
    _notifyTitleCardState();
  }
  if (isSectionIntroActive) {
    const secIntro = document.getElementById('ch2SectionIntroOverlay');
    if (secIntro) secIntro.classList.remove('active', 'revealed');
    isSectionIntroActive = false;
    _notifyTitleCardState();
  }
  if (!currentSlide) return;
  _clearAllTyping();
  const subEl = document.getElementById('subtitleText');
  if (subEl && currentSlide.phrases && currentSlide.phrases.length) {
    const lastIdx = currentSlide.phrases.length - 1;
    subEl.textContent = currentSlide.phrases[lastIdx];
    window.dispatchEvent(new CustomEvent('exo:phrase-start', {
      detail: { slideId: currentSlide.id, phraseIndex: lastIdx, phrase: currentSlide.phrases[lastIdx] }
    }));
  }
  isTyping = false;
  _checkAllDone();
}

function _notifyTitleCardState() {
  if (onTitleCardStateChange) {
    onTitleCardStateChange(isChapterIntroActive || isTitleCardActive || isSectionIntroActive);
  }
}

function _playChapter2IntroCard(onComplete) {
  _clearAllTyping();
  isChapterIntroActive = true;
  _notifyTitleCardState();

  const overlay = document.getElementById('ch2IntroOverlay');
  if (!overlay) {
    isChapterIntroActive = false;
    _notifyTitleCardState();
    if (onComplete) onComplete();
    return;
  }

  overlay.classList.remove('glide', 'revealed');
  overlay.classList.add('active');

  const t1 = setTimeout(() => {
    overlay.classList.add('revealed');
  }, 60);
  phaseSequenceTimers.push(t1);

  // Hold ~2.5s then glide to top-left header
  const t2 = setTimeout(() => {
    _updatePersistentHeader('ENGINEERING PRINCIPLES', 'How Kepler worked as one precision instrument.');
    overlay.classList.add('glide');
    const t3 = setTimeout(() => {
      overlay.classList.remove('active', 'revealed', 'glide');
      isChapterIntroActive = false;
      _notifyTitleCardState();
      if (onComplete) onComplete();
    }, 850);
    phaseSequenceTimers.push(t3);
  }, 2650);
  phaseSequenceTimers.push(t2);
}

function _playSectionTitleCard(slide, onComplete) {
  _clearAllTyping();
  isTitleCardActive = true;
  currentSectionNumber = slide.section;
  _notifyTitleCardState();

  const overlay = document.getElementById('ch2TitleCardOverlay');
  const badgeEl = overlay ? overlay.querySelector('.ch-titlecard-badge') : null;
  const titleEl = document.getElementById('ch2TitleCardTitle');
  const subEl = document.getElementById('ch2TitleCardSub');
  const flash = document.getElementById('ch2SectionFlash');

  if (flash) {
    flash.classList.remove('flash');
    void flash.offsetWidth;
    flash.classList.add('flash');
  }

  if (badgeEl) badgeEl.textContent = 'CHAPTER 2';
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
        if (onComplete) onComplete();
      }, 500);
      phaseSequenceTimers.push(t3);
    } else {
      isTitleCardActive = false;
      _notifyTitleCardState();
      if (onComplete) onComplete();
    }
  }, 2200);
  phaseSequenceTimers.push(t2);
}

function _playSectionIntroText(text, onComplete) {
  isSectionIntroActive = true;
  _notifyTitleCardState();

  const overlay = document.getElementById('ch2SectionIntroOverlay');
  const textEl = document.getElementById('ch2SectionIntroText');
  if (!overlay || !textEl) {
    isSectionIntroActive = false;
    _notifyTitleCardState();
    if (onComplete) onComplete();
    return;
  }

  textEl.textContent = text;
  overlay.classList.add('active');
  const t1 = setTimeout(() => overlay.classList.add('revealed'), 50);
  phaseSequenceTimers.push(t1);

  const t2 = setTimeout(() => {
    overlay.classList.remove('revealed');
    const t3 = setTimeout(() => {
      overlay.classList.remove('active');
      isSectionIntroActive = false;
      _notifyTitleCardState();
      if (onComplete) onComplete();
    }, 550);
    phaseSequenceTimers.push(t3);
  }, 4000);
  phaseSequenceTimers.push(t2);
}

function _updatePersistentHeader(title, subtitle) {
  const b = document.getElementById('ch2Badge');
  const t = document.getElementById('ch2SectionTitle');
  const s = document.getElementById('ch2SectionSubtitle');
  if (b) b.textContent = 'CHAPTER 2';
  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}

function _loadSlide(index, isFirstSlide, onReady = null) {
  if (!chapter2Data) return;
  currentSlide = chapter2Data.slides[index];
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
  // 1. Visuals
  setChapter2VisualSlide(currentSlide.id);

  // 2. Clear previous typing
  _clearAllTyping();
  isTyping = false;

  // 3. Persistent Header
  _updatePersistentHeader(currentSlide.title, currentSlide.sectionSubtitle);

  // 4. Clear captions & hide fact row (no fact tags in Chapter 2)
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

  // 5. Audio + Narrator
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
  const t = setTimeout(() => {
    if (ghost.parentNode) ghost.remove();
  }, 420);
  typeTimeouts.push(t);
}

function _typeRollingPhrasesOffline(slide) {
  const subEl = document.getElementById('subtitleText');
  if (!subEl) return;

  const phrases = slide.phrases || [slide.text];
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
        const extra = /[.!?]/.test(ch) ? 160 : /[,;:]/.test(ch) ? 85 : 0;
        const t = setTimeout(nextChar, CHAR_MS + extra);
        typeTimeouts.push(t);
      } else {
        const gap = breakMs[phraseIdx] || 900;
        const t = setTimeout(() => typePhrase(phraseIdx + 1), Math.max(450, gap));
        typeTimeouts.push(t);
      }
    }

    nextChar();
  }

  typePhrase(0);
}

function _clearAllTyping() {
  typeTimeouts.forEach(t => clearTimeout(t));
  typeTimeouts = [];
  phaseSequenceTimers.forEach(t => clearTimeout(t));
  phaseSequenceTimers = [];
}

function _hideAllChapter2Overlays() {
  const intro = document.getElementById('ch2IntroOverlay');
  const secIntro = document.getElementById('ch2SectionIntroOverlay');
  if (intro) intro.classList.remove('active', 'revealed', 'glide');
  if (secIntro) secIntro.classList.remove('active', 'revealed');
}

function _checkAllDone() {
  if (!isTyping && onTypingCompleteCallback) {
    onTypingCompleteCallback(currentSlideIndex);
  }
}
