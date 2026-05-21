(function (global) {
  const CHANNEL_INITIAL = 'D';

  function levelClass(level) {
    if (level === 'high') return 'level-high';
    if (level === 'uncertain') return 'level-uncertain';
    return 'level-low';
  }

  function labelText(disclosure) {
    const pct = Number.isFinite(disclosure.percent) ? ` ${disclosure.percent}%` : '';
    if (disclosure.level === 'high') return `AI 생성 가능성 높음${pct}`;
    if (disclosure.level === 'uncertain') return `AI 생성 여부 확인 필요${pct}`;
    return `AI 생성 가능성 낮음${pct}`;
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function pseudoRange(seed, min, max) {
    const span = max - min + 1;
    return min + (seed % span);
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const rs = (s % 60).toString().padStart(2, '0');
    if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${rs}`;
    return `${m}:${rs}`;
  }

  function formatViews(n) {
    if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만회`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}천회`;
    return `${n}회`;
  }

  function formatSubscribers(n) {
    if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만명`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}천명`;
    return `${n}명`;
  }

  function formatTimeAgo(daysAgo) {
    if (daysAgo < 1) return '방금 전';
    if (daysAgo < 7) return `${daysAgo}일 전`;
    if (daysAgo < 30) return `${Math.floor(daysAgo / 7)}주 전`;
    if (daysAgo < 365) return `${Math.floor(daysAgo / 30)}개월 전`;
    return `${Math.floor(daysAgo / 365)}년 전`;
  }

  function videoMeta(videoId) {
    const seed = hashSeed(String(videoId || ''));
    const views = pseudoRange(seed, 120, 84000);
    const days = pseudoRange((seed >>> 7), 0, 180);
    const subscribers = pseudoRange((seed >>> 13), 1200, 95000);
    return {
      views,
      viewsText: `조회수 ${formatViews(views)}`,
      uploadedAgo: formatTimeAgo(days),
      subscribers,
      subscribersText: `구독자 ${formatSubscribers(subscribers)}`,
    };
  }

  function flashActive(el, ms) {
    if (!el) return;
    el.classList.add('flash-active');
    setTimeout(() => el.classList.remove('flash-active'), ms || 220);
  }

  function initHeader({ onSearch } = {}) {
    const menuBtn = document.querySelector('.yt-header .yt-icon-btn');
    const sidebar = document.querySelector('.yt-sidebar, .yt-studio-sidebar');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('is-collapsed');
      });
    }

    const avatar = document.querySelector('.yt-header .yt-avatar');
    if (avatar) {
      avatar.addEventListener('click', () => flashActive(avatar));
    }

    const searchInput = document.querySelector('.yt-search input');
    const searchBtn = document.querySelector('.yt-search-btn');
    if (searchInput && typeof onSearch === 'function') {
      const trigger = () => onSearch(searchInput.value.trim());
      searchInput.addEventListener('input', trigger);
      searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') trigger(); });
      if (searchBtn) searchBtn.addEventListener('click', trigger);
    } else if (searchInput && searchBtn) {
      const flashSearch = () => flashActive(searchBtn);
      searchBtn.addEventListener('click', flashSearch);
      searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') flashSearch(); });
    }
  }

  global.ISY_DEMO = {
    levelClass,
    labelText,
    formatDuration,
    formatViews,
    formatSubscribers,
    formatTimeAgo,
    videoMeta,
    flashActive,
    initHeader,
    CHANNEL_INITIAL,
  };
})(window);
