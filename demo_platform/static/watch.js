const videoId = location.pathname.split('/').filter(Boolean).pop();
const video = document.getElementById('video');
const playerLabel = document.getElementById('player-label');
const labelText = document.getElementById('label-text');
const videoTitle = document.getElementById('video-title');

// labelText는 DOM 요소 이름과 겹쳐서 별칭으로 가져옴
const { levelClass, labelText: levelLabel } = window.ISY_DEMO;

function updatePlayerLabelVisibility() {
  playerLabel.hidden = video.currentTime > 10;
}

function renderDisclosure(disclosure) {
  const cls = levelClass(disclosure.level);

  video.src = `/api/platform/videos/${encodeURIComponent(disclosure.video_id)}`;
  videoTitle.textContent = disclosure.filename || '업로드된 영상';
  labelText.textContent = levelLabel(disclosure);
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
