const videoId = location.pathname.split('/').filter(Boolean).pop();
const video = document.getElementById('video');
const playerLabel = document.getElementById('player-label');
const labelTitle = document.getElementById('label-title');
const labelSummary = document.getElementById('label-summary');
const videoTitle = document.getElementById('video-title');
const videoMeta = document.getElementById('video-meta');
const disclosureCard = document.getElementById('disclosure-card');

function levelClass(level) {
  if (level === 'high') return 'level-high';
  if (level === 'uncertain') return 'level-uncertain';
  return 'level-low';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function updatePlayerLabelVisibility() {
  playerLabel.hidden = video.currentTime > 5;
}

function renderDisclosure(disclosure) {
  video.src = `/api/platform/videos/${encodeURIComponent(disclosure.video_id)}`;
  videoTitle.textContent = disclosure.filename || 'Partner disclosure demo';
  videoMeta.textContent = `Video ID ${disclosure.video_id}`;
  labelTitle.textContent = disclosure.viewer_title;
  labelSummary.textContent = disclosure.viewer_summary;

  disclosureCard.className = `disclosure-card ${levelClass(disclosure.level)}`;
  disclosureCard.innerHTML = `
    <strong>${disclosure.viewer_title}</strong>
    <p>${disclosure.viewer_summary}</p>
    <div class="kv">
      <div><span>분석 점수</span><b>${disclosure.percent}%</b></div>
      <div><span>분석 모델</span><b>${disclosure.model}</b></div>
      <div><span>등록 출처</span><b>${disclosure.source}</b></div>
      <div><span>파일 크기</span><b>${formatBytes(disclosure.file_size)}</b></div>
    </div>
  `;
}

async function loadDisclosure() {
  try {
    const response = await fetch(`/api/platform/disclosures/${encodeURIComponent(videoId)}`);
    if (!response.ok) throw new Error('등록된 공개 라벨을 찾지 못했습니다.');
    renderDisclosure(await response.json());
  } catch (err) {
    labelTitle.textContent = '공개 라벨 없음';
    labelSummary.textContent = err.message;
    disclosureCard.className = 'disclosure-card loading';
    disclosureCard.textContent = err.message;
  }
}

video.addEventListener('timeupdate', updatePlayerLabelVisibility);
video.addEventListener('seeked', updatePlayerLabelVisibility);
video.addEventListener('play', updatePlayerLabelVisibility);
video.addEventListener('ended', () => {
  playerLabel.hidden = true;
});

loadDisclosure();
