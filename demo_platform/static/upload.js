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

const { levelClass } = window.ISY_DEMO;

function resultTitle(disclosure) {
  if (disclosure.level === 'high') return 'AI 생성 가능성 높음';
  if (disclosure.level === 'uncertain') return 'AI 생성 여부 확인 필요';
  return 'AI 생성 가능성 낮음';
}

function renderResult(payload) {
  const disclosure = payload.disclosure;
  const title = resultTitle(disclosure);
  const cls = levelClass(disclosure.level);
  resultCard.className = `result-card ${cls}`;
  resultCard.innerHTML = `
    <div class="score">
      <div>
        <div class="score-value">${disclosure.percent}%</div>
        <div class="score-meta">AI 생성 가능성</div>
      </div>
      <div class="score-title">${title}</div>
    </div>
    <div class="gauge-wrap">
      <div class="gauge-header"><span>0%</span><span>100%</span></div>
      <div class="gauge-track"><div class="gauge-fill" style="width:${disclosure.percent}%"></div></div>
    </div>
    <p class="result-note">DEMO 시청자에게 영상 시작 시 ISY 검증 라벨이 노출됩니다.</p>
    <a class="watch-link" href="/demo/browse" target="_blank" rel="noreferrer">시청자 입장에서 보기 →</a>
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
  fileName.textContent = file ? file.name : '파일을 선택하면 자동으로 분석하고 공개 라벨을 등록합니다.';
  if (file) {
    uploadSelectedFile();
  }
});

async function uploadSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) return;

  submitBtn.disabled = true;
  resultCard.className = 'result-card hidden';
  setStatus('영상 분석 및 공개 라벨 등록 중', 'busy');

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
    setStatus('시청자 공개 라벨 등록 완료', 'done');
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
