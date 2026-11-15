/**
 * Main Application Controller — EXO WORLDS
 * - Strict Slide Deck Navigation (100dvh, zero scrolling, mouse wheel disabled)
 * - Pages 1-3 Fixes: Subtitle bar completely removed on Pages 1-3
 * - Unified 13-Slide Deck (3 Prologue Pages + 10 Chapter 1 Slides)
 * - Navigation: Bottom buttons & Keyboard (Right/Space/Enter for next, Left for prev)
 * - Typing engine finish-on-click/Space/Enter and glowing Next button
 * - Chapter 1 Hyperspace Warp & Cinematic Sequence Orchestration
 */

import { initStarfield, triggerHyperspace } from './starfield.js';
import { initPlanet } from './planet.js';
import { initNarrator, setActiveAudioSlide } from './narrator.js';
import { playHyperspaceWarp, stopAllSfx } from './sfx.js';
import {
  initChapter1,
  startChapter1Cinematic,
  goToChapterSlide,
  exitChapter1,
  completeTypingInstantly,
  isTypingActive,
  getTotalSlides,
  getCurrentSlideIndex,
  getChapter1SlideIndexById
} from './chapter1.js';
import {
  initChapter2,
  startChapter2Cinematic,
  goToChapter2Slide,
  exitChapter2,
  completeChapter2TypingInstantly,
  isChapter2TypingActive,
  getChapter2TotalSlides,
  getChapter2SlideIndexById,
  getCurrentChapter2SlideId
} from './chapter2.js';
import {
  initChapter3,
  startChapter3Cinematic,
  goToChapter3Slide,
  exitChapter3,
  completeChapter3TypingInstantly,
  isChapter3TypingActive,
  getChapter3TotalSlides,
  getChapter3SlideIndexById
} from './chapter3.js';
import { createTopicMenu } from './topicmenu.js';
import { initVisualStage, stopVisualLoop } from './visuals.js';

// Slide Deck Definition:
// Index 0: Hero (Page 1)
// Index 1: Tribute (Page 2)
// Index 2: Team Hub (Page 3)
// Index 3..12: Chapter 1 Slides (s01 to s10)
// Index 13..19: Chapter 2 Slides (c2-s01 to c2-s07)
// Index 20..24: Chapter 3 Slides (c3-s01 to c3-s05)
const PROLOGUE_COUNT = 3;
let currentDeckIndex = 0;
let isWarping = false;
let isIntroActive = false;
let ch1TopicMenu = null;
let topicMenu = null;
let ch3TopicMenu = null;
let lastPart1DeckIndex = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Disable scrolling completely
  preventAllScrolling();

  // 2. Initialize Subsystems
  initStarfield();
  initPlanet();
  initVisualStage();
  initCursorOrb();
  initModals();
  initTributeCarousel();
  initTributeTabs();
  initHubAndLaunch();

  // 3. Initialize Narrator with Toast
  initNarrator({
    showToast: msg => showToast(msg)
  });

  // 4. Initialize Reusable Side Star Sub-Navigation Menus (Chapters 1, 2 & 3)
  ch1TopicMenu = createTopicMenu({
    header: 'CHAPTER 1 · SUB-NAVIGATION',
    triggerLabel: 'PAGES',
    items: [
      {
        label: 'The Mystery of the Universe',
        slideId: 's01',
        pages: [
          { label: '01', slideId: 's01', title: 'Look up at the night sky' },
          { label: '02', slideId: 's02', title: 'Four hundred billion stars' },
          { label: '03', slideId: 's03', title: 'Is anyone out there?' }
        ]
      },
      {
        label: 'The Scientific Challenge',
        slideId: 's04',
        pages: [
          { label: '04', slideId: 's04', title: 'How do you find a world?' },
          { label: '05', slideId: 's05', title: 'Eighty-four parts per million' }
        ]
      },
      {
        label: 'The Birth of Kepler',
        slideId: 's06',
        pages: [
          { label: '06', slideId: 's06', title: 'Dr. William Borucki' },
          { label: '07', slideId: 's07', title: 'NASA said no — not once' }
        ]
      },
      {
        label: 'Launch and Journey',
        slideId: 's08',
        pages: [
          { label: '08', slideId: 's08', title: 'Cape Canaveral liftoff' },
          { label: '09', slideId: 's09', title: 'Earth-trailing orbit' },
          { label: '10', slideId: 's10', title: '150,000 stars in Cygnus & Lyra' }
        ]
      }
    ],
    onSelect: (slideId) => {
      navigateToChapter1SlideId(slideId);
    },
    onStepPrev: () => handlePrevRequest(),
    onStepNext: () => handleNextRequest()
  });

  topicMenu = createTopicMenu({
    header: 'CHAPTER 2 · SUB-NAVIGATION',
    triggerLabel: 'PAGES',
    items: [
      {
        label: 'Engineering Principles',
        slideId: 'c2-s01',
        pages: [
          { label: '01', slideId: 'c2-s01', title: 'Engineering for Extraordinary Precision' },
          { label: '02', slideId: 'c2-s02', title: 'Part 1 Topics' },
          { label: '03', slideId: 'c2-s03', title: 'Capturing Starlight' },
          { label: '04', slideId: 'c2-s04', title: 'Maintaining Precision' }
        ]
      },
      { label: 'Anatomy of the Spacecraft', slideId: 'c2-s05' },
      {
        label: 'Mission Challenges and K2 Revival',
        slideId: 'c2-s06',
        pages: [
          { label: '06', slideId: 'c2-s06', title: 'Reaction Wheel Failure' },
          { label: '07', slideId: 'c2-s07', title: 'The K2 Mission Revival' }
        ]
      }
    ],
    onSelect: (slideId) => {
      navigateToChapter2SlideId(slideId);
    },
    onStepPrev: () => handlePrevRequest(),
    onStepNext: () => handleNextRequest()
  });

  ch3TopicMenu = createTopicMenu({
    header: 'CHAPTER 3 · SUB-NAVIGATION',
    triggerLabel: 'PAGES',
    items: [
      {
        label: 'A Universe Unveiled',
        slideId: 'c3-s01',
        pages: [
          { label: '01', slideId: 'c3-s01', title: 'The Hidden Landscape' },
          { label: '02', slideId: 'c3-s02', title: 'Two Kepler Worlds' }
        ]
      },
      { label: 'Beyond the Mission', slideId: 'c3-s03' },
      { label: 'The Final Chapter', slideId: 'c3-s04' }
    ],
    onSelect: (slideId) => {
      navigateToChapter3SlideId(slideId);
    },
    onStepPrev: () => handlePrevRequest(),
    onStepNext: () => handleNextRequest()
  });

  // 5. Initialize Chapter 1
  await initChapter1({
    onTypingComplete: () => {
      onSlideTypingComplete();
    },
    onSlideChange: (_idx, slide) => {
      if (ch1TopicMenu && slide) {
        ch1TopicMenu.setActive(slide.id, (slide.section || 1) - 1);
      }
      updateDeckHUD();
    },
    onTitleCardStateChange: (hidden) => {
      if (ch1TopicMenu) ch1TopicMenu.setTitleCardHidden(hidden);
    }
  });

  // 6. Initialize Chapter 2
  await initChapter2({
    onTypingComplete: () => {
      onSlideTypingComplete();
    },
    onSlideChange: (_idx, slide) => {
      if (topicMenu && slide) {
        topicMenu.setActive(slide.id, (slide.section || 1) - 1);
      }
      updateDeckHUD();
    },
    onTitleCardStateChange: (hidden) => {
      if (topicMenu) topicMenu.setTitleCardHidden(hidden);
    },
    onNavigateSlideId: (slideId) => {
      navigateToChapter2SlideId(slideId);
    }
  });

  // 7. Initialize Chapter 3
  await initChapter3({
    onTypingComplete: () => {
      onSlideTypingComplete();
    },
    onSlideChange: (_idx, slide) => {
      if (ch3TopicMenu && slide) {
        ch3TopicMenu.setActive(slide.id, (slide.section || 1) - 1);
        ch3TopicMenu.setTitleCardHidden(Boolean(slide.hideMenu));
      }
      updateDeckHUD();
    },
    onTitleCardStateChange: (hidden) => {
      if (ch3TopicMenu) ch3TopicMenu.setTitleCardHidden(hidden);
    },
    onReplayJourney: () => {
      lastPart1DeckIndex = null;
      updateSlideDisplay(0);
    }
  });

  // 8. Initialize Bottom Deck Controls & HUD
  initBottomDeckControls();

  // 9. Keyboard & Click Navigation
  initInteractionListeners();

  // 10. Initial Slide State (support returning directly to Team Hub via #hub)
  const initialIndex = window.location.hash === '#hub' ? 2 : 0;
  updateSlideDisplay(initialIndex);
});

/**
 * Prevents wheel and scroll navigation anywhere
 */
function preventAllScrolling() {
  window.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  window.addEventListener('touchmove', e => {
    // Only allow touching modals if scrollable
    if (!e.target.closest('.card')) {
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('scroll', () => {
    window.scrollTo(0, 0);
  });
}

function getChapter2StartIndex() {
  return PROLOGUE_COUNT + getTotalSlides();
}

function getChapter3StartIndex() {
  return getChapter2StartIndex() + getChapter2TotalSlides();
}

function getTotalDeckSlides() {
  return getChapter3StartIndex() + getChapter3TotalSlides();
}

function navigateToChapter1SlideId(slideId) {
  const idx = getChapter1SlideIndexById(slideId);
  if (idx < 0) return;
  updateSlideDisplay(PROLOGUE_COUNT + idx);
}

function navigateToChapter2SlideId(slideId) {
  const idx = getChapter2SlideIndexById(slideId);
  if (idx < 0) return;
  const ch2Start = getChapter2StartIndex();
  const ch3Start = getChapter3StartIndex();
  if (currentDeckIndex >= ch2Start && currentDeckIndex < ch3Start) {
    const curId = getCurrentChapter2SlideId();
    if (curId === 'c2-s02' || curId === 'c2-s03' || curId === 'c2-s04') {
      lastPart1DeckIndex = currentDeckIndex;
    }
  }
  updateSlideDisplay(ch2Start + idx);
}

function navigateToChapter3SlideId(slideId) {
  const idx = getChapter3SlideIndexById(slideId);
  if (idx < 0) return;
  updateSlideDisplay(getChapter3StartIndex() + idx);
}

/**
 * Updates the visual slide states with cinematic transitions
 */
function updateSlideDisplay(newIndex, isFromWarp = false) {
  // Stop all active sound effects when changing slide
  stopAllSfx();
  const slides = [
    document.getElementById('hero'),
    document.getElementById('tribute'),
    document.getElementById('hub'),
    document.getElementById('chapter-1'),
    document.getElementById('chapter-2'),
    document.getElementById('chapter-3')
  ];

  const prevDeckIndex = currentDeckIndex;
  currentDeckIndex = newIndex;

  const ch2Start = getChapter2StartIndex();
  const ch3Start = getChapter3StartIndex();
  const bottomCard = document.getElementById('bottomCard');
  const factRow = document.getElementById('factRow');

  // Prologue slides (0, 1, 2 = Pages 1, 2, 3)
  if (currentDeckIndex < PROLOGUE_COUNT) {
    stopVisualLoop();
    exitChapter1();
    exitChapter2();
    exitChapter3();
    if (ch1TopicMenu) ch1TopicMenu.hide();
    if (topicMenu) topicMenu.hide();
    if (ch3TopicMenu) ch3TopicMenu.hide();

    // 1. Bottom card completely hidden on Pages 1, 2 & 3
    if (bottomCard) {
      bottomCard.classList.add('deck-hidden');
      bottomCard.classList.remove('rolling-mode');
    }

    slides.forEach((slide, idx) => {
      if (!slide) return;
      if (idx === currentDeckIndex) {
        slide.classList.remove('leaving');
        slide.classList.add('active');
      } else if (idx === prevDeckIndex || (prevDeckIndex >= PROLOGUE_COUNT && idx >= 3)) {
        slide.classList.remove('active');
        slide.classList.add('leaving');
        setTimeout(() => slide.classList.remove('leaving'), 750);
      } else {
        slide.classList.remove('active', 'leaving');
      }
    });

    // Prologue Audio
    if (currentDeckIndex === 0) setActiveAudioSlide('hero');
    else if (currentDeckIndex === 1) setActiveAudioSlide('tribute');
    else if (currentDeckIndex === 2) setActiveAudioSlide('hub');

    // Page 1 hook typing/glow timing + hero button size
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      if (currentDeckIndex === 0) {
        nextBtn.classList.add('hero-next');
        nextBtn.classList.remove('glow');
        setTimeout(() => {
          if (currentDeckIndex === 0) nextBtn.classList.add('glow');
        }, 2200);
      } else {
        nextBtn.classList.remove('hero-next');
        nextBtn.classList.add('glow');
      }
    }
  } else if (currentDeckIndex < ch2Start) {
    // Chapter 1 Slides (Index 3..12: s01 to s10)
    exitChapter2();
    exitChapter3();
    if (topicMenu) topicMenu.hide();
    if (ch3TopicMenu) ch3TopicMenu.hide();

    const chIndex = currentDeckIndex - PROLOGUE_COUNT;
    const chContainer = document.getElementById('chapter-1');
    const ch2Container = document.getElementById('chapter-2');
    const ch3Container = document.getElementById('chapter-3');

    // Hide bottom card cleanly during warp intro card; chapter1.js opens it when slide loads
    if (bottomCard && isFromWarp) {
      bottomCard.classList.add('deck-hidden');
    }

    // Remove hero sizing from next button
    const nextBtnCh = document.getElementById('nextBtn');
    if (nextBtnCh) nextBtnCh.classList.remove('hero-next');

    // Hide prologue slides, Chapter 2 & Chapter 3
    slides.slice(0, 3).forEach(s => {
      if (s) s.classList.remove('active', 'leaving');
    });
    if (ch2Container) ch2Container.classList.remove('active', 'leaving');
    if (ch3Container) ch3Container.classList.remove('active', 'leaving');

    if (chContainer && !chContainer.classList.contains('active')) {
      chContainer.classList.add('active');
    }

    // Reset Next button glow while typing is active
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.classList.remove('glow');

    if (ch1TopicMenu) {
      ch1TopicMenu.show();
    }

    if (isFromWarp) {
      isIntroActive = true;
      startChapter1Cinematic(() => {
        isIntroActive = false;
      });
    } else {
      goToChapterSlide(chIndex);
    }
  } else if (currentDeckIndex < ch3Start) {
    // Chapter 2 Slides (Index 13..19: c2-s01 to c2-s07)
    stopVisualLoop();
    exitChapter1();
    exitChapter3();
    if (ch1TopicMenu) ch1TopicMenu.hide();
    if (ch3TopicMenu) ch3TopicMenu.hide();

    const ch2Index = currentDeckIndex - ch2Start;
    const chContainer = document.getElementById('chapter-1');
    const ch2Container = document.getElementById('chapter-2');
    const ch3Container = document.getElementById('chapter-3');

    // Hide prologue, Chapter 1 & Chapter 3
    slides.slice(0, 3).forEach(s => {
      if (s) s.classList.remove('active', 'leaving');
    });
    if (chContainer) chContainer.classList.remove('active', 'leaving');
    if (ch3Container) ch3Container.classList.remove('active', 'leaving');

    if (ch2Container && !ch2Container.classList.contains('active')) {
      ch2Container.classList.add('active');
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.classList.remove('hero-next', 'glow');
    }

    if (topicMenu) {
      topicMenu.show();
    }

    if (isFromWarp) {
      isIntroActive = true;
      startChapter2Cinematic(() => {
        isIntroActive = false;
      });
    } else {
      goToChapter2Slide(ch2Index);
    }
  } else {
    // Chapter 3 Slides (Index 20..24: c3-s01 to c3-s05)
    stopVisualLoop();
    exitChapter1();
    exitChapter2();
    if (ch1TopicMenu) ch1TopicMenu.hide();
    if (topicMenu) topicMenu.hide();

    const ch3Index = currentDeckIndex - ch3Start;
    const chContainer = document.getElementById('chapter-1');
    const ch2Container = document.getElementById('chapter-2');
    const ch3Container = document.getElementById('chapter-3');

    // Hide prologue, Chapter 1 & Chapter 2
    slides.slice(0, 3).forEach(s => {
      if (s) s.classList.remove('active', 'leaving');
    });
    if (chContainer) chContainer.classList.remove('active', 'leaving');
    if (ch2Container) ch2Container.classList.remove('active', 'leaving');

    if (ch3Container && !ch3Container.classList.contains('active')) {
      ch3Container.classList.add('active');
    }

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.classList.remove('hero-next', 'glow');
    }

    if (ch3TopicMenu) {
      ch3TopicMenu.show();
    }

    if (isFromWarp) {
      isIntroActive = true;
      startChapter3Cinematic(() => {
        isIntroActive = false;
      });
    } else {
      goToChapter3Slide(ch3Index);
    }
  }

  updateDeckHUD();
}

/**
 * Called when typing on active slide finishes
 */
function onSlideTypingComplete() {
  const nextBtn = document.getElementById('nextBtn');
  const totalDeckSlides = getTotalDeckSlides();

  if (nextBtn && currentDeckIndex < totalDeckSlides - 1) {
    nextBtn.classList.add('glow');
  }
}

/**
 * Updates the bottom HUD: buttons, labels, progress dots, and bottom line
 */
function updateDeckHUD() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const deckDots = document.getElementById('deckDots');
  const progressLineFill = document.getElementById('progressLineFill');

  const ch2Start = getChapter2StartIndex();
  const ch3Start = getChapter3StartIndex();
  const totalDeckSlides = getTotalDeckSlides();

  // 1. Previous Button logic: shown on every slide except the first
  if (prevBtn) {
    if (currentDeckIndex === 0) {
      prevBtn.style.display = 'none';
    } else {
      prevBtn.style.display = 'inline-flex';
      prevBtn.disabled = false;
    }
  }

  // 2. Next Button logic:
  // - BEGIN JOURNEY on Page 1
  // - NEXT on Page 2
  // - LAUNCH MISSION on Page 3
  // - CONTINUE TO CHAPTER 2 on Chapter 1 last slide (s10)
  // - CONTINUE TO CHAPTER 3 on Chapter 2 last slide (c2-s07)
  // - Hidden on Chapter 3 final closing card (c3-s05) where closing CTAs live
  if (nextBtn) {
    if (currentDeckIndex === totalDeckSlides - 1) {
      nextBtn.style.display = 'none';
      nextBtn.classList.remove('glow');
    } else {
      nextBtn.style.display = 'inline-flex';
      if (currentDeckIndex === 0) {
        nextBtn.textContent = 'BEGIN JOURNEY';
        nextBtn.disabled = false;
      } else if (currentDeckIndex === 1) {
        nextBtn.textContent = 'NEXT';
        nextBtn.disabled = false;
      } else if (currentDeckIndex === 2) {
        nextBtn.textContent = 'LAUNCH MISSION';
        nextBtn.disabled = false;
      } else if (currentDeckIndex === ch2Start - 1) {
        nextBtn.textContent = 'CONTINUE TO CHAPTER 2';
        nextBtn.disabled = false;
      } else if (currentDeckIndex === ch3Start - 1) {
        nextBtn.textContent = 'CONTINUE TO CHAPTER 3';
        nextBtn.disabled = false;
      } else {
        nextBtn.textContent = 'NEXT';
        nextBtn.disabled = false;
      }
    }
  }

  // 3. Progress Dots
  if (deckDots) {
    deckDots.innerHTML = '';
    const dotCount = Math.min(8, totalDeckSlides);
    const activeDotIdx = Math.floor((currentDeckIndex / (totalDeckSlides - 1)) * (dotCount - 1));

    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElement('i');
      if (i === activeDotIdx) dot.classList.add('on');
      deckDots.appendChild(dot);
    }
  }

  // 4. Thin Bottom Progress Line
  if (progressLineFill) {
    const progressPercent = ((currentDeckIndex + 1) / totalDeckSlides) * 100;
    progressLineFill.style.width = `${progressPercent}%`;
  }
}

/**
 * Handle Next navigation request
 */
function handleNextRequest() {
  if (isWarping || isIntroActive) return;

  const ch2Start = getChapter2StartIndex();
  const ch3Start = getChapter3StartIndex();
  const totalDeckSlides = getTotalDeckSlides();

  // If slide is currently typing or showing title card, pressing Next / Space / Enter finishes typing instantly
  if (currentDeckIndex >= PROLOGUE_COUNT && currentDeckIndex < ch2Start && isTypingActive()) {
    completeTypingInstantly();
    return;
  }
  if (currentDeckIndex >= ch2Start && currentDeckIndex < ch3Start && isChapter2TypingActive()) {
    completeChapter2TypingInstantly();
    return;
  }
  if (currentDeckIndex >= ch3Start && isChapter3TypingActive()) {
    completeChapter3TypingInstantly();
    return;
  }

  if (currentDeckIndex === 2) {
    // Page 3 -> Launch Mission warp into Chapter 1
    triggerMissionLaunch();
  } else if (currentDeckIndex === ch2Start - 1) {
    // Chapter 1 last slide (s10) -> Chapter 2 with soft light flash & Chapter 2 title card
    updateSlideDisplay(ch2Start, true);
  } else if (currentDeckIndex === ch3Start - 1) {
    // Chapter 2 last slide (c2-s07) -> Chapter 3 with soft light flash & Chapter 3 title card
    updateSlideDisplay(ch3Start, true);
  } else if (currentDeckIndex >= ch2Start && currentDeckIndex < ch3Start) {
    // Chapter 2: on c2-s02, c2-s03, c2-s04 bottom Next skips/goes to Anatomy (c2-s05)
    const ch2Id = getCurrentChapter2SlideId();
    if (ch2Id === 'c2-s02' || ch2Id === 'c2-s03' || ch2Id === 'c2-s04') {
      lastPart1DeckIndex = currentDeckIndex;
      navigateToChapter2SlideId('c2-s05');
    } else if (currentDeckIndex < totalDeckSlides - 1) {
      updateSlideDisplay(currentDeckIndex + 1);
    }
  } else if (currentDeckIndex < totalDeckSlides - 1) {
    updateSlideDisplay(currentDeckIndex + 1);
  }
}

/**
 * Handle Previous navigation request
 */
function handlePrevRequest() {
  if (isWarping || isIntroActive) return;
  stopAllSfx();

  const ch2Start = getChapter2StartIndex();
  const ch3Start = getChapter3StartIndex();
  if (currentDeckIndex >= ch2Start && currentDeckIndex < ch3Start) {
    const ch2Id = getCurrentChapter2SlideId();
    if (ch2Id === 'c2-s05' && lastPart1DeckIndex !== null && lastPart1DeckIndex >= ch2Start) {
      const target = lastPart1DeckIndex;
      lastPart1DeckIndex = null;
      updateSlideDisplay(target);
      return;
    }
    if (ch2Id === 'c2-s03' || ch2Id === 'c2-s04') {
      navigateToChapter2SlideId('c2-s02');
      return;
    }
  }

  if (currentDeckIndex > 0) {
    updateSlideDisplay(currentDeckIndex - 1);
  }
}

/**
 * Initializes Bottom Controls buttons
 */
function initBottomDeckControls() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      handlePrevRequest();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      handleNextRequest();
    });
  }
}

/**
 * Handles Keyboard and Click navigation
 */
function initInteractionListeners() {
  window.addEventListener('keydown', e => {
    const openModal = document.querySelector('.modal.open');
    if (openModal) {
      if (e.key === 'Escape') openModal.classList.remove('open');
      return;
    }

    // Do not hijack arrow keys while Anatomy 3D explorer iframe is focused
    const ch2Start = getChapter2StartIndex();
    const ch3Start = getChapter3StartIndex();
    const ch2Id = (currentDeckIndex >= ch2Start && currentDeckIndex < ch3Start) ? getCurrentChapter2SlideId() : null;
    if (ch2Id === 'c2-s05') {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.id === 'anatomyFrame') {
        return;
      }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (activeEl && activeEl.closest && activeEl.closest('#anatomyFrame')) return;
      }
    }

    if (e.code === 'ArrowRight') {
      e.preventDefault();
      handleNextRequest();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      handlePrevRequest();
    } else if (e.code === 'Space' || e.code === 'Enter') {
      if (e.target && e.target.closest && e.target.closest('button, a, .topic-menu-root, .ch3-planet-slot, .ch3-hz-marker')) return;
      e.preventDefault();
      handleNextRequest();
    }
  });

  const stage = document.getElementById('stage');
  if (stage) {
    stage.addEventListener('click', (e) => {
      if (e.target.closest('button, a, .tab, .card, .nav, .hotspot, .topic-menu-root, #anatomyFrame, .ch3-planet-slot, .ch3-hz-marker, .ch3-ho-interactive, .ch3-closing-actions')) return;
      const ch2Start = getChapter2StartIndex();
      const ch3Start = getChapter3StartIndex();
      if (currentDeckIndex >= PROLOGUE_COUNT && currentDeckIndex < ch2Start && isTypingActive()) {
        completeTypingInstantly();
      } else if (currentDeckIndex >= ch2Start && currentDeckIndex < ch3Start && isChapter2TypingActive()) {
        completeChapter2TypingInstantly();
      } else if (currentDeckIndex >= ch3Start && isChapter3TypingActive()) {
        completeChapter3TypingInstantly();
      }
    });
  }
}

/**
 * Mission Launch Hyperspace Warp
 */
function initHubAndLaunch() {
  const launchBtn = document.getElementById('launchBtn');
  if (launchBtn) {
    launchBtn.addEventListener('click', () => {
      triggerMissionLaunch();
    });
  }

  const logo = document.getElementById('teamLogo');
  const fallback = document.getElementById('logoFallback');
  if (logo) {
    logo.onload = () => {
      logo.hidden = false;
      if (fallback) fallback.style.display = 'none';
    };
    logo.src = logo.getAttribute('src');
  }
}

function triggerMissionLaunch() {
  if (isWarping) return;
  isWarping = true;

  playHyperspaceWarp(1900);

  triggerHyperspace(1900, () => {
    isWarping = false;
    updateSlideDisplay(PROLOGUE_COUNT, true);
  });
}

/**
 * Cursor Orb
 */
function initCursorOrb() {
  const orb = document.getElementById('orb');
  if (!orb) return;
  let tx = 0, ty = 0, x = 0, y = 0;

  window.addEventListener('pointermove', e => {
    tx = e.clientX;
    ty = e.clientY;
    orb.style.opacity = '1';
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    orb.style.opacity = '0';
  });

  function loop() {
    x += (tx - x) * 0.14;
    y += (ty - y) * 0.14;
    orb.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/**
 * Modals & Toast
 */
export function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function initModals() {
  function closeModals() {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  }

  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-open');
      const targetModal = document.getElementById(targetId);
      if (targetModal) targetModal.classList.add('open');
    });
  });

  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m || e.target.hasAttribute('data-close')) {
        closeModals();
      }
    });
  });

  // Page 3 Mission Navigation Modal jump buttons
  document.querySelectorAll('[data-jump-chapter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ch = btn.getAttribute('data-jump-chapter');
      closeModals();
      if (ch === '1') updateSlideDisplay(PROLOGUE_COUNT, true);
      else if (ch === '2') updateSlideDisplay(getChapter2StartIndex(), true);
      else if (ch === '3') updateSlideDisplay(getChapter3StartIndex(), true);
    });
  });

  document.querySelectorAll('[data-jump-ch1]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slideId = btn.getAttribute('data-jump-ch1');
      closeModals();
      navigateToChapter1SlideId(slideId);
    });
  });

  document.querySelectorAll('[data-jump-ch2]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slideId = btn.getAttribute('data-jump-ch2');
      closeModals();
      navigateToChapter2SlideId(slideId);
    });
  });

  document.querySelectorAll('[data-jump-ch3]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slideId = btn.getAttribute('data-jump-ch3');
      closeModals();
      navigateToChapter3SlideId(slideId);
    });
  });
}

/**
 * Tribute Carousel
 */
function initTributeCarousel() {
  const slides = [...document.querySelectorAll('#carousel .slide')];
  const dotsContainer = document.querySelector('#carousel .cdots');
  const box = document.getElementById('carousel');
  if (!slides.length || !dotsContainer || !box) return;

  dotsContainer.innerHTML = '';
  slides.forEach(() => dotsContainer.appendChild(document.createElement('i')));

  let current = 0;
  let hold = false;

  function show(idx) {
    current = (idx + slides.length) % slides.length;
    slides.forEach((s, j) => s.classList.toggle('on', j === current));
    [...dotsContainer.children].forEach((d, j) => d.classList.toggle('on', j === current));
  }

  show(0);

  box.addEventListener('mouseenter', () => { hold = true; });
  box.addEventListener('mouseleave', () => { hold = false; });

  setInterval(() => {
    if (!hold && currentDeckIndex === 1) show(current + 1);
  }, 3200);
}

/**
 * Tribute Tabs
 */
function initTributeTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      const panelId = t.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      if (!panel) return;

      const isOpening = !panel.classList.contains('open');

      tabs.forEach(o => {
        o.setAttribute('aria-expanded', 'false');
        const p = document.getElementById(o.getAttribute('aria-controls'));
        if (p) p.classList.remove('open');
      });

      if (isOpening) {
        t.setAttribute('aria-expanded', 'true');
        panel.classList.add('open');
      }
    });
  });
}
