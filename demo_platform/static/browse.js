const { levelClass, labelText } = window.ISY_DEMO;

function createCard(disclosure) {
  const cls = levelClass(disclosure.level);
  const videoSrc = `/api/platform/videos/${encodeURIComponent(disclosure.video_id)}`;

  const card = document.createElement('div');
  card.className = 'video-card';
  card.innerHTML = `
    <div class="card-thumb">
      <video class="thumb-video" muted playsinline preload="metadata" src="${videoSrc}"></video>
      <div class="card-overlay ${cls}">
        <span class="label-level-dot"></span>
        <span class="label-verify">ISY 검증</span>
        <span class="label-divider">·</span>
        <span>${labelText(disclosure)}</span>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${disclosure.filename || '업로드된 영상'}</div>
      <div class="card-channel">DEMO Creator</div>
    </div>
  `;

  const video = card.querySelector('.thumb-video');
  const overlay = card.querySelector('.card-overlay');

  video.addEventListener('loadedmetadata', () => {
    video.currentTime = 1;
  });

  card.addEventListener('mouseenter', () => {
    video.play().catch(() => {});
    overlay.classList.add('visible');
  });

  card.addEventListener('mouseleave', () => {
    video.pause();
    video.currentTime = 1;
    overlay.classList.remove('visible');
  });

  card.addEventListener('click', () => {
    location.href = `/demo/watch/${disclosure.video_id}`;
  });

  return card;
}

async function loadVideos() {
  const grid = document.getElementById('video-grid');
  try {
    const res = await fetch('/api/platform/disclosures');
    if (!res.ok) throw new Error();
    const videos = await res.json();
    grid.innerHTML = '';
    if (!videos.length) {
      grid.innerHTML = '<p class="empty-state">업로드된 영상이 없습니다. 먼저 영상을 업로드해주세요.</p>';
      return;
    }
    videos.forEach(d => grid.appendChild(createCard(d)));
  } catch {
    grid.innerHTML = '<p class="empty-state">영상 목록을 불러오지 못했습니다.</p>';
  }
}

loadVideos();
