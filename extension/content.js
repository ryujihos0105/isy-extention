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
  const progress = { pending: 0, done: 0, failed: 0 };
  const focusCursors = { high: 0, low: 0, failed: 0 };
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
    ISY.state.results.set(key, {
      isFake: false,
      fakeProb: 0,
      level: 'failed',
      mediaType,
      error: error || '분석 실패',
      element
    });
  }

  async function analyzeItem(item, options) {
    const opts = options || {};
    const key = getItemKey(item);

    if (ISY.state.analyzedUrls.has(key) && !opts.force) return;
    ISY.state.analyzedUrls.add(key);

    progress.pending += 1;

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
        const error = response && response.error ? response.error : '분석 실패';
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

  function analyzeItems(items, options) {
    items.forEach(item => analyzeItem(item, options));
  }

  function getResultsByLevel(level) {
    return Array.from(ISY.state.results.values())
      .filter(result => result.level === level)
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
        const lowCount = allResults.filter(r => r.level === 'low').length;
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
          failedCount,
          fakeCount: highCount,
          realCount: lowCount
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
