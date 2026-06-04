const form = document.getElementById('upload-form');
const fileInput = document.getElementById('video-file');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultCard = document.getElementById('result-card');
const dropZone = document.getElementById('drop-zone');
const preview = document.getElementById('preview');
const previewStage = document.getElementById('preview-stage');
const previewVideo = document.getElementById('preview-video');
const previewName = document.getElementById('preview-name');
const previewBadge = document.getElementById('preview-badge');
const previewBadgeText = document.getElementById('preview-badge-text');
const changeBtn = document.getElementById('change-btn');
const stepsEl = document.getElementById('steps');

const { levelClass, labelText, initHeader, flashActive } = window.ISY_DEMO;

const STEPS = [
  { label: '영상 프레임 추출', meta: '균등 간격 6프레임 샘플링' },
  { label: '자막·텍스트 영역 마스킹', meta: '상·하단 오버레이 노이즈 제거' },
  { label: '시각 패턴(RGB) 분석', meta: 'EfficientNet-B0 딥러닝 추론' },
  { label: '좌우 반전 교차 검증', meta: 'Flip TTA 이중 확인' },
  { label: '7개 모델 앙상블 판정', meta: 'n=7 · median 통합' },
  { label: 'ISY 검증 라벨 생성', meta: '신뢰도 가중 종합' },
];

let previewUrl = null;
let stepTimer = null;

function setStatus(text, mode) {
  statusEl.textContent = text;
  statusEl.className = `yt-status ${mode || 'idle'}`;
}

function resultTitle(disclosure) {
  if (disclosure.level === 'high') return 'AI 생성 가능성 높음';
  if (disclosure.level === 'uncertain') return 'AI 생성 여부 확인 필요';
  return 'AI 생성 가능성 낮음';
}

/* ─── 미리보기 전환 ─── */
function showPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  previewVideo.src = previewUrl;
  previewVideo.play().catch(() => {});
  previewName.textContent = file.name;

  dropZone.classList.add('hidden');
  preview.classList.remove('hidden');
  previewBadge.hidden = true;
  previewStage.className = 'yt-preview-stage';
}

/* ─── 분석 스텝 연출 ─── */
function buildSteps() {
  stepsEl.innerHTML = STEPS.map((step, i) => `
    <li class="yt-step" data-step="${i}">
      <span class="yt-step-icon">
        <svg class="yt-step-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
      </span>
      <span class="yt-step-body">
        <span class="yt-step-text">${step.label}</span>
        <span class="yt-step-meta">${step.meta}</span>
      </span>
    </li>
  `).join('');
}

function setStepState(index, state) {
  const li = stepsEl.querySelector(`[data-step="${index}"]`);
  if (li) li.className = `yt-step ${state}`;
}

// 앞 단계를 순차적으로 체크하고, 마지막 단계가 진행 중(active)인 시점에 resolve.
// 마지막 단계는 실제 응답을 받은 뒤 호출부에서 done 처리 → 빈 대기 시간 없이 결과로 이어짐.
function startSteps() {
  buildSteps();
  stepsEl.classList.remove('hidden');
  return new Promise(resolve => {
    let i = 0;
    setStepState(0, 'active');
    clearInterval(stepTimer);
    stepTimer = setInterval(() => {
      if (i >= STEPS.length - 1) {
        clearInterval(stepTimer);
        resolve();
        return;
      }
      setStepState(i, 'done');
      i += 1;
      setStepState(i, 'active');
    }, 560);
  });
}

function resetSteps() {
  clearInterval(stepTimer);
  stepsEl.classList.add('hidden');
  stepsEl.innerHTML = '';
}

/* ─── 숫자 카운트업 ─── */
function animateCount(el, target, duration = 1200) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = `${Math.round(target * eased)}%`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ─── 결과 렌더 (원형 게이지) ─── */
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

function renderResult(payload) {
  const disclosure = payload.disclosure;
  const watchUrl = payload.watch_url || `/demo/watch/${encodeURIComponent(disclosure.video_id)}`;
  const cls = levelClass(disclosure.level);

  resultCard.className = `yt-result-card ${cls}`;
  resultCard.innerHTML = `
    <div class="yt-result-header">
      <span class="isy-dot"></span>
      ISY 검증 결과 · ${resultTitle(disclosure)}
    </div>
    <div class="yt-result-body">
      <div class="yt-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="yt-ring-bg" cx="60" cy="60" r="${RING_R}"/>
          <circle class="yt-ring-fill" cx="60" cy="60" r="${RING_R}"
            style="stroke-dasharray:${RING_C};stroke-dashoffset:${RING_C}"/>
        </svg>
        <div class="yt-ring-center">
          <div class="yt-ring-pct" id="ring-pct">0%</div>
          <div class="yt-ring-label">AI 생성 가능성</div>
        </div>
      </div>
      <p class="yt-result-note">영상 재생 시작 후 10초 동안, 좌측 상단에 ISY 검증 라벨이 시청자에게 표시됩니다.</p>
      <a class="yt-watch-link" href="${watchUrl}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        시청자 입장에서 보기
      </a>
    </div>
  `;

  // 영상 위 검증 라벨 박기
  previewStage.className = `yt-preview-stage ${cls}`;
  previewBadgeText.textContent = labelText(disclosure);
  previewBadge.hidden = false;

  requestAnimationFrame(() => {
    const fill = resultCard.querySelector('.yt-ring-fill');
    const pct = resultCard.querySelector('#ring-pct');
    fill.style.strokeDashoffset = String(RING_C * (1 - disclosure.percent / 100));
    animateCount(pct, disclosure.percent);
  });
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
  submitBtn.disabled = !fileInput.files?.[0];
}

async function uploadSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) return;

  submitBtn.disabled = true;
  resultCard.className = 'yt-result-card hidden';
  previewBadge.hidden = true;
  previewStage.className = 'yt-preview-stage scanning';
  setStatus('영상 분석 및 공개 라벨 등록 중', 'busy');
  const stepsDone = startSteps();

  const data = new FormData();
  data.append('file', file, file.name);

  try {
    const response = await fetch('/api/platform/demo-upload', { method: 'POST', body: data });
    if (!response.ok) throw new Error(await parseError(response));
    const payload = await response.json();
    // 앞 단계 애니메이션이 끝날 때까지 기다린 뒤, 마지막 단계에 ✓ 를 찍고 결과 표시
    await stepsDone;
    setStepState(STEPS.length - 1, 'done');
    await new Promise(resolve => setTimeout(resolve, 450));
    previewStage.classList.remove('scanning');
    setStatus('시청자 공개 라벨 등록 완료', 'done');
    renderResult(payload);
  } catch (err) {
    resetSteps();
    previewStage.className = 'yt-preview-stage';
    setStatus(err.message || '업로드 실패', 'error');
  } finally {
    updateSubmitEnabled();
  }
}

function handleFileSelected() {
  const file = fileInput.files?.[0];
  if (!file) return;
  resetSteps();
  showPreview(file);
  updateSubmitEnabled();
  uploadSelectedFile();
}

fileInput.addEventListener('change', handleFileSelected);

changeBtn.addEventListener('click', () => fileInput.click());

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!fileInput.files?.[0]) return;
  uploadSelectedFile();
});

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
