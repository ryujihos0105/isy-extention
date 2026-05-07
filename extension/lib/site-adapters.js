// ============================================
// Site adapters
// Each adapter defines selectors that work well for a specific site family.
// ============================================

(function() {
  if (!window.ISY) {
    console.error('[ISY] namespace.js not loaded');
    return;
  }

  const naverArticleSelectors = [
    '#dic_area img',
    '#articeBody img',
    '#newsct_article img',
    '.end_photo_org img',
    '.article_body img',
    '.newsct_body img',
    'article img'
  ];

  const naverTextSelectors = [
    '#dic_area p',
    '#dic_area div',
    '#dic_area span',
    '#articeBody p',
    '#articeBody div',
    '#newsct_article p',
    '#newsct_article div',
    '.end_body_wrp p',
    '.end_body_wrp div',
    '.article_body p',
    '.article_body div',
    'article p'
  ];

  const naverSearchSelectors = [
    '.api_subject_bx img',
    '.total_wrap img',
    '.fds-news-item-list-tab img',
    '.news_wrap img',
    '.view_wrap img',
    '.thumb img',
    'a.link_thumb img'
  ];

  const naverSearchTextSelectors = [
    '.api_txt_lines',
    '.total_tit',
    '.news_tit',
    '.dsc_txt',
    '.sub_txt',
    '.title_link'
  ];

  const naverBlogSelectors = [
    '.se-image-resource',
    '.se-module-image img',
    '.post_ct img',
    '#postViewArea img',
    '.se-main-container img'
  ];

  const naverBlogTextSelectors = [
    '.se-text-paragraph',
    '#postViewArea p',
    '.post_ct p',
    '.se-main-container p'
  ];

  const naverBaseAdapter = {
    name: 'NAVER',
    imageSelectors: [
      'main img',
      '.main_pack img',
      '.news_area img',
      '.media_area img',
      '.thumb img',
      'article img',
      'section img'
    ],
    imageFallback: true,
    videoSelectors: ['video'],
    textSelectors: [
      'main p',
      'main div',
      'article p',
      'section p',
      '.news_area a',
      '.media_area a'
    ],
    excludeParents: ['header', 'footer', 'nav', '.gnb_area'],
    minSize: 120
  };

  const naverServiceNames = {
    'www.naver.com': 'NAVER',
    'm.naver.com': 'NAVER',
    'naver.com': 'NAVER',
    'search.naver.com': 'NAVER Search',
    'news.naver.com': 'NAVER News',
    'n.news.naver.com': 'NAVER News',
    'sports.news.naver.com': 'NAVER Sports',
    'entertain.naver.com': 'NAVER Entertainment',
    'blog.naver.com': 'NAVER Blog',
    'm.blog.naver.com': 'NAVER Blog',
    'cafe.naver.com': 'NAVER Cafe',
    'kin.naver.com': 'NAVER Knowledge iN',
    'shopping.naver.com': 'NAVER Shopping',
    'smartstore.naver.com': 'NAVER Smart Store',
    'store.naver.com': 'NAVER Place',
    'map.naver.com': 'NAVER Map',
    'm.place.naver.com': 'NAVER Place',
    'place.naver.com': 'NAVER Place',
    'post.naver.com': 'NAVER Post',
    'tv.naver.com': 'NAVER TV',
    'chzzk.naver.com': 'NAVER CHZZK',
    'comic.naver.com': 'NAVER Webtoon',
    'webtoon.naver.com': 'NAVER Webtoon',
    'series.naver.com': 'NAVER Series',
    'serieson.naver.com': 'NAVER Serieson',
    'finance.naver.com': 'NAVER Finance',
    'land.naver.com': 'NAVER Real Estate',
    'myplace.naver.com': 'NAVER MYPLACE',
    'weather.naver.com': 'NAVER Weather',
    'dict.naver.com': 'NAVER Dictionary',
    'papago.naver.com': 'NAVER Papago',
    'mail.naver.com': 'NAVER Mail',
    'calendar.naver.com': 'NAVER Calendar',
    'keep.naver.com': 'NAVER Keep',
    'memo.naver.com': 'NAVER Memo',
    'pay.naver.com': 'NAVER Pay',
    'booking.naver.com': 'NAVER Booking',
    'flight.naver.com': 'NAVER Flight',
    'hotel.naver.com': 'NAVER Hotel',
    'influencer.naver.com': 'NAVER Influencer',
    'premium.naver.com': 'NAVER Premium Contents',
    'game.naver.com': 'NAVER Game',
    'vibe.naver.com': 'NAVER VIBE',
    'audioclip.naver.com': 'NAVER AudioClip',
    'clova.naver.com': 'NAVER CLOVA',
    'works.naver.com': 'NAVER WORKS',
    'whale.naver.com': 'NAVER Whale'
  };

  const adapters = {
    'instagram.com': {
      name: 'Instagram',
      imageSelectors: [
        'article img[src*="cdninstagram"]',
        'article img[srcset]',
        'div[role="dialog"] img',
        'main a[href*="/reel/"] img',
        'main a[href*="/reels/"] img',
        'main a[href*="/p/"] img',
        'main a[href*="/explore/"] img',
        'main a[role="link"] img',
        'main div[role="button"] img',
        'main div[style*="transform"] img',
        'main img[srcset]',
        'main img[src*="cdninstagram"]'
      ],
      videoSelectors: ['article video', 'div[role="dialog"] video'],
      textSelectors: [
        'article h1',
        'article span[dir="auto"]',
        'div[role="dialog"] span[dir="auto"]'
      ],
      minSize: 200,
      thumbnailSelectors: [
        'a[href*="/reel/"] img',
        'a[href*="/reels/"] img',
        'a[href*="/p/"] img',
        'a[href*="/explore/"] img',
        'main a[role="link"] img',
        'main div[role="button"] img',
        'main div[style*="transform"] img'
      ],
      containerFinder: target =>
        target.closest('article') || target.parentElement || document.body
    },

    'x.com': {
      name: 'X (Twitter)',
      imageSelectors: [
        'article img[src*="pbs.twimg.com/media"]',
        'div[data-testid="tweetPhoto"] img'
      ],
      videoSelectors: ['article video', 'div[data-testid="videoPlayer"] video'],
      textSelectors: ['article [data-testid="tweetText"]'],
      minSize: 150
    },

    'youtube.com': {
      name: 'YouTube',
      minSize: 100,
      getPageType: () => {
        if (location.pathname.startsWith('/shorts/')) return 'shorts';
        if (location.pathname.startsWith('/watch')) return 'watch';
        return 'home';
      },
      pages: {
        home: {
          imageSelectors: [
            'ytd-thumbnail img[src*="ytimg.com"]',
            'ytd-rich-item-renderer img[src*="ytimg.com"]',
            'ytd-video-renderer img[src*="ytimg.com"]',
            'ytd-compact-video-renderer img[src*="ytimg.com"]',
            'ytd-grid-video-renderer img[src*="ytimg.com"]',
            'ytd-reel-item-renderer img[src*="ytimg.com"]',
            'ytd-search-pyv-renderer img[src*="ytimg.com"]',
            'ytd-playlist-renderer img[src*="ytimg.com"]'
          ],
          videoSelectors: [],
          textSelectors: []
        },
        watch: {
          imageSelectors: [],
          videoSelectors: ['video.html5-main-video'],
          textSelectors: [
            '#title h1',
            '#description ytd-text-inline-expander',
            'ytd-comment-renderer #content-text'
          ]
        },
        shorts: {
          imageSelectors: [],
          videoSelectors: [
            'ytd-reel-video-renderer video',
            'ytd-shorts video',
            'video.html5-main-video'
          ],
          textSelectors: [
            'ytd-reel-video-renderer #reel-title',
            'ytd-reel-player-header-renderer h2',
            'ytd-comment-renderer #content-text'
          ]
        }
      },
      containerFinder: target =>
        target.closest('ytd-thumbnail, ytd-reel-video-renderer') || target.parentElement || document.body
    },

    'news.naver.com': {
      name: 'NAVER News',
      imageSelectors: naverArticleSelectors,
      videoSelectors: ['#dic_area video', '#newsct_article video', '.article_body video'],
      textSelectors: naverTextSelectors,
      minSize: 180
    },

    'n.news.naver.com': {
      name: 'NAVER News',
      imageSelectors: naverArticleSelectors,
      videoSelectors: ['#dic_area video', '#newsct_article video', '.article_body video'],
      textSelectors: naverTextSelectors,
      minSize: 180
    },

    'sports.news.naver.com': {
      name: 'NAVER Sports',
      imageSelectors: naverArticleSelectors,
      videoSelectors: ['video', '.article_body video'],
      textSelectors: naverTextSelectors,
      minSize: 180
    },

    'entertain.naver.com': {
      name: 'NAVER Entertainment',
      imageSelectors: naverArticleSelectors,
      videoSelectors: ['video', '.article_body video'],
      textSelectors: naverTextSelectors,
      minSize: 180
    },

    'blog.naver.com': {
      name: 'NAVER Blog',
      imageSelectors: naverBlogSelectors,
      videoSelectors: ['.se-video-resource video', '#postViewArea video'],
      textSelectors: naverBlogTextSelectors,
      minSize: 180
    },

    'm.blog.naver.com': {
      name: 'NAVER Blog',
      imageSelectors: naverBlogSelectors,
      videoSelectors: ['.se-video-resource video', '#postViewArea video'],
      textSelectors: naverBlogTextSelectors,
      minSize: 180
    },

    'search.naver.com': {
      name: 'NAVER Search',
      imageSelectors: naverSearchSelectors,
      imageFallback: true,
      videoSelectors: ['video'],
      textSelectors: naverSearchTextSelectors,
      minSize: 120,
      excludeParents: ['header', 'footer', 'nav', '.ly_option', '.gnb_area']
    },

    'cafe.naver.com': {
      name: 'NAVER Cafe',
      imageSelectors: [
        '.se-image-resource',
        '.ArticleContentBox img',
        '#tbody img',
        '.article_viewer img'
      ],
      videoSelectors: ['video', '.se-video-resource video'],
      textSelectors: [
        '.se-text-paragraph',
        '.ArticleContentBox p',
        '#tbody p',
        '.article_viewer p'
      ],
      minSize: 160
    },

    'naver.com': naverBaseAdapter,

    'default': {
      name: 'General Web Page',
      imageSelectors: [
        'main img', 'article img',
        '[role="main"] img',
        '.content img', '#content img', '#main img',
        '.post img', '.entry-content img',
        '.article-body img', '.article img',
        '#article_body img', '#articletxt img',
        '.article_view img', '.story-news img',
        '.news_txt img', '.detail-body img', '.text_area img',
        'figure img'
      ],
      imageFallback: true,
      videoSelectors: [
        'main video', 'article video', '[role="main"] video',
        '#article_body video', '.article_view video', 'figure video',
        'video'
      ],
      textSelectors: [
        'article p', 'article div', 'article span',
        'main p', 'main div',
        '[role="main"] p', '[role="main"] div',
        '.content p', '.content div',
        '#content p', '#content div',
        '.post-content p', '.post-content div',
        '.entry-content p', '.entry-content div',
        '.article-body p', '.article-body div',
        '.article-content p', '.article-content div',
        '#article_body p', '#articletxt p',
        '.article_view p', '.story-news p',
        '.news_txt p', '.detail-body p', '.text_area p'
      ],
      excludeParents: [
        'nav', 'header', 'footer', 'aside',
        '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
      ],
      minSize: window.ISY.CONSTANTS.MIN_IMAGE_SIZE
    }
  };

  adapters['twitter.com'] = adapters['x.com'];
  adapters['www.naver.com'] = adapters['naver.com'];
  adapters['m.naver.com'] = adapters['naver.com'];

  function normalizeHostname(hostname) {
    return hostname.replace(/^www\./, '');
  }

  function createNaverAdapter(hostname) {
    const serviceName = naverServiceNames[hostname] || naverServiceNames[normalizeHostname(hostname)] || 'NAVER Service';
    return Object.assign({}, naverBaseAdapter, { name: serviceName });
  }

  function isNaverHost(hostname) {
    return hostname === 'naver.com' || hostname.endsWith('.naver.com');
  }

  window.ISY.adapters = adapters;
  window.ISY.naverServiceNames = naverServiceNames;

  window.ISY.getCurrentAdapter = function() {
    const hostname = normalizeHostname(window.location.hostname);
    if (adapters[hostname]) return adapters[hostname];

    if (isNaverHost(hostname)) {
      return createNaverAdapter(hostname);
    }

    for (const key of Object.keys(adapters)) {
      if (key !== 'default' && hostname.endsWith(key)) {
        return adapters[key];
      }
    }
    return adapters.default;
  };

  window.ISY.getActiveSelectors = function(adapter) {
    if (adapter.pages && typeof adapter.getPageType === 'function') {
      const pageType = adapter.getPageType();
      const pageSelectors = adapter.pages[pageType] || adapter.pages.home || {};
      return Object.assign({}, adapter, pageSelectors);
    }
    return adapter;
  };

  window.ISY.state.currentAdapter = window.ISY.getCurrentAdapter();
  console.log(`[ISY] Adapter: ${window.ISY.state.currentAdapter.name}`);
})();
