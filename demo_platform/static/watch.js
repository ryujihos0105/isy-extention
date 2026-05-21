const videoId = location.pathname.split('/').filter(Boolean).pop();
const video = document.getElementById('video');
const playerLabel = document.getElementById('player-label');
const labelTextEl = document.getElementById('label-text');
const videoTitle = document.getElementById('video-title');
const videoStats = document.getElementById('video-stats');
const channelAvatar = document.getElementById('channel-avatar');
const channelSubs = document.getElementById('channel-subs');
const relatedContainer = document.getElementById('related-videos');

const RELATED_LIMIT = 12;

const {
  levelClass,
  labelText: levelLabel,
  formatDuration,
  videoMeta,
  initHeader,
  flashActive,
  CHANNEL_INITIAL,
} = window.ISY_DEMO;

let allDisclosures = [];

function updatePlayerLabelVisibility() {
  if (!playerLabel.dataset.ready) return;
  playerLabel.hidden = video.currentTime > 10;
}

function renderDisclosure(disclosure) {
  const cls = levelClass(disclosure.level);
  video.src = `/api/platform/videos/${encodeURIComponent(disclosure.video_id)}`;

  const title = disclosure.filename || '업로드된 영상';
  videoTitle.textContent = title;
  if (channelAvatar) channelAvatar.textContent = CHANNEL_INITIAL;

  const meta = videoMeta(disclosure.video_id);
  if (videoStats) videoStats.textContent = `${meta.viewsText} · ${meta.uploadedAgo}`;
  if (channelSubs) channelSubs.textContent = meta.subscribersText;

  labelTextEl.textContent = levelLabel(disclosure);
  playerLabel.className = `yt-player-label ${cls}`;
  playerLabel.dataset.ready = '1';
  playerLabel.hidden = false;
}

function createRelatedCard(d) {
  const cls = levelClass(d.level);
  const src = `/api/platform/videos/${encodeURIComponent(d.video_id)}`;
  const title = d.filename || '업로드된 영상';

  const el = document.createElement('a');
  el.className = 'yt-related-card';
  el.href = `/demo/watch/${d.video_id}`;
  el.dataset.title = title.toLowerCase();
  el.innerHTML = `
    <div class="yt-related-thumb">
      <video muted playsinline preload="metadata" src="${src}"></video>
      <div class="yt-card-duration yt-related-duration" hidden></div>
    </div>
    <div class="yt-related-info">
      <div class="yt-related-title">${title}</div>
      <div class="yt-related-channel">DEMO Creator</div>
      <div class="yt-related-isy ${cls}">
        <span class="isy-dot"></span>
        ${levelLabel(d)}
      </div>
    </div>
  `;

  const v = el.querySelector('video');
  const durationEl = el.querySelector('.yt-related-duration');
  v.addEventListener('loadedmetadata', () => {
    const safeStart = Math.min(1, (v.duration || 2) * 0.1);
    v.currentTime = safeStart;
    if (Number.isFinite(v.duration) && v.duration > 0) {
      durationEl.textContent = formatDuration(v.duration);
      durationEl.hidden = false;
    }
  });
  el.addEventListener('mouseenter', () => { v.play().catch(() => {}); });
  el.addEventListener('mouseleave', () => {
    v.pause();
    const safeStart = Math.min(1, (v.duration || 2) * 0.1);
    v.currentTime = safeStart;
  });
  return el;
}

function applyRelatedSearch(query) {
  const q = (query || '').trim().toLowerCase();
  document.querySelectorAll('.yt-related-card').forEach(card => {
    if (!q) {
      card.hidden = false;
      return;
    }
    card.hidden = !(card.dataset.title || '').includes(q);
  });
}

async function loadRelated() {
  if (!relatedContainer) return;
  try {
    const res = await fetch('/api/platform/disclosures');
    if (!res.ok) return;
    allDisclosures = await res.json();
    const others = allDisclosures
      .filter(d => d.video_id !== videoId)
      .slice(0, RELATED_LIMIT);
    if (!others.length) {
      relatedContainer.innerHTML = '<p class="yt-related-empty">추천할 다른 영상이 아직 없습니다.</p>';
      return;
    }
    others.forEach(d => relatedContainer.appendChild(createRelatedCard(d)));
  } catch { /* 실패 무시 */ }
}

async function loadDisclosure() {
  try {
    const res = await fetch(`/api/platform/disclosures/${encodeURIComponent(videoId)}`);
    if (!res.ok) throw new Error('등록된 AI 콘텐츠 안내를 찾지 못했습니다.');
    renderDisclosure(await res.json());
  } catch (err) {
    labelTextEl.textContent = err.message;
    playerLabel.dataset.ready = '1';
    playerLabel.hidden = false;
  }
}

function initActionButtons() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    btn.addEventListener('click', () => {
      if (action === 'subscribe') {
        btn.classList.toggle('is-active');
        btn.textContent = btn.classList.contains('is-active') ? '구독 중' : '구독';
      } else if (action === 'like') {
        const wasActive = btn.classList.contains('is-active');
        document.querySelector('[data-action="dislike"]')?.classList.remove('is-active');
        btn.classList.toggle('is-active', !wasActive);
      } else if (action === 'dislike') {
        const wasActive = btn.classList.contains('is-active');
        document.querySelector('[data-action="like"]')?.classList.remove('is-active');
        btn.classList.toggle('is-active', !wasActive);
      } else {
        flashActive(btn, 280);
      }
    });
  });
}

video.addEventListener('timeupdate', updatePlayerLabelVisibility);
video.addEventListener('seeked', updatePlayerLabelVisibility);
video.addEventListener('play', updatePlayerLabelVisibility);
video.addEventListener('ended', () => { playerLabel.hidden = true; });

initHeader({ onSearch: applyRelatedSearch });
initActionButtons();
loadDisclosure();
loadRelated();
