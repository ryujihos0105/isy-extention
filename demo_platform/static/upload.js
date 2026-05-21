const form = document.getElementById('upload-form');
const fileInput = document.getElementById('video-file');
const fileName = document.getElementById('file-name');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('result-card');
const dropZone = document.querySelector('.yt-drop-zone');

const { levelClass, initHeader, flashActive } = window.ISY_DEMO;

function setStatus(text, mode) {
  statusEl.textContent = text;
  statusEl.className = `yt-status ${mode || 'idle'}`;
}

function resultTitle(disclosure) {
  if (disclosure.level === 'high') return 'AI 생성 가능성 높음';
  if (disclosure.level === 'uncertain') return 'AI 생성 여부 확인 필요';
  return 'AI 생성 가능성 낮음';
}

function renderResult(payload) {
  const disclosure = payload.disclosure;
  const watchUrl = payload.watch_url || `/demo/watch/${encodeURIComponent(disclosure.video_id)}`;
  const title = resultTitle(disclosure);
  const cls = levelClass(disclosure.level);
  resultCard.className = `yt-result-card ${cls}`;
  resultCard.innerHTML = `
    <div class="yt-result-header">
      <span class="isy-dot"></span>
      ISY 검증 결과 · ${title}
    </div>
    <div class="yt-result-body">
      <div class="yt-score">
        <div>
          <div class="yt-score-pct">${disclosure.percent}%</div>
          <div class="yt-score-label">AI 생성 가능성</div>
        </div>
      </div>
      <div>
        <div class="yt-gauge-header"><span>0%</span><span>100%</span></div>
        <div class="yt-gauge-track">
          <div class="yt-gauge-fill" style="width:${disclosure.percent}%"></div>
        </div>
      </div>
      <p class="yt-result-note">영상 재생 시작 후 10초 동안, 좌측 상단에 ISY 검증 라벨이 시청자에게 표시됩니다.</p>
      <a class="yt-watch-link" href="${watchUrl}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        시청자 입장에서 보기
      </a>
    </div>
  `;
}

async function parseError(response) {
  try {
    const body = await response.json();
    return body.detail || response.statusText;
  } catch {
    return response.statusText;
  }
}

function updateSubmitEnabled() {
  const hasFile = !!fileInput.files?.[0];
  submitBtn.disabled = !hasFile;
}

async function uploadSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) return;

  submitBtn.disabled = true;
  resultCard.className = 'yt-result-card hidden';
  setStatus('영상 분석 및 공개 라벨 등록 중', 'busy');

  const data = new FormData();
  data.append('file', file, file.name);

  try {
    const response = await fetch('/api/platform/demo-upload', { method: 'POST', body: data });
    if (!response.ok) throw new Error(await parseError(response));
    const payload = await response.json();
    setStatus('시청자 공개 라벨 등록 완료', 'done');
    renderResult(payload);
  } catch (err) {
    setStatus(err.message || '업로드 실패', 'error');
  } finally {
    updateSubmitEnabled();
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (fileName) fileName.textContent = file ? file.name : '';
  updateSubmitEnabled();
  if (file) uploadSelectedFile();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!fileInput.files?.[0]) return;
  uploadSelectedFile();
});

if (dropZone) {
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'dragend', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('is-dragover');
    });
  });
  dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.type.startsWith('video/')) {
      setStatus('동영상 파일만 업로드할 수 있습니다.', 'error');
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change'));
  });
}

let studioNavRestoreTimer = null;
document.querySelectorAll('.yt-studio-nav-item[data-studio-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.yt-studio-nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    flashActive(btn, 320);

    const prevText = statusEl.textContent;
    const prevClass = statusEl.className;
    setStatus('데모 환경에서는 해당 메뉴가 비활성화되어 있습니다.', 'idle');
    clearTimeout(studioNavRestoreTimer);
    studioNavRestoreTimer = setTimeout(() => {
      statusEl.textContent = prevText;
      statusEl.className = prevClass;
    }, 1500);
  });
});

initHeader();
updateSubmitEnabled();
