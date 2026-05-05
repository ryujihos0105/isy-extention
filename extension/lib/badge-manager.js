// ============================================
// Badge Manager
// Attaches result badges without changing media DOM structure.
// On Instagram, only the badge for the currently visible media is shown.
// ============================================

(function() {
  if (!window.ISY) return;

  const activeBadges = new Map();
  const containerBadges = new WeakMap();
  let visibilityObserver = null;

  function isInstagram() {
    return window.ISY.state.currentAdapter?.name === 'Instagram';
  }

  function findContainer(target) {
    const adapter = window.ISY.state.currentAdapter;
    if (typeof adapter.containerFinder === 'function') {
      const found = adapter.containerFinder(target);
      if (found) return found;
    }
    return target.parentElement || document.body;
  }

  function getContainerStack(container) {
    const stack = containerBadges.get(container) || [];
    const liveStack = stack.filter(entry => entry.badge && entry.badge.isConnected);
    containerBadges.set(container, liveStack);
    return liveStack;
  }

  function getVisibilityObserver() {
    if (visibilityObserver) return visibilityObserver;

    visibilityObserver = new IntersectionObserver(() => {
      requestAnimationFrame(updateAllInstagramVisibility);
    }, {
      threshold: [0, 0.2, 0.45, 0.75, 1]
    });

    return visibilityObserver;
  }

  function isVisuallyCentered(target) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return centerX > viewportW * 0.08
      && centerX < viewportW * 0.92
      && centerY > 0
      && centerY < viewportH;
  }

  function attachBadge(target, badge) {
    if (!target || !target.isConnected) return false;

    const container = findContainer(target);
    if (!container) return false;

    const cs = window.getComputedStyle(container);
    if (cs.position === 'static') {
      container.style.position = 'relative';
    }

    const stack = getContainerStack(container);
    const index = isInstagram() ? 0 : stack.length;

    badge.style.position = 'absolute';
    badge.style.top = `${8 + index * 30}px`;
    badge.style.right = '8px';
    badge.style.left = 'auto';
    badge.style.zIndex = String(window.ISY.CONSTANTS.BADGE_Z_INDEX);

    if (isInstagram()) {
      badge.classList.add('isy-badge-hidden');
    }

    container.appendChild(badge);
    stack.push({ target, badge });
    containerBadges.set(container, stack);
    activeBadges.set(target, { badge, container });

    if (isInstagram()) {
      getVisibilityObserver().observe(target);
      requestAnimationFrame(updateAllInstagramVisibility);
    }

    return true;
  }

  function updateAllInstagramVisibility() {
    if (!isInstagram()) return;

    const records = Array.from(activeBadges.entries())
      .filter(([target]) => target.isConnected)
      .map(([target, record]) => {
        const rect = target.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth;
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        const visibleW = Math.max(0, Math.min(rect.right, viewportW) - Math.max(rect.left, 0));
        const visibleH = Math.max(0, Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0));
        const ratio = (visibleW * visibleH) / Math.max(1, rect.width * rect.height);
        const centerDistance = Math.abs((rect.left + rect.width / 2) - viewportW / 2);
        return { target, record, ratio, centerDistance };
      })
      .filter(item => item.ratio >= 0.45 && isVisuallyCentered(item.target))
      .sort((a, b) => b.ratio - a.ratio || a.centerDistance - b.centerDistance);

    for (const [, record] of activeBadges) {
      record.badge.classList.add('isy-badge-hidden');
    }
    if (records[0]) {
      records[0].record.badge.classList.remove('isy-badge-hidden');
    }
  }

  function removeAllBadges() {
    for (const [target, { badge }] of activeBadges) {
      visibilityObserver?.unobserve(target);
      if (badge.isConnected) badge.remove();
      if (target.dataset) delete target.dataset.isyBadged;
    }
    activeBadges.clear();
    document.querySelectorAll('.isy-detail-overlay').forEach(el => el.remove());
  }

  function getBadgeCount() {
    return activeBadges.size;
  }

  window.addEventListener('scroll', () => requestAnimationFrame(updateAllInstagramVisibility), true);
  window.addEventListener('resize', () => requestAnimationFrame(updateAllInstagramVisibility));

  window.ISY.badges = {
    attach: attachBadge,
    removeAll: removeAllBadges,
    getCount: getBadgeCount,
    refreshVisibility: updateAllInstagramVisibility
  };
})();
