// ============================================
// ISY Background Service Worker
// ============================================

const API_BASE = "http://localhost:8000";  // 실제 백엔드로 교체 필요
const FETCH_TIMEOUT_MS = 25000;

const memCache = new Map();
const MAX_CACHE_SIZE = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;

// ============================================
// 이벤트 리스너는 반드시 top-level에 등록
// (Service Worker reboot 대비)
// ============================================

chrome.runtime.onInstalled.addListener(details => {
  // install/update 시에만 메뉴 재생성
  if (details.reason === 'install' || details.reason === 'update') {
    setupContextMenus();
  }
});

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.runtime.onMessage.addListener(handleMessage);

// ============================================
// 컨텍스트 메뉴 설정
// ============================================
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // lastError 체크 (removeAll은 거의 실패 안 하지만 방어)
    if (chrome.runtime.lastError) {
      console.warn('[ISY-BG] removeAll error:', chrome.runtime.lastError.message);
    }
    chrome.contextMenus.create({
      id: "isy-analyze",
      title: "I See You로 검증하기",
      contexts: ["image", "video"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[ISY-BG] create menu error:', chrome.runtime.lastError.message);
      }
    });
  });
}

// ============================================
// 컨텍스트 메뉴 클릭 핸들러
// ============================================
async function handleContextMenuClick(info, tab) {
  if (info.menuItemId !== "isy-analyze") return;
  if (!tab || !tab.id) return;

  const mediaUrl = info.srcUrl;
  const mediaType = info.mediaType;

  if (!mediaUrl) return;

  await safeSendToTab(tab.id, { type: "ANALYSIS_START", url: mediaUrl });

  try {
    const result = await analyzeContent(mediaUrl, mediaType, null, null, tab.url);
    await safeSendToTab(tab.id, {
      type: "ANALYSIS_RESULT",
      url: mediaUrl,
      result
    });
  } catch (err) {
    console.error('[ISY-BG] Context menu analysis failed:', err.message);
    await safeSendToTab(tab.id, {
      type: "ANALYSIS_ERROR",
      url: mediaUrl,
      error: err.message
    });
  }
}

// ============================================
// 안전한 탭 메시지 전송
// ============================================
async function safeSendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    // content script가 없는 탭에서 정상적으로 발생
    if (err.message && err.message.includes('Receiving end does not exist')) {
      // silent fail
    } else {
      console.error('[ISY-BG] sendMessage error:', err.message);
    }
    return null;
  }
}

// ============================================
// 메시지 핸들러
// ============================================
function handleMessage(message, sender, sendResponse) {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === "ANALYZE_REQUEST") {
    analyzeContent(message.url, message.mediaType, message.text, message.platformMeta, sender?.tab?.url, message.itemMeta)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;  // 비동기 응답
  }

  if (message.type === "ANALYZE_BATCH") {
    analyzeBatch(message.items)
      .then(results => sendResponse({ success: true, results }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
}

// ============================================
// 핵심 분석 함수
// ============================================
async function analyzeContent(url, mediaType, text, platformMeta, pageUrl, itemMeta) {
  if (mediaType === 'text') {
    return analyzeText(text);
  }
  if (mediaType === 'video') {
    return analyzeVideo(url, platformMeta);
  }

  if (!url) throw new Error('URL required');

  const cached = getCached(url);
  if (cached) {
    return Object.assign({}, cached, { fromCache: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/api/analyze/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        media_type: 'image',
        page_url: pageUrl || null
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(await formatApiError(response));
    }

    const result = await response.json();
    if (itemMeta) {
      result.item_meta = itemMeta;
    }
    setCached(url, stripLargeFields(result));
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Analysis timeout (25s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================
// 영상 분석 (골격 — 영상 모델 담당자가 완성)
// ============================================
// 계약:
//   url         - 직접 접근 가능한 영상 URL. blob: 이면 null.
//   platformMeta - { platform: 'youtube'|'instagram'|null, videoId: string|null }
//
// 서버 측 VideoRequest:
//   { url, platform_meta: { platform, video_id } }
//
// 구현 시 고려 사항:
//   - url이 있으면 서버가 직접 다운로드
//   - url이 null이면 platformMeta.videoId로 서버가 플랫폼 API를 통해 처리
async function analyzeVideo(url, platformMeta) {
  const cacheKey = url || `video:${platformMeta?.platform ?? 'unknown'}:${platformMeta?.videoId ?? 'unknown'}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return Object.assign({}, cached, { fromCache: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/api/analyze/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url || null,
        platform_meta: platformMeta || null
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(await formatApiError(response));
    }

    const result = await response.json();
    setCached(cacheKey, stripLargeFields(result));
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Analysis timeout (25s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeText(text) {
  if (!text) throw new Error('Text required');

  const cacheKey = 'text:' + text.slice(0, 120).replace(/\s+/g, ' ');
  const cached = getCached(cacheKey);
  if (cached) {
    return Object.assign({}, cached, { fromCache: true });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(await formatApiError(response));
    }

    const result = await response.json();
    setCached(cacheKey, result);
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Analysis timeout (25s)');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function analyzeBatch(items) {
  const BATCH_SIZE = 5;
  const results = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(item =>
        analyzeContent(item.url, item.mediaType, item.text, item.platformMeta)
          .catch(err => ({ url: item.url, error: err.message }))
      )
    );
    results.push(...chunkResults);
  }

  return results;
}

// ============================================
// 메모리 캐시 (LRU)
// ============================================
function getCached(url) {
  const entry = memCache.get(url);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memCache.delete(url);
    return null;
  }

  // LRU touch
  memCache.delete(url);
  memCache.set(url, entry);
  return entry.result;
}

function setCached(url, result) {
  while (memCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memCache.keys().next().value;
    memCache.delete(oldestKey);
  }
  memCache.set(url, { result, timestamp: Date.now() });
}

function stripLargeFields(result) {
  const slim = Object.assign({}, result);
  delete slim.heatmap;
  delete slim.heatmap_base64;
  delete slim.gradcam;
  return slim;
}

async function formatApiError(response) {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = body.detail || detail;
  } catch (err) {}
  return `API ${response.status}: ${detail}`;
}
