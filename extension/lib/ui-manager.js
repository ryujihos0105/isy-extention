// ============================================
// UI Manager
// Renders result badges, detail overlays, and auto-mode status.
// ============================================

(function() {
  if (!window.ISY) return;

  const activeOverlays = new WeakMap();
  const THRESHOLD = 0.5;

  function getFakeProbability(result) {
    return result.fake_probability != null ? result.fake_probability : 0;
  }

  function getResultMeta(result) {
    const fakeProb = getFakeProbability(result);
    const isHigh = fakeProb > THRESHOLD;
    const percent = Math.round(fakeProb * 100);
    return {
      fakeProb,
      isHigh,
      level: isHigh ? 'high' : 'low',
      percent,
      title: isHigh ? 'AI 가능성 높음' : 'AI 가능성 낮음',
      badgeText: isHigh ? `의심 ${percent}%` : '낮음',
      ariaText: isHigh
        ? `AI 생성 가능성 ${percent}%, 상세 보기`
        : `AI 생성 가능성 낮음, ${percent}%, 상세 보기`
    };
  }

  function recordResult(itemKey, result, mediaType, element) {
    if (!itemKey) return;
    const meta = getResultMeta(result);
    window.ISY.state.results.set(itemKey, {
      isFake: meta.isHigh,
      fakeProb: meta.fakeProb,
      level: meta.level,
      mediaType: mediaType || result.media_type || 'unknown',
      element
    });
  }

  function showResultBadge(targetElement, result, itemKey) {
    if (!targetElement || !targetElement.isConnected) return;
    if (targetElement.dataset && targetElement.dataset.isyBadged === 'true') return;
    if (targetElement.dataset) targetElement.dataset.isyBadged = 'true';

    const meta = getResultMeta(result);
    recordResult(itemKey, result, result.media_type || 'media', targetElement);

    const badge = document.createElement('div');
    badge.className = `isy-badge ${meta.isHigh ? 'isy-high' : 'isy-low'}`;
    badge.textContent = meta.badgeText;
    badge.title = meta.ariaText;
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', meta.ariaText);
    badge.dataset.isyLevel = meta.level;

    function open(e) {
      e.preventDefault();
      e.stopPropagation();
      showDetailOverlay(targetElement, result);
    }
    badge.addEventListener('click', open);
    badge.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });

    const ok = window.ISY.badges.attach(targetElement, badge);
    if (!ok && targetElement.dataset) {
      delete targetElement.dataset.isyBadged;
    }
  }

  function showTextBadge(element, result, itemKey) {
    if (!element || !element.isConnected) return;
    if (element.dataset && element.dataset.isyTextBadged === 'true') return;

    const meta = getResultMeta(result);
    recordResult(itemKey, result, 'text', element);
    if (!meta.isHigh) return;

    if (element.dataset) element.dataset.isyTextBadged = 'true';
    element.classList.add('isy-text-highlighted');

    const cs = window.getComputedStyle(element);
    if (cs.position === 'static') {
      element.dataset.isyOriginalPosition = 'static';
      element.style.position = 'relative';
    }

    const badge = document.createElement('span');
    badge.className = 'isy-text-badge';
    badge.textContent = `의심 ${meta.percent}%`;
    badge.setAttribute('aria-label', meta.ariaText);
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.title = meta.ariaText;
    badge.dataset.isyLevel = meta.level;

    function openText(e) {
      e.preventDefault();
      e.stopPropagation();
      showDetailOverlay(element, result);
    }
    badge.addEventListener('click', openText);
    badge.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openText(e);
    });

    element.appendChild(badge);
  }

  function showDetailOverlay(targetElement, result) {
    const existing = activeOverlays.get(targetElement);
    if (existing && existing.isConnected) {
      existing.remove();
      activeOverlays.delete(targetElement);
      return;
    }

    document.querySelectorAll('.isy-detail-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'isy-detail-overlay';

    const meta = getResultMeta(result);
    const adapterName = window.ISY.state.currentAdapter.name;
    const pctText = meta.fakeProb * 100;
    const mediaType = result.media_type || 'content';
    const itemMeta = result.item_meta || {};
    const analysisBasis = itemMeta.isThumbnail ? '썸네일 이미지 기준' : '원본/표시 이미지 기준';
    const cacheText = result.fromCache ? '<div class="isy-note">캐시된 결과입니다.</div>' : '';

    overlay.innerHTML = `
      <div class="isy-detail-card ${meta.isHigh ? 'high' : 'low'}" role="dialog" aria-label="AI 생성 가능성 분석 결과">
        <button class="isy-close" aria-label="닫기">x</button>
        <h3>
          <span class="isy-detail-icon" aria-hidden="true">${meta.isHigh ? '!' : 'i'}</span>
          ${meta.title}
        </h3>
        <p class="isy-explain">
          이 결과는 확정 판정이 아니라 모델이 계산한 AI 생성 가능성입니다.
        </p>
        <div class="isy-gauge-wrap">
          <div class="isy-gauge-header">
            <span>AI 생성 가능성</span>
            <strong class="isy-gauge-value">${pctText.toFixed(1)}%</strong>
          </div>
          <div class="isy-gauge-track" role="progressbar" aria-valuenow="${pctText.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">
            <div class="isy-gauge-fill ${meta.isHigh ? 'high' : 'low'}" style="width: ${pctText.toFixed(2)}%"></div>
            <div class="isy-gauge-threshold" aria-hidden="true"></div>
          </div>
          <div class="isy-gauge-scale" aria-hidden="true">
            <span>0%</span><span>기준값 50%</span><span>100%</span>
          </div>
        </div>
        <div class="isy-metric">
          <span>콘텐츠 유형</span>
          <strong>${mediaType}</strong>
        </div>
        <div class="isy-metric">
          <span>분석 기준</span>
          <strong>${analysisBasis}</strong>
        </div>
        ${result.crop_status ? `
          <div class="isy-metric">
            <span>얼굴 크롭</span>
            <strong>${result.crop_status}</strong>
          </div>
        ` : ''}
        ${cacheText}
        <div class="isy-source">모델: ${result.model || adapterName}</div>
      </div>
    `;

    overlay.style.position = 'fixed';
    overlay.style.top = '-9999px';
    overlay.style.left = '-9999px';
    overlay.style.zIndex = String(window.ISY.CONSTANTS.OVERLAY_Z_INDEX);
    document.body.appendChild(overlay);

    positionOverlay(overlay, targetElement);

    function closeOverlay() {
      overlay.remove();
      activeOverlays.delete(targetElement);
      document.removeEventListener('keydown', onEscKey, true);
      document.removeEventListener('click', onOutsideClick, true);
    }
    function onEscKey(e) {
      if (e.key === 'Escape') closeOverlay();
    }
    function onOutsideClick(e) {
      if (overlay.contains(e.target)) return;
      if (e.target.closest('.isy-badge, .isy-text-badge')) return;
      closeOverlay();
    }

    overlay.querySelector('.isy-close').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onEscKey, true);
    setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
    activeOverlays.set(targetElement, overlay);
  }

  function positionOverlay(overlay, targetElement) {
    const card = overlay.querySelector('.isy-detail-card');
    const cardRect = card.getBoundingClientRect();
    const cardW = cardRect.width;
    const cardH = cardRect.height;
    const rect = targetElement.getBoundingClientRect();
    const margin = 12;

    if (window.innerWidth <= 520) {
      overlay.style.left = '12px';
      overlay.style.right = '12px';
      overlay.style.bottom = '12px';
      overlay.style.top = 'auto';
      return;
    }

    let left = rect.right + margin;
    if (left + cardW > window.innerWidth - margin) {
      left = rect.left - cardW - margin;
    }
    if (left < margin) {
      left = Math.max(margin, Math.min(rect.left, window.innerWidth - cardW - margin));
    }

    let top = rect.top;
    if (top + cardH > window.innerHeight - margin) {
      top = window.innerHeight - cardH - margin;
    }
    if (top < margin) top = margin;

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
  }

  function highlightElement(element) {
    if (!element || !element.isConnected) return false;
    element.classList.add('isy-focus-target');
    setTimeout(() => {
      if (element.isConnected) element.classList.remove('isy-focus-target');
    }, 1800);
    return true;
  }

  function removeAllTextBadges() {
    document.querySelectorAll('[data-isy-text-badged="true"]').forEach(el => {
      const badge = el.querySelector('.isy-text-badge');
      if (badge) badge.remove();
      el.classList.remove('isy-text-highlighted');
      if (el.dataset.isyOriginalPosition === 'static') {
        el.style.position = '';
        delete el.dataset.isyOriginalPosition;
      }
      delete el.dataset.isyTextBadged;
    });
  }

  let autoIndicatorEl = null;
  let autoIndicatorOnDisable = null;

  function showAutoIndicator(onDisable) {
    if (autoIndicatorEl && autoIndicatorEl.isConnected) {
      autoIndicatorOnDisable = onDisable;
      return;
    }
    autoIndicatorOnDisable = onDisable;

    const el = document.createElement('div');
    el.className = 'isy-auto-indicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <span class="isy-auto-dot" aria-hidden="true"></span>
      <span class="isy-auto-text">자동 분석 대기 중</span>
      <button class="isy-auto-stop" aria-label="자동 모드 끄기" title="자동 모드 끄기">x</button>
    `;
    el.querySelector('.isy-auto-stop').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (autoIndicatorOnDisable) autoIndicatorOnDisable();
    });

    document.body.appendChild(el);
    autoIndicatorEl = el;
  }

  function updateAutoIndicator(text) {
    if (!autoIndicatorEl || !autoIndicatorEl.isConnected) return;
    const t = autoIndicatorEl.querySelector('.isy-auto-text');
    if (t) t.textContent = text;
  }

  function hideAutoIndicator() {
    if (autoIndicatorEl && autoIndicatorEl.isConnected) autoIndicatorEl.remove();
    autoIndicatorEl = null;
    autoIndicatorOnDisable = null;
  }

  window.ISY.ui = {
    showResultBadge,
    showTextBadge,
    removeAllTextBadges,
    showAutoIndicator,
    updateAutoIndicator,
    hideAutoIndicator,
    highlightElement
  };
})();
