/* ====================================================================
   THE APIARIST — ui.js
   ALL rendering and DOM management. No game logic here.
   Depends on: data.js, encyclopedia.js, colony.js, simulation.js,
               economy.js, actions.js (all loaded before this file).
   game.js is loaded AFTER and provides Game, advanceWeek, etc.
   ==================================================================== */

/* ====================================================================
   HYPERSCRIPT HELPER
   ==================================================================== */

/**
 * h(tag, attrs, children)
 * A minimal hyperscript builder. Returns a DOM element.
 *   attrs: { class, id, text, html, style (string|object), title,
 *            data-*, onclick, oninput, onchange, onmouseenter, ... }
 *   children: string | Node | array (nested; null/false skipped)
 */
function h(tag, attrs, children) {
  var el = document.createElement(tag);
  attrs = attrs || {};

  for (var key in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
    var val = attrs[key];
    if (val === null || val === false || val === undefined) continue;

    if (key === 'text') {
      el.textContent = val;
    } else if (key === 'html') {
      el.innerHTML = val;
    } else if (key === 'class') {
      el.className = val;
    } else if (key === 'style' && typeof val === 'object') {
      for (var prop in val) {
        if (Object.prototype.hasOwnProperty.call(val, prop)) {
          if (prop.indexOf('--') === 0) el.style.setProperty(prop, val[prop]);
          else el.style[prop] = val[prop];
        }
      }
    } else if (key.indexOf('on') === 0 && typeof val === 'function') {
      el.addEventListener(key.slice(2), val);
    } else {
      el.setAttribute(key, val);
    }
  }

  if (children !== undefined && children !== null && children !== false) {
    _ui_appendChildren(el, children);
  }

  return el;
}

function _ui_appendChildren(el, children) {
  if (children === null || children === false || children === undefined) return;
  if (Array.isArray(children)) {
    for (var i = 0; i < children.length; i++) {
      _ui_appendChildren(el, children[i]);
    }
  } else if (children instanceof Node) {
    el.appendChild(children);
  } else {
    el.appendChild(document.createTextNode(String(children)));
  }
}

/* ====================================================================
   FORMATTING HELPERS
   ==================================================================== */

/**
 * fmtMoney(n) -> '£1,234' (rounded, thousands sep; negatives as -£n)
 */
function fmtMoney(n) {
  var rounded = Math.round(n);
  var neg = rounded < 0;
  var abs = Math.abs(rounded);
  var s = abs.toLocaleString('en-GB');
  return (neg ? '-' : '') + '£' + s;
}

/* ====================================================================
   GLOSSARY TOOLTIP (delegated, set up once)
   ==================================================================== */

var _ui_glossListenerAttached = false;

/**
 * gloss(term) -> HTML string wrapping term in a .gloss span.
 * The delegated tooltip listener is set up lazily.
 */
function gloss(term) {
  _ui_setupGlossListener();
  var escaped = String(term).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var display = String(term).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<span class="gloss" data-term="' + escaped + '">' + display + '</span>';
}

function _ui_setupGlossListener() {
  if (_ui_glossListenerAttached) return;
  _ui_glossListenerAttached = true;

  var tip = document.getElementById('tooltip');

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('gloss')) {
        var term = el.getAttribute('data-term');
        var defn = (typeof window.GLOSSARY !== 'undefined' && window.GLOSSARY)
          ? (window.GLOSSARY[term] || 'No definition found.')
          : 'No definition found.';
        if (tip) {
          tip.textContent = term + ': ' + defn;
          tip.hidden = false;
          tip.style.left = (e.clientX + 14) + 'px';
          tip.style.top = (e.clientY - 8) + 'px';
        }
        return;
      }
      el = el.parentElement;
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (tip && !tip.hidden) {
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY - 8) + 'px';
    }
  });

  document.addEventListener('mouseout', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('gloss')) {
        if (tip) tip.hidden = true;
        return;
      }
      el = el.parentElement;
    }
  });
}

/* ====================================================================
   MODAL SYSTEM
   ==================================================================== */

var _ui_currentOnClose = null;

/**
 * openModal({title, body, buttons, wide, xwide, onClose})
 * body: HTML string or DOM Node
 * buttons: [{label, cls, act}] — act is called, then modal closes (unless act prevents)
 */
function openModal(opts) {
  opts = opts || {};
  closeModal();

  _ui_currentOnClose = opts.onClose || null;

  var bodyNode;
  if (typeof opts.body === 'string') {
    bodyNode = h('div', { class: 'modal-body', html: opts.body });
  } else if (opts.body instanceof Node) {
    var wrapper = h('div', { class: 'modal-body' });
    wrapper.appendChild(opts.body);
    bodyNode = wrapper;
  } else {
    bodyNode = h('div', { class: 'modal-body' });
  }

  var footBtns = [];
  if (opts.buttons && opts.buttons.length) {
    footBtns = opts.buttons.map(function(b) {
      return h('button', {
        class: 'btn ' + (b.cls || ''),
        text: b.label,
        onclick: function() {
          if (b.act) b.act();
          else closeModal();
        }
      });
    });
  } else {
    footBtns = [h('button', { class: 'btn', text: 'Close', onclick: closeModal })];
  }

  var modalCls = 'modal';
  if (opts.xwide) modalCls += ' xwide';
  else if (opts.wide) modalCls += ' wide';

  var closeBtn = h('button', {
    class: 'x', title: 'Close', text: '×', onclick: closeModal
  });

  var modal = h('div', { class: modalCls }, [
    h('div', { class: 'modal-head' }, [
      h('h3', {}, opts.title || ''),
      closeBtn
    ]),
    bodyNode,
    h('div', { class: 'modal-foot' }, footBtns)
  ]);

  var overlay = h('div', { class: 'modal-overlay' }, modal);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeModal();
  });

  var root = document.getElementById('modal-root');
  root.appendChild(overlay);
}

function closeModal() {
  var root = document.getElementById('modal-root');
  if (!root) return;
  while (root.firstChild) root.removeChild(root.firstChild);
  if (_ui_currentOnClose) {
    var fn = _ui_currentOnClose;
    _ui_currentOnClose = null;
    fn();
  } else {
    _ui_currentOnClose = null;
  }
}

/* ====================================================================
   TOAST NOTIFICATIONS
   ==================================================================== */

var _ui_toastStack = null;

function _ui_ensureToastStack() {
  if (_ui_toastStack && document.body.contains(_ui_toastStack)) return _ui_toastStack;
  _ui_toastStack = h('div', { class: 'toast-stack' });
  document.body.appendChild(_ui_toastStack);
  return _ui_toastStack;
}

/**
 * toast(text, tone) — tone: 'good'|'bad'|'plain'
 */
function toast(text, tone) {
  var stack = _ui_ensureToastStack();
  var cls = 'toast' + (tone && tone !== 'plain' ? ' ' + tone : '');
  var el = h('div', { class: cls, text: text });
  stack.appendChild(el);
  while (stack.children.length > 4) stack.removeChild(stack.firstChild);
  setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3100);
}

/* ====================================================================
   TEACHING EXPLAINERS
   ==================================================================== */

/**
 * showExplainer(id, title, body)
 * Shows a teaching modal once per id. body is HTML string.
 */
function showExplainer(id, title, body) {
  if (typeof Game === 'undefined' || !Game) return;
  if (!Game.flags) Game.flags = {};
  if (!Game.flags.seenExplainers) Game.flags.seenExplainers = {};
  if (Game.flags.seenExplainers[id]) return;
  Game.flags.seenExplainers[id] = true;

  var wrapper = h('div', { class: 'explainer' }, [
    h('div', { class: 'explainer-art' }, _ui_explainerIcon(id)),
    h('div', { class: 'explainer-body', html: body })
  ]);

  openModal({
    title: title,
    body: wrapper,
    buttons: [{ label: 'Got it', cls: 'btn-primary', act: closeModal }]
  });
}

function _ui_explainerIcon(id) {
  var icons = {
    swarm: '🐝', varroa: '🪲', harvest: '🍯', winter: '❄️', death: '🥀',
    disease: '🦠', queen: '👑', hornet: '🐝', inspection: '🔍', feed: '🍯'
  };
  var lid = String(id).toLowerCase();
  for (var k in icons) {
    if (lid.indexOf(k) !== -1) return icons[k];
  }
  return '🐝';
}

/* ====================================================================
   TITLE SCREEN
   ==================================================================== */

/**
 * renderTitleScreen()
 * Renders the new-game / continue screen into #app.
 */
function renderTitleScreen() {
  var app = document.getElementById('app');
  app.innerHTML = '';

  var chosenDiff = 'beekeeper';
  var nameInput;

  var diffCards = Object.keys(DIFFICULTY).map(function(key) {
    var d = DIFFICULTY[key];
    var card = h('div', {
      class: 'diff-pick' + (key === chosenDiff ? ' sel' : ''),
      onclick: function() {
        chosenDiff = key;
        var all = titleCard.querySelectorAll('.diff-pick');
        all.forEach(function(c) { c.classList.remove('sel'); });
        card.classList.add('sel');
      }
    }, [
      h('div', { class: 'di' }, d.icon),
      h('div', { class: 'dn' }, d.label),
      h('div', { class: 'dd' }, d.blurb)
    ]);
    return card;
  });

  var startBtn = h('button', {
    class: 'btn btn-primary btn-lg btn-block',
    style: { marginTop: '16px' },
    text: 'Start beekeeping',
    onclick: function() {
      var name = (nameInput.value || '').trim() || 'Beekeeper';
      if (typeof startNewGame === 'function') {
        startNewGame(name, chosenDiff);
      }
    }
  });

  var children = [
    h('div', { class: 'bee-crest' }, '🐝'),
    h('div', { class: 'game-name' }, 'The Apiarist'),
    h('div', { class: 'tagline' }, 'A beekeeping simulation for the curious and patient'),
    h('div', { class: 'field' }, [
      h('label', { text: 'Your name' }),
      (nameInput = h('input', { type: 'text', placeholder: 'e.g. Eleanor Holt', style: { width: '100%' } }))
    ]),
    h('div', { class: 'field' }, [
      h('label', { text: 'Difficulty' }),
      h('div', { class: 'diff-picks' }, diffCards)
    ]),
    startBtn
  ];

  if (typeof hasSave === 'function' && hasSave()) {
    var continueBtn = h('button', {
      class: 'btn btn-lg btn-block',
      style: { marginTop: '8px' },
      text: 'Continue saved game',
      onclick: function() {
        if (typeof loadGame === 'function') {
          loadGame();
          render();
        }
      }
    });
    children.push(continueBtn);
  }

  var titleCard = h('div', { class: 'title-card' }, children);
  var screen = h('div', { class: 'title-screen' }, titleCard);
  app.appendChild(screen);
}

/* ====================================================================
   MASTER RENDER
   ==================================================================== */

/**
 * render()
 * Master render. Checks game state, routes to title or game views.
 */
function render() {
  var app = document.getElementById('app');
  if (!app) return;

  if (typeof Game === 'undefined' || !Game || !Game.difficulty) {
    renderTitleScreen();
    return;
  }

  app.innerHTML = '';

  app.appendChild(_ui_buildTopbar());
  app.appendChild(_ui_buildNavbar());

  var stage = h('div', { class: 'stage' });
  var view = (Game.ui && Game.ui.view) || 'apiary';

  if (view === 'apiary')    stage.appendChild(_ui_buildApiaryView());
  else if (view === 'market')   stage.appendChild(_ui_buildMarketView());
  else if (view === 'handbook') stage.appendChild(_ui_buildHandbookView());
  else if (view === 'finances') stage.appendChild(_ui_buildFinancesView());
  else if (view === 'journal')  stage.appendChild(_ui_buildJournalView());

  app.appendChild(stage);
}

/* ====================================================================
   TOPBAR
   ==================================================================== */

function _ui_buildTopbar() {
  var w = (typeof weather === 'function') ? weather() : {};
  var wIcon = w.icon || '?';
  var season = (typeof seasonOfWeek === 'function') ? seasonOfWeek(Game.week) : '';
  var seasonLabel = SEASONS[season] || season;
  var dl = (typeof dateLabel === 'function') ? dateLabel(Game.week) : '';
  var yr = (typeof gameYear === 'function') ? gameYear() : '';
  var hc = (typeof hiveCount === 'function') ? hiveCount() : 0;
  var titleName = (typeof titleFor === 'function') ? titleFor(hc) : '';
  var xp = Game.skillXp || 0;
  var sl = (typeof skillLevel === 'function') ? skillLevel(xp) : 1;

  return h('div', { class: 'topbar' }, [
    h('div', { class: 'brand' }, [
      h('span', { class: 'bee' }, '🐝'),
      ' The Apiarist'
    ]),
    h('div', { class: 'topbar-clock' }, [
      h('span', { class: 'weather-ico' }, wIcon),
      h('div', { class: 'when' }, [
        h('b', { text: seasonLabel + ' -- ' + dl }),
        h('small', { text: 'Year ' + yr })
      ])
    ]),
    h('div', { class: 'topbar-spacer' }),
    h('div', { class: 'topbar-stat cash' }, [
      h('b', { text: fmtMoney(Game.cash) }),
      h('small', { text: 'Cash' })
    ]),
    h('div', { class: 'topbar-stat' }, [
      h('b', { text: titleName }),
      h('small', { text: 'Skill level ' + sl })
    ])
  ]);
}

/* ====================================================================
   NAVBAR
   ==================================================================== */

function _ui_buildNavbar() {
  var view = (Game.ui && Game.ui.view) || 'apiary';

  var badCount = (Game.advisor || []).filter(function(a) { return a.tone === 'bad'; }).length;

  var navItems = [
    { key: 'apiary',   label: 'Apiary',   ico: '🏡', pip: badCount > 0 ? badCount : 0 },
    { key: 'market',   label: 'Market',   ico: '🛒' },
    { key: 'handbook', label: 'Handbook', ico: '📗' },
    { key: 'finances', label: 'Finances', ico: '💰' },
    { key: 'journal',  label: 'Journal',  ico: '📜' }
  ];

  var btns = navItems.map(function(item) {
    var children = [
      h('span', { class: 'ico' }, item.ico),
      item.label
    ];
    if (item.pip) {
      children.push(h('span', { class: 'pip' }, String(item.pip)));
    }
    return h('button', {
      class: 'nav-btn' + (item.key === view ? ' active' : ''),
      onclick: function() {
        if (!Game.ui) Game.ui = {};
        Game.ui.view = item.key;
        render();
      }
    }, children);
  });

  return h('div', { class: 'navbar' }, btns);
}

/* ====================================================================
   APIARY VIEW
   ==================================================================== */

/* ====================================================================
   APIARY SCENE — an illustrated countryside backdrop behind the hives.
   Layered SVG: sky, sun, clouds, rolling hills, a treeline, foreground
   trees, and wildflower-dotted grass. Tinted and dressed by season.
   Cached per apiary + season so it does not flicker between weeks.
   ==================================================================== */
var _ui_sceneCache = {};
function _ui_apiaryScene(season, apiaryId) {
  var cacheKey = (apiaryId || 0) + '|' + season;
  if (_ui_sceneCache[cacheKey]) return _ui_sceneCache[cacheKey];

  var P = {
    spring: { sky1:'#a9cae0', sky2:'#dde7d6', hF:'#a6c389', hM:'#8bb062', hN:'#7ba353',
      g1:'#9cc066', g2:'#86ad55', can:'#6f9a42', can2:'#83ab53', trunk:'#7c5a34',
      sun:'#fbe7b4', bloom:true, flowers:['#f3d23e','#fbf3df','#e7b9d2'] },
    summer: { sky1:'#9ec6df', sky2:'#d9e7c8', hF:'#97b878', hM:'#7aa455', hN:'#6c9a48',
      g1:'#90b257', g2:'#7aa047', can:'#5f8c39', can2:'#719c47', trunk:'#6f5230',
      sun:'#fdedbf', bloom:false, flowers:['#f4d23c','#ffffff','#c79ad6'] },
    autumn: { sky1:'#bcc7c6', sky2:'#e8dcbb', hF:'#b3a774', hM:'#a58c54', hN:'#977f49',
      g1:'#b09a55', g2:'#99853f', can:'#c9842c', can2:'#dca23a', trunk:'#684827',
      sun:'#f3dca0', bloom:false, flowers:['#d98f3c','#caa248'] },
    winter: { sky1:'#c5d0d6', sky2:'#e9e9e3', hF:'#c6cfc6', hM:'#aeb7ad', hN:'#9aa597',
      g1:'#ccd3c6', g2:'#bcc3b4', can:'#bcc4b8', can2:'#ced4c9', trunk:'#5f4b37',
      sun:'#eef0ec', bloom:false, flowers:[] }
  };
  var c = P[season] || P.summer;
  var W = 1200, H = 620, hz = 205, bare = (season === 'winter');

  function tree(x, by, s) {
    var tw = 15 * s, th = 74 * s, o = '';
    o += '<rect x="' + (x - tw / 2).toFixed(1) + '" y="' + (by - th).toFixed(1) +
      '" width="' + tw.toFixed(1) + '" height="' + th.toFixed(1) + '" rx="' + (4 * s).toFixed(1) +
      '" fill="' + c.trunk + '"/>';
    if (bare) {
      o += '<g stroke="' + c.trunk + '" stroke-width="' + (4.5 * s).toFixed(1) +
        '" stroke-linecap="round" fill="none">';
      o += '<path d="M' + x + ' ' + (by - th + 20 * s).toFixed(0) + ' q ' + (-20 * s).toFixed(0) +
        ' ' + (-16 * s).toFixed(0) + ' ' + (-32 * s).toFixed(0) + ' ' + (-44 * s).toFixed(0) + '"/>';
      o += '<path d="M' + x + ' ' + (by - th + 10 * s).toFixed(0) + ' q ' + (20 * s).toFixed(0) +
        ' ' + (-18 * s).toFixed(0) + ' ' + (30 * s).toFixed(0) + ' ' + (-46 * s).toFixed(0) + '"/></g>';
    } else {
      var fy = by - th - 2 * s;
      o += '<circle cx="' + x + '" cy="' + fy.toFixed(1) + '" r="' + (48 * s).toFixed(1) + '" fill="' + c.can + '"/>';
      o += '<circle cx="' + (x - 32 * s).toFixed(1) + '" cy="' + (fy + 18 * s).toFixed(1) + '" r="' + (36 * s).toFixed(1) + '" fill="' + c.can2 + '"/>';
      o += '<circle cx="' + (x + 34 * s).toFixed(1) + '" cy="' + (fy + 14 * s).toFixed(1) + '" r="' + (38 * s).toFixed(1) + '" fill="' + c.can2 + '"/>';
      o += '<circle cx="' + (x + 6 * s).toFixed(1) + '" cy="' + (fy - 24 * s).toFixed(1) + '" r="' + (31 * s).toFixed(1) + '" fill="' + c.can + '"/>';
      if (c.bloom) {
        for (var bl = 0; bl < 9; bl++) {
          var a = Math.random() * 6.28, r = (18 + Math.random() * 36) * s;
          o += '<circle cx="' + (x + Math.cos(a) * r).toFixed(1) + '" cy="' + (fy + Math.sin(a) * r).toFixed(1) +
            '" r="' + (3.5 * s).toFixed(1) + '" fill="#fbe1ea"/>';
        }
      }
    }
    return o;
  }
  function cloud(x, y, s) {
    return '<g fill="#fcfcf7" opacity="0.95">' +
      '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (48 * s) + '" ry="' + (26 * s) + '"/>' +
      '<ellipse cx="' + (x - 36 * s) + '" cy="' + (y + 9 * s) + '" rx="' + (32 * s) + '" ry="' + (20 * s) + '"/>' +
      '<ellipse cx="' + (x + 38 * s) + '" cy="' + (y + 7 * s) + '" rx="' + (34 * s) + '" ry="' + (21 * s) + '"/></g>';
  }

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><linearGradient id="agSky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + c.sky1 + '"/><stop offset="1" stop-color="' + c.sky2 + '"/></linearGradient>' +
    '<linearGradient id="agGrass" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' + c.g1 + '"/><stop offset="1" stop-color="' + c.g2 + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#agSky)"/>';
  s += '<circle cx="985" cy="92" r="86" fill="' + c.sun + '" opacity="0.45"/>';
  s += '<circle cx="985" cy="92" r="48" fill="' + c.sun + '"/>';
  s += cloud(250, 96, 1.0) + cloud(610, 62, 0.78) + cloud(1070, 150, 0.66);
  s += '<path d="M0 ' + (hz - 30) + ' Q 300 ' + (hz - 95) + ' 620 ' + (hz - 44) + ' T 1200 ' + (hz - 58) + ' V ' + H + ' H 0 Z" fill="' + c.hF + '"/>';
  s += '<path d="M0 ' + (hz + 18) + ' Q 360 ' + (hz - 44) + ' 760 ' + (hz + 22) + ' T 1200 ' + (hz - 2) + ' V ' + H + ' H 0 Z" fill="' + c.hM + '"/>';
  for (var t = 0; t < 11; t++) s += tree(56 + t * 112, hz + 30, 0.32);
  s += '<path d="M0 ' + (hz + 96) + ' Q 440 ' + (hz + 54) + ' 880 ' + (hz + 96) + ' T 1200 ' + (hz + 80) + ' V ' + H + ' H 0 Z" fill="' + c.hN + '"/>';
  s += '<path d="M0 ' + (hz + 150) + ' Q 520 ' + (hz + 126) + ' 1200 ' + (hz + 156) + ' V ' + H + ' H 0 Z" fill="url(#agGrass)"/>';
  s += tree(116, hz + 200, 1.05) + tree(1108, hz + 220, 1.2) + tree(978, hz + 165, 0.72);
  if (c.flowers.length) {
    for (var f = 0; f < 54; f++) {
      var fx = (Math.random() * W).toFixed(0);
      var fy2 = (hz + 168 + Math.random() * (H - hz - 184)).toFixed(0);
      var col = c.flowers[Math.floor(Math.random() * c.flowers.length)];
      s += '<circle cx="' + fx + '" cy="' + fy2 + '" r="' + (1.6 + Math.random() * 2.3).toFixed(1) + '" fill="' + col + '" opacity="0.9"/>';
    }
  }
  s += '</svg>';
  _ui_sceneCache[cacheKey] = s;
  return s;
}

function _ui_buildApiaryView() {
  var apiaries = Game.apiaries || [];
  if (!Game.ui) Game.ui = {};
  var selId = Game.ui.selectedApiary;
  if (!selId && apiaries.length > 0) {
    selId = apiaries[0].id;
    Game.ui.selectedApiary = selId;
  }

  var apiary = null;
  for (var i = 0; i < apiaries.length; i++) {
    if (apiaries[i].id === selId) { apiary = apiaries[i]; break; }
  }

  var season = (typeof seasonOfWeek === 'function') ? seasonOfWeek(Game.week) : 'spring';
  var mo = (typeof monthOfWeek === 'function') ? monthOfWeek(Game.week) : 0;
  var forageNote = (FORAGE && FORAGE.sources) ? FORAGE.sources[mo] : '';

  var siteType = apiary ? apiary.siteType : '';
  var siteInfo = (siteType && SITE_TYPES) ? SITE_TYPES[siteType] : {};
  var siteLabel = siteInfo.label || siteType;
  var siteIcon = siteInfo.icon || '';

  // Apiary switcher
  var switcherBtns = [];
  if (apiaries.length > 1) {
    switcherBtns = apiaries.map(function(ap) {
      return h('button', {
        class: 'btn btn-sm' + (ap.id === selId ? ' btn-primary' : ''),
        onclick: function() {
          Game.ui.selectedApiary = ap.id;
          render();
        },
        text: ap.name
      });
    });
  }

  var apiaryHead = h('div', { class: 'apiary-head' }, [
    h('h2', { text: apiary ? apiary.name : 'No Apiary' }),
    siteType ? h('span', { class: 'site-tag' }, siteIcon + ' ' + siteLabel) : null,
    h('span', { class: 'forage-note' }, forageNote ? 'Forage: ' + forageNote : ''),
    switcherBtns.length ? h('div', { class: 'apiary-switch' }, switcherBtns) : null
  ]);

  // Hives
  var colonies = [];
  if (apiary && typeof coloniesIn === 'function') {
    colonies = coloniesIn(apiary.id);
  }

  var hiveNodes = colonies.map(function(col) {
    return _ui_buildHiveCard(col);
  });

  var addSlot = h('div', {
    class: 'add-hive-slot',
    onclick: function() {
      Game.ui.view = 'market';
      render();
    }
  }, [
    h('div', { class: 'plus' }, '+'),
    h('span', { text: 'Add a colony' })
  ]);

  hiveNodes.push(addSlot);

  var yardRow = h('div', { class: 'yard-row' }, hiveNodes);
  var scene = h('div', { class: 'yard-scene', html: _ui_apiaryScene(season, apiary ? apiary.id : 0) });
  var yard = h('div', { class: 'yard ' + (season || 'spring') }, [scene, yardRow]);

  var main = h('div', { class: 'apiary-main' }, [
    apiaryHead,
    yard
  ]);

  // Sidebar
  var sidebar = _ui_buildSidebar();

  return h('div', { class: 'apiary-view' }, [main, sidebar]);
}

/* Single hive card in the yard */
function _ui_buildHiveCard(colony) {
  var known = colony.known;
  var dotCls;
  if (!colony.alive) dotCls = 'dead';
  else if (!known) dotCls = 'unknown';
  else dotCls = known.status || 'unknown';

  var statusLine;
  if (!colony.alive) statusLine = colony.deadReason ? ('Lost — ' + colony.deadReason) : 'Colony lost';
  else if (!known) statusLine = 'Not yet inspected';
  else statusLine = (known.populationBand
    ? known.populationBand.charAt(0).toUpperCase() + known.populationBand.slice(1)
    : (known.note || 'Inspected'));

  var showBadge = known && ((known.queenCells && known.queenCells !== 'none') || known.disease);
  var badgeGlyph = '';
  if (known && known.queenCells && known.queenCells !== 'none') badgeGlyph = '⚠️';
  else if (known && known.disease) badgeGlyph = '🔴';

  // Box stack: supers on top, brood boxes below
  var boxes = [];
  var superCount = colony.supers || 0;
  for (var s = 0; s < superCount; s++) boxes.push(h('div', { class: 'hive-box super' }));
  var broodCount = colony.broodBoxes || 1;
  for (var b = 0; b < broodCount; b++) boxes.push(h('div', { class: 'hive-box brood' }));

  // Bees: count from colony size, scaled by how flyable the weather is.
  // Cold, wet or stormy weather keeps the foragers in, so very few show.
  // Foragers leave the entrance, climb and shrink into the distance;
  // returning bees grow as they approach. Each faces the way it flies.
  var beeNodes = [];
  if (colony.alive) {
    var pop = colony.population || 0;
    var sizeBee = pop < 3500 ? 0 : pop < 11000 ? 3 : pop < 22000 ? 5 : pop < 36000 ? 8 : 12;
    var fly = (typeof weather === 'function' && weather() && weather().fly != null) ? weather().fly : 0.6;
    var nBees = Math.round(sizeBee * fly);
    if (nBees === 0 && sizeBee > 0 && fly > 0.22) nBees = 1;
    for (var bi = 0; bi < nBees; bi++) {
      var out = Math.random() < 0.58;                  // most foragers are heading out
      var side = Math.random() < 0.5 ? -1 : 1;
      var dx = (side * (50 + Math.random() * 290)).toFixed(0);
      var dy = (-(95 + Math.random() * 255)).toFixed(0);
      var netX = out ? side : -side;                   // net direction of travel
      var face = netX >= 0 ? -1 : 1;                   // flip glyph to face its heading
      var tilt = ((Math.random() * 2 - 1) * 24).toFixed(0);
      var dur = ((out ? 3.4 : 3.0) + Math.random() * 3.6).toFixed(1);
      var del = (Math.random() * dur).toFixed(1);
      var bob = (0.30 + Math.random() * 0.32).toFixed(2);
      beeNodes.push(
        h('span', { class: 'bee', style: {
          left: (40 + Math.random() * 18) + '%',
          bottom: (20 + Math.random() * 18) + '%',
          '--dx': dx + 'px', '--dy': dy + 'px',
          animationName: out ? 'bee-out' : 'bee-in',
          animationDuration: dur + 's',
          animationDelay: '-' + del + 's'
        } }, h('span', { class: 'bee-face', style: { '--face': String(face), '--tilt': tilt + 'deg' } },
          h('span', { class: 'bee-glyph', style: { '--bob': bob + 's' } }, '🐝')))
      );
    }
  }

  return h('div', {
    class: 'hive' + (colony.alive ? '' : ' is-dead'),
    onclick: function() { openHiveDetail(colony); }
  }, [
    h('div', { class: 'hive-dot ' + dotCls }),
    showBadge ? h('div', { class: 'hive-badge' }, badgeGlyph) : null,
    h('div', { class: 'hive-bees' }, beeNodes),
    h('div', { class: 'hive-roof' }),
    h('div', { class: 'hive-stack' }, boxes),
    h('div', { class: 'hive-floor' }),
    h('div', { class: 'hive-stand' }),
    h('div', { class: 'hive-plaque' }, [
      h('div', { class: 'nm', text: colony.name }),
      h('div', { class: 'st', text: statusLine })
    ])
  ]);
}

/* ====================================================================
   SIDEBAR (time controls, mentor, advisor)
   ==================================================================== */

function _ui_buildSidebar() {
  var advisor = Game.advisor || [];

  /* The mentor speaks the single most pressing thing — drawn from the same
     advisor list, so the mentor and the notes below can never contradict. */
  var top = null;
  for (var i = 0; i < advisor.length; i++) { if (advisor[i].tone === 'bad') { top = advisor[i]; break; } }
  if (!top) { for (var j = 0; j < advisor.length; j++) { if (advisor[j].tone === 'warn') { top = advisor[j]; break; } } }

  var mentorText, mentorTone;
  if (top) {
    mentorText = top.text;
    mentorTone = top.tone;
  } else {
    var ml = (typeof mentorLine === 'function') ? mentorLine() : null;
    mentorText = ml || 'All looks well at the apiary. Enjoy a calm week — and keep half an eye on the season ahead.';
    mentorTone = 'ok';
  }

  var mentorBlock = h('div', { class: 'mentor tone-' + mentorTone }, [
    h('div', { class: 'mentor-face' }, '🧑‍🌾'),
    h('div', { class: 'mentor-bubble' }, [
      h('div', { class: 'mentor-who' }, 'Your mentor'),
      h('div', { class: 'mentor-text', text: mentorText })
    ])
  ]);

  /* The notes list shows everything else the advisor flagged */
  var notes = advisor.filter(function(a) { return a !== top; });
  var advisorItems;
  if (!notes.length) {
    advisorItems = [h('div', { class: 'advisor-empty' }, 'Nothing else to flag right now.')];
  } else {
    advisorItems = notes.map(function(item) {
      return h('div', { class: 'advisor-item ' + (item.tone || 'info') }, [
        h('span', { class: 'ico' }, item.icon || ''),
        h('span', { text: item.text })
      ]);
    });
  }

  var advanceBtn = h('button', {
    class: 'btn btn-primary',
    onclick: function() { if (typeof advanceWeek === 'function') advanceWeek(); }
  }, '+ Advance one week');

  var skipBtn = h('button', {
    class: 'btn',
    onclick: function() { _ui_advanceToEvent(); }
  }, 'Advance to next event');

  return h('div', { class: 'apiary-side' }, [
    h('div', { class: 'time-controls' }, [advanceBtn, skipBtn]),
    mentorBlock,
    h('div', { class: 'side-section' }, [
      h('div', { class: 'side-head', text: 'Adviser notes' }),
      h('div', { class: 'side-body' }, advisorItems)
    ])
  ]);
}

function _ui_advanceToEvent() {
  var MAX_WEEKS = 6;
  var count = 0;

  function step() {
    if (count >= MAX_WEEKS) return;
    if (typeof advanceWeek === 'function') advanceWeek();
    count++;
    // Check if advisor has bad or warn item now
    var adv = Game.advisor || [];
    var hasSignal = adv.some(function(a) { return a.tone === 'bad' || a.tone === 'warn'; });
    if (!hasSignal && count < MAX_WEEKS) {
      setTimeout(step, 60);
    }
  }

  step();
}

/* ====================================================================
   MARKET VIEW
   ==================================================================== */

function _ui_buildMarketView() {
  var tabs = [
    { key: 'bees',     label: 'Bees',     ico: '🐝' },
    { key: 'hives',    label: 'Hives',    ico: '🪵' },
    { key: 'tools',    label: 'Tools',    ico: '🔧' },
    { key: 'supplies', label: 'Supplies', ico: '🛍️' },
    { key: 'sell',     label: 'Sell',     ico: '🍯' },
    { key: 'apiaries', label: 'Apiaries', ico: '🌳' }
  ];
  var tabBtns = tabs.map(function(t) {
    return h('button', {
      class: 'market-tab' + (_ui_marketTab === t.key ? ' active' : ''),
      onclick: function() { _ui_marketTab = t.key; render(); }
    }, [ h('span', { class: 'ico' }, t.ico), t.label ]);
  });

  var content;
  if (_ui_marketTab === 'hives') {
    content = _ui_marketBuyTab('Hives and boxes', CATALOG.hives, 'hives');
  } else if (_ui_marketTab === 'tools') {
    content = _ui_marketBuyTab('Tools and equipment', CATALOG.tools, 'tools');
  } else if (_ui_marketTab === 'supplies') {
    content = _ui_marketSuppliesTab();
  } else if (_ui_marketTab === 'sell') {
    content = _ui_marketSellTab();
  } else if (_ui_marketTab === 'apiaries') {
    content = _ui_marketApiariesTab();
  } else {
    content = _ui_marketBuyTab('Bees and colonies',
      CATALOG.bees.filter(function(b) { return b.id !== 'matedqueen'; }), 'bees');
  }

  return h('div', { class: 'panel-view narrow' }, [
    h('div', { class: 'page-title' }, ['🛒 Market']),
    h('div', { class: 'page-sub' }, 'Buy bees and equipment, sell your produce, and set up apiaries.'),
    _ui_marketHelp(),
    h('div', { class: 'market-tabs' }, tabBtns),
    content
  ]);
}

/* Contextual guidance banner at the top of the market */
function _ui_marketHelp() {
  var noBees = (typeof aliveColonies === 'function') && aliveColonies().length === 0;
  if (noBees) {
    return h('div', { class: 'market-help', html:
      '<b>New to this? Start here.</b> On the <b>Bees</b> tab, buy a <b>Nucleus colony</b>. ' +
      'A "nuc" is a small ready-made colony with a laying queen — the gentlest way to begin. ' +
      'You already have an empty hive for it to go into.' });
  }
  return h('div', { class: 'market-help soft', html:
    '<b>Tip.</b> Keep a spare hive in stock through spring, so you can carry out an ' +
    'artificial swarm the moment you find queen cells.' });
}

/* A buy tab: one card of clean shop rows, plus a summary of what you own */
function _ui_marketBuyTab(title, items, category) {
  var rows = (items || []).map(function(item) { return _ui_shopRow(item, category); });
  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, title),
      h('div', { class: 'shop-list' }, rows)
    ]),
    _ui_marketKitStrip()
  ]);
}

/* A single clean shop row with one clear Buy button */
function _ui_shopRow(item, category) {
  var owned = (category === 'tools' && Game.inventory && Game.inventory.tools &&
               !!Game.inventory.tools[item.id]);
  var action;
  if (owned) {
    action = h('span', { class: 'badge ok', text: 'Owned' });
  } else {
    action = h('button', {
      class: 'btn btn-primary shop-buy',
      onclick: function() {
        var r = buyFromCatalog(category, item.id, 1);
        toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) render();
      }
    }, [ 'Buy', h('span', { class: 'shop-price' }, fmtMoney(item.price)) ]);
  }
  return h('div', { class: 'shop-item' }, [
    h('div', { class: 'ico' }, item.icon),
    h('div', { class: 'meta' }, [
      h('b', { text: item.name }),
      h('p', { text: item.desc })
    ]),
    h('div', { class: 'shop-action' }, action)
  ]);
}

/* Compact reminder of what you have */
function _ui_marketKitStrip() {
  var inv = Game.inventory || {};
  var treatTotal = Object.keys(inv.treatStock || {}).reduce(function(s, k) {
    return s + (inv.treatStock[k] || 0);
  }, 0);
  var items = [
    ['Cash', fmtMoney(Game.cash)],
    ['Spare hives', String(inv.spareHives || 0)],
    ['Sugar', (inv.sugar || 0) + ' kg'],
    ['Empty jars', String(inv.emptyJars || 0)],
    ['Treatments', String(treatTotal)],
    ['Jars to sell', String(_ui_totalJars(inv.jars))]
  ];
  return h('div', { class: 'kit-strip' }, items.map(function(p) {
    return h('div', { class: 'kit-item' }, [
      h('b', { text: p[1] }),
      h('small', { text: p[0] })
    ]);
  }));
}

/* The Supplies tab — sugar, jars and varroa treatments held as stock */
function _ui_marketSuppliesTab() {
  var inv = Game.inventory || {};
  function buyRow(icon, name, desc, held, price, onBuy) {
    return h('div', { class: 'shop-item' }, [
      h('div', { class: 'ico' }, icon),
      h('div', { class: 'meta' }, [
        h('b', { text: name }),
        h('p', { text: desc }),
        h('span', { class: 'shop-held', text: 'In stock: ' + held })
      ]),
      h('div', { class: 'shop-action' }, h('button', {
        class: 'btn btn-primary shop-buy',
        onclick: function() {
          var r = onBuy();
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) render();
        }
      }, ['Buy', h('span', { class: 'shop-price' }, fmtMoney(price))]))
    ]);
  }

  var feedRows = (CATALOG.supplies || []).map(function(item) {
    var held = item.id === 'sugarbag' ? ((inv.sugar || 0) + ' kg of sugar')
             : item.id === 'jarpack' ? ((inv.emptyJars || 0) + ' empty jars')
             : '0';
    return buyRow(item.icon, item.name, item.desc, held, item.price,
      (function(id) { return function() { return buySupply(id, 1); }; })(item.id));
  });

  var treatRows = Object.keys(TREATMENTS).map(function(id) {
    var t = TREATMENTS[id];
    var n = (inv.treatStock || {})[id] || 0;
    var held = n + (n === 1 ? ' treatment' : ' treatments');
    return buyRow('💊', t.name, t.note, held, t.price,
      (function(tid) { return function() { return buySupply(tid, 1); }; })(id));
  });

  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, '🛍️ Feeding and bottling'),
      h('p', { style: { fontSize: '13px', color: 'var(--ink-soft)', margin: '0 0 8px' },
        text: 'Buy sugar for syrup and jars for your honey. Feeding and bottling draw on this stock.' }),
      h('div', { class: 'shop-list' }, feedRows)
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, '💊 Varroa treatments'),
      h('p', { style: { fontSize: '13px', color: 'var(--ink-soft)', margin: '0 0 8px' },
        text: 'Keep a treatment in stock so you can act the moment the honey crop is off.' }),
      h('div', { class: 'shop-list' }, treatRows)
    ]),
    _ui_marketKitStrip()
  ]);
}

/* The Apiaries tab — your sites, and a panel to establish a new one */
function _ui_marketApiariesTab() {
  var list = (Game.apiaries || []).map(function(ap) {
    var site = SITE_TYPES[ap.siteType] || {};
    var count = (typeof coloniesIn === 'function')
      ? coloniesIn(ap.id).filter(function(c) { return c.alive; }).length : 0;
    return h('div', { class: 'apiary-line' }, [
      h('div', { class: 'ico' }, site.icon || '🌳'),
      h('div', { class: 'meta' }, [
        h('b', { text: ap.name }),
        h('p', { text: (site.label || ap.siteType) + ' — ' +
          count + ' colon' + (count === 1 ? 'y' : 'ies') })
      ])
    ]);
  });

  var siteKeys = Object.keys(SITE_TYPES);
  var selSite = siteKeys[0];
  var picker = h('select', { class: 'book-search', style: { marginBottom: '6px' } },
    siteKeys.map(function(key) {
      return h('option', { value: key }, SITE_TYPES[key].icon + '  ' + SITE_TYPES[key].label);
    }));
  var siteNote = h('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 10px' },
    text: SITE_TYPES[selSite] ? SITE_TYPES[selSite].blurb : '' });
  picker.addEventListener('change', function() {
    selSite = picker.value;
    siteNote.textContent = SITE_TYPES[selSite] ? SITE_TYPES[selSite].blurb : '';
  });
  var cost = (typeof COSTS !== 'undefined' && COSTS) ? COSTS.newApiary : 95;

  return h('div', {}, [
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, '🌳 Your apiaries'),
      list.length ? h('div', {}, list)
        : h('p', { class: 'muted', style: { fontSize: '13px' }, text: 'No apiaries yet.' })
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, 'Establish a new apiary'),
      h('p', { style: { fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '8px' },
        text: 'A second site spreads your forage and your risk. Pick a site type to read about it.' }),
      picker,
      siteNote,
      h('button', {
        class: 'btn btn-primary',
        onclick: function() {
          var r = establishApiary(selSite);
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) render();
        }
      }, [ 'Establish here', h('span', { class: 'shop-price' }, fmtMoney(cost)) ])
    ])
  ]);
}

/* The Sell tab — honey jars, wax, and surplus colonies */
function _ui_marketSellTab() {
  var inv = Game.inventory || {};
  var jars = inv.jars || {};
  var cards = [];

  var unlocked = Object.keys(SALES).filter(function(ch) {
    if (ch === 'gate') return true;
    return !!(Game.flags && Game.flags.salesChannels && Game.flags.salesChannels[ch]);
  });
  var best = unlocked.reduce(function(a, b) {
    return SALES[b].priceMul > SALES[a].priceMul ? b : a;
  }, unlocked[0]);

  var jarRows = [];
  Object.keys(HONEY_TYPES).forEach(function(htId) {
    var count = jars[htId] || 0;
    if (count <= 0) return;
    var ht = HONEY_TYPES[htId];
    var ch = SALES[best];
    var price = (typeof marketPrice === 'function') ? marketPrice(htId, best) : ht.value;
    var batch = Math.min(count, ch.capacity);
    jarRows.push(h('div', { class: 'shop-item' }, [
      h('div', { class: 'ico' }, '🍯'),
      h('div', { class: 'meta' }, [
        h('b', { text: ht.name }),
        h('p', { text: count + ' jar' + (count !== 1 ? 's' : '') + ' in stock — ' +
          fmtMoney(price) + ' each via ' + ch.name })
      ]),
      h('div', { class: 'shop-action' }, h('button', {
        class: 'btn btn-leaf shop-buy',
        onclick: function() {
          var r = sellHoney(best, htId, batch);
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) render();
        }
      }, 'Sell ' + batch))
    ]));
  });
  if (!jarRows.length) {
    jarRows.push(h('p', { class: 'muted', style: { fontSize: '13px', fontStyle: 'italic' },
      text: 'No jars ready yet. Inspect a hive, use its Harvest action, then bottle the honey.' }));
  }
  cards.push(h('div', { class: 'card' }, [
    h('div', { class: 'card-title' }, '🍯 Sell honey'),
    h('div', { class: 'shop-list' }, jarRows)
  ]));

  var wax = inv.wax || 0;
  if (wax >= 0.3) {
    cards.push(h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, '🕯️ Sell wax'),
      h('div', { class: 'shop-item' }, [
        h('div', { class: 'ico' }, '🕯️'),
        h('div', { class: 'meta' }, [
          h('b', { text: 'Rendered beeswax' }),
          h('p', { text: (Math.round(wax * 10) / 10) + ' kg in stock' })
        ]),
        h('div', { class: 'shop-action' }, h('button', {
          class: 'btn btn-leaf shop-buy',
          onclick: function() { var r = renderWax(); toast(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) render(); }
        }, 'Sell wax'))
      ])
    ]));
  }

  var alive = (typeof aliveColonies === 'function') ? aliveColonies() : [];
  if (alive.length) {
    var colRows = alive.map(function(col) {
      var val = (typeof colonyValue === 'function') ? colonyValue(col) : 0;
      return h('div', { class: 'shop-item' }, [
        h('div', { class: 'ico' }, '🐝'),
        h('div', { class: 'meta' }, [
          h('b', { text: col.name }),
          h('p', { text: 'A buyer would pay around ' + fmtMoney(val) + ' for this colony.' })
        ]),
        h('div', { class: 'shop-action' }, h('button', {
          class: 'btn shop-buy',
          onclick: function() { var r = sellColony(col, false); toast(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) render(); }
        }, 'Sell colony'))
      ]);
    });
    cards.push(h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, '🐝 Sell colonies'),
      h('div', { class: 'shop-list' }, colRows)
    ]));
  }

  return h('div', {}, cards);
}

var _ui_marketTab = 'bees';

function _ui_totalHoney(obj) {
  if (!obj) return 0;
  return Math.round(Object.keys(obj).reduce(function(s, k) { return s + (obj[k] || 0); }, 0) * 10) / 10;
}

function _ui_totalJars(obj) {
  if (!obj) return 0;
  return Object.keys(obj).reduce(function(s, k) { return s + (obj[k] || 0); }, 0);
}

/* ====================================================================
   HANDBOOK VIEW
   ==================================================================== */

var _ui_handbookSelected = null;
var _ui_handbookSearch = '';
var _ui_handbookGlossary = false;

function _ui_buildHandbookView() {
  var enc = (typeof window.ENCYCLOPEDIA !== 'undefined') ? window.ENCYCLOPEDIA : {};
  var gloss = (typeof window.GLOSSARY !== 'undefined') ? window.GLOSSARY : {};

  // Group articles by category
  var byCategory = {};
  var all = [];
  Object.keys(enc).forEach(function(id) {
    var art = enc[id];
    art._id = id;
    all.push(art);
    var cat = art.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(art);
  });

  var search = _ui_handbookSearch.toLowerCase();
  var filtered = search ? all.filter(function(a) {
    return (a.title || '').toLowerCase().indexOf(search) !== -1 ||
           (a.body || '').toLowerCase().indexOf(search) !== -1;
  }) : null;

  // TOC
  var tocItems = [];

  var searchBox = h('input', {
    type: 'text',
    class: 'book-search',
    placeholder: 'Search...',
    value: _ui_handbookSearch,
    oninput: function() {
      _ui_handbookSearch = searchBox.value;
      _ui_handbookSelected = null;
      _ui_handbookGlossary = false;
      render();
    }
  });
  tocItems.push(searchBox);

  if (filtered) {
    filtered.forEach(function(art) {
      tocItems.push(h('div', {
        class: 'book-link' + (_ui_handbookSelected === art._id && !_ui_handbookGlossary ? ' active' : ''),
        text: art.title || art._id,
        onclick: function() {
          _ui_handbookSelected = art._id;
          _ui_handbookGlossary = false;
          render();
        }
      }));
    });
  } else {
    Object.keys(byCategory).forEach(function(cat) {
      var catItems = byCategory[cat].map(function(art) {
        return h('div', {
          class: 'book-link' + (_ui_handbookSelected === art._id && !_ui_handbookGlossary ? ' active' : ''),
          text: art.title || art._id,
          onclick: function() {
            _ui_handbookSelected = art._id;
            _ui_handbookGlossary = false;
            render();
          }
        });
      });
      tocItems.push(h('div', { class: 'book-cat' }, [
        h('b', { text: cat }),
        catItems
      ]));
    });
  }

  tocItems.push(h('div', {
    class: 'book-link' + (_ui_handbookGlossary ? ' active' : ''),
    text: '📖 Glossary',
    onclick: function() {
      _ui_handbookGlossary = true;
      _ui_handbookSelected = null;
      render();
    }
  }));

  var toc = h('div', { class: 'book-toc' }, tocItems);

  // Article pane
  var articlePane;
  if (_ui_handbookGlossary) {
    articlePane = _ui_buildGlossaryPane(gloss);
  } else if (_ui_handbookSelected && enc[_ui_handbookSelected]) {
    articlePane = _ui_buildArticlePane(enc[_ui_handbookSelected]);
  } else {
    var firstArt = all[0];
    if (firstArt) {
      _ui_handbookSelected = firstArt._id;
      articlePane = _ui_buildArticlePane(firstArt);
    } else {
      articlePane = h('div', { class: 'book-article' }, [
        h('p', { text: 'The handbook is empty. Check back as the game develops.' })
      ]);
    }
  }

  var book = h('div', { class: 'book' }, [toc, articlePane]);
  return h('div', { class: 'panel-view', style: { padding: '16px' } }, book);
}

function _ui_buildArticlePane(art) {
  var body = art.body || '';
  var rendered = _ui_renderArticleBody(body);

  return h('div', { class: 'book-article' }, [
    h('h2', { text: art.title || '' }),
    h('div', { class: 'acat', text: art.category || '' }),
    rendered
  ]);
}

function _ui_renderArticleBody(text) {
  var container = h('div', {});
  var paragraphs = text.split(/\n\n+/);
  paragraphs.forEach(function(block) {
    block = block.trim();
    if (!block) return;

    // Heading
    if (block.indexOf('## ') === 0) {
      container.appendChild(h('h4', { text: block.slice(3).trim() }));
      return;
    }

    // List
    var lines = block.split('\n');
    var isListBlock = lines.every(function(l) { return l.trim() === '' || l.trim().indexOf('- ') === 0; });
    if (isListBlock) {
      var ul = h('ul', {});
      lines.forEach(function(l) {
        l = l.trim();
        if (l.indexOf('- ') === 0) {
          ul.appendChild(h('li', { text: l.slice(2) }));
        }
      });
      container.appendChild(ul);
      return;
    }

    container.appendChild(h('p', { text: block }));
  });
  return container;
}

function _ui_buildGlossaryPane(gloss) {
  var terms = Object.keys(gloss).sort();
  var items = terms.map(function(term) {
    return h('div', { class: 'stat-row' }, [
      h('span', { class: 'lbl', style: { fontWeight: '700', minWidth: '160px' }, text: term }),
      h('span', { text: gloss[term] || '' })
    ]);
  });

  if (items.length === 0) {
    items = [h('p', { text: 'No glossary entries found.', style: { color: 'var(--ink-faint)' } })];
  }

  return h('div', { class: 'book-article' }, [
    h('h2', { text: 'Glossary' }),
    h('div', { class: 'acat', text: 'Reference' }),
    h('div', {}, items)
  ]);
}

/* ====================================================================
   FINANCES VIEW
   ==================================================================== */

function _ui_buildFinancesView() {
  var ledger = (Game.ledger || []).slice().reverse();
  var stats = Game.stats || {};

  var ledgerRows = ledger.map(function(entry) {
    var isPos = entry.amount > 0;
    return h('tr', {}, [
      h('td', { text: (typeof dateLabel === 'function') ? dateLabel(entry.week) : ('Wk ' + entry.week) }),
      h('td', { text: entry.desc || '' }),
      h('td', { class: 'amt ' + (isPos ? 'pos' : 'neg'), text: fmtMoney(entry.amount) })
    ]);
  });

  var statTiles = [
    { label: 'Honey harvested', val: (Math.round((stats.honeyHarvested || 0) * 10) / 10) + ' kg' },
    { label: 'Colonies lost', val: String(stats.coloniesLost || 0) },
    { label: 'Swarms lost', val: String(stats.swarmsLost || 0) },
    { label: 'Swarms caught', val: String(stats.swarmsCaught || 0) },
    { label: 'Winters survived', val: String(stats.wintersSurvived || 0) },
    { label: 'Splits made', val: String(stats.splitsMade || 0) },
    { label: 'Queens reared', val: String(stats.queensReared || 0) },
    { label: 'Jars sold', val: String(stats.jarsSold || 0) }
  ].map(function(s) {
    return h('div', { class: 'stat-tile' }, [
      h('b', { text: s.val }),
      h('small', { text: s.label })
    ]);
  });

  return h('div', { class: 'panel-view narrow' }, [
    h('div', { class: 'page-title' }, ['💰 Finances']),
    h('div', { class: 'page-sub' }, 'A full record of money in and out.'),
    h('div', { class: 'card', style: { marginBottom: '16px' } }, [
      h('div', { class: 'card-title' }, 'Current balance'),
      h('div', { style: { fontSize: '32px', fontFamily: 'var(--serif)', color: 'var(--honey-dk)', fontWeight: '700' },
                  text: fmtMoney(Game.cash) })
    ]),
    h('div', { class: 'card', style: { marginBottom: '16px' } }, [
      h('div', { class: 'card-title' }, 'Statistics'),
      h('div', { class: 'stat-tiles' }, statTiles)
    ]),
    h('div', { class: 'card' }, [
      h('div', { class: 'card-title' }, 'Ledger'),
      h('table', { class: 'ledger-table' }, [
        h('thead', {}, [
          h('tr', {}, [
            h('th', { text: 'Date' }),
            h('th', { text: 'Description' }),
            h('th', { text: 'Amount' })
          ])
        ]),
        h('tbody', {}, ledgerRows.length ? ledgerRows : [
          h('tr', {}, [h('td', { colspan: '3', text: 'No transactions yet.', style: { color: 'var(--ink-faint)', fontStyle: 'italic' } })])
        ])
      ])
    ])
  ]);
}

/* ====================================================================
   JOURNAL VIEW
   ==================================================================== */

function _ui_buildJournalView() {
  var log = (Game.log || []).slice();
  // newest first
  var entries = log.map(function(entry) {
    return h('div', { class: 'log-entry ' + (entry.tone || 'plain') }, [
      h('span', { class: 'when', text: (typeof dateLabel === 'function') ? dateLabel(entry.week) : ('Wk ' + entry.week) }),
      h('span', { class: 'ico' }, entry.icon || ''),
      h('span', { class: 'txt', text: entry.text || '' })
    ]);
  });

  if (entries.length === 0) {
    entries = [h('div', { class: 'empty-state' }, [
      h('div', { class: 'big' }, '📜'),
      h('p', { text: 'Your journal is empty. Events and notes will appear here as you play.' })
    ])];
  }

  return h('div', { class: 'panel-view narrow' }, [
    h('div', { class: 'page-title' }, ['📜 Journal']),
    h('div', { class: 'page-sub' }, 'A record of everything that has happened at your apiary.'),
    h('div', { class: 'card' }, entries)
  ]);
}

/* ====================================================================
   HIVE DETAIL MODAL
   ==================================================================== */

/**
 * openHiveDetail(colony)
 * Opens a modal showing the colony's last-known state and action buttons.
 */
function openHiveDetail(colony) {
  var known = colony.known;
  var weeksAgo = 0;
  if (known && typeof Game !== 'undefined' && Game) {
    weeksAgo = Game.week - known.week;
  }

  var crossSection = _ui_buildHiveCross(colony);

  var infoNode = h('div', { class: 'hive-info' }, []);

  if (!known) {
    infoNode.appendChild(h('div', { class: 'colony-known-note', text: 'This colony has not been inspected yet. You know nothing of its interior state.' }));
  } else {
    if (weeksAgo >= 3) {
      infoNode.appendChild(h('div', { class: 'colony-known-note' },
        'Last inspected ' + weeksAgo + ' weeks ago. The colony may have changed considerably since then.'));
    }
    infoNode.appendChild(_ui_buildKnownSummary(known));
  }

  infoNode.appendChild(h('div', { class: 'divider' }));
  infoNode.appendChild(h('div', { style: { fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--honey-dk)', marginBottom: '8px' } }, 'Actions'));
  infoNode.appendChild(_ui_buildActionButtons(colony));

  var bodyNode = h('div', { class: 'hive-detail' }, [crossSection, infoNode]);

  openModal({
    title: colony.name + (colony.alive ? '' : ' (Dead)'),
    body: bodyNode,
    wide: true,
    buttons: [{ label: 'Close', act: closeModal }]
  });
}

function _ui_buildHiveCross(colony) {
  var stack = h('div', { class: 'cross-stack' });

  var superCount = colony.supers || 0;
  for (var s = 0; s < superCount; s++) {
    (function(idx) {
      stack.appendChild(h('div', {
        class: 'cross-box super clickable',
        title: 'Super ' + (idx + 1) + ' -- harvest honey here'
      }, 'Super'));
    })(s);
  }

  if (colony.queenExcluder) {
    stack.appendChild(h('div', { class: 'cross-box excluder', title: 'Queen excluder' }));
  }

  var broodCount = colony.broodBoxes || 1;
  for (var b = 0; b < broodCount; b++) {
    stack.appendChild(h('div', {
      class: 'cross-box brood clickable',
      title: 'Brood box -- contains the nest'
    }, 'Brood'));
  }

  var queen = colony.queen;
  var queenLine = '';
  if (queen) {
    if (queen.present) {
      queenLine = 'Queen: ' + queen.state;
      if (queen.marked) queenLine += ' (marked ' + queen.marked + ')';
    } else {
      queenLine = 'Queen not present';
    }
  }

  var entranceLabel = {
    open: 'Open entrance',
    reduced: 'Reduced entrance',
    mouseguard: 'Mouse guard fitted'
  }[colony.entrance] || colony.entrance;

  return h('div', { class: 'hive-cross' }, [
    h('div', { style: { fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--honey-dk)', marginBottom: '8px' } }, 'Hive layout'),
    stack,
    queenLine ? h('div', { style: { fontSize: '12px', marginTop: '8px', color: 'var(--ink-soft)' }, text: queenLine }) : null,
    h('div', { style: { fontSize: '12px', marginTop: '4px', color: 'var(--ink-soft)' }, text: entranceLabel })
  ]);
}

/* The fog-of-war panel: every observed state value, explained and colour-coded
   green (good) / amber (watch) / red (act) so the player learns what each means. */
function _ui_buildKnownSummary(known) {
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '--'; }
  function row(label, value, tone, explain) {
    return h('div', { class: 'known-row' }, [
      h('div', { class: 'known-head' }, [
        h('span', { class: 'known-lbl', text: label }),
        h('span', { class: 'known-val ' + (tone || 'neutral'), text: value })
      ]),
      explain ? h('div', { class: 'known-explain', text: explain }) : null
    ]);
  }
  var rows = [];

  var st = known.status || 'ok';
  rows.push(row('Overall',
    st === 'bad' ? 'In trouble' : st === 'warn' ? 'Needs attention' : 'Looking healthy',
    st === 'bad' ? 'bad' : st === 'warn' ? 'warn' : 'good',
    st === 'bad' ? 'Something here needs dealing with now.'
      : st === 'warn' ? 'One or two things below are worth acting on soon.'
      : 'Nothing pressing — keep up the regular routine.'));

  var pb = known.populationBand || 'unknown';
  rows.push(row('Population', cap(pb),
    (pb === 'a handful' || pb === 'small') ? 'warn' : (pb === 'strong' || pb === 'huge') ? 'good' : 'neutral',
    pb === 'a handful' ? 'Very few bees — this colony is struggling to hold on.'
      : pb === 'small' ? 'A small colony — it needs to build up to be safe.'
      : pb === 'building' ? 'Growing as it should for the time of year.'
      : 'A strong workforce — good for the honey crop and for defence.'));

  var br = known.brood || 'none';
  rows.push(row('Brood pattern', cap(br),
    (br === 'none' || br === 'poor') ? 'bad' : br === 'patchy' ? 'warn' : 'good',
    (br === 'excellent' || br === 'good') ? 'A solid, even pattern — the mark of a good laying queen.'
      : br === 'patchy' ? 'Gaps in the pattern — a failing queen, or disease, can cause this.'
      : br === 'poor' ? 'Very little brood — the queen is failing or recently lost.'
      : 'No brood seen — the colony may well be queenless.'));

  var qv, qt, qe;
  if (known.queenSeen) { qv = 'Seen, laying'; qt = 'good'; qe = 'You found the queen herself — the surest confirmation.'; }
  else if (known.eggsSeen) { qv = 'Eggs present'; qt = 'good'; qe = 'Fresh eggs prove a queen was laying within the last three days.'; }
  else { qv = 'Not confirmed'; qt = 'warn'; qe = 'Neither the queen nor eggs were seen — look again in a few days.'; }
  rows.push(row('Queen', qv, qt, qe));

  var qc = known.queenCells || 'none';
  rows.push(row('Queen cells', qc === 'none' ? 'None' : cap(qc),
    qc === 'swarm' ? 'bad' : qc === 'none' ? 'good' : 'warn',
    qc === 'none' ? 'No swarm preparations under way.'
      : qc === 'swarm' ? 'The colony means to swarm — take swarm-control action now.'
      : qc === 'supersedure' ? 'The colony is quietly replacing its own queen — usually best left to it.'
      : 'Emergency cells — the colony lost its queen and is raising a new one.'));

  var sts = known.stores || 'unknown';
  rows.push(row('Stores', cap(sts),
    sts === 'critical' ? 'bad' : sts === 'low' ? 'warn' : 'good',
    sts === 'critical' ? 'Almost no food left — feed immediately or the colony will starve.'
      : sts === 'low' ? 'Running light — feed before it becomes critical.'
      : sts === 'heavy' ? 'Plenty of food, with perhaps a honey crop to take.'
      : 'Enough food in the hive for now.'));

  var vs = known.varroaSign || 'unchecked';
  rows.push(row('Varroa', cap(vs),
    (vs === 'high' || vs === 'severe') ? 'bad' : vs === 'moderate' ? 'warn'
      : vs === 'unchecked' ? 'neutral' : 'good',
    vs === 'unchecked' ? 'Not measured yet — use Monitor varroa to find the true level.'
      : (vs === 'none' || vs === 'low') ? 'Mite levels are low — keep monitoring through the season.'
      : vs === 'moderate' ? 'Mites are building up — plan a treatment.'
      : 'A heavy mite load — treat as soon as the honey crop is off.'));

  if (known.disease) {
    var dn = (typeof DISEASES !== 'undefined' && DISEASES[known.disease])
      ? DISEASES[known.disease].name : known.disease;
    rows.push(row('Disease', dn, 'bad', 'Signs of disease were seen — check the Handbook and act on it.'));
  } else {
    rows.push(row('Disease', 'None seen', 'good', 'No disease signs at the last inspection.'));
  }

  if (known.pests && known.pests.length) {
    rows.push(row('Pests', known.pests.join(', '), 'warn',
      'Pests are troubling the colony — the Handbook explains how to deal with each.'));
  }

  var tm = known.temper || 'calm';
  rows.push(row('Temperament', cap(tm),
    tm === 'defensive' ? 'warn' : 'neutral',
    tm === 'calm' ? 'An easy, gentle colony to work.'
      : tm === 'lively' ? 'A little lively, but manageable with calm handling and smoke.'
      : 'Very defensive — worth requeening with calmer stock.'));

  return h('div', {}, [
    h('div', { class: 'card-title', text: 'What you saw last inspection' }),
    h('div', { class: 'known-list' }, rows)
  ]);
}

function _ui_buildActionButtons(colony) {
  var dead = !colony.alive;

  function abtn(label, cls, key, disabled, reason) {
    var btn = h('button', {
      class: 'btn btn-sm ' + (cls || ''),
      text: label,
      title: disabled ? (reason || '') : '',
      onclick: function() {
        if (disabled) { toast(reason || 'Not available right now.', 'bad'); return; }
        _ui_actionDialog(key, colony);
      }
    });
    if (disabled) btn.disabled = true;
    return btn;
  }

  var inspectBtn = h('button', {
    class: 'btn btn-sm btn-primary',
    text: '🔍 Inspect the hive',
    onclick: function() {
      if (dead) { toast('This colony has died.', 'bad'); return; }
      closeModal();
      openInspection(colony);
    }
  });
  if (dead) inspectBtn.disabled = true;

  var core = h('div', { class: 'btn-row' }, [
    inspectBtn,
    abtn('Feed', '', 'feed', dead, 'This colony has died'),
    abtn('Treat varroa', '', 'treat', dead, 'This colony has died'),
    abtn('Monitor varroa', '', 'monitorVarroa', dead, 'This colony has died'),
    abtn('Add super', '', 'addSuper', dead || (colony.supers || 0) >= 5,
      dead ? 'This colony has died' : 'Plenty of supers on already'),
    abtn('Add brood box', '', 'addBroodBox', dead || colony.broodBoxes >= 2,
      dead ? 'This colony has died' : 'Already on double brood'),
    abtn('Entrance', '', 'entrance', dead, 'This colony has died'),
    abtn('Harvest honey', 'btn-leaf', 'harvest', dead || (colony.supers || 0) === 0,
      dead ? 'This colony has died' : 'No supers on the hive to harvest')
  ]);

  var swarm = h('div', { class: 'action-group' }, [
    h('div', { class: 'action-group-title' }, '🐝 Swarm control'),
    h('div', { class: 'btn-row' }, [
      abtn('Artificial swarm', '', 'artificialSwarm', dead, 'This colony has died'),
      abtn('Nucleus method', '', 'nucleusMethod', dead, 'This colony has died'),
      abtn('Split colony', '', 'split', dead, 'This colony has died'),
      abtn('Remove queen cells', '', 'removeQueenCells', dead, 'This colony has died'),
      abtn('Clip queen', '', 'clipQueen', dead || !(colony.queen && colony.queen.present),
        'No queen present to clip')
    ])
  ]);

  var queen = h('div', { class: 'action-group' }, [
    h('div', { class: 'action-group-title' }, '👑 Queen and colony'),
    h('div', { class: 'btn-row' }, [
      abtn('Requeen', '', 'requeen', dead, 'This colony has died'),
      abtn('Mark queen', '', 'markQueen',
        dead || !(colony.queen && colony.queen.present && !colony.queen.marked),
        'No unmarked queen to mark'),
      abtn('Unite colonies', '', 'unite',
        dead || (typeof aliveColonies === 'function' && aliveColonies().length < 2),
        'No other colony to unite with'),
      abtn('Sell colony', 'btn-danger', 'sellColony', dead, 'This colony has died')
    ])
  ]);

  return h('div', {}, [core, swarm, queen]);
}

/* ====================================================================
   ACTION EDUCATION DIALOG
   Every action opens a guided dialog: what it is, why and when it is
   done, what to watch for, plus this colony's current situation —
   then confirms. It teaches as you go, and re-reads as a reminder.
   ==================================================================== */

function _ui_actionDialog(key, colony) {
  var g = (window.ACTION_GUIDE || {})[key];
  if (!g) { var rc = _ui_actionControls(key, colony); if (rc.run) { var rr = rc.run(); if (rr && rr.msg) toast(rr.msg, rr.ok ? 'good' : 'bad'); render(); } return; }

  var body = h('div', { class: 'action-guide' });
  body.appendChild(h('div', { class: 'ag-art' }, g.icon || '•'));

  function sec(label, txt) {
    if (!txt) return;
    body.appendChild(h('div', { class: 'ag-sec' }, [
      h('div', { class: 'ag-label' }, label),
      h('div', { class: 'ag-text' }, txt)
    ]));
  }
  sec('What it is', g.what);
  sec('Why it matters', g.why);
  sec('When to do it', g.when);
  sec('Watch out', g.watch);

  var ctx = _ui_actionContext(key, colony);
  if (ctx) body.appendChild(h('div', { class: 'ag-context', html:
    '<b>' + colony.name + ' right now:</b> ' + ctx }));

  var cost = _ui_actionCost(key, colony);
  if (cost) {
    var cc = 'ag-cost', ct;
    if (cost.amount > 0) {
      ct = '<b>Cost: ' + fmtMoney(cost.amount) + '.</b> ' + cost.note;
      if (cost.amount > Game.cash) {
        cc += ' bad';
        ct += ' You only have ' + fmtMoney(Game.cash) + ', so you cannot afford this yet.';
      }
    } else {
      ct = cost.note;
      if (cost.blocked) cc += ' bad';
    }
    body.appendChild(h('div', { class: cc, html: ct }));
  }

  var controls = _ui_actionControls(key, colony);
  function back() { closeModal(); if (colony.alive) openHiveDetail(colony); }

  if (controls.options) {
    body.appendChild(h('div', { class: 'ag-label', style: { marginTop: '14px' } }, 'Your choice'));
    body.appendChild(h('div', { class: 'ag-options' }, controls.options));
    openModal({ title: g.title, body: body, wide: true,
      buttons: [{ label: 'Cancel', act: back }] });
  } else {
    var confirmLabel = controls.confirmLabel || 'Do it';
    if (cost && cost.amount > 0) confirmLabel += ' — ' + fmtMoney(cost.amount);
    openModal({ title: g.title, body: body, wide: true, buttons: [
      { label: 'Cancel', act: back },
      { label: confirmLabel, cls: 'btn-primary', act: function() {
        var r = controls.run();
        if (r && r.msg) toast(r.msg, r.ok ? 'good' : 'bad');
        closeModal();
        render();
        if (colony.alive) openHiveDetail(colony);
      } }
    ] });
  }
}

/* What an action costs — money, or kit it consumes */
function _ui_actionCost(key, colony) {
  if (key === 'addSuper') {
    var amt = COSTS.superAdd + (colony.queenExcluder ? 0 : COSTS.queenExcluder);
    return { amount: amt, note: colony.queenExcluder
      ? 'A new super of frames for the bees to store honey in.'
      : 'A new super of frames, plus a queen excluder to fit beneath it.' };
  }
  if (key === 'addBroodBox') return { amount: COSTS.broodBoxAdd, note: 'A second brood box with a full set of frames.' };
  if (key === 'requeen') {
    var qp = (CATALOG.bees.filter(function(b) { return b.id === 'matedqueen'; })[0] || {}).price || 42;
    return { amount: qp, note: 'A mated queen of known stock, posted to you in a cage.' };
  }
  if (key === 'artificialSwarm') {
    var noHive = (Game.inventory.spareHives || 0) < 1;
    return { amount: 0, blocked: noHive,
      note: noHive ? 'This uses a spare hive, and you have none. Buy a complete hive from the Market first.'
                   : 'Free, but it uses one of your spare hives for the new colony.' };
  }
  if (key === 'nucleusMethod') {
    var noNuc = (Game.inventory.nucBoxes || 0) < 1;
    return { amount: 0, blocked: noNuc,
      note: noNuc ? 'This uses a nucleus box, and you have none. Buy one from the Market first.'
                  : 'Free, but it uses one of your nucleus boxes.' };
  }
  if (key === 'split') {
    var noKit = (Game.inventory.spareHives || 0) < 1 && (Game.inventory.nucBoxes || 0) < 1;
    return { amount: 0, blocked: noKit,
      note: noKit ? 'This needs a spare hive or nucleus box, and you have neither. Buy one from the Market first.'
                  : 'Free, but it uses a spare hive or nucleus box for the new colony.' };
  }
  if (key === 'feed') {
    var sg = (Game.inventory.sugar || 0);
    return { amount: 0, blocked: sg < 3,
      note: 'Feeding draws on your sugar stock — you hold <b>' + sg + ' kg</b>. ' +
        (sg < 3 ? 'That is low; buy more from the Market (the Supplies tab).'
                : 'Each option below shows how much sugar it uses.') };
  }
  if (key === 'treat') {
    var tsk = Game.inventory.treatStock || {};
    var tot = Object.keys(tsk).reduce(function(a, k) { return a + (tsk[k] || 0); }, 0);
    return { amount: 0, blocked: tot < 1,
      note: tot > 0 ? 'Treating uses one treatment from your stock — you hold <b>' + tot + '</b> in all.'
        : 'You have no treatments in stock. Buy one from the Market (the Supplies tab) first.' };
  }
  if (key === 'monitorVarroa') return { amount: 0, note: 'Free — it costs only a small sample of bees.' };
  if (key === 'harvest') return { amount: 0, note: 'Free to take the supers off. Extracting and bottling the honey costs a little later.' };
  if (key === 'markQueen' || key === 'clipQueen' || key === 'removeQueenCells' ||
      key === 'entrance' || key === 'unite') {
    return { amount: 0, note: 'Free — this costs only your time at the hive.' };
  }
  return null;
}

/* Option buttons (feed/treat/entrance) or a single confirmed action */
function _ui_actionControls(key, colony) {
  function opt(label, note, fn) {
    return h('button', { class: 'ag-option', onclick: function() {
      var r = fn();
      if (r && r.msg) toast(r.msg, r.ok ? 'good' : 'bad');
      closeModal();
      render();
      if (colony.alive) openHiveDetail(colony);
    } }, [
      h('span', { class: 'ag-option-label', text: label }),
      note ? h('span', { class: 'ag-option-note', text: note }) : null
    ]);
  }

  if (key === 'feed') {
    var sugarHeld = Game.inventory.sugar || 0;
    function feedOpt(label, note, sKg, kind) {
      var short = sugarHeld < sKg;
      return opt(label + ' — uses ' + sKg + ' kg of sugar',
        (short ? 'You hold only ' + sugarHeld + ' kg of sugar; buy more from the Market first. ' : '') + note,
        function() { return feedColony(colony, sKg, kind); });
    }
    return { options: [
      feedOpt('1:1 spring syrup', 'Thin syrup that stimulates the queen to lay. Best in spring.', 5, 'syrup1'),
      feedOpt('2:1 autumn syrup', 'Thick syrup the bees store as winter food. Best in autumn.', 10, 'syrup2'),
      feedOpt('Fondant', 'Solid feed for emergencies in the cold of winter.', 3, 'fondant')
    ] };
  }
  if (key === 'treat') {
    var stock = Game.inventory.treatStock || {};
    return { options: Object.keys(TREATMENTS).map(function(id) {
      var t = TREATMENTS[id];
      var have = stock[id] || 0;
      return opt(t.name + (have > 0 ? ' — ' + have + ' in stock' : ' — none in stock'),
        (have > 0 ? '' : 'You have none; buy this from the Market (Supplies tab) first. ') + t.note,
        function() { return treatColony(colony, id); });
    }) };
  }
  if (key === 'entrance') {
    return { options: [
      opt('Open entrance', 'Full width — for a strong colony in a good flow.',
        function() { return setEntrance(colony, 'open'); }),
      opt('Reduced entrance', 'A small gap the guard bees can defend against wasps.',
        function() { return setEntrance(colony, 'reduced'); }),
      opt('Mouse guard', 'Fitted for winter to keep mice out of the hive.',
        function() { return setEntrance(colony, 'mouseguard'); })
    ] };
  }

  var runners = {
    addSuper: function() { return addSuper(colony); },
    addBroodBox: function() { return addBroodBox(colony); },
    artificialSwarm: function() { return artificialSwarm(colony); },
    nucleusMethod: function() { return nucleusMethod(colony); },
    split: function() { return splitColony(colony); },
    removeQueenCells: function() { return removeQueenCells(colony); },
    clipQueen: function() { return clipQueen(colony); },
    requeen: function() { return requeen(colony, 'bought'); },
    markQueen: function() { return markQueen(colony); },
    monitorVarroa: function() { return monitorVarroa(colony, 'sugar'); },
    harvest: function() { return harvestColony(colony); },
    sellColony: function() { return sellColony(colony, false); },
    unite: function() {
      var others = aliveColonies().filter(function(c) { return c.id !== colony.id; })
        .sort(function(a, b) { return b.population - a.population; });
      if (!others.length) return { ok: false, msg: 'No other colony to unite with.' };
      return uniteColonies(colony, others[0]);
    }
  };
  var labels = {
    addSuper: 'Add the super', addBroodBox: 'Add the brood box',
    artificialSwarm: 'Carry out the artificial swarm', nucleusMethod: 'Make up the nucleus',
    split: 'Make the split', removeQueenCells: 'Knock the cells down',
    clipQueen: 'Clip the queen', requeen: 'Buy and introduce a new queen',
    markQueen: 'Mark the queen', monitorVarroa: 'Take a sugar-roll sample',
    harvest: 'Take the honey off', sellColony: 'Sell this colony',
    unite: 'Unite into the strongest colony'
  };
  return {
    run: runners[key] || function() { return { ok: false, msg: 'That action is not available.' }; },
    confirmLabel: labels[key] || 'Do it'
  };
}

/* A sentence about this colony's current situation, relevant to the action */
function _ui_actionContext(key, colony) {
  var k = colony.known;
  if (key === 'addSuper') {
    var cong = (typeof colonyCongestion === 'function') ? colonyCongestion(colony) : 0.5;
    if (cong > 0.72) return 'the hive is crowded and the bees badly need more room — a super is overdue.';
    if (cong > 0.46) return 'the hive is filling up; a super now keeps the bees ahead of the flow.';
    return 'there is still room inside, so a super is not urgent — but no harm if a flow is coming.';
  }
  if (key === 'feed') {
    if (k && k.stores === 'critical') return 'stores were critically low at the last inspection. Feed without delay.';
    if (k && k.stores === 'low') return 'stores looked low when you last checked. Worth feeding.';
    if (k && k.stores) return 'stores looked "' + k.stores + '" at the last inspection.';
    return 'you have not checked the stores here yet — inspect first if you are unsure.';
  }
  if (key === 'treat') {
    if ((colony.supers || 0) > 0) return 'there are supers on the hive — you must take the honey off before you treat.';
    if (k && (k.varroaSign === 'high' || k.varroaSign === 'severe')) return 'varroa looked "' + k.varroaSign + '" — treat without delay.';
    if (k && k.varroaSign === 'unchecked') return 'you have not monitored varroa here yet. A sugar roll first would tell you if it is needed.';
    if (k && k.varroaSign) return 'varroa looked "' + k.varroaSign + '" at the last check.';
    return 'late summer, once the crop is off, is the key treatment window.';
  }
  if (key === 'addBroodBox') {
    return colony.broodBoxes >= 2 ? 'this colony is already on double brood.'
      : 'this colony is on a single brood box.';
  }
  if (key === 'harvest') {
    if ((colony.supers || 0) === 0) return 'there are no supers on the hive to harvest.';
    return 'there ' + (colony.supers === 1 ? 'is 1 super' : 'are ' + colony.supers + ' supers') + ' on the hive.';
  }
  if (key === 'requeen') {
    if (colony.queen && colony.queen.state === 'dronelayer') return 'the queen has become a drone-layer — she must be replaced.';
    if (colony.queen && colony.queen.state === 'failing') return 'the queen is failing — replacing her would be wise.';
    if (!colony.queen || !colony.queen.present) return 'this colony currently has no queen.';
    return 'the colony has a laying queen; requeen only if she is poor, or to bring in fresh stock.';
  }
  if (key === 'entrance') {
    return 'the entrance is currently set to "' + (colony.entrance || 'open') + '".';
  }
  if (key === 'artificialSwarm' || key === 'nucleusMethod' || key === 'removeQueenCells') {
    if (k && k.queenCells === 'swarm') return 'swarm cells were seen at the last inspection — act now, before the colony leaves.';
    return 'no swarm cells have been seen yet. This is most useful once they appear.';
  }
  if (key === 'unite') {
    return 'this will merge ' + colony.name + ' into your strongest other colony; ' + colony.name + '\'s queen will be lost.';
  }
  return null;
}

/* ====================================================================
   INSPECTION MODAL
   ==================================================================== */

/**
 * openInspection(colony)
 * Runs the inspection, then shows the brood box with its frames. The player
 * lifts a frame out of the box to read its comb. Teaches with an intro and a
 * "what to do next" panel.
 */
function openInspection(colony) {
  var report;
  try {
    report = (typeof inspectColony === 'function')
      ? inspectColony(colony)
      : { ok: false, frames: [], findings: [], summary: [], lesson: null };
  } catch (e) {
    toast('Inspection failed: ' + e.message, 'bad');
    return;
  }

  var frames = report.frames || [];
  var selected = 0;
  var seen = {};        // frame index -> true once it has been lifted
  var answers = {};     // frame index -> { chosen, correct }
  seen[0] = true;

  /* The teaching Q&A runs only until the player has completed one full
     inspection — after that, lifting a frame just shows its reading. */
  var teaching = !(Game.flags && Game.flags.inspectionTaught);

  var modalBody = h('div', { class: 'inspect' });

  function build() {
    var host = modalBody.parentNode;          // .modal-body — preserve scroll
    var keepScroll = host ? host.scrollTop : 0;
    modalBody.innerHTML = '';

    var seenCount = 0;
    for (var s = 0; s < frames.length; s++) { if (seen[s]) seenCount++; }
    var done = seenCount >= frames.length;

    modalBody.appendChild(h('div', { class: 'inspect-intro', html:
      teaching
        ? ('Work through every frame in ' + colony.name + '\'s box. Lift each one, read the comb ' +
           'and answer what you are looking at — your full summary appears once you have been ' +
           'right through the box.')
        : ('Work through every frame in ' + colony.name + '\'s box. Lift each one and read the ' +
           'comb. Your summary appears once you have been right through them all.') }));

    modalBody.appendChild(h('div', { class: 'inspect-progress' + (done ? ' done' : '') },
      done
        ? 'All ' + frames.length + ' frames examined — inspection complete.'
        : 'Examined ' + seenCount + ' of ' + frames.length + ' frames.'));

    var boxFrames = frames.map(function(fr, idx) {
      var isSeen = !!seen[idx];
      var cls = 'box-frame' + (idx === selected ? ' lifted' : '') + (isSeen ? ' seen' : ' unseen');
      var bf = h('div', {
        class: cls,
        title: isSeen
          ? ('Frame ' + (idx + 1) + (fr.label ? ' — ' + fr.label : ''))
          : ('Frame ' + (idx + 1) + ' — not yet examined'),
        onclick: function() { selected = idx; seen[idx] = true; build(); }
      });
      /* a frame only reveals what it holds once you have lifted it out */
      if (isSeen) {
        _ui_fillThumb(bf, fr);
        if (fr.hasQueen) bf.appendChild(h('div', { class: 'box-frame-q', title: 'The queen' }));
        if ((fr.cells && fr.cells.qcell) > 0) {
          bf.appendChild(h('div', { class: 'box-frame-qc', title: 'Queen cells' }));
        }
      }
      bf.appendChild(h('div', { class: 'box-frame-n' }, String(idx + 1)));
      return bf;
    });

    modalBody.appendChild(h('div', { class: 'inspect-box' }, [
      h('div', { class: 'inspect-box-label' }, 'The open brood box — tap a frame to lift it out and read it'),
      h('div', { class: 'inspect-box-inner' }, boxFrames)
    ]));

    var fr = frames[selected] || { cells: {}, label: '', hasQueen: false };
    modalBody.appendChild(h('div', { class: 'inspect-detail' }, [
      _ui_buildComb(fr),
      h('div', { class: 'inspect-detail-read' }, [
        h('div', { class: 'card-title' }, 'Frame ' + (selected + 1) + (fr.label ? ' — ' + fr.label : '')),
        fr.hasQueen ? h('div', { class: 'find-result found' }, [
          h('span', { class: 'queen-mini' }), ' The queen is on this frame'
        ]) : null,
        _ui_buildCombLegend()
      ])
    ]));

    /* the teaching question for the frame in hand */
    modalBody.appendChild(_ui_buildFrameQA(fr, selected, colony, answers, build, teaching));

    /* findings and summary stay locked until every frame has been examined */
    if (!done) {
      modalBody.appendChild(h('div', { class: 'inspect-locked' }, [
        h('div', { class: 'lock-ico' }, '🔒'),
        h('div', {}, 'Examine all ' + frames.length + ' frames to finish the inspection. ' +
          'Your summary and next steps will appear once you have been through the whole box.')
      ]));
    } else {
      /* a first full inspection has done its teaching — drop the quiz next time */
      if (!Game.flags) Game.flags = {};
      Game.flags.inspectionTaught = true;
      modalBody.appendChild(h('div', { class: 'inspect-findings' }, [
        h('h4', {}, 'What you found'),
        (report.findings || []).map(function(f) {
          return h('div', { class: 'read-line' }, [
            h('span', { class: 'ico' }, f.icon || ''),
            h('span', { text: f.text || '' })
          ]);
        })
      ]));

      var asked = 0, correct = 0;
      for (var a in answers) { if (answers.hasOwnProperty(a)) { asked++; if (answers[a].correct) correct++; } }
      if (asked > 0) {
        modalBody.appendChild(h('div', { class: 'inspect-score' },
          'You read ' + correct + ' of ' + asked + ' frame' + (asked === 1 ? '' : 's') +
          ' correctly' + (correct === asked
            ? ' — a clean read of the colony.'
            : '. Look again at the ones you misjudged; that is how your eye sharpens.')));
      }

      var summaryNode = h('div', { class: 'inspect-summary' }, [
        h('h4', {}, 'The five questions'),
        h('ul', {}, (report.summary || []).map(function(s) {
          return h('li', { class: (/^Urgent:/.test(s) ? 'sum-urgent' : null), text: s });
        }))
      ]);
      if (report.lesson) {
        summaryNode.appendChild(h('div', { class: 'explain lesson', style: { marginTop: '10px' } }, [
          h('b', { text: 'To learn: ' }), report.lesson
        ]));
      }
      modalBody.appendChild(summaryNode);

      var advice = _ui_inspectionAdvice(colony, report);
      if (advice.length) {
        var recRows = advice.map(function(a2) {
          var kids = [
            h('span', { class: 'ico' }, a2.action ? '➡️' : '✓'),
            h('span', { class: 'rec-text', text: a2.text })
          ];
          if (a2.action) {
            kids.push(h('button', {
              class: 'btn btn-sm btn-primary', text: 'Do this',
              onclick: function() { closeModal(); render(); _ui_actionDialog(a2.action, colony); }
            }));
          }
          return h('div', { class: 'inspect-rec' }, kids);
        });
        modalBody.appendChild(h('div', { class: 'inspect-next' }, [
          h('h4', {}, 'What to do next'),
          h('div', {}, recRows)
        ]));
      }
    }

    if (host) host.scrollTop = keepScroll;
  }

  build();

  openModal({
    title: 'Inspecting ' + colony.name,
    body: modalBody,
    xwide: true,
    buttons: [{ label: 'Done', cls: 'btn-primary', act: function() { closeModal(); render(); } }]
  });
}

/* The teaching question for a single frame — what is the player looking at? */
function _ui_frameQuestion(frame, colony) {
  var c = frame.cells || {};

  /* A frame with queen cells — read where they sit and what they mean */
  if ((c.qcell || 0) > 0) {
    var qt = frame.queenCellType || 'swarm';
    var swarmFb = 'Swarm cells hang from the bottom bars of the comb. The colony has decided to ' +
      'split — the old queen will leave with half the bees. Carry out swarm control now, today.';
    var superFb = 'Supersedure cells sit on the face of the comb, usually just one or two. The ' +
      'colony is quietly replacing a queen it judges to be failing — it is best left to get on with it.';
    var emergFb = 'Emergency cells are worker cells re-drawn into queen cells on the face of the comb. ' +
      'The colony has suddenly lost its queen and is racing to raise one from a young larva.';
    var truth = qt === 'swarm' ? swarmFb : qt === 'supersedure' ? superFb : emergFb;
    return {
      question: 'There are queen cells on this frame. Reading where they sit, what kind are they?',
      options: [
        { label: 'Swarm cells — hanging from the bottom edge of the comb',
          correct: qt === 'swarm',
          feedback: qt === 'swarm' ? swarmFb
            : 'Look again — these are on the face of the comb, not the bottom bars. ' + truth },
        { label: 'Supersedure cells — a few, on the face of the comb',
          correct: qt === 'supersedure',
          feedback: qt === 'supersedure' ? superFb
            : 'Look again at where they sit. ' + truth },
        { label: 'Emergency cells — worker cells re-built into queen cells',
          correct: qt === 'emergency',
          feedback: qt === 'emergency' ? emergFb
            : 'Not these. ' + truth },
        { label: 'Nothing to worry about — just oversized drone cells',
          correct: false,
          feedback: 'These are queen cells, not drone brood. Drone cells are domed and bullet-shaped ' +
            'but sit flush in the comb; a queen cell is large and pitted and hangs like a peanut. ' + truth }
      ]
    };
  }

  /* An ordinary frame — what is it mostly? */
  var brood = (c.eggs || 0) + (c.larva || 0) + (c.capbrood || 0) + (c.dronebr || 0);
  var stores = (c.honey || 0) + (c.nectar || 0);
  var pollen = (c.pollen || 0);
  var empty = (c.empty || 0);
  var top = Math.max(brood, stores, pollen, empty);
  var kind = top === brood ? 'brood' : top === stores ? 'stores' : top === pollen ? 'pollen' : 'empty';

  var tell = {
    brood: 'A brood frame. Pearly grains standing up in the cell bottoms are eggs; glistening ' +
      'white curls are larvae; the domed, biscuit-brown caps are sealed brood about to emerge.',
    stores: 'A stores frame. Ripe honey is sealed under flat, pale, airtight cappings. Unripe ' +
      'nectar is open and wet, and glistens when you tilt the frame to the light.',
    pollen: 'A pollen frame. Pollen is packed into cells in dense, matt blocks — every shade ' +
      'from bright yellow to orange to grey-green, depending on which flowers are out.',
    empty: 'Empty drawn comb. Not wasted — it is room for the queen to lay into, or for the ' +
      'bees to fill when a honey flow comes on.'
  };
  var kindWord = { brood: 'brood', stores: 'honey and nectar', pollen: 'pollen', empty: 'empty comb' };
  function fb(picked) {
    return picked === kind ? tell[kind]
      : 'Not quite — this frame is mostly ' + kindWord[kind] + '. ' + tell[kind];
  }
  return {
    question: 'Look at the comb in your hands. What is this frame mostly?',
    options: [
      { label: 'Mostly brood — eggs, larvae and sealed cells', correct: kind === 'brood', feedback: fb('brood') },
      { label: 'Mostly honey and nectar', correct: kind === 'stores', feedback: fb('stores') },
      { label: 'Mostly pollen', correct: kind === 'pollen', feedback: fb('pollen') },
      { label: 'Mostly empty drawn comb', correct: kind === 'empty', feedback: fb('empty') }
    ]
  };
}

/* Render the question for the lifted frame, grade the answer, and teach. */
function _ui_buildFrameQA(frame, idx, colony, answers, rebuild, teaching) {
  var qa = _ui_frameQuestion(frame, colony);

  /* once the player has completed a full inspection, drop the quiz and
     just show the reading of the frame directly */
  if (!teaching) {
    var ans = null;
    for (var ci = 0; ci < qa.options.length; ci++) {
      if (qa.options[ci].correct) { ans = qa.options[ci]; break; }
    }
    return h('div', { class: 'frame-reading' }, [
      h('b', {}, 'What you are looking at: '),
      h('span', { text: ans ? ans.feedback : '' })
    ]);
  }

  var answered = answers[idx];
  var wrap = h('div', { class: 'qa-block' });
  wrap.appendChild(h('div', { class: 'qa-q' }, qa.question));

  var opts = h('div', { class: 'qa-options' });
  qa.options.forEach(function(opt, oi) {
    var cls = 'qa-option';
    if (answered) {
      if (oi === answered.chosen) cls += answered.correct ? ' chosen-correct' : ' chosen-wrong';
      else if (opt.correct) cls += ' is-answer';
      else cls += ' dim';
    } else {
      cls += ' live';
    }
    var btn = h('div', { class: cls }, opt.label);
    if (!answered) {
      btn.onclick = function() {
        answers[idx] = { chosen: oi, correct: !!opt.correct };
        rebuild();
      };
    }
    opts.appendChild(btn);
  });
  wrap.appendChild(opts);

  if (answered) {
    var chosen = qa.options[answered.chosen];
    wrap.appendChild(h('div', { class: 'qa-feedback ' + (answered.correct ? 'right' : 'wrong') }, [
      h('b', {}, answered.correct ? 'Correct. ' : 'Not quite. '),
      h('span', { text: chosen.feedback })
    ]));
  }
  return wrap;
}

/* Recommended next actions drawn from what the inspection found */
function _ui_inspectionAdvice(colony, report) {
  var k = colony.known || {};
  var out = [];
  if (k.queenCells === 'swarm') {
    out.push({ action: 'artificialSwarm',
      text: 'Swarm cells are present — carry out swarm control now, before the colony leaves with half its bees.' });
  }
  if (!colony.queen || !colony.queen.present ||
      (colony.queen && colony.queen.state === 'dronelayer') || colony.layingWorkers) {
    out.push({ action: 'requeen',
      text: 'The colony has a serious queen problem — requeen it, or unite it with a strong colony.' });
  }
  if (k.stores === 'critical' || k.stores === 'low') {
    out.push({ action: 'feed',
      text: 'Stores are ' + k.stores + ' — feed the colony so it does not starve.' });
  }
  if (k.disease) {
    var dn = (typeof DISEASES !== 'undefined' && DISEASES[k.disease]) ? DISEASES[k.disease].name : k.disease;
    out.push({ action: null,
      text: 'Signs of ' + dn + ' were seen — read the Handbook and act on it; some diseases are serious.' });
  }
  if (k.varroaSign === 'high' || k.varroaSign === 'severe') {
    out.push({ action: (colony.supers > 0 ? 'harvest' : 'treat'),
      text: 'Varroa is ' + k.varroaSign + ' — ' + (colony.supers > 0
        ? 'take the honey supers off, then treat.' : 'treat the colony before the winter bees are reared.') });
  } else if (k.varroaSign === 'unchecked') {
    out.push({ action: 'monitorVarroa',
      text: 'Varroa has not been measured here — take a sample so you know where you stand.' });
  }
  var cong = (typeof colonyCongestion === 'function') ? colonyCongestion(colony) : 0;
  if (cong > 0.7 && colony.alive) {
    out.push({ action: 'addSuper',
      text: 'The hive is crowded — add a super so the bees have room and are less likely to swarm.' });
  }
  if (!out.length) {
    out.push({ action: null,
      text: 'Nothing needs doing today. Close the hive up gently and let them get on with it.' });
  }
  return out;
}

/* Fill a tiny thumbnail with proportional colour bands */
function _ui_fillThumb(el, frame) {
  var cells = frame.cells || {};
  var order = ['capbrood','larva','eggs','honey','pollen','nectar','dronebr','qcell','disease','mite','empty'];
  var total = order.reduce(function(s, k) { return s + (cells[k] || 0); }, 0) || 1;
  var y = 0;
  order.forEach(function(cls) {
    var count = cells[cls] || 0;
    if (!count) return;
    var pct = count / total * 100;
    var band = document.createElement('div');
    band.style.cssText = 'position:absolute;left:0;right:0;top:' + y + '%;height:' + pct + '%;';
    band.classList.add('cell', cls);
    band.style.clipPath = 'none';
    band.style.borderRadius = '0';
    band.style.width = '100%';
    el.style.position = 'relative';
    el.appendChild(band);
    y += pct;
  });
}

/* Build the big hex comb grid — cells laid out the way bees actually build
   a frame: brood in the centre, a pollen band hugging it, honey and nectar
   arcing over the top and down the outer edges. Queen cells and the queen
   herself are drawn as overlays on top of the comb. */
function _ui_buildComb(frame) {
  var cells = frame.cells || {};
  var COLS = 11, ROWS = 9, total = COLS * ROWS;

  /* grid cell types — queen cells and the queen are overlays, not grid cells */
  var order = ['eggs','larva','capbrood','dronebr','disease','mite','pollen','nectar','honey','empty'];
  var totalCount = order.reduce(function(s, k) { return s + (cells[k] || 0); }, 0) || 1;

  /* how central each type sits: brood innermost, a pollen band, then stores */
  var rank = { eggs: 0, disease: 1, larva: 1, capbrood: 2, dronebr: 2, mite: 2,
               pollen: 3, nectar: 4, honey: 5, empty: 6 };

  var list = [];
  var remaining = total;
  order.forEach(function(cls, i) {
    var n = (i === order.length - 1) ? remaining
      : Math.min(remaining, Math.round((cells[cls] || 0) / totalCount * total));
    for (var j = 0; j < n; j++) list.push(cls);
    remaining -= n; if (remaining < 0) remaining = 0;
  });
  list.sort(function(a, b) { return rank[a] - rank[b]; });

  /* grid positions sorted by distance from the brood centre. The centre sits
     a little low so honey fills the arch across the top; a small fixed jitter
     keeps the bands organic rather than perfect rings. */
  var cx = (COLS - 1) / 2, cy = (ROWS - 1) / 2 + 0.5;
  var pos = [];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var dx = (c - cx) / (COLS / 2);
      var dy = (r - cy) / (ROWS / 2);
      var jit = (((c * 7 + r * 13) % 7) - 3) * 0.05;
      pos.push({ r: r, c: c, d: Math.sqrt(dx * dx + dy * dy) + jit });
    }
  }
  pos.sort(function(a, b) { return a.d - b.d; });

  var typeAt = {};
  for (var k = 0; k < pos.length; k++) {
    typeAt[pos[k].r + '_' + pos[k].c] = list[k] || 'empty';
  }

  var grid = h('div', { class: 'comb-grid' });
  for (var row = 0; row < ROWS; row++) {
    var line = h('div', { class: 'comb-line' });
    for (var col = 0; col < COLS; col++) {
      var cls = typeAt[row + '_' + col] || 'empty';
      line.appendChild(h('div', { class: 'cell ' + cls, title: cls }));
    }
    grid.appendChild(line);
  }

  var qn = cells.qcell || 0;
  var onBottom = qn > 0 && (frame.queenCellType === 'swarm');
  var comb = h('div', { class: 'comb' + (onBottom ? ' has-bottom-qc' : '') }, grid);

  /* the queen, on the brood in the centre of the frame */
  if (frame.hasQueen) {
    comb.appendChild(h('div', { class: 'comb-queen', title: 'The queen' }));
  }

  /* queen cells — peanut shapes. Swarm cells hang from the bottom bar;
     supersedure and emergency cells sit on the face of the comb. */
  if (qn > 0) {
    var qWrap = h('div', { class: 'comb-qcells ' + (onBottom ? 'at-bottom' : 'on-face') });
    for (var qi = 0; qi < Math.min(qn, 4); qi++) {
      qWrap.appendChild(h('div', { class: 'queen-cell',
        title: (frame.queenCellType || 'queen') + ' cell' }));
    }
    comb.appendChild(qWrap);
  }

  return comb;
}

function _ui_buildCombLegend() {
  var items = [
    { cls: 'empty',    label: 'Empty' },
    { cls: 'eggs',     label: 'Eggs' },
    { cls: 'larva',    label: 'Larva' },
    { cls: 'capbrood', label: 'Capped brood' },
    { cls: 'dronebr',  label: 'Drone brood' },
    { cls: 'honey',    label: 'Honey' },
    { cls: 'nectar',   label: 'Nectar' },
    { cls: 'pollen',   label: 'Pollen' },
    { cls: 'qcell',    label: 'Queen cell' },
    { cls: 'disease',  label: 'Disease' },
    { cls: 'mite',     label: 'Mite' }
  ];
  var spans = items.map(function(it) {
    return h('span', {}, [
      h('i', { class: 'cell ' + it.cls, style: { clipPath: 'none', borderRadius: '2px' } }),
      it.label
    ]);
  });
  return h('div', { class: 'comb-legend' }, spans);
}
