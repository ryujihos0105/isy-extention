const {
  levelClass,
  labelText,
  formatDuration,
  videoMeta,
  initHeader,
  flashActive,
  CHANNEL_INITIAL,
} = window.ISY_DEMO;

const state = {
  all: [],
  levelFilter: 'all',
  searchQuery: '',
};

function createCard(disclosure) {
  const cls = levelClass(disclosure.level);
  const videoSrc = `/api/platform/videos/${encodeURIComponent(disclosure.video_id)}`;
  const title = disclosure.filename || '업로드된 영상';
  const meta = videoMeta(disclosure.video_id);

  const card = document.createElement('div');
  card.className = 'yt-card';
  card.innerHTML = `
    <div class="yt-card-thumb">
      <video muted playsinline preload="metadata" src="${videoSrc}"></video>
      <div class="yt-card-isy ${cls}">
        <span class="isy-dot"></span>
        <span class="isy-badge-text">ISY 검증</span>
        <span class="isy-divider">·</span>
        <span>${labelText(disclosure)}</span>
      </div>
      <div class="yt-card-duration" hidden></div>
      <button class="yt-card-delete" type="button" title="이 영상 삭제" aria-label="이 영상 삭제">✕</button>
    </div>
    <div class="yt-card-meta">
      <div class="yt-channel-avatar">${CHANNEL_INITIAL}</div>
      <div class="yt-card-info">
        <div class="yt-card-title">${title}</div>
        <div class="yt-card-channel">DEMO Creator</div>
        <div class="yt-card-stats">${meta.viewsText} · ${meta.uploadedAgo}</div>
      </div>
    </div>
  `;

  const video = card.querySelector('video');
  const durationEl = card.querySelector('.yt-card-duration');
  video.addEventListener('loadedmetadata', () => {
    const safeStart = Math.min(1, (video.duration || 2) * 0.1);
    video.currentTime = safeStart;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      durationEl.textContent = formatDuration(video.duration);
      durationEl.hidden = false;
    }
  });
  card.addEventListener('mouseenter', () => { video.play().catch(() => {}); });
  card.addEventListener('mouseleave', () => {
    video.pause();
    const safeStart = Math.min(1, (video.duration || 2) * 0.1);
    video.currentTime = safeStart;
  });
  card.addEventListener('click', () => { location.href = `/demo/watch/${disclosure.video_id}`; });

  const deleteBtn = card.querySelector('.yt-card-delete');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteVideo(disclosure, deleteBtn);
  });

  return card;
}

async function deleteVideo(disclosure, btn) {
  const title = disclosure.filename || '이 영상';
  if (!confirm(`'${title}'을(를) 삭제할까요?\n영상 파일과 ISY 검증 기록이 함께 삭제됩니다.`)) return;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/platform/disclosures/${encodeURIComponent(disclosure.video_id)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) throw new Error();
    state.all = state.all.filter(d => d.video_id !== disclosure.video_id);
    applyFilters();
  } catch {
    if (btn) btn.disabled = false;
    alert('영상 삭제에 실패했습니다. 서버 상태를 확인해주세요.');
  }
}

function applyFilters() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;
  const q = state.searchQuery.toLowerCase();
  const filtered = state.all.filter(d => {
    if (state.levelFilter !== 'all' && d.level !== state.levelFilter) return false;
    if (q && !(d.filename || '').toLowerCase().includes(q)) return false;
    return true;
  });
  grid.innerHTML = '';
  if (!filtered.length) {
    const msg = state.searchQuery
      ? `'${state.searchQuery}'와 일치하는 영상이 없습니다.`
      : '해당 조건에 해당하는 영상이 없습니다.';
    grid.innerHTML = `<p class="yt-empty">${msg}</p>`;
    return;
  }
  filtered.forEach(d => grid.appendChild(createCard(d)));
}

function syncSidebarToLevel(level) {
  const navMap = { all: 'home', high: 'isy-channel' };
  const target = navMap[level];
  document.querySelectorAll('.yt-sidebar [data-nav]').forEach(btn => {
    btn.classList.toggle('active', target ? btn.dataset.nav === target : false);
  });
}

function setLevelFilter(level) {
  state.levelFilter = level;
  document.querySelectorAll('.yt-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === level);
  });
  syncSidebarToLevel(level);
  applyFilters();
}

function initChips() {
  document.querySelectorAll('.yt-chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => setLevelFilter(chip.dataset.filter));
  });
}

function initSidebarNav() {
  const buttons = document.querySelectorAll('.yt-sidebar [data-nav]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.nav;
      if (nav === 'home') {
        setLevelFilter('all');
      } else if (nav === 'isy-channel') {
        setLevelFilter('high');
      } else {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        flashActive(btn, 320);
      }
    });
  });
}

async function loadVideos() {
  const grid = document.getElementById('video-grid');
  try {
    const res = await fetch('/api/platform/disclosures');
    if (!res.ok) throw new Error();
    state.all = await res.json();
    if (!state.all.length) {
      grid.innerHTML = '<p class="yt-empty">업로드된 영상이 없습니다. 먼저 영상을 업로드해주세요.</p>';
      return;
    }
    applyFilters();
  } catch {
    grid.innerHTML = '<p class="yt-empty">영상 목록을 불러오지 못했습니다.</p>';
  }
}

initHeader({
  onSearch(query) {
    state.searchQuery = query;
    applyFilters();
  },
});
initChips();
initSidebarNav();
loadVideos();
