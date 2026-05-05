// ============================================
// 미디어 URL 추출기
// ============================================

(function() {
  if (!window.ISY) return;

  function extractImageUrl(img) {
    if (img.currentSrc && !img.currentSrc.startsWith('data:') && !isLikelyPlaceholder(img.currentSrc)) {
      return img.currentSrc;
    }

    const srcset = img.srcset || img.getAttribute('data-srcset');
    if (srcset) {
      const best = parseSrcset(srcset);
      if (best) return best;
    }

    const direct = [
      img.src,
      img.getAttribute('data-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('data-original-src'),
      img.getAttribute('data-lazy')
    ].find(url => url && !url.startsWith('data:') && !isLikelyPlaceholder(url));

    return direct || null;
  }

  function isLikelyPlaceholder(url) {
    return /spacer|transparent|placeholder|blank/i.test(url);
  }

  function parseSrcset(srcset) {
    try {
      const candidates = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        return { url: parts[0], weight: parseFloat(parts[1]) || 1 };
      }).filter(c => c.url && !c.url.startsWith('data:'));

      if (candidates.length === 0) return null;
      return candidates.sort((a, b) => b.weight - a.weight)[0].url;
    } catch (err) {
      return null;
    }
  }

  function extractVideoUrl(video) {
    if (video.src && !video.src.startsWith('blob:')) {
      return { url: video.src, isPoster: false };
    }
    const source = video.querySelector('source');
    if (source?.src && !source.src.startsWith('blob:')) {
      return { url: source.src, isPoster: false };
    }
    if (video.poster) {
      return { url: video.poster, isPoster: true };
    }
    return null;
  }

  // 플랫폼별 영상 메타데이터 추출
  // 영상 모델 담당자: platformMeta를 서버로 전달하는 계약 데이터
  // { platform: string|null, videoId: string|null }
  function extractPlatformMeta() {
    const hostname = location.hostname.replace(/^www\./, '');
    if (hostname === 'youtube.com') {
      // /watch?v=ID 또는 /shorts/ID
      const params = new URLSearchParams(location.search);
      const watchId = params.get('v');
      if (watchId) return { platform: 'youtube', videoId: watchId };
      const shortsMatch = location.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shortsMatch) return { platform: 'youtube', videoId: shortsMatch[1] };
    }
    if (hostname === 'instagram.com') {
      const reelMatch = location.pathname.match(/^\/reels?\/([^/?]+)/);
      const postMatch = location.pathname.match(/^\/p\/([^/?]+)/);
      const id = reelMatch?.[1] || postMatch?.[1] || null;
      return { platform: 'instagram', videoId: id };
    }
    return { platform: null, videoId: null };
  }

  function getUrlFromElement(el) {
    if (!el) return null;
    if (el.tagName === 'IMG') return extractImageUrl(el);
    if (el.tagName === 'VIDEO') {
      const result = extractVideoUrl(el);
      return result?.url || null;
    }
    return null;
  }

  function isLargeEnough(element, minSize) {
    if (element.tagName === 'IMG') {
      const w = element.naturalWidth || element.width || 0;
      const h = element.naturalHeight || element.height || 0;
      const rect = element.getBoundingClientRect();
      return (w >= minSize && h >= minSize)
          || (rect.width >= minSize && rect.height >= minSize);
    }
    return element.tagName === 'VIDEO';
  }

  function getElementArea(element) {
    const rect = element.getBoundingClientRect();
    const renderedArea = Math.max(0, rect.width) * Math.max(0, rect.height);
    const intrinsicArea = (element.naturalWidth || element.videoWidth || element.width || 0)
      * (element.naturalHeight || element.videoHeight || element.height || 0);
    return Math.max(renderedArea, intrinsicArea);
  }

  function isActuallyVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 1
      && rect.height > 1
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0;
  }

  function getMinSizeForElement(element, adapter) {
    const sel = window.ISY.getActiveSelectors(adapter);
    if (adapter.name === 'Instagram' && matchesAnySelector(element, sel.thumbnailSelectors)) {
      return 80;
    }
    return adapter.minSize;
  }

  function isExcludedByParent(element, excludeSelectors) {
    if (!excludeSelectors || excludeSelectors.length === 0) return false;
    let el = element.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 10) {
      for (const sel of excludeSelectors) {
        try {
          if (el.matches(sel)) return true;
        } catch (e) {}
      }
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  function matchesAnySelector(element, selectors) {
    if (!selectors || selectors.length === 0) return false;
    return selectors.some(selector => {
      try {
        return element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  function extractMedia(rootElement) {
    const root = rootElement || document.body;
    const adapter = window.ISY.state.currentAdapter;
    const sel = window.ISY.getActiveSelectors(adapter);  // pageType 반영
    const byUrl = new Map();

    function addOrReplaceItem(url, item) {
      const existing = byUrl.get(url);
      if (!existing) {
        byUrl.set(url, item);
        return;
      }

      const existingVisible = isActuallyVisible(existing.element);
      const nextVisible = isActuallyVisible(item.element);
      const existingArea = getElementArea(existing.element);
      const nextArea = getElementArea(item.element);

      if ((!existingVisible && nextVisible) || (existingVisible === nextVisible && nextArea > existingArea)) {
        byUrl.set(url, item);
      }
    }

    function addImages(selectors) {
      selectors.forEach(selector => {
        try {
          root.querySelectorAll(selector).forEach(img => {
            if (window.ISY.isExtensionElement(img)) return;
            if (isExcludedByParent(img, sel.excludeParents)) return;
            if (!isLargeEnough(img, getMinSizeForElement(img, adapter))) return;

            const url = extractImageUrl(img);
            if (!url) return;

            addOrReplaceItem(url, {
              url,
              mediaType: 'image',
              element: img,
              source: adapter.name,
              isThumbnail: matchesAnySelector(img, sel.thumbnailSelectors)
            });
          });
        } catch (err) {
          console.warn(`[ISY] Selector failed: ${selector}`, err.message);
        }
      });
    }

    addImages(sel.imageSelectors || []);

    if (byUrl.size === 0 && sel.imageFallback) {
      addImages(['img']);
    }

    (sel.videoSelectors || []).forEach(selector => {
      try {
        root.querySelectorAll(selector).forEach(video => {
          if (window.ISY.isExtensionElement(video)) return;
          if (isExcludedByParent(video, sel.excludeParents)) return;

          const result = extractVideoUrl(video);
          if (!result) return;

          addOrReplaceItem(result.url, {
            url: result.url,
            mediaType: result.isPoster ? 'image' : 'video',
            element: video,
            source: adapter.name,
            isPosterFallback: result.isPoster,
            // blob: URL인 경우 직접 접근 불가 — platformMeta로 서버가 우회 처리
            platformMeta: result.isPoster ? extractPlatformMeta() : null
          });
        });
      } catch (err) {
        console.warn(`[ISY] Selector failed: ${selector}`, err.message);
      }
    });

    return Array.from(byUrl.values()).filter(item => isActuallyVisible(item.element));
  }

  const BLOCK_TAGS = new Set([
    'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER',
    'NAV', 'MAIN', 'UL', 'OL', 'TABLE', 'FIGURE', 'BLOCKQUOTE'
  ]);

  function isTextContainer(el) {
    if (el.tagName === 'P') return true;
    for (const child of el.children) {
      if (BLOCK_TAGS.has(child.tagName)) return false;
    }
    return true;
  }

  function extractText(rootElement) {
    const root = rootElement || document.body;
    const adapter = window.ISY.state.currentAdapter;
    const sel = window.ISY.getActiveSelectors(adapter);  // pageType 반영
    const items = [];
    const seenHashes = new Set();
    const MIN_TEXT_LENGTH = 80;

    for (const selector of (sel.textSelectors || [])) {
      try {
        root.querySelectorAll(selector).forEach(el => {
          if (window.ISY.isExtensionElement(el)) return;
          if (isExcludedByParent(el, sel.excludeParents)) return;
          if (el.dataset && el.dataset.isyTextBadged === 'true') return;
          if (!isTextContainer(el)) return;

          const text = (el.innerText || el.textContent || '').trim();
          if (!text || text.length < MIN_TEXT_LENGTH) return;

          const hash = text.slice(0, 120).replace(/\s+/g, ' ');
          if (seenHashes.has(hash)) return;
          seenHashes.add(hash);

          items.push({ text, mediaType: 'text', element: el, source: adapter.name });
        });
      } catch (err) {
        console.warn(`[ISY] Text selector failed: ${selector}`, err.message);
      }
    }

    return items;
  }

  window.ISY.extractMedia = extractMedia;
  window.ISY.extractText = extractText;
  window.ISY.extractImageUrl = extractImageUrl;
  window.ISY.extractVideoUrl = extractVideoUrl;
  window.ISY.extractPlatformMeta = extractPlatformMeta;
  window.ISY.getUrlFromElement = getUrlFromElement;
})();
