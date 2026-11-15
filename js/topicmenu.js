/**
 * Reusable Side Star Topic & Sub-Navigation Menu — EXO WORLDS
 * Fixed to the right edge, vertically centred, glowing star button with hover label.
 * Clicking/touching opens a smooth glass sub-navigation panel of numbered sections,
 * optional sub-page chips ({ pages: [{ label, slideId }] }), and optional step buttons.
 * Zero invisible hit-blocking when closed; keyboard accessible; closes on outside tap, Esc, or jump.
 */

export function createTopicMenu(options = {}) {
  const items = Array.isArray(options.items) ? options.items : [];
  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : () => {};
  const onStepPrev = typeof options.onStepPrev === 'function' ? options.onStepPrev : null;
  const onStepNext = typeof options.onStepNext === 'function' ? options.onStepNext : null;
  const headerText = options.header || 'SUB-NAVIGATION';
  const triggerLabel = options.triggerLabel || 'PAGES';
  const mountTarget = options.container || document.body;

  let isVisible = false;
  let isTitleCardHidden = false;
  let isOpen = false;
  let activeSlideId = null;

  // Root wrapper (pointer-events: none when closed so stage interactions stay unblocked)
  const root = document.createElement('div');
  root.className = 'topic-menu-root';
  root.setAttribute('aria-hidden', 'true');

  // Star / Orb Trigger Button
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'topic-star-btn';
  triggerBtn.setAttribute('aria-expanded', 'false');
  triggerBtn.setAttribute('aria-haspopup', 'true');
  triggerBtn.setAttribute('aria-label', 'Open chapter sub-navigation');

  triggerBtn.innerHTML = `
    <span class="topic-star-label" aria-hidden="true">${triggerLabel}</span>
    <span class="topic-star-orb" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="22" height="22">
        <path d="M16 2 L19.2 12.8 L30 16 L19.2 19.2 L16 30 L12.8 19.2 L2 16 L12.8 12.8 Z" fill="currentColor"/>
      </svg>
    </span>
  `;

  // Slim Glass Sub-Navigation Drawer
  const panel = document.createElement('nav');
  panel.className = 'topic-menu-panel glass';
  panel.setAttribute('aria-label', 'Chapter pages sub-navigation');
  panel.setAttribute('aria-hidden', 'true');

  const panelHeader = document.createElement('div');
  panelHeader.className = 'topic-menu-header';
  panelHeader.textContent = headerText;
  panel.appendChild(panelHeader);

  const list = document.createElement('div');
  list.className = 'topic-menu-list';
  panel.appendChild(list);

  const itemButtons = [];
  const subPageButtons = [];
  const focusableControls = [];

  items.forEach((item, idx) => {
    const group = document.createElement('div');
    group.className = 'topic-menu-group';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-menu-item';
    btn.dataset.slideId = item.slideId;
    btn.tabIndex = -1;

    const numSpan = document.createElement('span');
    numSpan.className = 'topic-menu-num';
    numSpan.textContent = String(idx + 1);

    const textSpan = document.createElement('span');
    textSpan.className = 'topic-menu-text';
    textSpan.textContent = item.label;

    btn.appendChild(numSpan);
    btn.appendChild(textSpan);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      onSelect(item.slideId);
    });

    group.appendChild(btn);
    itemButtons.push(btn);
    focusableControls.push(btn);

    // Optional compact sub-page chips within the section
    if (Array.isArray(item.pages) && item.pages.length > 1) {
      const pagesRow = document.createElement('div');
      pagesRow.className = 'topic-subpages';

      item.pages.forEach((pg, pIdx) => {
        const pgBtn = document.createElement('button');
        pgBtn.type = 'button';
        pgBtn.className = 'topic-subpage-btn';
        pgBtn.dataset.slideId = pg.slideId;
        pgBtn.dataset.sectionIdx = String(idx);
        pgBtn.textContent = pg.label || String(pIdx + 1).padStart(2, '0');
        pgBtn.title = pg.title || `Go to ${item.label} (${pgBtn.textContent})`;
        pgBtn.tabIndex = -1;

        pgBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          close();
          onSelect(pg.slideId);
        });

        pagesRow.appendChild(pgBtn);
        subPageButtons.push(pgBtn);
        focusableControls.push(pgBtn);
      });

      group.appendChild(pagesRow);
    }

    list.appendChild(group);
  });

  // Optional Prev / Next quick-touch footer inside the sub-navigation panel
  if (onStepPrev || onStepNext) {
    const footer = document.createElement('div');
    footer.className = 'topic-menu-footer';

    if (onStepPrev) {
      const prevStep = document.createElement('button');
      prevStep.type = 'button';
      prevStep.className = 'topic-step-btn';
      prevStep.textContent = '← PREV';
      prevStep.tabIndex = -1;
      prevStep.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        onStepPrev();
      });
      footer.appendChild(prevStep);
      focusableControls.push(prevStep);
    }

    if (onStepNext) {
      const nextStep = document.createElement('button');
      nextStep.type = 'button';
      nextStep.className = 'topic-step-btn primary';
      nextStep.textContent = 'NEXT PAGE →';
      nextStep.tabIndex = -1;
      nextStep.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        onStepNext();
      });
      footer.appendChild(nextStep);
      focusableControls.push(nextStep);
    }

    panel.appendChild(footer);
  }

  // Keyboard navigation across drawer items
  focusableControls.forEach((ctrl, cIdx) => {
    ctrl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = focusableControls[(cIdx + 1) % focusableControls.length];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = focusableControls[(cIdx - 1 + focusableControls.length) % focusableControls.length];
        if (prev) prev.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        triggerBtn.focus();
      }
    });
  });

  root.appendChild(panel);
  root.appendChild(triggerBtn);
  mountTarget.appendChild(root);

  function syncVisibility() {
    const shouldShow = isVisible && !isTitleCardHidden;
    root.classList.toggle('visible', shouldShow);
    root.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (!shouldShow && isOpen) {
      close();
    }
  }

  function open() {
    if (!isVisible || isTitleCardHidden) return;
    isOpen = true;
    root.classList.add('open');
    triggerBtn.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    focusableControls.forEach((ctrl) => { ctrl.tabIndex = 0; });
    const activeBtn =
      subPageButtons.find((b) => b.classList.contains('active')) ||
      itemButtons.find((b) => b.classList.contains('active')) ||
      focusableControls[0];
    if (activeBtn) {
      requestAnimationFrame(() => activeBtn.focus());
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('open');
    triggerBtn.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    focusableControls.forEach((ctrl) => { ctrl.tabIndex = -1; });
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  // Outside tap / click closes drawer cleanly
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !root.contains(e.target)) {
      close();
    }
  });

  // Esc closes drawer without navigating
  window.addEventListener('keydown', (e) => {
    if (isOpen && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      triggerBtn.focus();
    }
  }, true);

  function setActive(slideId, activeIndex = -1) {
    activeSlideId = slideId;
    itemButtons.forEach((btn, idx) => {
      const match = activeIndex >= 0 ? idx === activeIndex : btn.dataset.slideId === slideId;
      btn.classList.toggle('active', match);
      if (match) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    subPageButtons.forEach((pgBtn) => {
      const match = pgBtn.dataset.slideId === slideId;
      pgBtn.classList.toggle('active', match);
      if (match) pgBtn.setAttribute('aria-current', 'page');
      else pgBtn.removeAttribute('aria-current');
    });
  }

  function show() {
    isVisible = true;
    syncVisibility();
  }

  function hide() {
    isVisible = false;
    close();
    syncVisibility();
  }

  function setTitleCardHidden(hidden) {
    isTitleCardHidden = Boolean(hidden);
    syncVisibility();
  }

  function destroy() {
    root.remove();
  }

  return {
    show,
    hide,
    open,
    close,
    toggle,
    setActive,
    setTitleCardHidden,
    isOpen: () => isOpen,
    destroy
  };
}
