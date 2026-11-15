/**
 * Acknowledgements & SI Disclosure Page Controller
 * - Initializes shared living starfield & subtle cursor glow orb
 * - Handles interactive 5-stage application timeline & active nav highlight
 */

import { initStarfield } from './starfield.js';

const STAGE_DETAILS = [
  {
    stage: 'Stage 01 · Research & Discovery',
    title: 'Scientific Research and Information Gathering',
    tool: 'ChatGPT (OpenAI)',
    summary:
      'ChatGPT was utilised to gather, explore and understand scientific information related to the Kepler Space Telescope, including its mission history, engineering principles, observational techniques, discoveries and scientific significance. It assisted in explaining complex astronomical concepts and identifying relevant information for the educational content.'
  },
  {
    stage: 'Stage 02 · Information Architecture',
    title: 'Content Organisation and Educational Structuring',
    tool: 'Gemini (Google)',
    summary:
      'Gemini assisted in organising the gathered information into a logical and structured format. It helped arrange scientific topics into chapters and subtopics, establish a coherent flow of information and improve the overall presentation of educational content.'
  },
  {
    stage: 'Stage 03 · Software Engineering',
    title: 'Website Programming and Code Development',
    tool: 'Claude (Anthropic)',
    summary:
      'Claude was utilised to assist with website coding, including generating, refining and debugging code, developing website components and supporting the implementation of interactive features and layouts.'
  },
  {
    stage: 'Stage 04 · Visual Direction & Workflow',
    title: 'Website Vision, Design Direction and Implementation Workflow',
    tool: 'Google Antigravity',
    summary:
      "Google Antigravity was used to develop and shape the overall vision of the website, supporting its visual direction, design approach, website structure and implementation workflow. It helped translate the project's concept into a cohesive digital experience."
  },
  {
    stage: 'Stage 05 · Disclosure & Refinement',
    title: 'Acknowledgement Page Design and AI-Assisted Development',
    tool: 'Google AI Studio',
    summary:
      'Google AI Studio was utilised to support the development and refinement of website components, particularly the creation and improvement of the acknowledgement and SI disclosure page, while assisting with its presentation and content organisation.'
  }
];

document.addEventListener('DOMContentLoaded', () => {
  initStarfield();
  initCursorOrb();
  initTimelineSelector();
  initActiveNavTracking();
});

function initCursorOrb() {
  const orb = document.getElementById('orb');
  if (!orb) return;

  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;

  window.addEventListener(
    'pointermove',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      orb.style.opacity = '1';
    },
    { passive: true }
  );

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

function initTimelineSelector() {
  const buttons = [...document.querySelectorAll('.timeline-step')];
  const stageEl = document.getElementById('timelineDetailStage');
  const titleEl = document.getElementById('timelineDetailHeading');
  const toolEl = document.getElementById('timelineDetailTool');
  const copyEl = document.getElementById('timelineDetailCopy');

  if (!buttons.length || !stageEl || !titleEl || !toolEl || !copyEl) return;

  function selectStage(index) {
    const detail = STAGE_DETAILS[index];
    if (!detail) return;

    buttons.forEach((btn, i) => {
      const isActive = i === index;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    stageEl.textContent = detail.stage;
    titleEl.textContent = detail.title;
    toolEl.textContent = detail.tool;
    copyEl.textContent = detail.summary;
  }

  buttons.forEach((btn, idx) => {
    btn.addEventListener('click', () => selectStage(idx));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (idx + 1) % buttons.length;
        selectStage(next);
        buttons[next].focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (idx - 1 + buttons.length) % buttons.length;
        selectStage(prev);
        buttons[prev].focus();
      }
    });
  });

  selectStage(0);
}

function initActiveNavTracking() {
  const links = [...document.querySelectorAll('.ack-nav-link')];
  if (!links.length) return;

  const sections = links
    .map((link) => {
      const id = link.getAttribute('href')?.replace('#', '');
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean);

  if (!sections.length || typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          links.forEach((l) => {
            l.classList.toggle('active', l.getAttribute('href') === `#${id}`);
          });
        }
      }
    },
    { rootMargin: '-30% 0px -55% 0px', threshold: 0.05 }
  );

  sections.forEach((sec) => observer.observe(sec));
}
