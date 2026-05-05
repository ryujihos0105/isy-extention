// ============================================
// ISY Popup Script
// ============================================

const scanBtn = document.getElementById('scan-btn');
const analyzeAllBtn = document.getElementById('analyze-all-btn');
const statusEl = document.getElementById('status');
const adapterNameEl = document.getElementById('adapter-name');
const resultsSummary = document.getElementById('results-summary');
const summaryNote = document.getElementById('summary-note');
const highCountEl = document.getElementById('high-count');
const lowCountEl = document.getElementById('low-count');
const failedCountEl = document.getElementById('failed-count');
const focusHighBtn = document.getElementById('focus-high-btn');
const focusLowBtn = document.getElementById('focus-low-btn');
const focusFailedBtn = document.getElementById('focus-failed-btn');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' status-' + type : '');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pingContentScript(tabId, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (response && response.ok) return response;
    } catch (err) {}
    if (i < retries) await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

function isRestrictedUrl(url) {
  return url.startsWith('chrome://')
    || url.startsWith('chrome-extension://')
    || url.startsWith('about:');
}

async function safeSend(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    setStatus('탭 정보를 가져올 수 없습니다.', 'error');
    return null;
  }
  if (isRestrictedUrl(tab.url)) {
    setStatus('이 페이지에서는 사용할 수 없습니다.', 'error');
    return null;
  }
  const ping = await pingContentScript(tab.id);
  if (!ping) {
    setStatus('페이지를 새로고침한 뒤 다시 시도하세요.', 'error');
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    setStatus(err.message, 'error');
    return null;
  }
}

function setFocusButtonState(button, count) {
  button.disabled = count <= 0;
}

function updateResultsSummary(state) {
  const high = state.highCount || state.fakeCount || 0;
  const low = state.lowCount || state.realCount || 0;
  const failed = state.failedCount || 0;
  const total = high + low + failed;

  if (total === 0) {
    resultsSummary.classList.add('hidden');
    summaryNote.classList.add('hidden');
    return;
  }

  resultsSummary.classList.remove('hidden');
  summaryNote.classList.remove('hidden');
  highCountEl.textContent = high;
  lowCountEl.textContent = low;
  failedCountEl.textContent = failed;
  setFocusButtonState(focusHighBtn, high);
  setFocusButtonState(focusLowBtn, low);
  setFocusButtonState(focusFailedBtn, failed);

  const pending = state.pendingCount || 0;
  summaryNote.textContent = pending > 0
    ? `총 ${total}개 결과, ${pending}개 분석 중 · 숫자를 누르면 해당 콘텐츠로 이동합니다.`
    : `총 ${total}개 결과 · 새로 보이는 콘텐츠도 계속 확인합니다.`;
}

async function syncState() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    adapterNameEl.textContent = '알 수 없음';
    return;
  }
  if (isRestrictedUrl(tab.url)) {
    adapterNameEl.textContent = '사용 불가';
    [scanBtn, analyzeAllBtn].forEach(btn => { btn.disabled = true; });
    return;
  }

  const ping = await pingContentScript(tab.id);
  if (!ping) {
    adapterNameEl.textContent = '새로고침 필요';
    return;
  }

  adapterNameEl.textContent = ping.adapter || '알 수 없음';

  try {
    const state = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' });
    if (state) updateResultsSummary(state);
  } catch (err) {
    console.error(err);
  }
}

scanBtn.addEventListener('click', async () => {
  setStatus('분석 가능한 항목을 확인하는 중', 'loading');
  const res = await safeSend({ type: 'SCAN_PAGE' });
  if (res) {
    if (res.count === 0) {
      setStatus(`${res.adapter}에서 분석할 콘텐츠를 찾지 못했습니다.`, 'error');
      return;
    }
    const detail = res.textCount > 0
      ? `미디어 ${res.mediaCount}개, 텍스트 ${res.textCount}개`
      : `${res.count}개`;
    setStatus(`${res.adapter}에서 ${detail}를 찾았습니다.`, 'success');
  }
});

async function focusResult(level) {
  const labels = {
    high: '가능성 높은',
    low: '가능성 낮은',
    failed: '분석 실패'
  };
  const res = await safeSend({ type: 'FOCUS_RESULT', level });
  if (!res) return;
  if (res.ok) {
    setStatus(`${labels[level]} 콘텐츠 위치로 이동했습니다.`, 'success');
  } else {
    setStatus(res.error || '이동할 콘텐츠를 찾지 못했습니다.', 'error');
  }
}

focusHighBtn.addEventListener('click', () => focusResult('high'));
focusLowBtn.addEventListener('click', () => focusResult('low'));
focusFailedBtn.addEventListener('click', () => focusResult('failed'));

let pollTimer = null;

function startPolling() {
  stopPolling();
  let lastSignature = '';
  let stableCount = 0;
  pollTimer = setInterval(async () => {
    const tab = await getActiveTab();
    if (!tab) return stopPolling();
    try {
      const state = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' });
      if (!state) return;
      updateResultsSummary(state);

      const signature = [
        state.highCount || state.fakeCount || 0,
        state.lowCount || state.realCount || 0,
        state.failedCount || 0,
        state.pendingCount || 0
      ].join(':');

      if (signature === lastSignature) {
        stableCount += 1;
        if (stableCount >= 5) stopPolling();
      } else {
        stableCount = 0;
        lastSignature = signature;
      }
    } catch (err) {
      stopPolling();
    }
  }, 700);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

analyzeAllBtn.addEventListener('click', async () => {
  setStatus('현재 페이지를 분석하는 중', 'loading');
  const res = await safeSend({ type: 'ANALYZE_ALL' });
  if (res) {
    if (res.count === 0) {
      setStatus('분석할 콘텐츠를 찾지 못했습니다.', 'error');
      return;
    }
    setStatus(`${res.count}개 항목 분석을 시작했습니다. 새로 보이는 콘텐츠도 계속 확인합니다.`, 'loading');
    startPolling();
  }
});

window.addEventListener('unload', stopPolling);

syncState();
