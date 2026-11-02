/* Apple-style FLIP and crossfade page transitions with reduced-motion support. */
(function (root) {
  'use strict';
  let activeAnimations = [];
  let snapshots = [];
  let sequence = 0;
  const appleEase = 'cubic-bezier(0.16, 1, 0.3, 1)';

  /** Cancel any in-flight animations and remove temporary transition clones. */
  function finishPrevious() {
    activeAnimations.forEach(animation => {
      try { animation.cancel(); } catch (_) { /* ignore */ }
    });
    snapshots.forEach(node => node.remove());
    activeAnimations = [];
    snapshots = [];
  }

  /** Create a positioned visual clone of a departing element inside its relative container. */
  function snapshot(element, container) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const hostRect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const clone = element.cloneNode(true);
    const prefix = `tx-${++sequence}-`;
    const idMap = new Map();
    [clone, ...clone.querySelectorAll('[id]')].forEach(node => {
      if (node.id) {
        idMap.set(node.id, prefix + node.id);
        node.id = prefix + node.id;
      }
    });
    clone.querySelectorAll('[clip-path]').forEach(node => {
      const attr = node.getAttribute('clip-path') || '';
      const match = attr.match(/^url\(#(.+)\)$/);
      if (match && idMap.has(match[1])) {
        node.setAttribute('clip-path', `url(#${idMap.get(match[1])})`);
      }
    });
    clone.querySelectorAll('[marker-end]').forEach(node => {
      const attr = node.getAttribute('marker-end') || '';
      const match = attr.match(/^url\(#(.+)\)$/);
      if (match && idMap.has(match[1])) {
        node.setAttribute('marker-end', `url(#${idMap.get(match[1])})`);
      }
    });
    clone.inert = true;
    clone.hidden = false;
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('transition-snapshot');
    Object.assign(clone.style, {
      position: 'absolute',
      left: `${rect.left - hostRect.left - container.clientLeft}px`,
      top: `${rect.top - hostRect.top - container.clientTop}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      opacity: '1',
      visibility: 'visible',
      pointerEvents: 'none',
      zIndex: '6',
      willChange: 'transform, opacity'
    });
    container.append(clone);
    snapshots.push(clone);
    return clone;
  }

  /** Run a Web Animation and clean up when finished. */
  function animate(element, keyframes, options = {}, removeOnFinish = false) {
    if (!element || typeof element.animate !== 'function') return;
    const animation = element.animate(keyframes, {
      duration: options.duration || 680,
      delay: options.delay || 0,
      easing: options.easing || appleEase,
      fill: 'both'
    });
    activeAnimations.push(animation);
    animation.finished
      .then(() => {
        if (removeOnFinish) element.remove();
        animation.cancel();
      })
      .catch(() => {});
  }

  /** Execute smooth transition between pages, including the Page 2 <-> Page 3 manifold FLIP move. */
  function run(previousPage, nextPage, render) {
    finishPrevious();
    if (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      render();
      return;
    }
    const workspace = document.getElementById('stage-workspace');
    const igGrid = document.getElementById('ig-inner-grid');
    if (!workspace) {
      render();
      return;
    }
    const direction = nextPage > previousPage ? 1 : -1;

    if ([1, 2].includes(previousPage) && [1, 2].includes(nextPage) && igGrid) {
      const mapCard = document.getElementById('map-card');
      const before = mapCard.getBoundingClientRect();
      const leavingEl = document.getElementById(nextPage === 2 ? 'ig-text-block' : 'bound-card');
      const leavingClone = snapshot(leavingEl, igGrid);
      render();
      const after = mapCard.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;

      if (leavingClone) {
        animate(
          leavingClone,
          [
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            { opacity: 0, transform: `translate3d(${-direction * 64}px, 0, 0) scale(0.96)` }
          ],
          { duration: 540 },
          true
        );
      }

      mapCard.style.zIndex = '7';
      animate(
        mapCard,
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' }
        ],
        { duration: 680 }
      );
      setTimeout(() => { mapCard.style.zIndex = ''; }, 700);

      const arrivingEl = document.getElementById(nextPage === 2 ? 'bound-card' : 'ig-text-block');
      animate(
        arrivingEl,
        [
          { opacity: 0, transform: `translate3d(${direction * 56}px, 0, 0) scale(0.97)` },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
        ],
        { duration: 640, delay: 90 }
      );

      if (nextPage === 2) {
        animate(
          document.getElementById('page3-proof-box'),
          [
            { opacity: 0, transform: 'translate3d(0, 24px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' }
          ],
          { duration: 680, delay: 160 }
        );
      }
      return;
    }

    const currentStage = workspace.querySelector('.page-stage:not([hidden])');
    const departingClone = snapshot(currentStage, workspace);
    render();
    const nextStage = workspace.querySelector('.page-stage:not([hidden])');
    if (departingClone) {
      animate(
        departingClone,
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 0, transform: `translate3d(${-direction * 44}px, 0, 0) scale(0.985)` }
        ],
        { duration: 480 },
        true
      );
    }
    animate(
      nextStage,
      [
        { opacity: 0, transform: `translate3d(${direction * 48}px, 0, 0) scale(0.99)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
      ],
      { duration: 620, delay: 40 }
    );
  }

  root.PageTransitions = { run };
})(window);
