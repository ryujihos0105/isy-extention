const form = document.getElementById('upload-form');
const fileInput = document.getElementById('video-file');
const fileName = document.getElementById('file-name');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('result-card');

function setStatus(text, mode) {
  statusEl.textContent = text;
  statusEl.className = `status ${mode || 'idle'}`;
}

function levelClass(level) {
  if (level === 'high') return 'level-high';
  if (level === 'uncertain') return 'level-uncertain';
  return 'level-low';
}

function renderResult(payload) {
  const disclosure = payload.disclosure;
  resultCard.classList.remove('hidden');
  resultCard.innerHTML = `
    <div class="score">
      <div>
        <div class="section-label">Registered Label</div>
        <strong class="${levelClass(disclosure.level)}">${disclosure.percent}%</strong>
      </div>
      <div>${disclosure.viewer_title}</div>
    </div>
    <p>${disclosure.viewer_summary}</p>
    <a href="${payload.watch_url}" target="_blank" rel="noreferrer">시청자 화면 열기</a>
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

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileName.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'MP4, MOV, WEBM';
  if (file) {
    uploadSelectedFile();
  }
});

async function uploadSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) return;

  submitBtn.disabled = true;
  resultCard.classList.add('hidden');
  setStatus('업로드 중 · ISY 분석 대기', 'busy');

  const data = new FormData();
  data.append('file', file, file.name);

  try {
    const response = await fetch('/api/platform/demo-upload', {
      method: 'POST',
      body: data
    });
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    const payload = await response.json();
    setStatus('플랫폼 공개 라벨 등록 완료', 'done');
    renderResult(payload);
  } catch (err) {
    setStatus(err.message || '업로드 실패', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  uploadSelectedFile();
});
