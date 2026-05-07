// ============================================
// ISY Content Script
// ============================================

(function() {
  if (!window.ISY) {
    console.error('[ISY] Namespace not loaded - check manifest js order');
    return;
  }

  const ISY = window.ISY;
  const adapter = ISY.state.currentAdapter;

  console.log(`[ISY] Ready on ${window.location.hostname} (${adapter.name})`);

  const TEXT_ANALYSIS_ENABLED = false;
  const ANALYZE_CONCURRENCY = 4;
  const progress = { pending: 0, done: 0, failed: 0 };
  const focusCursors = { high: 0, low: 0, failed: 0 };
  const analyzeQueue = [];
  let activeAnalyzeCount = 0;
  let analysisStarted = false;
  let followupObserverStarted = false;

  function getItemKey(item) {
    return item.mediaType === 'text'
      ? 'text:' + item.text.slice(0, 120).replace(/\s+/g, ' ')
      : item.url;
  }

  function getCurrentItems() {
    const mediaItems = ISY.extractMedia();
    const textItems = TEXT_ANALYSIS_ENABLED ? ISY.extractText() : [];
    return { mediaItems, textItems, allItems: [...mediaItems, ...textItems] };
  }

  function recordFailure(key, mediaType, error, element) {
    progress.failed += 1;
    const reason = error || '분석 실패';
    ISY.state.results.set(key, {
      isFake: false,
      fakeProb: 0,
      level: 'failed',
      mediaType,
      error: reason,
      element
    });
    // 페이지에 실패 배지 표시 (미디어만 — 텍스트는 high만 띄우는 기존 정책 유지)
    if (element && element.isConnected && mediaType !== 'text') {
      ISY.ui.showResultBadge(element, {
        level: 'failed',
        media_type: mediaType,
        error: reason
      }, key);
    }
  }

  async function analyzeItem(item, options) {
    const opts = options || {};
    const key = getItemKey(item);

    if (ISY.state.analyzedUrls.has(key) && !opts.force) return;
    ISY.state.analyzedUrls.add(key);

    progress.pending += 1;

    // 미디어 항목은 결과 도착 전까지 "분석 중" 배지로 상태를 보여줌.
    // 텍스트는 high 결과에만 배지가 붙는 기존 정책을 유지.
    if (item.mediaType !== 'text' && item.element && item.element.isConnected) {
      ISY.ui.showLoadingBadge(item.element, key);
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_REQUEST',
        url: item.url || null,
        mediaType: item.mediaType,
        text: item.text || null,
        platformMeta: item.platformMeta || null,
        itemMeta: {
          isThumbnail: !!item.isThumbnail,
          source: item.source || null
        }
      });

      if (response && response.success) {
        if (item.mediaType === 'text') {
          ISY.ui.showTextBadge(item.element, response.result, key);
        } else {
          ISY.ui.showResultBadge(item.element, response.result, key);
        }
      } else {
        const error = !response ? 'Service Worker 응답 없음' : (response.error || '분석 실패');
        console.warn('[ISY] Analysis failed:', error);
        recordFailure(key, item.mediaType, error, item.element);
      }
    } catch (err) {
      console.error('[ISY] Message failed:', err);
      recordFailure(key, item.mediaType, err.message, item.element);
    } finally {
      progress.done += 1;
      if (ISY.badges.refreshVisibility) ISY.badges.refreshVisibility();
    }
  }

  // 동시 요청을 ANALYZE_CONCURRENCY개로 제한.
  // 서버 모델 추론이 sequential이라 폭주시키면 후순위 요청들이 클라이언트 25s timeout에 걸린다.
  function analyzeItems(items, options) {
    items.forEach(item => analyzeQueue.push({ item, options }));
    pumpAnalyzeQueue();
  }

  // 실패 항목 재분석. specificKeys가 주어지면 그 중 실패 상태인 것만, 아니면 전체 실패.
  // 팝업의 "실패 재시도" 버튼과 페이지 오버레이의 "재시도" 버튼이 공통 사용.
  function retryFailedItems(specificKeys) {
    const allFailed = Array.from(ISY.state.results.entries())
      .filter(([, r]) => r.level === 'failed')
      .map(([key]) => key);
    const targets = Array.isArray(specificKeys) && specificKeys.length
      ? allFailed.filter(k => specificKeys.includes(k))
      : allFailed;

    targets.forEach(key => {
      const stored = ISY.state.results.get(key);
      if (stored && stored.element && stored.element.dataset
          && stored.element.dataset.isyBadged === 'true') {
        ISY.badges.detach(stored.element);
      }
      ISY.state.analyzedUrls.delete(key);
      ISY.state.results.delete(key);
    });
    progress.failed = Math.max(0, progress.failed - targets.length);

    const itemsToRetry = getCurrentItems().allItems
      .filter(item => targets.includes(getItemKey(item)));
    analyzeItems(itemsToRetry, { force: true });

    return { ok: true, retried: itemsToRetry.length, requested: targets.length };
  }
  ISY.retryFailedItems = retryFailedItems;

  function pumpAnalyzeQueue() {
    while (activeAnalyzeCount < ANALYZE_CONCURRENCY && analyzeQueue.length > 0) {
      const { item, options } = analyzeQueue.shift();
      activeAnalyzeCount += 1;
      analyzeItem(item, options).finally(() => {
        activeAnalyzeCount -= 1;
        pumpAnalyzeQueue();
      });
    }
  }

  function getResultsByLevel(level) {
    return Array.from(ISY.state.results.values())
      .filter(result => {
        if (level === 'low') return result.level === 'low' || result.level === 'uncertain';
        return result.level === level;
      })
      .filter(result => result.element && result.element.isConnected);
  }

  function focusResult(level) {
    const results = getResultsByLevel(level);
    if (results.length === 0) {
      return { ok: false, error: '해당 분류의 콘텐츠를 찾지 못했습니다.' };
    }

    const index = focusCursors[level] % results.length;
    focusCursors[level] = (focusCursors[level] + 1) % results.length;
    const target = results[index].element;

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    ISY.ui.highlightElement(target);

    return {
      ok: true,
      level,
      index: index + 1,
      total: results.length
    };
  }

  function resetPageState() {
    progress.pending = 0;
    progress.done = 0;
    progress.failed = 0;
    focusCursors.high = 0;
    focusCursors.low = 0;
    focusCursors.failed = 0;
    ISY.resetAnalyzed();
    ISY.badges.removeAll();
    ISY.ui.removeAllTextBadges();
    ISY.state.results.clear();
  }

  function startFollowupScanning() {
    if (followupObserverStarted) return;
    followupObserverStarted = true;

    ISY.observer.startMutationObserver(({ mediaItems, textItems }) => {
      if (!analysisStarted) return;
      const enabledTextItems = TEXT_ANALYSIS_ENABLED ? textItems : [];
      analyzeItems([...mediaItems, ...enabledTextItems]);
    });

    ISY.observer.startUrlChangeDetector(() => {
      if (!analysisStarted) return;
      console.log('[ISY] URL changed - resetting');
      resetPageState();
      setTimeout(() => {
        if (!analysisStarted) return;
        analyzeItems(getCurrentItems().allItems);
      }, 1000);
    });
  }

  function scanAfterUserInteraction() {
    if (!analysisStarted) return;
    setTimeout(() => {
      if (ISY.badges.refreshVisibility) ISY.badges.refreshVisibility();
      analyzeItems(getCurrentItems().allItems);
    }, 450);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    switch (message.type) {
      case 'PING':
        sendResponse({ ok: true, adapter: adapter.name });
        return false;

      case 'GET_STATE': {
        const allResults = Array.from(ISY.state.results.values());
        const highCount = allResults.filter(r => r.level === 'high').length;
        // uncertain(애매)은 사용자 관점에서 "확실히 의심 아님"이므로 low로 묶어 카운트.
        const lowCount = allResults.filter(r => r.level === 'low' || r.level === 'uncertain').length;
        const failedCount = allResults.filter(r => r.level === 'failed').length;
        sendResponse({
          autoMode: false,
          analysisStarted,
          adapter: adapter.name,
          analyzedCount: ISY.state.analyzedUrls.size,
          pendingCount: Math.max(0, progress.pending - progress.done),
          badgeCount: ISY.badges.getCount(),
          highCount,
          lowCount,
          failedCount
        });
        return false;
      }

      case 'SCAN_PAGE': {
        const { mediaItems, textItems } = getCurrentItems();
        sendResponse({
          count: mediaItems.length + textItems.length,
          mediaCount: mediaItems.length,
          textCount: textItems.length,
          adapter: adapter.name,
          items: mediaItems.map(i => ({ url: i.url, mediaType: i.mediaType }))
        });
        return false;
      }

      case 'ANALYZE_ALL': {
        analysisStarted = true;
        startFollowupScanning();
        const { mediaItems, textItems, allItems } = getCurrentItems();
        analyzeItems(allItems, { force: true });
        sendResponse({ count: mediaItems.length + textItems.length });
        return false;
      }

      case 'FOCUS_RESULT':
        sendResponse(focusResult(message.level));
        return false;

      case 'RETRY_FAILED': {
        const result = retryFailedItems(message.failedKeys);
        sendResponse(result);
        return false;
      }

      case 'STOP_ANALYSIS': {
        analysisStarted = false;
        followupObserverStarted = false;
        analyzeQueue.length = 0;  // 대기 중이던 항목들 폐기
        if (ISY.observer && ISY.observer.stopAll) {
          ISY.observer.stopAll();
        }
        // background.js에서 in-flight 요청을 모두 abort. SW가 죽었거나 응답 없어도 무시.
        try {
          chrome.runtime.sendMessage({ type: 'STOP_BG_ANALYSIS' })
            .catch(() => {});
        } catch {}
        sendResponse({ ok: true });
        return false;
      }

      case 'ANALYSIS_RESULT': {
        const targetEl = Array.from(document.querySelectorAll('img, video'))
          .find(el => ISY.getUrlFromElement(el) === message.url);
        if (targetEl) ISY.ui.showResultBadge(targetEl, message.result, message.url);
        sendResponse({ ok: !!targetEl });
        return false;
      }

      default:
        return false;
    }
  });

  document.addEventListener('click', scanAfterUserInteraction, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      scanAfterUserInteraction();
    }
  }, true);
})();
