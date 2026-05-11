const videoId = location.pathname.split('/').filter(Boolean).pop();
const video = document.getElementById('video');
const playerLabel = document.getElementById('player-label');
const labelText = document.getElementById('label-text');
const videoTitle = document.getElementById('video-title');

function levelClass(level) {
  if (level === 'high') return 'level-high';
  if (level === 'uncertain') return 'level-uncertain';
  return 'level-low';
}

function labelCopy(disclosure) {
  const pct = Number.isFinite(disclosure.percent) ? ` ${disclosure.percent}%` : '';
  if (disclosure.level === 'high') return `AI 생성 가능성 높음${pct}`;
  if (disclosure.level === 'uncertain') return `AI 생성 여부 확인 필요${pct}`;
  return `AI 생성 가능성 낮음${pct}`;
}

function updatePlayerLabelVisibility() {
  playerLabel.hidden = video.currentTime > 10;
}

function renderDisclosure(disclosure) {
  const cls = levelClass(disclosure.level);

  video.src = `/api/platform/videos/${encodeURIComponent(disclosure.video_id)}`;
  videoTitle.textContent = disclosure.filename || '업로드된 영상';
  labelText.textContent = labelCopy(disclosure);
  playerLabel.className = `player-label ${cls}`;
}

async function loadDisclosure() {
  try {
    const response = await fetch(`/api/platform/disclosures/${encodeURIComponent(videoId)}`);
    if (!response.ok) throw new Error('등록된 AI 콘텐츠 안내를 찾지 못했습니다.');
    renderDisclosure(await response.json());
  } catch (err) {
    labelText.textContent = err.message;
  }
}

video.addEventListener('timeupdate', updatePlayerLabelVisibility);
video.addEventListener('seeked', updatePlayerLabelVisibility);
video.addEventListener('play', updatePlayerLabelVisibility);
video.addEventListener('ended', () => {
  playerLabel.hidden = true;
});

loadDisclosure();
