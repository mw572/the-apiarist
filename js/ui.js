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

  /* Clear any lingering toasts before a modal opens — they were drifting
     in over modal content and reading as cross-talk between two screens. */
  var _toastStack = document.querySelector('.toast-stack');
  if (_toastStack) _toastStack.innerHTML = '';

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
 * toast(text, tone) — paper-note style notification.
 *
 * tone: 'good' | 'bad' | 'warn' | 'plain' (default plain). Each tone
 * paints a thin left-edge accent (moss / earthy red / ochre-deep) on a
 * paper-cream background. The styling is all in `.toast` and tone
 * modifier classes — JS only assigns the class name.
 */
function toast(text, tone) {
  var stack = _ui_ensureToastStack();
  var cls = 'toast' + (tone && tone !== 'plain' ? ' toast-' + tone : ' toast-plain');
  var el = h('div', { class: cls, text: text });
  stack.appendChild(el);
  while (stack.children.length > 4) stack.removeChild(stack.firstChild);
  setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 4500);
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

  /* Editorial / field-notebook style: no decorative emoji art at the
     top of the explainer. The title carries the visual weight; the
     body reads like a page from a beekeeping journal. */
  var wrapper = h('div', { class: 'explainer' }, [
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
 *
 * Plate-led layout (Stage 1 of the visual overhaul): hero scene plate
 * with the title overlaid, parchment "page" beneath holding the name
 * field, region picker (landscape plates as card backgrounds), and a
 * difficulty picker (figure plates as character cards).
 *
 * The outer wrapper keeps the `.title-screen` class and the inner
 * paper plate keeps `.title-card` so existing QA selectors still
 * resolve. The figure/region cards keep `.diff-pick` / `.region-pick`
 * for the same reason (battery.js / narrate.js click them by class).
 */
function renderTitleScreen() {
  var app = document.getElementById('app');
  app.innerHTML = '';

  var chosenDiff = 'beekeeper';
  var chosenRegion = 'uk';
  var nameInput;
  var titlePage;

  /* ----- Region cards: full landscape plates as the card surface.
     Locked regions are desaturated and not clickable. ----- */
  var regionPlate = {
    uk:      'img/plates/region-uk.png',
    us_ne:   'img/plates/region-us-northeast.png',
    france:  'img/plates/region-france.png',
    japan:   'img/plates/region-japan.png',
    nz:      'img/plates/region-nz.png',
  };
  var regionCards = Object.keys(REGIONS).map(function (key) {
    var r = REGIONS[key];
    var plate = regionPlate[key] || '';
    var classes = 'title-region region-pick';
    if (key === chosenRegion) classes += ' selected sel';
    if (!r.available) classes += ' locked';
    var card = h('div', {
      class: classes,
      title: r.available ? r.blurb : (r.blurb + ' — coming soon'),
      style: plate ? { backgroundImage: 'url("' + plate + '")' } : null,
      onclick: function () {
        if (!r.available) return;
        chosenRegion = key;
        var all = titlePage.querySelectorAll('.title-region');
        all.forEach(function (c) { c.classList.remove('selected'); c.classList.remove('sel'); });
        card.classList.add('selected');
        card.classList.add('sel');
      }
    }, [
      h('div', { class: 'title-region-label' }, r.label + (r.available ? '' : ' — soon'))
    ]);
    return card;
  });

  /* ----- Difficulty cards: figure plate as the carrier, name + tag +
     blurb below (or beside on mobile via CSS). ----- */
  var figurePlate = {
    apprentice: 'img/plates/figure-apprentice.png',
    beekeeper:  'img/plates/figure-beekeeper.png',
    master:     'img/plates/figure-master.png',
  };
  var difficultyTag = {
    apprentice: 'Forgiving',
    beekeeper:  'True to life',
    master:     'No hand-holding',
  };
  var diffCards = Object.keys(DIFFICULTY).map(function (key) {
    var d = DIFFICULTY[key];
    var plate = figurePlate[key] || '';
    var classes = 'title-diff diff-pick';
    if (key === chosenDiff) classes += ' selected sel';
    var card = h('div', {
      class: classes,
      onclick: function () {
        chosenDiff = key;
        var all = titlePage.querySelectorAll('.title-diff');
        all.forEach(function (c) { c.classList.remove('selected'); c.classList.remove('sel'); });
        card.classList.add('selected');
        card.classList.add('sel');
      }
    }, [
      h('div', {
        class: 'title-diff-img',
        style: plate ? { backgroundImage: 'url("' + plate + '")' } : null
      }),
      h('div', { class: 'title-diff-body' }, [
        h('div', { class: 'title-diff-name dn' }, d.label),
        h('div', { class: 'title-diff-tag' }, difficultyTag[key] || ''),
        h('div', { class: 'title-diff-blurb dd' }, d.blurb),
      ])
    ]);
    return card;
  });

  /* ----- Hero scene plate + overlaid title. ----- */
  var hero = h('div', { class: 'title-hero' }, [
    h('div', { class: 'title-hero-overlay' }, [
      h('div', { class: 'title-hero-rule' }),
      h('div', { class: 'title-hero-title' }, 'The Apiarist'),
      h('div', { class: 'title-hero-sub' }, 'a beekeeping simulation for the curious and patient'),
    ])
  ]);

  /* ----- Sections. ----- */
  function sectionHead(label) {
    return h('div', { class: 'title-section-head' }, [
      h('span', { class: 'title-section-mark' }, label),
      h('span', { class: 'title-section-rule' })
    ]);
  }

  var nameSection = h('div', { class: 'title-section' }, [
    sectionHead('Your name'),
    (nameInput = h('input', {
      class: 'title-input',
      type: 'text',
      placeholder: 'e.g. Eleanor Holt'
    }))
  ]);

  var regionSection = h('div', { class: 'title-section' }, [
    sectionHead('Where in the world'),
    h('div', { class: 'title-region-grid' }, regionCards)
  ]);

  var diffSection = h('div', { class: 'title-section' }, [
    sectionHead('Choose your standing'),
    h('div', { class: 'title-diff-grid' }, diffCards)
  ]);

  /* ----- Buttons. Start is solid ink. Secondaries are ghost. ----- */
  var startBtn = h('button', {
    class: 'title-btn btn-primary',
    text: 'Start beekeeping',
    onclick: function () {
      var name = (nameInput.value || '').trim() || 'Beekeeper';
      if (typeof startNewGame === 'function') {
        startNewGame(name, chosenDiff, chosenRegion);
      }
    }
  });

  var actions = [startBtn];

  if (typeof hasSave === 'function' && hasSave()) {
    actions.push(h('button', {
      class: 'title-btn ghost',
      text: 'Continue saved game',
      onclick: function () {
        if (typeof loadGame === 'function') {
          loadGame();
          render();
        }
      }
    }));
  }

  actions.push(h('button', {
    class: 'title-btn ghost',
    text: 'Load a save file',
    onclick: function () { _ui_pickSaveFile(); }
  }));

  var actionsBlock = h('div', { class: 'title-actions' }, actions);

  /* ----- The parchment "page" that everything below the hero lives on.
     Marked as .title-card too so existing QA selectors find it. ----- */
  titlePage = h('div', { class: 'title-page title-card' }, [
    nameSection,
    regionSection,
    diffSection,
    actionsBlock
  ]);

  var footer = h('div', { class: 'title-footer-note' },
    'Bees reward attention. They punish neglect. Same as the real thing.');

  var plate = h('div', { class: 'title-plate' }, [hero, titlePage, footer]);
  var screen = h('div', { class: 'title-screen' }, plate);
  app.appendChild(screen);
}

/* ====================================================================
   SAVE & LOAD — portable save files
   ==================================================================== */

function _ui_openSaveLoad() {
  var info = '';
  if (Game) {
    var n = (typeof aliveColonies === 'function') ? aliveColonies().length : 0;
    info = (Game.beekeeperName || 'Your apiary') + ' — year ' +
      ((typeof gameYear === 'function') ? gameYear() : '?') + ', ' +
      n + ' ' + (n === 1 ? 'colony' : 'colonies');
  }
  var body = h('div', {}, [
    h('p', { class: 'sl-note' },
      'The game saves itself in this browser as you play. To keep a backup — or to ' +
      'carry your apiary to another device — save it to a file, then load that file ' +
      'back in here whenever you like.'),
    info ? h('div', { class: 'sl-current' }, 'Current game: ' + info) : null,
    h('div', { class: 'sl-actions' }, [
      h('button', {
        class: 'btn btn-primary',
        onclick: function() {
          if (typeof exportSaveFile === 'function' && exportSaveFile()) {
            toast('Save file downloaded.', 'good');
          } else {
            toast('Could not save the file.', 'bad');
          }
        }
      }, '↓ Save to file'),
      h('button', {
        class: 'btn',
        onclick: function() { _ui_pickSaveFile(); }
      }, '↑ Load from file')
    ])
  ]);
  openModal({ title: 'Save & Load', body: body });
}

/* Open the OS file picker and load the chosen save. */
function _ui_pickSaveFile() {
  var input = h('input', {
    type: 'file', accept: '.json,application/json',
    style: { position: 'fixed', left: '-9999px' }
  });
  input.addEventListener('change', function() {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      var obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { toast('That file could not be read as a save.', 'bad'); return; }
      var r = (typeof loadSaveObject === 'function')
        ? loadSaveObject(obj)
        : { ok: false, msg: 'Loading is unavailable.' };
      toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) closeModal();
    };
    reader.onerror = function() { toast('That file could not be read.', 'bad'); };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(function() { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
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
  else if (view === 'map')      stage.appendChild(_ui_buildMapView());
  else if (view === 'market')   stage.appendChild(_ui_buildMarketView());
  else if (view === 'handbook') stage.appendChild(_ui_buildHandbookView());
  else if (view === 'records')  stage.appendChild(_ui_buildRecordsView());
  /* legacy view names — normalise to 'records' so tab state persists */
  else if (view === 'finances') { Game.ui.recordsTab = 'finances'; Game.ui.view = 'records'; stage.appendChild(_ui_buildRecordsView('finances')); }
  else if (view === 'journal')  { Game.ui.recordsTab = 'journal';  Game.ui.view = 'records'; stage.appendChild(_ui_buildRecordsView('journal')); }

  app.appendChild(stage);
  app.appendChild(_ui_buildStatusbar());

  /* Floating advance-week button — mobile only, shown via CSS */
  var hasUrgent = (Game.advisor || []).some(function(a) { return a.tone === 'bad' || a.tone === 'warn'; });
  var fab = h('button', {
    class: 'advance-fab' + (hasUrgent ? ' urgent' : ' pulse'),
    title: 'Advance one week',
    onclick: function() { if (typeof advanceWeek === 'function') advanceWeek(); }
  }, '▶︎');
  app.appendChild(fab);
}

/* ====================================================================
   STATUSBAR — persistent bottom resource bar
   ==================================================================== */

function _ui_buildStatusbar() {
  var inv = (Game && Game.inventory) || {};
  var cash      = (Game && Game.cash != null) ? Game.cash : 0;
  var honeyKg   = inv.honey ? Object.values(inv.honey).reduce(function(s,v){ return s+(v||0); }, 0) : 0;
  var sugarKg   = inv.sugar     || 0;
  var jars      = inv.jars ? Object.values(inv.jars).reduce(function(s,v){ return s+(v||0); }, 0) : 0;
  var spare     = inv.spareHives || 0;
  var bait      = inv.baitHives  || 0;

  function stat(icon, val, label, cls) {
    return h('div', { class: 'sb-stat ' + (cls || '') }, [
      h('span', { class: 'sb-icon' }, icon),
      h('span', { class: 'sb-val' }, val),
      h('span', { class: 'sb-lbl' }, label)
    ]);
  }

  return h('div', { class: 'statusbar' }, [
    stat('💷', '£' + cash.toFixed(0), 'Cash'),
    h('div', { class: 'sb-divider' }),
    stat('🍯', honeyKg.toFixed(1) + ' kg', 'Honey'),
    stat('🧂', sugarKg.toFixed(1) + ' kg', 'Sugar'),
    stat('🫙', String(jars), 'Jars'),
    h('div', { class: 'sb-divider' }),
    stat('📦', String(spare), 'Spare hives', spare > 0 ? 'sb-has' : ''),
    stat('🪤', String(bait), 'Bait hives', bait > 0 ? 'sb-has' : '')
  ]);
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

  /* Match the rank to a figure portrait — Apprentice / Beekeeper /
     Master tier. Done as a 24px painted thumbnail next to the title
     so the chrome stays restrained but the role is recognisable at
     a glance. */
  var rankPlate = 'figure-apprentice.png';
  if (hc >= 30) rankPlate = 'figure-master.png';
  else if (hc >= 2) rankPlate = 'figure-beekeeper.png';

  return h('div', { class: 'topbar' }, [
    h('div', { class: 'brand' }, 'The Apiarist'),
    h('div', { class: 'topbar-clock' }, [
      h('span', { class: 'weather-ico' }, wIcon),
      h('div', { class: 'when' }, [
        h('b', { text: seasonLabel + ', ' + dl }),
        h('small', { text: 'Year ' + yr })
      ])
    ]),
    h('div', { class: 'topbar-spacer' }),
    h('div', { class: 'topbar-cash', title: 'Cash on hand' }, [
      h('b', { text: fmtMoney(Game.cash) }),
      h('small', { text: 'Cash' })
    ]),
    h('div', { class: 'topbar-rank', title: 'Beekeeper rank — ' + titleName }, [
      h('img', { class: 'topbar-rank-portrait', src: 'img/plates/' + rankPlate, alt: '' }),
      h('span', { class: 'topbar-rank-label', text: titleName })
    ])
  ]);
}

/* ====================================================================
   NAVBAR
   ==================================================================== */

function _ui_buildNavbar() {
  var view = (Game.ui && Game.ui.view) || 'apiary';

  var badCount = (Game.advisor || []).filter(function(a) { return a.tone === 'bad'; }).length;

  /* Painterly-treatise navbar — no emoji icons, just labels in IM Fell.
     The painted plates carry visual weight inside each view; the nav
     is restrained book-tab marks at the foot of the page. */
  var navItems = [
    { key: 'apiary',   label: 'Apiary',   pip: badCount > 0 ? badCount : 0 },
    { key: 'map',      label: 'Map'    },
    { key: 'market',   label: 'Market' },
    { key: 'handbook', label: 'Handbook' },
    { key: 'records',  label: 'Records' }
  ];

  var btns = navItems.map(function(item) {
    var children = [item.label];
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

function _ui_cloud(x, y, s) {
  return '<g fill="#fcfcf7" opacity="0.93">' +
    '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (48*s) + '" ry="' + (26*s) + '"/>' +
    '<ellipse cx="' + (x-36*s) + '" cy="' + (y+9*s) + '" rx="' + (32*s) + '" ry="' + (20*s) + '"/>' +
    '<ellipse cx="' + (x+38*s) + '" cy="' + (y+7*s) + '" rx="' + (34*s) + '" ry="' + (21*s) + '"/></g>';
}

function _ui_apiaryScene(season, siteType, apiaryId) {
  var cacheKey = (apiaryId || 0) + '|' + season + '|' + (siteType || 'rural');
  if (_ui_sceneCache[cacheKey]) return _ui_sceneCache[cacheKey];
  var result;
  if (siteType === 'farmland')      result = _ui_sceneFarmland(season);
  else if (siteType === 'moorland') result = _ui_sceneMoorland(season);
  else if (siteType === 'orchard')  result = _ui_sceneOrchard(season);
  else if (siteType === 'urban')    result = _ui_sceneUrban(season);
  else                              result = _ui_sceneRural(season);
  _ui_sceneCache[cacheKey] = result;
  return result;
}

/* ---- Rural (mixed woodland — the classic scene) ---- */
function _ui_sceneRural(season) {
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
    var tw = 15*s, th = 74*s, o = '';
    o += '<rect x="' + (x-tw/2).toFixed(1) + '" y="' + (by-th).toFixed(1) +
      '" width="' + tw.toFixed(1) + '" height="' + th.toFixed(1) + '" rx="' + (4*s).toFixed(1) + '" fill="' + c.trunk + '"/>';
    if (bare) {
      o += '<g stroke="' + c.trunk + '" stroke-width="' + (4.5*s).toFixed(1) + '" stroke-linecap="round" fill="none">';
      o += '<path d="M' + x + ' ' + (by-th+20*s).toFixed(0) + ' q ' + (-20*s).toFixed(0) + ' ' + (-16*s).toFixed(0) + ' ' + (-32*s).toFixed(0) + ' ' + (-44*s).toFixed(0) + '"/>';
      o += '<path d="M' + x + ' ' + (by-th+10*s).toFixed(0) + ' q ' + (20*s).toFixed(0) + ' ' + (-18*s).toFixed(0) + ' ' + (30*s).toFixed(0) + ' ' + (-46*s).toFixed(0) + '"/></g>';
    } else {
      var fy = by-th-2*s;
      o += '<circle cx="' + x + '" cy="' + fy.toFixed(1) + '" r="' + (48*s).toFixed(1) + '" fill="' + c.can + '"/>';
      o += '<circle cx="' + (x-32*s).toFixed(1) + '" cy="' + (fy+18*s).toFixed(1) + '" r="' + (36*s).toFixed(1) + '" fill="' + c.can2 + '"/>';
      o += '<circle cx="' + (x+34*s).toFixed(1) + '" cy="' + (fy+14*s).toFixed(1) + '" r="' + (38*s).toFixed(1) + '" fill="' + c.can2 + '"/>';
      o += '<circle cx="' + (x+6*s).toFixed(1) + '" cy="' + (fy-24*s).toFixed(1) + '" r="' + (31*s).toFixed(1) + '" fill="' + c.can + '"/>';
      if (c.bloom) {
        for (var bl = 0; bl < 9; bl++) {
          var a = bl * 0.698, r = (18 + (bl % 3) * 12) * s;
          o += '<circle cx="' + (x+Math.cos(a)*r).toFixed(1) + '" cy="' + (fy+Math.sin(a)*r).toFixed(1) + '" r="' + (3.5*s).toFixed(1) + '" fill="#fbe1ea"/>';
        }
      }
    }
    return o;
  }

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><linearGradient id="agSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.sky1 + '"/><stop offset="1" stop-color="' + c.sky2 + '"/></linearGradient>' +
    '<linearGradient id="agGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.g1 + '"/><stop offset="1" stop-color="' + c.g2 + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#agSky)"/>';
  s += '<circle cx="985" cy="92" r="86" fill="' + c.sun + '" opacity="0.45"/><circle cx="985" cy="92" r="48" fill="' + c.sun + '"/>';
  s += _ui_cloud(250, 96, 1.0) + _ui_cloud(610, 62, 0.78) + _ui_cloud(1070, 150, 0.66);
  s += '<path d="M0 ' + (hz-30) + ' Q 300 ' + (hz-95) + ' 620 ' + (hz-44) + ' T 1200 ' + (hz-58) + ' V ' + H + ' H 0 Z" fill="' + c.hF + '"/>';
  s += '<path d="M0 ' + (hz+18) + ' Q 360 ' + (hz-44) + ' 760 ' + (hz+22) + ' T 1200 ' + (hz-2) + ' V ' + H + ' H 0 Z" fill="' + c.hM + '"/>';
  for (var t = 0; t < 11; t++) s += tree(56+t*112, hz+30, 0.32);
  s += '<path d="M0 ' + (hz+96) + ' Q 440 ' + (hz+54) + ' 880 ' + (hz+96) + ' T 1200 ' + (hz+80) + ' V ' + H + ' H 0 Z" fill="' + c.hN + '"/>';
  s += '<path d="M0 ' + (hz+150) + ' Q 520 ' + (hz+126) + ' 1200 ' + (hz+156) + ' V ' + H + ' H 0 Z" fill="url(#agGrass)"/>';
  s += tree(116, hz+200, 1.05) + tree(1108, hz+220, 1.2) + tree(978, hz+165, 0.72);
  if (c.flowers.length) {
    for (var f = 0; f < 54; f++) {
      var fx = ((f * 227) % W).toFixed(0);
      var fy2 = (hz + 168 + ((f * 73) % (H - hz - 184))).toFixed(0);
      var col = c.flowers[f % c.flowers.length];
      s += '<circle cx="' + fx + '" cy="' + fy2 + '" r="' + (1.6 + (f%3)*0.8).toFixed(1) + '" fill="' + col + '" opacity="0.9"/>';
    }
  }
  s += '</svg>';
  return s;
}

/* ---- Farmland (flat arable fields, hedgerows, OSR / wheat) ---- */
function _ui_sceneFarmland(season) {
  var W = 1200, H = 620, hz = 270;
  var sky1 = season === 'winter' ? '#b8ccd8' : season === 'autumn' ? '#c0beb0' : '#a4c8e0';
  var sky2 = season === 'winter' ? '#dce4dc' : season === 'autumn' ? '#dcd4b0' : '#cce4c4';
  var sunC = season === 'winter' ? '#eaeae0' : '#fde8b0';
  var fieldTop = season === 'spring' ? '#f0cc08' : season === 'summer' ? '#b8aa3c' : season === 'autumn' ? '#b08838' : '#7a5830';
  var fieldBot = season === 'spring' ? '#d8b008' : season === 'summer' ? '#9e9228' : season === 'autumn' ? '#906830' : '#5a3e20';
  var hedgeC = season === 'winter' ? '#3a4830' : '#3c6820';
  var hedgeC2 = season === 'winter' ? '#2e3824' : '#2e5018';
  var grassC = season === 'winter' ? '#8a9878' : season === 'autumn' ? '#9a9448' : '#6a9438';

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><linearGradient id="agSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient>' +
    '<linearGradient id="agField" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + fieldTop + '"/><stop offset="1" stop-color="' + fieldBot + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#agSky)"/>';
  s += '<circle cx="940" cy="88" r="80" fill="' + sunC + '" opacity="0.38"/><circle cx="940" cy="88" r="44" fill="' + sunC + '"/>';
  s += _ui_cloud(280, 108, 1.0) + _ui_cloud(720, 72, 0.8) + _ui_cloud(1060, 140, 0.65);
  /* Far field */
  s += '<rect x="0" y="' + (hz-10) + '" width="' + W + '" height="' + (H-hz+10) + '" fill="url(#agField)"/>';
  /* Distant hedge band */
  s += '<path d="M0 ' + hz + ' Q200 ' + (hz-8) + ' 400 ' + (hz+4) + ' Q700 ' + (hz-6) + ' 1000 ' + (hz+4) + ' Q1100 ' + (hz-2) + ' 1200 ' + hz + ' V' + (hz+22) + ' H0 Z" fill="' + hedgeC + '"/>';
  /* Mid field — slightly lighter band */
  var mhz = hz + 130;
  s += '<path d="M0 ' + mhz + ' Q300 ' + (mhz-10) + ' 600 ' + (mhz+6) + ' Q900 ' + (mhz-4) + ' 1200 ' + mhz + ' V' + (mhz+28) + ' H0 Z" fill="' + hedgeC2 + '"/>';
  /* Tillage lines on far field */
  if (season !== 'summer') {
    for (var tl = 0; tl < 16; tl++) {
      s += '<line x1="' + (30+tl*74) + '" y1="' + hz + '" x2="' + (30+tl*74) + '" y2="' + (hz+125) + '" stroke="rgba(0,0,0,0.06)" stroke-width="2"/>';
    }
  }
  /* Lone hedge trees */
  var htC = season === 'winter' ? '#4a3828' : '#3a6018';
  var htC2 = '#2e4e10';
  function hedgeTree(x, by, sc) {
    var o = '<rect x="' + (x-5*sc).toFixed(0) + '" y="' + (by-52*sc).toFixed(0) + '" width="' + (10*sc).toFixed(0) + '" height="' + (52*sc).toFixed(0) + '" fill="#5a4230"/>';
    if (season === 'winter') {
      o += '<line x1="' + x + '" y1="' + (by-52*sc).toFixed(0) + '" x2="' + (x-26*sc).toFixed(0) + '" y2="' + (by-86*sc).toFixed(0) + '" stroke="#4a3828" stroke-width="' + (3.5*sc).toFixed(0) + '"/>';
      o += '<line x1="' + x + '" y1="' + (by-44*sc).toFixed(0) + '" x2="' + (x+22*sc).toFixed(0) + '" y2="' + (by-80*sc).toFixed(0) + '" stroke="#4a3828" stroke-width="' + (3*sc).toFixed(0) + '"/>';
    } else {
      o += '<circle cx="' + x + '" cy="' + (by-68*sc).toFixed(0) + '" r="' + (30*sc).toFixed(0) + '" fill="' + htC + '"/>';
      o += '<circle cx="' + (x-18*sc).toFixed(0) + '" cy="' + (by-56*sc).toFixed(0) + '" r="' + (22*sc).toFixed(0) + '" fill="' + htC2 + '"/>';
    }
    return o;
  }
  s += hedgeTree(175, hz+4, 1.0) + hedgeTree(820, hz+2, 0.88);
  /* Foreground grass strip */
  s += '<path d="M0 ' + (hz+220) + ' Q480 ' + (hz+200) + ' 1200 ' + (hz+228) + ' V' + H + ' H0 Z" fill="' + grassC + '"/>';
  /* Fence posts */
  for (var fp = 0; fp < 9; fp++) {
    var fpx = 18 + fp * 148;
    s += '<rect x="' + (fpx-2) + '" y="' + (hz+188) + '" width="5" height="46" rx="1" fill="#9a7840"/>';
    s += '<rect x="' + (fpx-3) + '" y="' + (hz+192) + '" width="7" height="6" rx="1" fill="#b89050"/>';
  }
  s += '<line x1="18" y1="' + (hz+200) + '" x2="' + (18+8*148) + '" y2="' + (hz+200) + '" stroke="#9a7840" stroke-width="1.5" opacity="0.65"/>';
  s += '<line x1="18" y1="' + (hz+218) + '" x2="' + (18+8*148) + '" y2="' + (hz+218) + '" stroke="#9a7840" stroke-width="1.5" opacity="0.65"/>';
  /* OSR label shimmer — yellow field in spring only */
  if (season === 'spring') {
    s += '<rect x="0" y="' + (hz-10) + '" width="' + W + '" height="' + (hz+132-(hz-10)) + '" fill="rgba(255,220,0,0.08)"/>';
  }
  s += '</svg>';
  return s;
}

/* ---- Moorland (open moor, heather, no tall trees) ---- */
function _ui_sceneMoorland(season) {
  var W = 1200, H = 620, hz = 220;
  var sky1 = season === 'winter' ? '#a8b8c8' : season === 'spring' ? '#9eb8d0' : season === 'summer' ? '#8ab0cc' : '#aab0b8';
  var sky2 = season === 'winter' ? '#c8ccc8' : season === 'spring' ? '#bcccc0' : season === 'summer' ? '#b8ccc4' : '#c0b8a8';
  var sunC = season === 'winter' ? '#dce0dc' : '#f8e0a0';
  var h1C = season === 'summer' ? '#7a3070' : season === 'spring' ? '#9a6080' : season === 'autumn' ? '#c07030' : '#7a6050';
  var h2C = season === 'summer' ? '#5a2050' : season === 'spring' ? '#7a4060' : season === 'autumn' ? '#a05828' : '#6a5040';
  var h3C = season === 'summer' ? '#903888' : season === 'spring' ? '#6a4868' : season === 'autumn' ? '#b86828' : '#5a4838';
  var grassC = season === 'summer' ? '#5a6830' : season === 'spring' ? '#6a7838' : season === 'autumn' ? '#8a7838' : '#4a5028';

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><linearGradient id="agSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#agSky)"/>';
  /* Softer sun — moorland is often overcast */
  s += '<circle cx="920" cy="100" r="64" fill="' + sunC + '" opacity="0.3"/><circle cx="920" cy="100" r="36" fill="' + sunC + '" opacity="0.6"/>';
  /* Thinner clouds, more scattered */
  s += _ui_cloud(180, 88, 0.85) + _ui_cloud(560, 58, 0.7) + _ui_cloud(940, 120, 0.9) + _ui_cloud(1100, 76, 0.55);
  /* Far ridge — distant moorland silhouette */
  s += '<path d="M0 ' + (hz-60) + ' Q200 ' + (hz-110) + ' 450 ' + (hz-80) + ' Q650 ' + (hz-60) + ' 800 ' + (hz-90) + ' Q1000 ' + (hz-120) + ' 1200 ' + (hz-70) + ' V' + H + ' H0 Z" fill="' + h1C + '" opacity="0.55"/>';
  /* Mid moor */
  s += '<path d="M0 ' + (hz-10) + ' Q280 ' + (hz-55) + ' 560 ' + (hz-20) + ' Q840 ' + (hz-35) + ' 1200 ' + (hz-5) + ' V' + H + ' H0 Z" fill="' + h2C + '"/>';
  /* Near moor ground */
  s += '<path d="M0 ' + (hz+80) + ' Q360 ' + (hz+50) + ' 720 ' + (hz+85) + ' Q1000 ' + (hz+60) + ' 1200 ' + (hz+75) + ' V' + H + ' H0 Z" fill="' + h3C + '"/>';
  /* Heather bushes — low rounded mounds */
  function heatherBush(x, y, w, ht) {
    var bc = season === 'summer' ? '#8a2888' : season === 'spring' ? '#8a5870' : season === 'autumn' ? '#c07028' : '#6a5048';
    var bc2 = season === 'summer' ? '#6a1868' : season === 'autumn' ? '#a05020' : '#503840';
    var o = '<ellipse cx="' + x + '" cy="' + y + '" rx="' + w + '" ry="' + ht + '" fill="' + bc + '"/>';
    o += '<ellipse cx="' + (x-w*0.4).toFixed(0) + '" cy="' + (y+ht*0.3).toFixed(0) + '" rx="' + (w*0.55).toFixed(0) + '" ry="' + (ht*0.7).toFixed(0) + '" fill="' + bc2 + '"/>';
    return o;
  }
  var bushData = [[90,hz+148,52,18],[240,hz+132,38,14],[420,hz+158,62,20],[580,hz+140,44,16],
                  [750,hz+150,56,19],[900,hz+135,40,15],[1050,hz+155,58,20],[1150,hz+144,34,13]];
  for (var bi = 0; bi < bushData.length; bi++) {
    s += heatherBush(bushData[bi][0], bushData[bi][1], bushData[bi][2], bushData[bi][3]);
  }
  /* Dry stone wall */
  s += '<rect x="0" y="' + (hz+190) + '" width="' + W + '" height="14" rx="3" fill="#9a9080" opacity="0.7"/>';
  s += '<rect x="0" y="' + (hz+193) + '" width="' + W + '" height="8" rx="2" fill="#b4a898" opacity="0.5"/>';
  /* Stone detail */
  for (var st = 0; st < 18; st++) {
    s += '<rect x="' + (10+st*68) + '" y="' + (hz+191) + '" width="58" height="12" rx="2" fill="rgba(0,0,0,0.06)"/>';
  }
  /* Foreground grass/heather */
  s += '<path d="M0 ' + (hz+210) + ' Q400 ' + (hz+194) + ' 1200 ' + (hz+214) + ' V' + H + ' H0 Z" fill="' + grassC + '"/>';
  s += '</svg>';
  return s;
}

/* ---- Orchard (rows of apple/cherry trees, blossom in spring) ---- */
function _ui_sceneOrchard(season) {
  var W = 1200, H = 620, hz = 215;
  var sky1 = season === 'winter' ? '#c0cad2' : season === 'autumn' ? '#b8c0b0' : '#a8c8e0';
  var sky2 = season === 'winter' ? '#dce0d8' : season === 'autumn' ? '#d8cca8' : '#cce4c8';
  var sunC = season === 'winter' ? '#e8e8e0' : '#fce8b0';
  var g1 = season === 'winter' ? '#a8b4a0' : season === 'autumn' ? '#9a9e58' : '#88b050';
  var g2 = season === 'winter' ? '#8a9888' : season === 'autumn' ? '#808840' : '#70a038';

  function orchTree(x, by, sc) {
    var tC = '#6a4828';
    var o = '<rect x="' + (x-5*sc).toFixed(0) + '" y="' + (by-58*sc).toFixed(0) + '" width="' + (10*sc).toFixed(0) + '" height="' + (58*sc).toFixed(0) + '" fill="' + tC + '"/>';
    if (season === 'winter') {
      o += '<line x1="' + x + '" y1="' + (by-58*sc).toFixed(0) + '" x2="' + (x-30*sc).toFixed(0) + '" y2="' + (by-94*sc).toFixed(0) + '" stroke="' + tC + '" stroke-width="' + (4*sc).toFixed(0) + '"/>';
      o += '<line x1="' + x + '" y1="' + (by-50*sc).toFixed(0) + '" x2="' + (x+28*sc).toFixed(0) + '" y2="' + (by-90*sc).toFixed(0) + '" stroke="' + tC + '" stroke-width="' + (3.5*sc).toFixed(0) + '"/>';
      o += '<line x1="' + x + '" y1="' + (by-38*sc).toFixed(0) + '" x2="' + (x-16*sc).toFixed(0) + '" y2="' + (by-64*sc).toFixed(0) + '" stroke="' + tC + '" stroke-width="' + (2.5*sc).toFixed(0) + '"/>';
    } else {
      var canC = season === 'spring' ? '#e8d8e8' : season === 'summer' ? '#4a8a38' : '#7a9a2c';
      var canC2 = season === 'spring' ? '#f0c8d8' : season === 'summer' ? '#3a7828' : '#688220';
      var cy = by-82*sc;
      o += '<ellipse cx="' + x + '" cy="' + cy.toFixed(0) + '" rx="' + (40*sc).toFixed(0) + '" ry="' + (34*sc).toFixed(0) + '" fill="' + canC + '"/>';
      o += '<ellipse cx="' + (x-22*sc).toFixed(0) + '" cy="' + (cy+12*sc).toFixed(0) + '" rx="' + (30*sc).toFixed(0) + '" ry="' + (26*sc).toFixed(0) + '" fill="' + canC2 + '"/>';
      o += '<ellipse cx="' + (x+24*sc).toFixed(0) + '" cy="' + (cy+10*sc).toFixed(0) + '" rx="' + (32*sc).toFixed(0) + '" ry="' + (28*sc).toFixed(0) + '" fill="' + canC + '"/>';
      if (season === 'spring') {
        for (var b = 0; b < 14; b++) {
          var ba = b * 0.449;
          var br = (14 + (b%3)*9)*sc;
          o += '<circle cx="' + (x+Math.cos(ba)*br).toFixed(0) + '" cy="' + (cy+Math.sin(ba)*br*0.85).toFixed(0) + '" r="' + (3.5*sc).toFixed(0) + '" fill="#f8c8d8"/>';
        }
      } else if (season === 'autumn') {
        for (var fr = 0; fr < 8; fr++) {
          var fa = fr * 0.785;
          var frr = (10+(fr%3)*7)*sc;
          o += '<circle cx="' + (x+Math.cos(fa)*frr).toFixed(0) + '" cy="' + (cy+Math.sin(fa)*frr*0.85+6*sc).toFixed(0) + '" r="' + (4.5*sc).toFixed(0) + '" fill="#cc3818"/>';
        }
      }
    }
    return o;
  }

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><linearGradient id="agSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient>' +
    '<linearGradient id="agGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + g1 + '"/><stop offset="1" stop-color="' + g2 + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#agSky)"/>';
  s += '<circle cx="950" cy="90" r="78" fill="' + sunC + '" opacity="0.42"/><circle cx="950" cy="90" r="44" fill="' + sunC + '"/>';
  s += _ui_cloud(220, 92, 0.95) + _ui_cloud(640, 66, 0.78) + _ui_cloud(1020, 140, 0.7);
  /* Rolling meadow ground */
  s += '<path d="M0 ' + (hz+20) + ' Q360 ' + (hz-20) + ' 760 ' + (hz+24) + ' T 1200 ' + (hz+10) + ' V' + H + ' H0 Z" fill="' + g1 + '"/>';
  s += '<path d="M0 ' + (hz+150) + ' Q500 ' + (hz+130) + ' 1200 ' + (hz+160) + ' V' + H + ' H0 Z" fill="url(#agGrass)"/>';
  /* Far row of orchard trees */
  for (var ot = 0; ot < 7; ot++) s += orchTree(100 + ot * 170, hz + 60, 0.42);
  /* Near row */
  for (var ot2 = 0; ot2 < 5; ot2++) s += orchTree(100 + ot2 * 240, hz + 200, 0.88);
  /* Grass path between rows */
  s += '<rect x="0" y="' + (hz+62) + '" width="' + W + '" height="' + (hz+140-hz-62) + '" fill="rgba(120,160,60,0.18)"/>';
  /* Blossom petals on ground in spring */
  if (season === 'spring') {
    for (var p = 0; p < 30; p++) {
      s += '<circle cx="' + ((p*157+60)%W) + '" cy="' + (hz+155+((p*83)%60)) + '" r="2" fill="#f8d0e0" opacity="0.8"/>';
    }
  }
  s += '</svg>';
  return s;
}

/* ---- Urban (rooftops, chimneys, garden wall) ---- */
function _ui_sceneUrban(season) {
  var W = 1200, H = 620;
  var sky1 = season === 'winter' ? '#a0aab8' : season === 'autumn' ? '#b8b0a0' : '#88b0cc';
  var sky2 = season === 'winter' ? '#c8ccc8' : season === 'autumn' ? '#ccc0a0' : '#b8d0c0';
  var sunC = '#f8e0a0';
  var brickA = '#b87858', brickB = '#9a6048', brickC = '#c08868';
  var roofA = '#5a5050', roofB = '#786860', roofC = '#484040';
  var chimneyC = '#4a4040';
  var wallC = '#b89868', mortarC = '#c8b088';
  var gardenC = season === 'winter' ? '#6a7a5a' : season === 'autumn' ? '#788448' : '#5a8838';

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><linearGradient id="agSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky1 + '"/><stop offset="1" stop-color="' + sky2 + '"/></linearGradient></defs>';
  s += '<rect width="' + W + '" height="' + H + '" fill="url(#agSky)"/>';
  s += '<circle cx="900" cy="80" r="72" fill="' + sunC + '" opacity="0.36"/><circle cx="900" cy="80" r="40" fill="' + sunC + '"/>';
  s += _ui_cloud(300, 102, 0.9) + _ui_cloud(720, 70, 0.72) + _ui_cloud(1080, 130, 0.6);

  /* Building silhouettes — varied heights, terrace style */
  var buildings = [
    { x:0, w:180, h:290, bk:brickA },
    { x:175, w:220, h:240, bk:brickB },
    { x:390, w:160, h:310, bk:brickC },
    { x:545, w:200, h:260, bk:brickA },
    { x:740, w:140, h:330, bk:brickB },
    { x:875, w:190, h:270, bk:brickC },
    { x:1058, w:145, h:250, bk:brickA }
  ];
  /* Draw building walls */
  for (var bi = 0; bi < buildings.length; bi++) {
    var b = buildings[bi];
    var by = H - b.h;
    s += '<rect x="' + b.x + '" y="' + by + '" width="' + b.w + '" height="' + b.h + '" fill="' + b.bk + '"/>';
    /* Roof */
    s += '<rect x="' + b.x + '" y="' + (by-16) + '" width="' + b.w + '" height="18" fill="' + roofA + '"/>';
    /* Windows */
    var rows = Math.floor((b.h - 40) / 60);
    var cols = Math.floor(b.w / 60);
    for (var wr = 0; wr < rows; wr++) {
      for (var wc = 0; wc < cols; wc++) {
        var wx = b.x + 20 + wc*52, wy = by + 28 + wr*58;
        s += '<rect x="' + wx + '" y="' + wy + '" width="26" height="34" rx="2" fill="rgba(200,220,240,0.5)"/>';
        s += '<line x1="' + (wx+13) + '" y1="' + wy + '" x2="' + (wx+13) + '" y2="' + (wy+34) + '" stroke="rgba(100,120,140,0.4)" stroke-width="1"/>';
      }
    }
  }
  /* Rooftop silhouette overlap */
  for (var ri = 0; ri < buildings.length; ri++) {
    var rb = buildings[ri];
    s += '<rect x="' + rb.x + '" y="' + (H-rb.h-18) + '" width="' + rb.w + '" height="6" rx="1" fill="' + roofB + '"/>';
  }
  /* Chimneys */
  var chimneyData = [[80,H-292],[310,H-244],[470,H-314],[640,H-264],[800,H-334],[990,H-274]];
  for (var ci = 0; ci < chimneyData.length; ci++) {
    var cx = chimneyData[ci][0], cby = chimneyData[ci][1];
    s += '<rect x="' + (cx-8) + '" y="' + (cby-48) + '" width="16" height="52" fill="' + chimneyC + '"/>';
    s += '<rect x="' + (cx-11) + '" y="' + (cby-52) + '" width="22" height="8" rx="2" fill="' + roofC + '"/>';
    /* Smoke in winter */
    if (season === 'winter') {
      s += '<path d="M' + cx + ' ' + (cby-52) + ' Q' + (cx-10) + ' ' + (cby-72) + ' ' + cx + ' ' + (cby-90) + ' Q' + (cx+12) + ' ' + (cby-108) + ' ' + cx + ' ' + (cby-124) + '" fill="none" stroke="rgba(200,200,200,0.5)" stroke-width="6"/>';
    }
  }
  /* Garden wall */
  s += '<rect x="0" y="' + (H-160) + '" width="' + W + '" height="30" fill="' + wallC + '"/>';
  /* Mortar lines */
  for (var ml = 0; ml < 16; ml++) {
    s += '<rect x="' + (ml*78) + '" y="' + (H-161) + '" width="70" height="32" rx="1" fill="' + mortarC + '" opacity="0.3"/>';
    s += '<line x1="' + (ml*78) + '" y1="' + (H-146) + '" x2="' + (ml*78+70) + '" y2="' + (H-146) + '" stroke="rgba(180,160,120,0.4)" stroke-width="1"/>';
  }
  /* Garden soil / plants below wall */
  s += '<rect x="0" y="' + (H-130) + '" width="' + W + '" height="130" fill="' + gardenC + '"/>';
  /* Garden plants */
  var plantC = season === 'winter' ? '#4a5840' : season === 'autumn' ? '#6a7830' : '#4a8028';
  for (var gp = 0; gp < 10; gp++) {
    var gpx = 50 + gp * 118;
    s += '<ellipse cx="' + gpx + '" cy="' + (H-90) + '" rx="28" ry="22" fill="' + plantC + '"/>';
    s += '<ellipse cx="' + (gpx+20) + '" cy="' + (H-96) + '" rx="20" ry="16" fill="' + gardenC + '"/>';
  }
  s += '</svg>';
  return s;
}

function _ui_buildApiaryView() {
  /* Re-derive the advisor right before we render the action list.
     advanceWeek() rebuilds it weekly, but in-week actions (buying a
     nuc, completing an inspection, harvesting) change state too. Without
     this call the action list would keep telling you to "buy a nucleus"
     even after Rose is sitting in the apiary. */
  if (typeof buildAdvisor === 'function') {
    try { buildAdvisor(); } catch (e) {}
  }
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

  /* ----------------------------------------------------------------
     1. Season scene band — painted oil-on-canvas plate at the top.
     The painting carries the seasonal mood; CSS object-fit handles
     the crop. ---------------------------------------------------- */
  var seasonPlateMap = {
    spring: 'img/plates/scene-spring-buildup.png',
    summer: 'img/plates/scene-summer-flow.png',
    autumn: 'img/plates/scene-autumn-harvest.png',
    winter: 'img/plates/scene-winter-apiary.png'
  };
  var seasonLabelMap = {
    spring: 'Spring build-up',
    summer: 'Summer flow',
    autumn: 'Autumn harvest',
    winter: 'Winter'
  };
  var hbSeason = (HANDBOOK_LINKS.season && HANDBOOK_LINKS.season[season]) || null;
  var seasonBand = h('button', {
    type: 'button',
    class: 'apiary-season-band season-' + season + (hbSeason ? ' plate-link' : ''),
    title: hbSeason ? 'Read about the beekeeping ' + season : '',
    onclick: hbSeason ? function() { openHandbookArticle(hbSeason); } : null
  }, [
    h('img', {
      class: 'asb-plate',
      src: seasonPlateMap[season] || seasonPlateMap.spring,
      alt: (seasonLabelMap[season] || 'Season') + ' at the apiary'
    }),
    h('div', { class: 'asb-overlay' }),
    h('div', { class: 'asb-caption' }, [
      h('span', { class: 'asb-season', text: seasonLabelMap[season] || 'Season' }),
      forageNote ? h('span', { class: 'asb-forage', text: forageNote }) : null
    ]),
    hbSeason ? h('span', { class: 'plate-link-mark', text: '✣' }) : null
  ]);

  /* ----------------------------------------------------------------
     2. Apiary identity strip — name, site type pill, switcher. ---- */
  var switcherBtns = [];
  if (apiaries.length > 1) {
    switcherBtns = apiaries.map(function(ap) {
      return h('button', {
        class: 'btn btn-sm' + (ap.id === selId ? ' btn-primary' : ''),
        onclick: function() {
          Game.ui.selectedApiary = ap.id;
          Game.ui.selectedColony = null;
          render();
        },
        text: ap.name
      });
    });
  }

  /* Apiary identity block, editorial layout:
       kicker  →  site type (small caps)
       headline →  apiary name (IM Fell large)
       switcher → present only when there are 2+ apiaries */
  var apiaryHead = h('div', { class: 'apiary-head apiary-identity apiary-identity-v2' }, [
    h('div', { class: 'apiary-identity-text' }, [
      siteType
        ? h('div', { class: 'apiary-kicker', text: siteLabel })
        : null,
      h('h2', { class: 'apiary-name', text: apiary ? apiary.name : 'No Apiary' })
    ]),
    switcherBtns.length
      ? h('div', { class: 'apiary-switch' }, switcherBtns)
      : null
  ]);

  /* ----------------------------------------------------------------
     3. Hive grid — clean grid of colony cards (no cartoon SVG). ---- */
  var colonies = [];
  if (apiary && typeof coloniesIn === 'function') {
    colonies = coloniesIn(apiary.id);
  }

  var hiveNodes = colonies.map(function(col) {
    return _ui_buildHiveCard(col);
  });

  // Spare hive slots — one card per empty hive box awaiting a colony
  var spareCount = (Game.inventory && Game.inventory.spareHives) || 0;
  for (var si2 = 0; si2 < spareCount; si2++) {
    hiveNodes.push(h('div', {
      class: 'hive hive-card hive-card-empty spare-hive-slot',
      onclick: function() { Game.ui.view = 'market'; render(); }
    }, [
      h('div', { class: 'hcp-icon hcp-icon-empty' }, h('span', { class: 'hcp-icon-mark' }, '⌂')),
      h('div', { class: 'hcp-body' }, [
        h('div', { class: 'hcp-name-row' }, h('span', { class: 'hcp-name', text: 'Empty hive' })),
        h('div', { class: 'hcp-state', text: 'Ready for a colony — visit Market' })
      ])
    ]));
  }

  // Bait hive slots — one card per bait hive in inventory
  var baitCount = (Game.inventory && Game.inventory.baitHives) || 0;
  for (var bi = 0; bi < baitCount; bi++) {
    hiveNodes.push(h('div', { class: 'hive hive-card hive-card-bait bait-hive-slot' }, [
      h('div', { class: 'hcp-icon hcp-icon-bait' }, h('span', { class: 'hcp-icon-mark' }, '◇')),
      h('div', { class: 'hcp-body' }, [
        h('div', { class: 'hcp-name-row' }, h('span', { class: 'hcp-name', text: 'Bait hive' })),
        h('div', { class: 'hcp-state', text: 'Waiting for a swarm' })
      ])
    ]));
  }

  var addSlot = h('div', {
    class: 'hive hive-card hive-card-add add-hive-slot',
    onclick: function() {
      Game.ui.view = 'market';
      render();
    }
  }, [
    h('div', { class: 'hcp-icon hcp-icon-add' }, h('span', { class: 'hcp-icon-mark plus' }, '+')),
    h('div', { class: 'hcp-body' }, [
      h('div', { class: 'hcp-name-row' }, h('span', { class: 'hcp-name', text: 'Add a colony' })),
      h('div', { class: 'hcp-state', text: 'Open the market to bring bees home' })
    ])
  ]);

  hiveNodes.push(addSlot);

  var hiveGrid = h('div', { class: 'hive-grid yard-row' }, hiveNodes);

  /* When there are no live colonies (just the Add slot), fill the
     dead parchment with a painted yard scene so the page has weight
     instead of an ocean of empty cream. */
  var emptyPoster = null;
  if (colonies.length === 0 && spareCount === 0 && baitCount === 0) {
    emptyPoster = h('button', {
      type: 'button',
      class: 'yard-empty-poster plate-link',
      title: 'Read about choosing your first bees',
      onclick: function() { openHandbookArticle('first-bees'); }
    }, [
      h('img', { src: 'img/plates/scene-spring-buildup.png', alt: '' }),
      h('div', { class: 'yep-scrim' }),
      h('div', { class: 'yep-caption' }, [
        h('div', { class: 'yep-title', text: 'A first hive in spring' }),
        h('div', { class: 'yep-sub', text: 'Buy a nucleus from the market or set out a bait hive — your apiary starts with one decision.' })
      ]),
      h('span', { class: 'plate-link-mark', text: '✣' })
    ]);
  }

  var yard = h('div', { class: 'apiary-yard yard season-' + season }, [hiveGrid, emptyPoster]);

  /* Pending swarm alert for this apiary — kept above the grid. */
  var pendingSwarmAlert = null;
  if (Game.flags && Game.flags.pendingSwarm && apiary && Game.flags.pendingSwarm.apiaryId === apiary.id) {
    pendingSwarmAlert = h('div', { class: 'swarm-alert-card' }, [
      h('div', { class: 'sa-icon' }, '🐝'),
      h('div', { class: 'sa-body' }, [
        h('div', { class: 'sa-title' }, 'A swarm has moved into your bait hive!'),
        h('div', { class: 'sa-sub' }, 'They will move on within a week if you do not hive them.')
      ]),
      h('button', {
        class: 'btn btn-primary',
        onclick: function() { _ui_openSwarmNamingModal(); }
      }, 'Hive this swarm')
    ]);
  }

  var main = h('div', { class: 'apiary-main' }, [
    apiaryHead,
    pendingSwarmAlert,
    yard
  ]);

  // Sidebar — winter letter / year-on-year / mentor / action list / advance bar
  var sidebar = _ui_buildSidebar();

  return h('div', { class: 'apiary-view apiary-view-v2' }, [
    seasonBand,
    h('div', { class: 'apiary-body' }, [main, sidebar])
  ]);
}

/* ====================================================================
   TERRITORY MAP VIEW — overview of all sites, forage, honey types

   Plate-led rebuild (Stage 4 of the visual overhaul): hero band shows
   the painted landscape of the player's primary apiary site. Each site
   type below is a 16:9 card with its painted scene as the background,
   a soft gradient scrim at the bottom, and the label set in IM Fell
   English across the scrim. Active sites render a paper-dim band of
   apiaries beneath; inactive sites show a soft "Establish →" prompt.

   Clicking a territory plate jumps straight into the dedicated
   per-site Handbook article (Rural Woodland, Arable Farmland, Urban
   Garden, Orchard, Moorland) — the Handbook carries the long-form
   wisdom; the Map carries the at-a-glance comparison.
   ==================================================================== */

function _ui_buildMapView() {
  var season = (typeof seasonOfWeek === 'function') ? seasonOfWeek(Game.week) : 'spring';
  var wkInYear = ((Game.week - 1) % 52) + 1;
  var apiaries = Game.apiaries || [];

  /* Each site is a small lesson — the painted plate is the hero, the
     copy teaches what the site actually means for a beekeeper. Forage,
     yield, honey character, strain affinity, and the tradition note
     give the player a reason to spend time on this page beyond just
     picking somewhere to put bees. */
  var SITE_META = {
    rural:    {
      label: 'Rural Woodland',
      honey: 'Mixed summer wildflower',
      forageNote: 'Hawthorn into bramble into lime',
      foragePeriod: 'Apr — Sep',
      yield: '20–30 kg per colony',
      strain: 'Local mongrel · Buckfast',
      tradition: 'The classic British apiary. A few hives at the edge of a wood, a hedgerow of hawthorn, clover in the meadow. Steady, dependable, never spectacular. The site real beekeepers describe with the most affection — there is always something coming into flower.',
      plate: 'img/plates/region-uk.png'
    },
    farmland: {
      label: 'Arable Farmland',
      honey: 'Oilseed rape (spring), variable later',
      forageNote: 'Oilseed rape April–May; thin afterwards',
      foragePeriod: 'Apr — early Jul',
      yield: '40–60 kg in a rape year',
      strain: 'Italian · Carniolan (fast spring build)',
      tradition: 'High early-season yield, but the rape sets rock-hard in the comb within weeks — you must extract promptly or lose the crop. After mid-summer the fields are bare and you may need to feed. A site for the active, not the leave-them-alone keeper.',
      plate: 'img/plates/site-farmland.png'
    },
    urban:    {
      label: 'Urban Garden',
      honey: 'Summer garden blend',
      forageNote: 'Lavender, lime, bramble, ivy — long tail',
      foragePeriod: 'Mar — Nov',
      yield: '15–25 kg per colony',
      strain: 'Buckfast (calm) · Local',
      tradition: 'A surprisingly forgiving site. Garden after garden of bee-friendly flora makes for a long, even season into late autumn ivy. Temperament matters — defensive bees risk neighbours. Yields are modest but the honey is distinctly floral.',
      plate: 'img/plates/site-urban.png'
    },
    orchard:  {
      label: 'Orchard',
      honey: 'Apple and pear blossom',
      forageNote: 'Fruit blossom in April, quieter after',
      foragePeriod: 'Apr — Jul',
      yield: '18–28 kg per colony',
      strain: 'Carniolan (early flow) · Buckfast',
      tradition: 'A spring site above all. Apple and pear blossom give a delicate, pale honey that commercial buyers will sometimes label by varietal. Beekeepers are often welcomed by orchard owners for pollination — sometimes free siting in exchange.',
      plate: 'img/plates/site-orchard.png'
    },
    moorland: {
      label: 'Moorland',
      honey: 'Heather (Calluna) — the premium crop',
      forageNote: 'Calluna heather, ling, bell heather',
      foragePeriod: 'Aug — early Sep',
      yield: '15–25 kg of heather honey',
      strain: 'AMM Native · Local (hardy stock)',
      tradition: 'A migration apiary. UK beekeepers haul colonies up to the moor in late July and back down a few weeks later, just for the heather flow. The honey is thixotropic — gel-like — and has to be pressed, not spun. Prices reach £20+ per jar. The premium crop of the British beekeeping year.',
      plate: 'img/plates/scene-moorland.png'
    }
  };

  /* Primary apiary — used to choose the hero plate at the top of the
     page. If the player has no apiaries yet, fall back to the rural
     scene. */
  var primaryApiary = null;
  if (apiaries.length) {
    primaryApiary = apiaries.reduce(function(best, ap) {
      var n = (typeof coloniesIn === 'function') ? coloniesIn(ap.id).length : 0;
      var bn = best ? ((typeof coloniesIn === 'function') ? coloniesIn(best.id).length : 0) : -1;
      return (!best || n > bn) ? ap : best;
    }, null);
  }
  var heroSite = primaryApiary ? primaryApiary.siteType : 'rural';
  var heroMeta = SITE_META[heroSite] || SITE_META.rural;

  /* Map territory cards — one per site type, plate as background. */
  var territoryCards = Object.keys(SITE_META).map(function(siteKey) {
    var meta = SITE_META[siteKey];
    var siteApiaries = apiaries.filter(function(ap) { return ap.siteType === siteKey; });
    var totalCols = siteApiaries.reduce(function(sum, ap) {
      return sum + ((typeof coloniesIn === 'function') ? coloniesIn(ap.id).filter(function(c) { return c.alive; }).length : 0);
    }, 0);
    var isActive = siteApiaries.length > 0;

    var apList = siteApiaries.map(function(ap) {
      var count = (typeof coloniesIn === 'function') ? coloniesIn(ap.id).filter(function(c) { return c.alive; }).length : 0;
      return h('div', { class: 'map-apiary-line' }, [
        h('span', { class: 'map-ap-dot' }),
        h('b', { class: 'map-ap-name', text: ap.name }),
        h('span', { class: 'map-ap-cols', text: count + ' colon' + (count === 1 ? 'y' : 'ies') }),
        h('button', { class: 'btn btn-xs', onclick: function() {
          Game.ui.selectedApiary = ap.id;
          Game.ui.view = 'apiary';
          render();
        } }, 'View →')
      ]);
    });

    /* Plate band: 16:9 painted scene + scrim + label across the bottom.
       Active card carries a small badge in the top-right. The whole
       band is a button — click → the per-site Handbook article
       (Rural Woodland / Arable Farmland / Urban / Orchard / Moorland). */
    var hbSite = (HANDBOOK_LINKS.sites && HANDBOOK_LINKS.sites[siteKey]) || 'apiary-site';
    var plateBand = h('button', {
      type: 'button',
      class: 'map-territory-plate plate-link' + (meta.plate ? '' : ' map-territory-plate-empty') + (isActive ? '' : ' map-territory-plate-dim'),
      style: meta.plate ? { backgroundImage: 'url("' + meta.plate + '")' } : null,
      title: 'Read about ' + meta.label + ' in the Handbook',
      onclick: function() { openHandbookArticle(hbSite); }
    }, [
      h('div', { class: 'map-territory-scrim' }),
      isActive ? h('div', { class: 'map-active-badge', text: totalCols + ' col' + (totalCols === 1 ? 'ony' : 'onies') }) : null,
      h('div', { class: 'map-territory-label' }, [
        h('div', { class: 'map-territory-title', text: meta.label }),
        h('div', { class: 'map-territory-honey', text: meta.honey })
      ]),
      h('span', { class: 'plate-link-mark', text: '✣' })
    ]);

    /* Rich body — three little facts tables + a tradition note that
       teaches the player what this site actually means for a beekeeper.
       The painted plate above carries the visual weight; this body
       carries the wisdom. */
    var facts = h('dl', { class: 'map-facts' }, [
      h('dt', {}, 'Forage'),     h('dd', { text: meta.foragePeriod + ' · ' + meta.forageNote }),
      h('dt', {}, 'Honey'),      h('dd', { text: meta.honey }),
      h('dt', {}, 'Typical yield'), h('dd', { text: meta.yield }),
      h('dt', {}, 'Best strain'),h('dd', { text: meta.strain })
    ]);
    var tradition = h('p', { class: 'map-tradition', text: meta.tradition });

    return h('div', {
      class: 'map-territory' + (isActive ? ' map-territory-active' : ' map-territory-inactive')
    }, [
      plateBand,
      h('div', { class: 'map-territory-body' }, [
        facts,
        tradition,
        isActive
          ? h('div', { class: 'map-apiaries-list' }, apList.concat([
              h('div', { class: 'map-apiary-line map-apiary-add' }, [
                h('button', { class: 'btn btn-xs', onclick: function() {
                  var r = establishApiary(siteKey);
                  toast(r.msg, r.ok ? 'good' : 'bad');
                  if (r.ok) render();
                } }, '+ Add another here')
              ])
            ]))
          : h('div', { class: 'map-empty-site' }, [
              h('span', { class: 'map-empty-note', text: 'No apiary here yet' }),
              h('button', { class: 'btn btn-sm', onclick: function() {
                var r = establishApiary(siteKey);
                toast(r.msg, r.ok ? 'good' : 'bad');
                if (r.ok) render();
              } }, 'Establish here →')
            ])
      ])
    ]);
  });

  /* Season strip — restrained ink type, no emoji as chrome (season
     name carries the weight). */
  var mo = (typeof monthOfWeek === 'function') ? monthOfWeek(wkInYear) : 0;
  var forageNote = (FORAGE && FORAGE.sources) ? FORAGE.sources[mo] : '';
  var seasonStrip = h('div', { class: 'map-season-strip ' + season }, [
    h('span', { class: 'map-season-label', text: season.charAt(0).toUpperCase() + season.slice(1) }),
    forageNote ? h('span', { class: 'map-season-forage', text: forageNote }) : null
  ]);

  /* Hero band — 16:9 painted scene of the player's main site, title
     set in IM Fell English across the bottom. */
  var heroBand = h('div', {
    class: 'map-hero',
    style: heroMeta.plate ? { backgroundImage: 'url("' + heroMeta.plate + '")' } : null
  }, [
    h('div', { class: 'map-hero-scrim' }),
    h('div', { class: 'map-hero-inner' }, [
      h('h1', { class: 'map-hero-title', text: 'Territory Map' }),
      h('div', { class: 'map-hero-sub', text: 'Your apiaries across the landscape. Each site has its own forage, honey character, and seasonal rhythm.' })
    ])
  ]);

  return h('div', { class: 'panel-view map-view' }, [
    heroBand,
    h('div', { class: 'map-content' }, [
      seasonStrip,
      h('div', { class: 'map-grid' }, territoryCards)
    ])
  ]);
}

/* Honey type color lookup by site (for map view) */
var HONEY_VISUAL_MAP = {
  rural:    { color: '#e8a820' },
  farmland: { color: '#f2ce08' },
  urban:    { color: '#e0b830' },
  orchard:  { color: '#f5e96a' },
  moorland: { color: '#8b3a1a' }
};

/* Single hive card in the painterly apiary grid.
   Compact card: painted-icon plate left, colony name (IM Fell) + one
   state line right. Dot / badge / crown / swarm strip overlay the icon.
   Click opens the existing hive-detail modal — behaviour unchanged.

   PLATE-GAP: the Phase-2 hive-state plates (hive-icon-strong / building
   / queenless / dead) are not generated yet. The card falls through to
   an IM Fell letter form on paper-dim until they land. When a plate
   exists, push an <img class="hcp-icon-img"> into the iconBlock and the
   CSS positioning is ready. */
function _ui_buildHiveCard(colony) {
  var known = colony.known;
  var curWeek = (typeof Game !== 'undefined' && Game) ? Game.week : 1;

  /* Status dot — single coloured pip in the upper-right of the icon. */
  var dotCls;
  if (!colony.alive) dotCls = 'dead';
  else if (!known || known.heftOnly) dotCls = 'unknown';
  else dotCls = known.status || 'unknown';

  /* Single state line. The "N weeks ago" age sits on the same row so
     the card has just one row of state copy. */
  var statusLine;
  if (!colony.alive) {
    statusLine = colony.deadReason ? ('Lost — ' + colony.deadReason) : 'Colony lost';
  } else if (!known || known.heftOnly) {
    statusLine = 'Not yet inspected';
  } else {
    var base = (known.populationBand
      ? known.populationBand.charAt(0).toUpperCase() + known.populationBand.slice(1)
      : (known.note || 'Inspected'));
    var ageW = colony.lastInspected > 0 ? curWeek - colony.lastInspected : -1;
    var ageSuffix = '';
    if (ageW > 0) ageSuffix = ' · ' + (ageW === 1 ? '1 week ago' : ageW + ' weeks ago');
    statusLine = base + ageSuffix;
  }

  /* Priority badge — first match wins. */
  var showBadge = false, badgeGlyph = '', badgeCls = '';
  if (colony.alive) {
    if (known && known.disease) {
      showBadge = true; badgeGlyph = '🔴'; badgeCls = 'badge-bad';
    } else if (colony.queenCells && colony.queenCells.type === 'swarm' && colony.queenCells.state === 'capped') {
      showBadge = true; badgeGlyph = '🚨'; badgeCls = 'badge-imminent';
    } else if (colony.queenCells && colony.queenCells.type === 'postSwarm' && colony.queenCells.state !== 'emerged') {
      showBadge = true; badgeGlyph = '🐝'; badgeCls = 'badge-warn';
    } else if (colony.demaree && !colony.demaree.checked && colony.demaree.age >= 1) {
      showBadge = true; badgeGlyph = '🔄'; badgeCls = 'badge-warn';
    } else if (colony.osrCrystallised) {
      showBadge = true; badgeGlyph = '🍯'; badgeCls = 'badge-bad';
    } else if ((colony.honey || 0) < 1 && (colony._starvingWeeks || 0) > 0) {
      showBadge = true; badgeGlyph = '❗'; badgeCls = 'badge-bad';
    } else if ((colony.honey || 0) < 3 && (colony._nearZeroStarvingWeeks || 0) > 0) {
      showBadge = true; badgeGlyph = '⚠️'; badgeCls = 'badge-warn';
    }
  }

  /* Inspection urgency badge (during swarm season only). */
  var inspectUrgency = null;
  var inWin = (typeof _colony_inSwarmWindow === 'function') ? _colony_inSwarmWindow(curWeek) : false;
  if (colony.alive && !colony.lastInspected && inWin) {
    inspectUrgency = h('div', {
      class: 'hive-insp-badge insp-warn',
      title: 'This colony has never been inspected — swarm season is underway'
    }, '!');
  } else if (colony.alive && colony.lastInspected > 0 && inWin) {
    var weeksSince = curWeek - colony.lastInspected;
    if (weeksSince >= 1) {
      var daysSince = weeksSince * 7;
      var urgCls = weeksSince >= 2 ? 'insp-urgent' : 'insp-warn';
      inspectUrgency = h('div', {
        class: 'hive-insp-badge ' + urgCls,
        title: daysSince + ' days since last inspection'
      }, daysSince + 'd');
    }
  }

  /* Queen-cell crown — subtle painted mark above the icon. */
  var qcellCrown = null;
  if (colony.alive && known && known.queenCells && known.queenCells !== 'none') {
    qcellCrown = h('div', { class: 'hive-qcell-crown', title: 'Queen cells seen — check swarm control' }, '◆');
  }

  /* Swarm pressure strip — bottom edge of the card. */
  var swarmStrip = null;
  if (colony.alive) {
    var sp = colony.swarmPressure || 0;
    if (inWin && sp > 0.2) {
      var spColor = sp > 0.65 ? '#c03030' : sp > 0.4 ? '#d4820a' : '#4a9e5c';
      swarmStrip = h('div', {
        class: 'hive-swarm-strip',
        title: 'Swarm pressure: ' + Math.round(sp * 100) + '%',
        style: { '--sp': Math.round(sp * 100) + '%', '--spc': spColor }
      });
    }
  }

  /* Painted hive icon. The hive-state plates carry the state visually;
     the dot/badge/queen-cell crown overlay precise alerts on top. */
  var iconState = !colony.alive ? 'dead'
    : (known && known.disease) ? 'disease'
    : (!known || known.heftOnly) ? 'unknown'
    : 'strong';
  /* Pick the painted plate by state. Building / strong / queenless / dead
     are all generated; disease & unknown fall back to building (a healthy-
     looking colony before more info). */
  var platePath = 'img/plates/hive-state-' + (
    iconState === 'dead' ? 'dead' :
    iconState === 'disease' ? 'queenless' :
    iconState === 'unknown' ? 'building' :
    'strong'
  ) + '.png';
  var iconBlock = h('div', { class: 'hcp-icon hcp-icon-state-' + iconState }, [
    h('img', { class: 'hcp-icon-img', src: platePath, alt: '' }),
    h('div', { class: 'hive-dot ' + dotCls }),
    showBadge ? h('div', { class: 'hive-badge ' + badgeCls }, badgeGlyph) : null,
    inspectUrgency,
    qcellCrown
  ]);

  var statusBadge = _ui_buildStatusBadge(colony);

  var hiveCls = 'hive hive-card';
  if (!colony.alive) hiveCls += ' is-dead';
  if (known && known.disease) hiveCls += ' has-disease';

  return h('div', {
    class: hiveCls,
    onclick: function() { openHiveDetail(colony); }
  }, [
    iconBlock,
    h('div', { class: 'hcp-body' }, [
      h('div', { class: 'hcp-name-row' }, [
        h('span', { class: 'hcp-name', text: colony.name }),
        statusBadge
      ]),
      h('div', { class: 'hcp-state', text: statusLine })
    ]),
    swarmStrip
  ]);
}

/* Engagement update — living apiary scene: animated bee dots / winter cluster */
function _ui_buildHiveScene(colony, week) {
  var wkInYr = ((week - 1) % 52) + 1;
  var isWinter = (wkInYr >= 44 || wkInYr <= 8);
  var forage = (typeof forageNectar === 'function') ? forageNectar(week) : 0.5;
  var popFraction = Math.min(1, (colony.population || 0) / (SIM.fullColonyPop || 21000));
  var layers = [];

  if (!isWinter && forage > 0.1 && colony.alive !== false) {
    var dotCount = Math.round(popFraction * forage * 5);
    for (var i = 0; i < dotCount; i++) {
      var delay = (i * 0.8).toFixed(1);
      var dur = (2.5 + (i % 3) * 0.7).toFixed(1);
      var dx = (25 + (i * 13) % 40);
      var dy = -(15 + (i * 7) % 25);
      if (i % 2 === 0) dx = -dx;
      layers.push(h('div', {
        class: 'bee-dot',
        style: 'animation-delay:' + delay + 's;animation-duration:' + dur + 's;--dx:' + dx + 'px;--dy:' + dy + 'px'
      }));
    }
  }

  if (isWinter && colony.alive !== false) {
    var sz = Math.max(16, Math.round(popFraction * 38));
    layers.push(h('div', {
      class: 'winter-cluster',
      style: 'width:' + sz + 'px;height:' + sz + 'px'
    }));
  }

  return h('div', { class: 'hive-scene' }, layers);
}

/* Engagement update — status badge: text + colour, accessible */
function _ui_buildStatusBadge(colony) {
  if (!colony.alive) return null;
  var cls = 'ok', glyph = '✓';
  var advItems = (Game.advisor || []).filter(function(a) {
    return a.text && a.text.indexOf(colony.name) === 0 && (a.tone === 'bad' || a.tone === 'warn');
  });
  var pop = colony.population || 0;
  var maxPop = SIM.fullColonyPop || 21000;
  var wkInYr = ((Game.week - 1) % 52) + 1;
  var isWinter = wkInYr >= 44 || wkInYr <= 8;
  var diseaseOn = false;
  if (colony.diseases) {
    var dk = Object.keys(colony.diseases);
    for (var i = 0; i < dk.length; i++) {
      if ((colony.diseases[dk[i]] || 0) > 0.15) { diseaseOn = true; break; }
    }
  }
  var varroaRate = (typeof varroaInfestation === 'function') ? varroaInfestation(colony) : 0;
  var lowWinterStores = isWinter && (colony.honey || 0) < 8;

  if (diseaseOn || varroaRate > 0.03 || lowWinterStores) {
    cls = 'bad'; glyph = '!!';
  } else if (advItems.length > 0) {
    cls = 'warn'; glyph = '!';
  } else if (pop > maxPop * 0.3) {
    cls = 'ok'; glyph = '✓';
  } else {
    cls = 'warn'; glyph = '!';
  }
  return h('span', { class: 'hive-status-badge ' + cls, title: cls === 'ok' ? 'Healthy' : cls === 'warn' ? 'Needs attention' : 'Urgent' }, glyph);
}

/* ====================================================================
   SIDEBAR (time controls, mentor, advisor)
   ==================================================================== */

function _ui_buildSidebar() {
  var advisor = Game.advisor || [];

  /* Mentor speaks the single most pressing thing */
  var top = null;
  for (var i = 0; i < advisor.length; i++) { if (advisor[i].tone === 'bad') { top = advisor[i]; break; } }
  if (!top) { for (var j = 0; j < advisor.length; j++) { if (advisor[j].tone === 'warn') { top = advisor[j]; break; } } }

  var mentorText, mentorTone;
  if (top) {
    mentorText = top.text;
    mentorTone = top.tone;
  } else {
    var ml = (typeof mentorLine === 'function') ? mentorLine() : null;
    mentorText = ml || 'All looks well at the apiary. Enjoy a calm week — keep half an eye on the season ahead.';
    mentorTone = 'ok';
  }

  /* Mentor portrait — the painted portrait of the apiary mentor sits
     inside an ink-bordered paper-dim frame. The painting is the
     voice of mentorLine(). */
  var mentorBlock = h('div', { class: 'mentor mentor-card tone-' + mentorTone }, [
    h('div', { class: 'mentor-face' },
      h('img', { class: 'mentor-portrait-img', src: 'img/plates/mentor-portrait.png', alt: '' })),
    h('div', { class: 'mentor-bubble' }, [
      h('div', { class: 'mentor-who' }, 'Your mentor'),
      h('div', { class: 'mentor-text', text: mentorText })
    ])
  ]);

  /* Year-on-year line — a calm one-sentence reminder that wisdom is
     accumulating. Only renders in spring of year 2+; rest of the time
     it returns null and we skip the node entirely. */
  var yoyBlock = null;
  if (typeof getYearOnYearLine === 'function') {
    var yoy = getYearOnYearLine();
    if (yoy) yoyBlock = h('div', { class: 'year-on-year' }, yoy);
  }

  /* === Winter Letter — surfaces in the apiary view during the dormant
     months. The real beekeeping experience of January: nothing to do,
     much to know. Gives the player something specific to anticipate
     and pulls them back to spring rather than letting the dormancy
     period silently end the session. */
  var winterLetterBlock = null;
  if (typeof buildWinterLetter === 'function') {
    var letter = buildWinterLetter();
    if (letter) {
      var lineNodes = letter.lines.map(function (l) {
        return h('div', { class: 'wl-colony' }, [
          h('div', { class: 'wl-name' }, l.name),
          h('div', { class: 'wl-meta' }, l.meta),
          h('div', { class: 'wl-antic' }, l.anticipation),
        ]);
      });
      winterLetterBlock = h('div', { class: 'winter-letter' }, [
        h('div', { class: 'wl-head' }, [
          h('span', { class: 'wl-ico' }, '✉️'),
          h('span', { class: 'wl-when' }, letter.when),
        ]),
        h('div', { class: 'wl-body' }, lineNodes),
        h('div', { class: 'wl-closing' }, letter.closing),
      ]);
    }
  }

  /* Guided action items — urgency-ranked, click-to-open-colony where possible */
  var notes = advisor.filter(function(a) { return a !== top; });
  var actionItems;
  if (!notes.length) {
    /* Don't say "on top of things" when the mentor just raised a crisis.
       Calibrate the empty message to what the mentor is actually saying. */
    var _emptyMsg;
    if (top && top.tone === 'bad') {
      _emptyMsg = 'Handle the urgent item above first — nothing else flagged.';
    } else if (top && top.tone === 'warn') {
      _emptyMsg = 'Watch the note above. Otherwise looking steady.';
    } else {
      _emptyMsg = 'No flags — you\'re on top of things.';
    }
    actionItems = [h('div', { class: 'advisor-empty' }, _emptyMsg)];
  } else {
    actionItems = notes.map(function(item) {
      /* Try to match a colony by name appearing at the start of the text */
      var matchCol = null;
      var colonies = Game.colonies || [];
      for (var ci = 0; ci < colonies.length; ci++) {
        if (colonies[ci].alive && item.text && item.text.indexOf(colonies[ci].name) === 0) {
          matchCol = colonies[ci];
          break;
        }
      }

      var urgencyLabel = { bad: 'Urgent', warn: 'Soon', info: 'Note', ok: 'Good' }[item.tone] || 'Note';
      var urgencyRow = h('div', { class: 'action-urgency ' + (item.tone || 'info') }, [
        h('span', { class: 'ico' }, item.icon || ''),
        h('span', { class: 'urgency-label' }, urgencyLabel)
      ]);

      var openBtn = matchCol ? _ui_advisorActionButton(item, matchCol) : null;

      return h('div', { class: 'action-item tone-' + (item.tone || 'info') }, [
        urgencyRow,
        h('div', { class: 'action-text', text: item.text }),
        openBtn
      ]);
    });
  }

  /* Engagement update — advance button urgency:
     pulse + amber when 2+ alive colonies have advisor items needing attention */
  var _urgentCount = 0;
  if (Array.isArray(Game.advisor)) {
    var _flagged = {};
    Game.advisor.forEach(function(a) {
      if (a.tone === 'bad' || a.tone === 'warn') {
        var cols = Game.colonies || [];
        for (var ci = 0; ci < cols.length; ci++) {
          if (cols[ci].alive && a.text && a.text.indexOf(cols[ci].name) === 0) {
            _flagged[cols[ci].name] = true;
            break;
          }
        }
      }
    });
    _urgentCount = Object.keys(_flagged).length;
  }
  var _advBtnCls = 'btn btn-primary btn-advance' + (_urgentCount >= 2 ? ' urgent' : '');
  var advanceBtn = h('button', {
    class: _advBtnCls,
    onclick: function() { if (typeof advanceWeek === 'function') advanceWeek(); }
  }, '+ Advance one week (7 days)');

  var skipBtn = h('button', {
    class: 'btn',
    onclick: function() { _ui_advanceToEvent(); }
  }, 'Skip to next event');

  return h('div', { class: 'apiary-side' }, [
    winterLetterBlock,
    yoyBlock,
    mentorBlock,
    h('div', { class: 'side-section' }, [
      h('div', { class: 'side-head' }, [
        h('span', { text: 'Action list' }),
        notes.length > 0 ? h('span', { class: 'action-count tone-' + (top ? top.tone : 'ok') }, String(notes.length)) : null
      ]),
      h('div', { class: 'side-body action-list' }, actionItems)
    ]),
    h('div', { class: 'time-controls' }, [advanceBtn, skipBtn])
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

/* Plate-path lookup tables for the redesigned market cards. A null /
   missing entry tells the renderer to gracefully omit the plate. */
var MARKET_PLATES = {
  bees: {
    'nuc':           'img/plates/bee-local-mongrel.png',
    'nuc-italian':   'img/plates/bee-italian-queen.png',
    'nuc-carniolan': 'img/plates/bee-carniolan-queen.png',
    'nuc-buckfast':  'img/plates/bee-buckfast-queen.png',
    'nuc-native':    'img/plates/bee-amm-native.png',
    'colony':        'img/plates/bee-local-mongrel.png',  /* placeholder */
    'matedqueen':    'img/plates/bee-local-mongrel.png'
  },
  /* Hive-class kit. Use the painted hive-state plates as proxies until
     dedicated equipment portraits exist. */
  hives: {
    'hive':     'img/plates/hive-state-strong.png',  /* National hive — strong state stands in */
    'nucbox':   'img/plates/tool-nucleus-box.png',
    'baithive': 'img/plates/tool-bait-hive.png'
  },
  tools: {
    'suit':          'img/plates/tool-suit.png',
    'smoker':        'img/plates/tool-smoker.png',
    'extractor':     'img/plates/tool-extractor.png',
    'hiveTool':      'img/plates/tool-hive-tool.png',
    'clearerBoard':  'img/plates/tool-clearer-board.png',
    'refractometer': 'img/plates/tool-refractometer.png',
    'gloves':        'img/plates/tool-gloves.png',
    'settlingTank':  'img/plates/tool-settling-tank.png',
    'uncappingKit':  'img/plates/tool-uncapping-kit.png'
  },
  /* Keys MUST match CATALOG.supplies item ids exactly (sugarbag, jarpack,
     broodBox, super, queenExcluder, newspaper) so buyCard(item.id, ...)
     inside _ui_marketSuppliesTab finds the right plate. Treatment ids
     (apiguard, formic, apivar, oxalicVap, oxalicTrickle) all share the
     varroa-treatment plate. */
  supplies: {
    'sugarbag':        'img/plates/supplies-sugar.png',
    'jarpack':         'img/plates/supplies-jars.png',
    'broodBox':        'img/plates/supplies-brood-box.png',
    'super':           'img/plates/frame-super.png',
    'queenExcluder':   'img/plates/tool-queen-excluder.png',
    'newspaper':       'img/plates/supplies-newspaper.png',
    'foundation':      'img/plates/supplies-foundation.png',
    'frames':          'img/plates/supplies-foundation.png',
    'apiguard':        'img/plates/supplies-varroa-treatment.png',
    'formic':          'img/plates/supplies-varroa-treatment.png',
    'apivar':          'img/plates/supplies-varroa-treatment.png',
    'oxalicVap':       'img/plates/supplies-varroa-treatment.png',
    'oxalicTrickle':   'img/plates/supplies-varroa-treatment.png'
  },
  neighbours: {
    'scene':           'img/plates/scene-neighbours.png'
  },
  /* Forage plates lead the Sell cards. Phase 1 has hawthorn/lime/heather/
     ivy/oilseed-rape/dandelion — the rest fall back to dandelion (closest
     match: a mixed wildflower image) or render plain. */
  honey: {
    'spring':  'img/plates/forage-hawthorn.png',
    'oilseed': 'img/plates/forage-oilseed-rape.png',
    'summer':  'img/plates/forage-dandelion.png',     /* placeholder until clover/bramble */
    'lime':    'img/plates/forage-lime.png',
    'heather': 'img/plates/forage-heather.png',
    'ivy':     'img/plates/forage-ivy.png',
    'borage':  null
  },
  sites: {
    'rural':    'img/plates/region-uk.png',
    'moorland': 'img/plates/scene-moorland.png',
    'farmland': 'img/plates/site-farmland.png',
    'urban':    'img/plates/site-urban.png',
    'orchard':  'img/plates/site-orchard.png'
  }
};

/* Handbook deep-link map. Catalog item id → handbook article id (the
   `id` field inside ENCYCLOPEDIA, not the array index). Plates rendered
   on the market/map/apiary surfaces use this to wire themselves up as
   little hyperlinks into the codex. */
var HANDBOOK_LINKS = {
  bees: {
    'nuc':           'first-bees',
    'nuc-italian':   'first-bees',
    'nuc-carniolan': 'first-bees',
    'nuc-buckfast':  'first-bees',
    'nuc-native':    'first-bees',
    'colony':        'first-bees',
    'matedqueen':    'queen-life'
  },
  hives: {
    'hive':     'national-hive',
    'nucbox':   'hive-types',
    'baithive': 'catching-swarms'
  },
  tools: {
    'suit':          'tools-kit',
    'smoker':        'tools-kit',
    'hiveTool':      'tools-kit',
    'gloves':        'tools-kit',
    'clearerBoard':  'harvesting',
    'extractor':     'extracting',
    'settlingTank':  'extracting',
    'refractometer': 'extracting',
    'uncappingKit':  'extracting'
  },
  supplies: {
    'sugarbag':        'year-winter',
    'jarpack':         'selling-honey',
    'broodBox':        'national-hive',
    'super':           'national-hive',
    'queenExcluder':   'national-hive',
    'newspaper':       'uniting',
    'foundation':      'frames-comb',
    'frames':          'frames-comb',
    'apiguard':        'varroa-treat',
    'formic':          'varroa-treat',
    'apivar':          'varroa-treat',
    'oxalicVap':       'varroa-treat',
    'oxalicTrickle':   'varroa-treat'
  },
  sites: {
    'rural':    'site-rural',
    'farmland': 'site-farmland',
    'urban':    'site-urban',
    'orchard':  'site-orchard',
    'moorland': 'site-moorland'
  },
  season: {
    'spring': 'year-spring',
    'summer': 'year-summer',
    'autumn': 'year-autumn',
    'winter': 'year-winter'
  }
};

/* Open a handbook article by its `id` field. Resolves the array index
   inside ENCYCLOPEDIA, sets the module-level selection, switches the
   view to the handbook, and forces a render. Used by plate-link
   onclicks across the app. */
function openHandbookArticle(articleId) {
  if (!articleId) return;
  var enc = (typeof window !== 'undefined' && window.ENCYCLOPEDIA) || [];
  var idx = null;
  for (var i = 0; i < enc.length; i++) {
    if (enc[i] && enc[i].id === articleId) { idx = String(i); break; }
  }
  if (idx !== null) {
    _ui_handbookSelected = idx;
    _ui_handbookGlossary = false;
    _ui_handbookSearch = '';
    _ui_handbookTocOpen = false;
  }
  if (typeof Game !== 'undefined' && Game.ui) Game.ui.view = 'handbook';
  if (typeof render === 'function') render();
}

/* Build a square or 16:9 plate <img> for the painted card header.
   Returns null when no plate is mapped, so the caller can omit it
   cleanly. When `handbookId` is given the plate becomes a button that
   opens the matching handbook article — a small ✣ mark sits in the
   corner so the affordance is visible. */
function _ui_plateImg(src, alt, aspect, handbookId) {
  if (!src) return null;
  var classes = 'plate-frame' + (aspect === '16x9' ? ' plate-16x9' : ' plate-1x1');
  var img = h('img', { class: 'plate-img', src: src, alt: alt || '', loading: 'lazy' });
  if (handbookId) {
    return h('button', {
      type: 'button',
      class: classes + ' plate-link',
      title: 'Read about this in the Handbook',
      onclick: function(ev) {
        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
        openHandbookArticle(handbookId);
      }
    }, [ img, h('span', { class: 'plate-link-mark', text: '✣' }) ]);
  }
  return h('div', { class: classes }, [ img ]);
}

function _ui_buildMarketView() {
  var tabs = [
    { key: 'bees',       label: 'Bees' },
    { key: 'hives',      label: 'Hives' },
    { key: 'tools',      label: 'Tools' },
    { key: 'supplies',   label: 'Supplies' },
    { key: 'sell',       label: 'Sell' },
    { key: 'apiaries',   label: 'Apiaries' },
    { key: 'neighbours', label: 'Neighbours' }
  ];
  var tabBtns = tabs.map(function(t) {
    return h('button', {
      class: 'market-tab' + (_ui_marketTab === t.key ? ' active' : ''),
      onclick: function() { _ui_marketTab = t.key; render(); }
    }, t.label);
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
  } else if (_ui_marketTab === 'neighbours') {
    content = _ui_marketNeighboursTab();
  } else {
    /* Filter the Bees catalogue by the strains available in the
       player's region. UK v1 ships all five (local, italian,
       carniolan, buckfast, native); other regions will surface
       different stock when they unlock. */
    var availStrains = (REGIONS[Game.region] && REGIONS[Game.region].availableStrains) || ['local'];
    content = _ui_marketBuyTab('Bees and colonies',
      CATALOG.bees.filter(function(b) {
        if (b.id === 'matedqueen') return false;
        /* Full colony + plain nuc carry strain='local' so they pass
           through anywhere the local strain is available. */
        if (!b.strain) return true;
        return availStrains.indexOf(b.strain) !== -1;
      }), 'bees');
  }

  return h('div', { class: 'panel-view narrow market-view' }, [
    h('div', { class: 'page-title' }, 'Market'),
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

/* A buy tab: a section heading + a grid of painted plate cards. */
function _ui_marketBuyTab(title, items, category) {
  var cards = (items || []).map(function(item) { return _ui_plateCard(item, category); });
  return h('div', {}, [
    h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, title),
      h('div', { class: 'plate-grid' }, cards)
    ])
  ]);
}

/* Painted plate card: square plate at the top, name + description below,
   price + Buy/Owned action on the right. The card stays clickable target
   the whole way; the Buy button sits inside its own zone, never on the
   plate. */
function _ui_plateCard(item, category) {
  var owned = (category === 'tools' && Game.inventory && Game.inventory.tools &&
               !!Game.inventory.tools[item.id]);
  var lookup = MARKET_PLATES[category] || {};
  var platePath = lookup[item.id] || null;
  var hbLookup = HANDBOOK_LINKS[category] || {};
  var hbId = hbLookup[item.id] || null;
  var plate = _ui_plateImg(platePath, item.name, '1x1', hbId);

  var action;
  if (owned) {
    action = h('span', { class: 'plate-owned', text: 'Owned' });
  } else {
    action = h('button', {
      class: 'plate-buy',
      onclick: function() {
        var r = buyFromCatalog(category, item.id, 1);
        toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) {
          if (category === 'bees' && typeof Game !== 'undefined' && Game.ui) {
            Game.ui.view = 'apiary';
          }
          render();
        }
      }
    }, [ h('span', { class: 'plate-buy-label' }, 'Buy'),
         h('span', { class: 'plate-price' }, fmtMoney(item.price)) ]);
  }

  return h('div', { class: 'plate-card' + (plate ? '' : ' no-plate') }, [
    plate,
    h('div', { class: 'plate-body' }, [
      h('div', { class: 'plate-name' }, item.name),
      item.desc ? h('div', { class: 'plate-desc' }, item.desc) : null,
      h('div', { class: 'plate-foot' }, action)
    ])
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
    ['Bait hives', String(inv.baitHives || 0)],
    ['Sugar', (inv.sugar || 0) + ' kg'],
    ['Empty jars', String(inv.emptyJars || 0)],
    ['Treatments', String(treatTotal)],
    ['Supers', String(inv.supers || 0)],
    ['Queen excl.', String(inv.queenExcluders || 0)],
    ['Newspaper', String(inv.newspaper || 0)],
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
  /* A supplies plate-card: no plate yet for sugar/jars/etc., so the
     cards lean on type + name + held + price. When Phase-2 supply plates
     exist they'll slot into MARKET_PLATES.supplies and appear here. */
  var SUPPLY_PLATES = MARKET_PLATES.supplies || {};
  var SUPPLY_HB = HANDBOOK_LINKS.supplies || {};
  function buyCard(itemId, name, desc, held, price, onBuy) {
    var plate = _ui_plateImg(SUPPLY_PLATES[itemId] || null, name, '1x1', SUPPLY_HB[itemId] || null);
    return h('div', { class: 'plate-card' + (plate ? '' : ' no-plate') }, [
      plate,
      h('div', { class: 'plate-body' }, [
        h('div', { class: 'plate-name' }, name),
        desc ? h('div', { class: 'plate-desc' }, desc) : null,
        held ? h('div', { class: 'plate-held', text: 'In stock: ' + held }) : null,
        h('div', { class: 'plate-foot' }, h('button', {
          class: 'plate-buy',
          onclick: function() {
            var r = onBuy();
            toast(r.msg, r.ok ? 'good' : 'bad');
            if (r.ok) render();
          }
        }, [ h('span', { class: 'plate-buy-label' }, 'Buy'),
             h('span', { class: 'plate-price' }, fmtMoney(price)) ]))
      ])
    ]);
  }

  var feedCards = (CATALOG.supplies || []).map(function(item) {
    var held = item.id === 'sugarbag'       ? ((inv.sugar || 0) + ' kg of sugar')
             : item.id === 'jarpack'        ? ((inv.emptyJars || 0) + ' empty jars')
             : item.id === 'super'          ? ((inv.supers || 0) + ' in stock')
             : item.id === 'queenExcluder'  ? ((inv.queenExcluders || 0) + ' in stock')
             : item.id === 'newspaper'      ? ((inv.newspaper || 0) + ' sheets in stock')
             : null;
    return buyCard(item.id, item.name, item.desc, held, item.price,
      (function(id) { return function() { return buySupply(id, 1); }; })(item.id));
  });

  var treatCards = Object.keys(TREATMENTS).map(function(id) {
    var t = TREATMENTS[id];
    var n = (inv.treatStock || {})[id] || 0;
    var held = n + (n === 1 ? ' treatment' : ' treatments');
    return buyCard(id, t.name, t.note, held, t.price,
      (function(tid) { return function() { return buySupply(tid, 1); }; })(id));
  });

  /* === Extract & Bottle section === */
  var honeyInv = inv.honey || {};
  var honeyTypes = Object.keys(honeyInv).filter(function(t) { return (honeyInv[t] || 0) >= 0.01; });
  var KG_PER_JAR = 0.34;
  var emptyJars = inv.emptyJars || 0;

  var bottleSection;
  if (honeyTypes.length === 0) {
    bottleSection = h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Extract & Bottle'),
      h('p', { class: 'market-section-blurb',
        text: 'No bulk honey yet. Inspect a hive when the supers are heavy, then use the Harvest action to bring the honey in.' })
    ]);
  } else {
    var bottleRows = honeyTypes.map(function(ht) {
      var kgAvail = honeyInv[ht] || 0;
      var maxJars = (ht === 'heather')
        ? Math.floor(kgAvail * 0.70 / KG_PER_JAR)
        : Math.floor(kgAvail / KG_PER_JAR);
      var htInfo = (typeof HONEY_TYPES !== 'undefined' && HONEY_TYPES[ht]) || {};
      var htName = htInfo.name || ht;

      var input = h('input', {
        type: 'number',
        class: 'bottle-input',
        value: String(Math.min(maxJars, emptyJars)),
        min: '1',
        max: String(Math.min(maxJars, emptyJars))
      });

      var btn = h('button', {
        class: 'plate-buy plate-buy-compact',
        text: 'Bottle',
        onclick: function() {
          var n = parseInt(input.value, 10) || 0;
          if (n < 1) { toast('Enter at least 1 jar.', 'bad'); return; }
          var r = (typeof extractAndBottle === 'function')
            ? extractAndBottle(ht, n)
            : { ok: false, msg: 'extractAndBottle not loaded.' };
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) render();
        }
      });
      if (maxJars < 1 || emptyJars < 1) btn.disabled = true;

      var jarNote = emptyJars < 1
        ? 'No empty jars — buy a jar pack below.'
        : maxJars < 1
          ? 'Not enough honey for even one jar.'
          : 'Up to ' + Math.min(maxJars, emptyJars) + ' jar' + (Math.min(maxJars, emptyJars) === 1 ? '' : 's') + ' (you have ' + emptyJars + ' empty jar' + (emptyJars === 1 ? '' : 's') + ')';

      return h('div', { class: 'bottle-row' }, [
        h('div', { class: 'bottle-meta' }, [
          h('b', { text: htName }),
          h('span', { class: 'bottle-kg', text: kgAvail.toFixed(2) + ' kg bulk' }),
          h('span', { class: 'bottle-note', text: jarNote })
        ]),
        h('div', { class: 'bottle-controls' }, [input, btn])
      ]);
    });

    bottleSection = h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Extract & Bottle'),
      h('p', { class: 'market-section-blurb' },
        'Turn bulk honey into jars ready to sell. Each 227g jar takes ' + KG_PER_JAR + ' kg of honey. ' +
        (typeof Game !== 'undefined' && !(Game.inventory.tools && Game.inventory.tools.extractor)
          ? 'You\'ll hire the association extractor (' + fmtMoney(typeof COSTS !== 'undefined' ? COSTS.extractorHire : 15) + ' per session).'
          : 'Your extractor is ready.')),
      h('div', { class: 'bottle-list' }, bottleRows)
    ]);
  }

  return h('div', {}, [
    h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Feeding and bottling'),
      h('p', { class: 'market-section-blurb',
        text: 'Buy sugar for syrup and jars for your honey. Feeding and bottling draw on this stock.' }),
      h('div', { class: 'plate-grid' }, feedCards)
    ]),
    bottleSection,
    h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Varroa treatments'),
      h('p', { class: 'market-section-blurb',
        text: 'Keep a treatment in stock so you can act the moment the honey crop is off.' }),
      h('div', { class: 'plate-grid' }, treatCards)
    ])
  ]);
}

/* ====================================================================
   NEIGHBOURS tab — NPC marketplace ads. A painted hero plate frames
   the page so it carries the same painterly weight as the rest of
   the Market, even when the ads list is empty. Real-player ads will
   slot into the same plumbing when multiplayer ships.
   ==================================================================== */
function _ui_marketNeighboursTab() {
  var ads = (Game.marketplaceAds || []).slice();
  ads.sort(function (a, b) { return b.postedWeek - a.postedWeek; });

  var heroPlate = (MARKET_PLATES.neighbours && MARKET_PLATES.neighbours.scene) || null;
  var hero = h('div', {
    class: 'neigh-hero',
    style: heroPlate ? { backgroundImage: 'url("' + heroPlate + '")' } : null
  }, [
    h('div', { class: 'neigh-hero-scrim' }),
    h('div', { class: 'neigh-hero-inner' }, [
      h('h2', { class: 'neigh-hero-title', text: 'Neighbours' }),
      h('div', { class: 'neigh-hero-sub',
        text: 'Other beekeepers in your area sometimes have surplus kit, spare nucs in spring, or sugar to clear out. Ads run for three weeks.' })
    ])
  ]);

  var body;
  if (!ads.length) {
    body = h('div', { class: 'neigh-empty' }, [
      h('p', { class: 'neigh-empty-line',
        text: 'No ads from neighbours this week.' }),
      h('p', { class: 'neigh-empty-sub',
        text: 'They post when they have surplus kit or spare nucs — call back in a week or two.' })
    ]);
  } else {
    var rows = ads.map(function (ad) {
      var weeksLeft = 3 - (Game.week - ad.postedWeek);
      var badge = ad.isColony
        ? h('span', { class: 'neigh-strain-pill' },
            (HIVE_STRAINS && HIVE_STRAINS[ad.strain] && HIVE_STRAINS[ad.strain].short || 'Local'))
        : null;
      return h('div', { class: 'neigh-ad' }, [
        h('div', { class: 'neigh-seller', text: ad.seller }),
        h('div', { class: 'neigh-ad-head' }, [
          h('div', { class: 'neigh-name' }, [ ad.name, badge ]),
          h('span', { class: 'neigh-price' }, '£' + ad.price)
        ]),
        h('div', { class: 'neigh-meta' },
          (weeksLeft <= 0 ? 'Closing today' : (weeksLeft + ' week' + (weeksLeft === 1 ? '' : 's') + ' left'))),
        h('div', { class: 'neigh-desc', text: ad.desc }),
        h('div', { class: 'neigh-actions' }, [
          h('button', {
            class: 'plate-buy plate-buy-compact',
            onclick: function () {
              var r = buyMarketplaceAd(ad.id);
              toast(r.msg, r.ok ? 'good' : 'bad');
              if (r.ok) render();
            }
          }, 'Buy from neighbour')
        ])
      ]);
    });
    body = h('div', { class: 'neigh-list' }, rows);
  }

  return h('div', {}, [
    h('div', { class: 'market-section' }, [
      hero,
      body
    ])
  ]);
}

/* The Apiaries tab — a thin pointer-card. The Map view owns
   everything to do with apiaries (the territory grid, site dossiers,
   establishing new sites). Keeping the Apiaries tab in the Market
   strip would duplicate that, so it forwards to the Map. */
function _ui_marketApiariesTab() {
  var siteLookup = MARKET_PLATES.sites || {};
  var heroPlate = siteLookup.rural || 'img/plates/region-uk.png';
  var apiaryCount = (Game.apiaries || []).length;
  var siteCount = (function() {
    var s = {};
    (Game.apiaries || []).forEach(function(ap) { s[ap.siteType] = 1; });
    return Object.keys(s).length;
  })();

  var meta = apiaryCount
    ? (apiaryCount + ' apiar' + (apiaryCount === 1 ? 'y' : 'ies') +
       ' across ' + siteCount + ' site type' + (siteCount === 1 ? '' : 's'))
    : 'No apiaries set up yet.';

  return h('div', {}, [
    h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Apiaries are managed from the Map'),
      h('p', { class: 'market-section-blurb' },
        'Apiaries live on the Map. Each territory there shows you what forage that site offers, what honey it produces and which colonies you already have there. Establish new sites from the same screen.'),
      h('div', { class: 'site-card' }, [
        _ui_plateImg(heroPlate, 'Your territory', '16x9'),
        h('div', { class: 'site-body' }, [
          h('div', { class: 'site-name' }, 'Open the Map'),
          h('div', { class: 'site-meta', text: meta }),
          h('div', { style: { marginTop: '12px' } }, [
            h('button', {
              class: 'plate-buy plate-buy-wide',
              onclick: function() {
                Game.ui.view = 'map';
                render();
              }
            }, [
              h('span', { class: 'plate-buy-label' }, 'Go to the Map →')
            ])
          ])
        ])
      ])
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

  /* Honey type visual characteristics — color swatch + special handling notes */
  var HONEY_VISUAL = {
    spring:   { color: '#f5e96a', note: null },
    oilseed:  { color: '#f2ce08', note: 'Sets fast — bottle within 5-6 weeks of extraction' },
    summer:   { color: '#e8a820', note: null },
    lime:     { color: '#d8de50', note: null },
    borage:   { color: '#f0d060', note: null },
    heather:  { color: '#8b3a1a', note: 'Thixotropic — must be pressed, not spun' },
    ivy:      { color: '#2a2010', note: 'Dark and bitter. Niche market — price accordingly' }
  };

  var honeyPlates = MARKET_PLATES.honey || {};
  var jarCards = [];
  Object.keys(HONEY_TYPES).forEach(function(htId) {
    var count = jars[htId] || 0;
    if (count <= 0) return;
    var ht = HONEY_TYPES[htId];
    var vis = HONEY_VISUAL[htId] || { color: '#e8a820', note: null };
    var ch = SALES[best];
    var price = (typeof marketPrice === 'function') ? marketPrice(htId, best) : ht.value;
    var batch = Math.min(count, ch.capacity);
    var plate = _ui_plateImg(honeyPlates[htId] || null, ht.name, '1x1');
    var notes = [];
    if (batch < count) {
      notes.push(h('div', { class: 'plate-note', text: 'Channel capacity: ' + batch + ' jars this sale (' + (count - batch) + ' remaining)' }));
    }
    if (vis.note) {
      notes.push(h('div', { class: 'plate-note plate-note-warn', text: vis.note }));
    }
    jarCards.push(h('div', { class: 'plate-card honey-card' + (plate ? '' : ' no-plate') }, [
      plate,
      h('div', { class: 'plate-body' }, [
        h('div', { class: 'plate-name' }, [
          ht.name,
          h('span', { class: 'honey-swatch', style: { background: vis.color } })
        ]),
        h('div', { class: 'plate-desc' },
          count + ' jar' + (count !== 1 ? 's' : '') + ' — ' + fmtMoney(price) + ' each via ' + ch.name),
        notes.length ? h('div', { class: 'plate-notes' }, notes) : null,
        h('div', { class: 'plate-foot' }, h('button', {
          class: 'plate-buy',
          onclick: function() {
            var r = sellHoney(best, htId, batch);
            toast(r.msg, r.ok ? 'good' : 'bad');
            if (r.ok) render();
          }
        }, [ h('span', { class: 'plate-buy-label' }, 'Sell ' + batch),
             h('span', { class: 'plate-price' }, fmtMoney(price * batch)) ]))
      ])
    ]));
  });
  if (!jarCards.length) {
    jarCards.push(h('p', { class: 'market-section-blurb',
      text: 'No jars ready yet. Inspect a hive, use its Harvest action, then bottle the honey.' }));
  }
  cards.push(h('div', { class: 'market-section' }, [
    h('div', { class: 'market-section-head' }, 'Sell honey'),
    h('div', { class: 'plate-grid' }, jarCards)
  ]));

  var wax = inv.wax || 0;
  if (wax >= 0.3) {
    cards.push(h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Sell wax'),
      h('div', { class: 'plate-grid' }, [
        h('div', { class: 'plate-card no-plate' }, [
          h('div', { class: 'plate-body' }, [
            h('div', { class: 'plate-name' }, 'Rendered beeswax'),
            h('div', { class: 'plate-desc' },
              (Math.round(wax * 10) / 10) + ' kg in stock'),
            h('div', { class: 'plate-foot' }, h('button', {
              class: 'plate-buy',
              onclick: function() {
                var r = renderWax();
                toast(r.msg, r.ok ? 'good' : 'bad');
                if (r.ok) render();
              }
            }, h('span', { class: 'plate-buy-label' }, 'Sell wax')))
          ])
        ])
      ])
    ]));
  }

  /* Beeswax candles: a single full-width card with the make/sell controls. */
  var candleCount = inv.candles || 0;
  if (wax >= CANDLE_WAX_PER_BATCH || candleCount > 0) {
    var _wkInYr = ((Game.week - 1) % 52) + 1;
    var _isWinter = (_wkInYr <= 8 || _wkInYr >= 42);
    var maxBatches = Math.floor(wax / CANDLE_WAX_PER_BATCH);
    var firstTime = !(Game.flags && Game.flags.seenExplainers && Game.flags.seenExplainers.firstCandles);
    var blurb = firstTime ? h('div', { class: 'candle-blurb' },
      'Cappings wax rendered clean and poured into moulds — ' + Math.round(CANDLE_WAX_PER_BATCH * 1000) + 'g of wax becomes ' + CANDLES_PER_BATCH + ' candles worth £' + (CANDLES_PER_BATCH * CANDLE_PRICE).toFixed(2) + ', vs about £' + (CANDLE_WAX_PER_BATCH * 14).toFixed(2) + ' of raw wax.') : null;

    cards.push(h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Beeswax candles'),
      blurb,
      h('div', { class: 'candle-stats' }, [
        h('span', {}, 'Wax: ' + wax.toFixed(2) + ' kg'),
        h('span', {}, 'Candles: ' + candleCount)
      ]),
      h('div', { class: 'candle-actions' }, [
        h('button', {
          class: 'plate-buy plate-buy-wide',
          disabled: (!_isWinter || maxBatches < 1) ? 'disabled' : null,
          onclick: function() {
            var r = makeCandles(1);
            toast(r.msg, r.ok ? 'good' : 'bad');
            if (r.ok) render();
          }
        }, _isWinter ? ('Make 1 batch (' + CANDLES_PER_BATCH + ' candles)') : 'Winter only'),
        h('button', {
          class: 'plate-buy plate-buy-ghost plate-buy-wide',
          disabled: candleCount < 1 ? 'disabled' : null,
          onclick: function() {
            var r = sellCandles(candleCount);
            if (r.ok) toast('Sold ' + candleCount + ' candles.', 'good');
            else toast(r.msg, 'bad');
            if (r.ok) render();
          }
        }, candleCount > 0 ? ('Sell all (' + fmtMoney(candleCount * CANDLE_PRICE) + ')') : 'No candles')
      ])
    ]));
  }

  var alive = (typeof aliveColonies === 'function') ? aliveColonies() : [];
  if (alive.length) {
    var beePlate = MARKET_PLATES.bees || {};
    var colCards = alive.map(function(col) {
      var val = (typeof colonyValue === 'function') ? colonyValue(col) : 0;
      var strain = col.strain || 'local';
      var platePath = strain === 'italian'   ? beePlate['nuc-italian']
                    : strain === 'carniolan' ? beePlate['nuc-carniolan']
                    : strain === 'buckfast'  ? beePlate['nuc-buckfast']
                    : strain === 'native'    ? beePlate['nuc-native']
                    : beePlate['nuc'];
      var plate = _ui_plateImg(platePath || null, col.name, '1x1');
      return h('div', { class: 'plate-card' + (plate ? '' : ' no-plate') }, [
        plate,
        h('div', { class: 'plate-body' }, [
          h('div', { class: 'plate-name' }, col.name),
          h('div', { class: 'plate-desc' },
            'A buyer would pay around ' + fmtMoney(val) + ' for this colony.'),
          h('div', { class: 'plate-foot' }, h('button', {
            class: 'plate-buy plate-buy-ghost',
            onclick: function() {
              var r = sellColony(col, false);
              toast(r.msg, r.ok ? 'good' : 'bad');
              if (r.ok) render();
            }
          }, h('span', { class: 'plate-buy-label' }, 'Sell colony')))
        ])
      ]);
    });
    cards.push(h('div', { class: 'market-section' }, [
      h('div', { class: 'market-section-head' }, 'Sell colonies'),
      h('div', { class: 'plate-grid' }, colCards)
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
// Track whether the mobile TOC drawer is open. On desktop the
// <details> element is always treated as open (the summary is
// hidden by CSS), so the flag only takes effect at narrow widths.
var _ui_handbookTocOpen = true;

function _ui_buildHandbookView() {
  var enc = (typeof window.ENCYCLOPEDIA !== 'undefined') ? window.ENCYCLOPEDIA : {};
  var gloss = (typeof window.GLOSSARY !== 'undefined') ? window.GLOSSARY : {};

  // Group articles by category. ENCYCLOPEDIA is an array — iterating
  // with Object.keys() yields numeric index strings that become the
  // article _id the view reads.
  var byCategory = {};
  var catOrder = [];
  var all = [];
  Object.keys(enc).forEach(function(id) {
    var art = enc[id];
    art._id = id;
    all.push(art);
    var cat = art.category || 'General';
    if (!byCategory[cat]) {
      byCategory[cat] = [];
      catOrder.push(cat);
    }
    byCategory[cat].push(art);
  });

  var search = _ui_handbookSearch.toLowerCase();
  var filtered = search ? all.filter(function(a) {
    return (a.title || '').toLowerCase().indexOf(search) !== -1 ||
           (a.body || '').toLowerCase().indexOf(search) !== -1;
  }) : null;

  // ─── Banner ──────────────────────────────────────────────────────────
  var banner = h('div', { class: 'handbook-banner' }, [
    h('h1', { class: 'handbook-title', text: 'The Beekeeper’s Handbook' }),
    h('div', { class: 'handbook-rule' })
  ]);

  // ─── Search field (paper-and-ink underline style) ────────────────────
  var searchBox = h('input', {
    type: 'text',
    class: 'book-search',
    placeholder: 'Search the handbook',
    value: _ui_handbookSearch,
    oninput: function() {
      _ui_handbookSearch = searchBox.value;
      _ui_handbookSelected = null;
      _ui_handbookGlossary = false;
      render();
    }
  });
  var searchWrap = h('div', { class: 'handbook-search-wrap' }, searchBox);

  // ─── Table of contents ───────────────────────────────────────────────
  var tocItems = [];

  function tocLink(art) {
    var isActive = _ui_handbookSelected === art._id && !_ui_handbookGlossary;
    return h('div', {
      class: 'book-link' + (isActive ? ' active' : ''),
      onclick: function() {
        _ui_handbookSelected = art._id;
        _ui_handbookGlossary = false;
        // On mobile (single-column), close the TOC so the freshly
        // selected article jumps into view rather than sitting below
        // a tall contents list.
        if (window.innerWidth <= 720) _ui_handbookTocOpen = false;
        render();
      }
    }, [
      h('span', { class: 'book-link-mark', text: isActive ? '✣' : '' }),
      h('span', { class: 'book-link-label', text: art.title || art._id })
    ]);
  }

  if (filtered) {
    if (filtered.length === 0) {
      tocItems.push(h('div', { class: 'book-empty', text: 'No matches.' }));
    } else {
      filtered.forEach(function(art) { tocItems.push(tocLink(art)); });
    }
  } else {
    catOrder.forEach(function(cat) {
      var catChildren = [
        h('div', { class: 'book-cat-head' }, [
          h('span', { class: 'book-cat-rule' }),
          h('span', { class: 'book-cat-label', text: cat }),
          h('span', { class: 'book-cat-rule' })
        ])
      ];
      byCategory[cat].forEach(function(art) { catChildren.push(tocLink(art)); });
      tocItems.push(h('div', { class: 'book-cat' }, catChildren));
    });
  }

  tocItems.push(h('div', {
    class: 'book-link book-link-glossary' + (_ui_handbookGlossary ? ' active' : ''),
    onclick: function() {
      _ui_handbookGlossary = true;
      _ui_handbookSelected = null;
      render();
    }
  }, [
    h('span', { class: 'book-link-mark', text: _ui_handbookGlossary ? '✣' : '' }),
    h('span', { class: 'book-link-label', text: 'Glossary' })
  ]));

  // The TOC is wrapped in a <details> so it collapses cleanly on
  // mobile (where stage width forces single-column). On desktop the
  // <summary> is hidden by CSS and the details element behaves like a
  // plain div, so we always render it open at desktop widths.
  var tocAttrs = { class: 'book-toc' };
  if (window.innerWidth > 720 || _ui_handbookTocOpen) tocAttrs.open = 'open';
  var tocSummary = h('summary', { class: 'book-toc-summary', text: 'Contents' });
  // Native <details> toggle fires before our handler — keep our flag
  // in sync so re-renders preserve the user's choice.
  var tocEl = h('details', tocAttrs, [
    tocSummary,
    h('div', { class: 'book-toc-list' }, tocItems)
  ]);
  tocEl.addEventListener('toggle', function() {
    _ui_handbookTocOpen = tocEl.open;
  });
  var toc = tocEl;

  // ─── Article pane ────────────────────────────────────────────────────
  var articlePane;
  if (_ui_handbookGlossary) {
    articlePane = _ui_buildGlossaryPane(gloss);
  } else if (_ui_handbookSelected !== null && enc[_ui_handbookSelected]) {
    articlePane = _ui_buildArticlePane(enc[_ui_handbookSelected]);
  } else {
    // In search mode, default to the first matching result so the
    // shown article reflects the query. Otherwise fall to the very
    // first article in the encyclopedia.
    var firstArt = (filtered && filtered.length) ? filtered[0] : all[0];
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
  return h('div', { class: 'panel-view handbook-view' }, [banner, searchWrap, book]);
}

function _ui_buildArticlePane(art) {
  var body = art.body || '';
  var children = [];

  // Optional painted plate at the top of the article. If the named
  // file is missing on disk, the frame collapses to nothing via
  // the onerror handler — the article still renders.
  if (art.plate) {
    var plateImg = h('img', {
      class: 'article-plate',
      src: 'img/plates/' + art.plate,
      alt: art.title || '',
      onerror: function(e) {
        var img = e && e.target;
        if (img) {
          var frame = img.parentNode;
          if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        }
      }
    });
    children.push(h('div', { class: 'article-plate-frame' }, plateImg));
  }

  children.push(h('div', { class: 'acat', text: art.category || '' }));
  children.push(h('h2', { class: 'article-title', text: art.title || '' }));

  var rendered = _ui_renderArticleBody(body);
  children.push(rendered);

  return h('div', { class: 'book-article' }, children);
}

function _ui_renderArticleBody(text) {
  var container = h('div', { class: 'article-body' });
  var paragraphs = text.split(/\n\n+/);
  var firstParaSeen = false;

  paragraphs.forEach(function(block) {
    block = block.trim();
    if (!block) return;

    // Heading
    if (block.indexOf('## ') === 0) {
      container.appendChild(h('h4', { class: 'article-subhead', text: block.slice(3).trim() }));
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

    // The first running paragraph carries the drop-cap.
    var pClass = !firstParaSeen ? 'article-lede' : '';
    firstParaSeen = true;
    container.appendChild(h('p', { class: pClass, text: block }));
  });
  return container;
}

function _ui_buildGlossaryPane(gloss) {
  var terms = Object.keys(gloss).sort();
  var items = terms.map(function(term) {
    return h('div', { class: 'glossary-row' }, [
      h('div', { class: 'glossary-term', text: term }),
      h('div', { class: 'glossary-def', text: gloss[term] || '' })
    ]);
  });

  if (items.length === 0) {
    items = [h('p', { text: 'No glossary entries found.', style: { color: 'var(--ink-faint)' } })];
  }

  return h('div', { class: 'book-article' }, [
    h('div', { class: 'acat', text: 'Reference' }),
    h('h2', { class: 'article-title', text: 'Glossary' }),
    h('div', { class: 'glossary-body' }, items)
  ]);
}

/* ====================================================================
   RECORDS VIEW — combines Journal + Finances with internal tabs
   ==================================================================== */

function _ui_buildRecordsView(startTab) {
  var activeTab = startTab || (Game.ui && Game.ui.recordsTab) || 'journal';

  function setTab(t) {
    if (!Game.ui) Game.ui = {};
    Game.ui.recordsTab = t;
    render();
  }

  var tabBar = h('div', { class: 'records-tabs' }, [
    h('button', { class: 'records-tab' + (activeTab === 'journal'  ? ' active' : ''),
      onclick: function() { setTab('journal'); } }, 'Journal'),
    h('button', { class: 'records-tab' + (activeTab === 'finances' ? ' active' : ''),
      onclick: function() { setTab('finances'); } }, 'Finances'),
    h('button', { class: 'records-tab' + (activeTab === 'samples'  ? ' active' : ''),
      onclick: function() { setTab('samples'); } }, 'Samples')
  ]);

  var content;
  if (activeTab === 'finances')      content = _ui_buildFinancesContent();
  else if (activeTab === 'samples')  content = _ui_buildSamplesContent();
  else                                content = _ui_buildJournalContent();

  var goalsWidget = _ui_buildGoalsWidget();
  return h('div', { class: 'panel-view narrow records-view' }, [tabBar, content, goalsWidget]);
}

/* ====================================================================
   SAMPLES — pollen-analysis lab results
   ==================================================================== */
function _ui_buildSamplesContent() {
  var jars     = (Game.inventory && Game.inventory.jars) || {};
  var pending  = (Game.pendingSamples || []).slice();
  var done     = (Game.completedSamples || []).slice();

  /* Send-a-sample card — one row per honey type currently in jars. */
  var rows = [];
  Object.keys(jars).forEach(function (t) {
    var count = jars[t] || 0;
    if (count < 1) return;
    var honeyName = (HONEY_TYPES[t] && HONEY_TYPES[t].name) || t;
    rows.push(h('div', { class: 'sample-send-row' }, [
      h('div', { class: 'sample-honey-name' }, honeyName + ' — ' + count + ' jar' + (count === 1 ? '' : 's')),
      h('button', {
        class: 'btn btn-sm btn-primary',
        onclick: function () {
          var r = sendHoneySample(t);
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) render();
        }
      }, 'Send sample (£' + SAMPLE_COST + ')'),
    ]));
  });
  if (!rows.length) {
    rows.push(h('div', { class: 'empty-state' },
      'You need bottled honey before you can send a sample. Extract and bottle some first.'));
  }
  var sendCard = h('div', { class: 'card sample-card' }, [
    h('div', { class: 'fin-card-title', text: 'Send a sample to the lab' }),
    h('div', { class: 'fin-card-note',
      text: 'A pollen analysis tells you which flowers actually fed the colony when this honey was made. £' +
            SAMPLE_COST + ' per sample, results back in ' + SAMPLE_TURNAROUND + ' weeks.' }),
    h('div', {}, rows),
  ]);

  /* Pending samples */
  var pendingCard = null;
  if (pending.length) {
    pendingCard = h('div', { class: 'card sample-card' }, [
      h('div', { class: 'fin-card-title', text: 'Awaiting results' }),
      h('div', {}, pending.map(function (s) {
        var weeksLeft = Math.max(0, s.returnWeek - Game.week);
        var honeyName = (HONEY_TYPES[s.honeyType] && HONEY_TYPES[s.honeyType].name) || s.honeyType;
        return h('div', { class: 'sample-pending-row' }, [
          h('div', {}, [
            h('b', { text: honeyName }),
            h('div', { style: { fontSize: '11px', color: 'var(--ink-soft)' },
              text: 'Sent ' + (typeof dateLabel === 'function' ? dateLabel(s.sentWeek) : ('wk ' + s.sentWeek)) })
          ]),
          h('div', { style: { fontSize: '12px', color: 'var(--honey-dk)' } },
            weeksLeft === 0 ? 'Due this week' :
            (weeksLeft + ' week' + (weeksLeft === 1 ? '' : 's') + ' to go'))
        ]);
      })),
    ]);
  }

  /* Completed sample results */
  var doneCard = null;
  if (done.length) {
    doneCard = h('div', { class: 'card sample-card' }, [
      h('div', { class: 'fin-card-title', text: 'Lab reports' }),
      h('div', {}, done.map(function (r) {
        var honeyName = (HONEY_TYPES[r.honeyType] && HONEY_TYPES[r.honeyType].name) || r.honeyType;
        var bars = (r.composition || []).map(function (c) {
          return h('div', { class: 'sample-bar-row' }, [
            h('div', { class: 'sample-bar-label' }, c.src),
            h('div', { class: 'sample-bar-track' }, [
              h('div', { class: 'sample-bar-fill', style: { width: c.pct + '%' } }),
            ]),
            h('div', { class: 'sample-bar-pct' }, c.pct + '%'),
          ]);
        });
        return h('div', { class: 'sample-result' }, [
          h('div', { class: 'sample-result-head' }, [
            h('b', { text: honeyName }),
            h('span', { class: 'sample-result-date',
              text: 'Result ' + (typeof dateLabel === 'function' ? dateLabel(r.returnedWeek) : ('wk ' + r.returnedWeek)) }),
          ]),
          h('div', { class: 'sample-bars' }, bars),
        ]);
      })),
    ]);
  }

  return h('div', { class: 'samples-content' }, [sendCard, pendingCard, doneCard].filter(Boolean));
}

function _journal_dingbatFor(entry) {
  var tone = entry.tone || 'plain';
  if (tone === 'good') return '·';
  if (tone === 'warn') return '†';
  if (tone === 'bad')  return '✕';
  return '•';
}

function _ui_buildJournalContent() {
  var log = (Game.log || []).slice();
  var headerPlate = h('div', { class: 'journal-header-plate' }, [
    h('img', { class: 'journal-header-img', src: 'img/plates/scene-summer-harvest.png',
      alt: '', onerror: function () { this.style.display = 'none'; } }),
    h('div', { class: 'journal-header-scrim' }),
    h('div', { class: 'journal-header-titlebox' }, [
      h('div', { class: 'journal-header-rule' }),
      h('div', { class: 'journal-header-title', text: 'The keeper’s journal' })
    ])
  ]);
  var entries = log.map(function(entry) {
    return h('div', { class: 'log-entry ' + (entry.tone || 'plain') }, [
      h('span', { class: 'when', text: (typeof dateLabel === 'function') ? dateLabel(entry.week) : ('Wk ' + entry.week) }),
      h('span', { class: 'ico', text: _journal_dingbatFor(entry) }),
      h('span', { class: 'txt', text: entry.text || '' })
    ]);
  });
  if (!entries.length) {
    return h('div', { class: 'journal-content' }, [headerPlate,
      h('div', { class: 'empty-state' }, [
        h('p', { class: 'empty-state-note',
          text: 'Your journal is empty. Events and notes will appear here as you play.' })
      ])
    ]);
  }
  return h('div', { class: 'journal-content' }, [headerPlate,
    h('div', { class: 'journal-spread' }, entries)
  ]);
}

function _ui_buildJournalContent_OLD_UNUSED() {
  var log = (Game.log || []).slice();
  var entries = log.map(function(entry) {
    return h('div', { class: 'log-entry ' + (entry.tone || 'plain') }, [
      h('span', { class: 'when', text: (typeof dateLabel === 'function') ? dateLabel(entry.week) : ('Wk ' + entry.week) }),
      h('span', { class: 'ico' }, entry.icon || ''),
      h('span', { class: 'txt', text: entry.text || '' })
    ]);
  });
  if (!entries.length) {
    entries = [h('div', { class: 'empty-state' }, [
      h('div', { class: 'big' }, '📜'),
      h('p', { text: 'Your journal is empty. Events and notes will appear here as you play.' })
    ])];
  }
  return h('div', { class: 'card' }, entries);
}

/* ====================================================================
   _finance_categorise(desc, amount) -> 'income' | 'operating' | 'equipment'
   A ledger entry might be £-44 "1 super box" — that is a durable
   asset that will last 10+ seasons, not an operating cost of THIS
   year's beekeeping. Conflating the two makes year 1 look like a
   failure when it is actually a year of investment. This helper
   separates them so the Finances view can show operating surplus
   independently of capital outlay.
   ==================================================================== */
function _finance_categorise(desc, amount) {
  if (amount > 0) return 'income';
  var d = (desc || '').toLowerCase();
  /* Durable kit — hives, supers, brood boxes, excluders, extractors,
     nuc boxes, bait hives, clearer boards. One-time purchase, multi-
     year lifespan. */
  if (/national hive|bait hive|nuc(leus)? box(?!es)|super box|brood box|queen excluder|extractor(?! hire)|clearer board|smoker|hive tool|suit|gloves|refractometer|uncapping/i.test(d)) {
    return 'equipment';
  }
  /* Everything else that costs money is operating: sugar, jars,
     treatments, extractor hire, market stall, postage, nucs bought
     to add or replace a colony, requeen, candle wicks. */
  return 'operating';
}

function _ui_buildFinancesContent() {
  var ledger = (Game.ledger || []).slice();
  var stats = Game.stats || {};

  /* Income vs operating spend vs equipment investment, this year. */
  var income = 0, operating = 0, equipment = 0;
  (Game.ledger || []).forEach(function(e) {
    var yr = (typeof gameYear === 'function') ? gameYear() : 1;
    var entryYr = Math.ceil(e.week / 52);
    if (entryYr !== yr) return;
    var cat = _finance_categorise(e.desc, e.amount);
    if (cat === 'income') income += e.amount;
    else if (cat === 'equipment') equipment += e.amount;
    else operating += e.amount;
  });
  /* operating + equipment are both negative; operating surplus =
     income + operating (so income £400, operating -£140 → +£260). */
  var operatingSurplus = income + operating;

  var ledgerRows = ledger.map(function(entry) {
    var isPos = entry.amount > 0;
    return h('tr', {}, [
      h('td', { text: (typeof dateLabel === 'function') ? dateLabel(entry.week) : ('Wk ' + entry.week) }),
      h('td', { class: 'desc-cell', text: entry.desc || '' }),
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

  /* Painterly tile: large IM Fell display number over a small-caps
     label. The variant class (income/expense/cash/neutral) drives the
     ink colour from the v2 palette so the same component reads
     correctly across the operating, capital and statistics cards. */
  function finTile(value, label, variant) {
    return h('div', { class: 'fin-tile fin-tile-' + (variant || 'neutral') }, [
      h('div', { class: 'fin-tile-val', text: fmtMoney(value) }),
      h('span', { class: 'fin-tile-lbl', text: label })
    ]);
  }
  var surplusVariant = operatingSurplus >= 0 ? 'income' : 'expense';

  return h('div', { class: 'finances-content' }, [
    h('div', { class: 'card fin-card' }, [
      h('div', { class: 'fin-card-title', text: 'This year — operating' }),
      h('div', { class: 'fin-tile-row' }, [
        finTile(income,           'Income (honey, sales)', 'income'),
        finTile(operating,        'Operating costs',       'expense'),
        finTile(operatingSurplus, 'Operating surplus',     surplusVariant),
      ])
    ]),
    h('div', { class: 'card fin-card' }, [
      h('div', { class: 'fin-card-title', text: 'This year — capital' }),
      h('div', { class: 'fin-card-note',
        text: 'Durable kit lasts 10+ seasons. It belongs to the apiary, not to one year’s honey crop.' }),
      h('div', { class: 'fin-tile-row' }, [
        finTile(equipment, 'Equipment invested', 'neutral'),
        finTile(Game.cash, 'Cash in hand',       'cash'),
      ])
    ]),
    h('div', { class: 'card fin-card' }, [
      h('div', { class: 'fin-card-title', text: 'Statistics' }),
      h('div', { class: 'stat-tiles' }, statTiles)
    ]),
    h('div', { class: 'card fin-card' }, [
      h('div', { class: 'fin-card-title', text: 'Ledger' }),
      h('div', { class: 'ledger-wrap' }, [
        h('table', { class: 'ledger-table' }, [
          h('thead', {}, [h('tr', {}, [h('th', {text:'Date'}), h('th', {text:'Description'}), h('th', {text:'Amount'})])]),
          h('tbody', {}, ledgerRows.length ? ledgerRows : [
            h('tr', {}, [h('td', { class: 'ledger-empty', colspan:'3', text:'No transactions yet.' })])
          ])
        ])
      ])
    ])
  ]);
}

/* ====================================================================
   FINANCES VIEW — kept for legacy compatibility
   ==================================================================== */

function _ui_buildFinancesView() {
  return _ui_buildRecordsView('finances');
}

/* ====================================================================
   JOURNAL VIEW
   ==================================================================== */

function _ui_buildJournalView() {
  return _ui_buildRecordsView('journal');
}

/* ====================================================================
   HIVE DETAIL MODAL
   ==================================================================== */

/**
 * openHiveDetail(colony)
 * Opens a modal showing the colony's last-known state and action buttons.
 */
function openHiveDetail(colony, _startTab) {
  var known = colony.known;
  var weeksAgo = 0;
  if (known && typeof Game !== 'undefined' && Game) {
    weeksAgo = Game.week - known.week;
  }

  /* Default to actions — players open hive detail to do things, not re-read history */
  var activeTab = _startTab || 'actions';

  /* ── Left column: cross-section + hive assembly ── */
  var crossSection;
  if (!colony.alive) {
    crossSection = h('div', { class: 'hive-cross hive-cross-dead' }, [
      h('div', { class: 'cross-section-title' }, 'Hive cross-section'),
      h('div', { class: 'cross-dead-state' }, [
        h('div', { class: 'cross-dead-icon' }, '🪦'),
        h('div', { class: 'cross-dead-label' }, 'Colony lost'),
        h('div', { class: 'cross-dead-reason' }, 'Cause: ' + (colony.deadReason || 'Unknown cause') )
      ])
    ]);
  } else {
    crossSection = _ui_buildHiveCross(colony);
  }

  var stackEditor = colony.alive ? _ui_buildStackEditor(colony) : null;
  var leftCol = h('div', { class: 'hive-left-col' }, stackEditor ? [crossSection, stackEditor] : [crossSection]);

  /* ── Inspection panel content ── */
  var inspectionContent = h('div', {}, []);
  if (!known) {
    inspectionContent.appendChild(h('div', { class: 'colony-known-note', text: 'This colony has not been inspected yet. You know nothing of its interior state.' }));
  } else if (known.heftOnly) {
    var storesLabel = { critical: 'critically low — feed fondant now', low: 'running light — consider fondant', ok: 'adequate', heavy: 'plenty in reserve', unknown: 'unknown' }[known.stores] || known.stores;
    inspectionContent.appendChild(h('div', { class: 'colony-known-note' },
      'Stores checked by hefting (week ' + known.week + '): ' + storesLabel + '. The hive has not been opened — inspect to see the full picture.'));
  } else {
    if (weeksAgo >= 3) {
      inspectionContent.appendChild(h('div', { class: 'colony-known-note' },
        'Last inspected ' + weeksAgo + ' weeks ago. The colony may have changed considerably since then.'));
    }
    inspectionContent.appendChild(_ui_buildKnownSummary(known));
  }

  /* ── Tab panels ── */
  var panelInspection = h('div', { class: 'hive-tab-panel' + (activeTab === 'inspection' ? '' : ' hive-tab-hidden') }, [inspectionContent]);
  var panelActions    = h('div', { class: 'hive-tab-panel' + (activeTab === 'actions'    ? '' : ' hive-tab-hidden') }, [_ui_buildActionButtons(colony)]);
  var panelDiary      = h('div', { class: 'hive-tab-panel' + (activeTab === 'diary'      ? '' : ' hive-tab-hidden') }, [_ui_buildDiaryPanel(colony)]);

  function _tabSwitch(activeKey) {
    tabInspect.className = 'hive-tab' + (activeKey === 'inspection' ? ' active' : '');
    tabAct.className     = 'hive-tab' + (activeKey === 'actions'    ? ' active' : '');
    tabDiary.className   = 'hive-tab' + (activeKey === 'diary'      ? ' active' : '');
    panelInspection.classList.toggle('hive-tab-hidden', activeKey !== 'inspection');
    panelActions.classList.toggle('hive-tab-hidden', activeKey !== 'actions');
    panelDiary.classList.toggle('hive-tab-hidden', activeKey !== 'diary');
  }

  /* ── Tab bar ── */
  var tabInspect = h('button', {
    class: 'hive-tab' + (activeTab === 'inspection' ? ' active' : ''),
    onclick: function() { _tabSwitch('inspection'); }
  }, '🔍 Last inspection' + (known && !known.heftOnly && weeksAgo > 0 ? ' (' + (weeksAgo === 1 ? '1 week ago' : weeksAgo + ' weeks ago') + ')' : ''));

  var tabAct = h('button', {
    class: 'hive-tab' + (activeTab === 'actions' ? ' active' : ''),
    onclick: function() { _tabSwitch('actions'); }
  }, '⚙ Actions');

  var tabDiary = h('button', {
    class: 'hive-tab' + (activeTab === 'diary' ? ' active' : ''),
    onclick: function() { _tabSwitch('diary'); }
  }, '📔 Diary');

  var rightCol = h('div', { class: 'hive-right-col' }, [
    h('div', { class: 'hive-tab-bar' }, [tabInspect, tabAct, tabDiary]),
    panelInspection,
    panelActions,
    panelDiary
  ]);

  var bodyNode = h('div', { class: 'hive-detail' }, [leftCol, rightCol]);

  openModal({
    title: colony.name + (colony.alive ? '' : ' — Colony lost'),
    body: bodyNode,
    xwide: true,
    buttons: [{ label: 'Close', act: closeModal }]
  });
}

/* ====================================================================
   HIVE STACK EDITOR — physical assembly below cross-section
   ==================================================================== */

function _ui_buildStackEditor(colony) {
  if (!colony || !colony.stack || !colony.stack.length) return null;

  var inv = Game.inventory || {};
  var hasQX = colony.stack.some(function(i) { return i.type === 'queenExcluder'; });
  var hasNewspaper = colony.stack.some(function(i) { return i.type === 'newspaper'; });
  var qxOwned = inv.queenExcluders || 0;
  var newsOwned = inv.newspaper || 0;

  function refresh() {
    closeModal();
    render();
    if (colony.alive) openHiveDetail(colony, 'actions');
  }

  var ICONS  = { broodBox: '🟫', super: '📦', queenExcluder: '🔲', clearerBoard: '🔳', newspaper: '📰' };
  var LABELS = { broodBox: 'Brood box', super: 'Super', queenExcluder: 'Queen excluder', clearerBoard: 'Clearer board', newspaper: 'Newspaper (uniting)' };

  /* Stack displayed top → bottom (highest index last in array = top of hive) */
  var reversed = colony.stack.slice().reverse();
  var stackRows = reversed.map(function(item) {
    var icon  = ICONS[item.type]  || '▪';
    var label = LABELS[item.type] || item.type;

    var removeBtn = null;
    if (item.type === 'queenExcluder') {
      removeBtn = h('button', {
        class: 'btn btn-xs stack-item-remove',
        onclick: function() {
          var r = removeQueenExcluder(colony);
          toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) refresh();
        }
      }, 'Remove');
    } else if (item.type === 'newspaper') {
      removeBtn = h('button', {
        class: 'btn btn-xs stack-item-remove',
        onclick: function() {
          colony.stack = colony.stack.filter(function(i) { return i !== item; });
          colony.newspaperWeeksInPlace = 0;
          inv.newspaper = (inv.newspaper || 0) + 1;
          if (typeof _colony_deriveFromStack === 'function') _colony_deriveFromStack(colony);
          toast('Newspaper removed and returned to stock.', 'good');
          refresh();
        }
      }, 'Remove');
    } else if (item.type === 'super') {
      removeBtn = h('span', { class: 'stack-item-hint', text: '(use Take box off)' });
    }

    return h('div', { class: 'stack-item' }, [
      h('span', { class: 'stack-item-icon', text: icon }),
      h('span', { class: 'stack-item-label', text: label }),
      removeBtn
    ]);
  });

  stackRows.push(h('div', { class: 'stack-item stack-item-floor' }, [
    h('span', { class: 'stack-item-icon', text: '▬' }),
    h('span', { class: 'stack-item-label', text: 'Floor / hive stand' })
  ]));

  /* Palette — what can be added */
  var paletteItems = [];

  if (!hasQX) {
    var qxLabel = qxOwned > 0 ? '+ Queen excluder (stock: ' + qxOwned + ')' : '+ Queen excluder (£9)';
    paletteItems.push(h('button', {
      class: 'btn btn-sm stack-palette-item',
      onclick: function() {
        var r = fitQueenExcluder(colony);
        toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) refresh();
      }
    }, qxLabel));
  }

  if (!hasNewspaper && (colony.broodBoxes || 1) >= 2) {
    var npLabel = newsOwned > 0 ? '+ Newspaper (stock: ' + newsOwned + ')' : '+ Newspaper (£1)';
    paletteItems.push(h('button', {
      class: 'btn btn-sm stack-palette-item',
      onclick: function() {
        var r = placeNewspaper(colony);
        toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) refresh();
      }
    }, npLabel));
  }

  var warnings = colony._stackWarnings || [];
  var warnNodes = warnings.map(function(w) {
    return h('div', { class: 'stack-item-warn', text: '⚠ ' + w });
  });

  return h('div', { class: 'hive-stack-editor' }, [
    h('div', { class: 'stack-editor-title' }, 'Hive assembly'),
    h('div', { class: 'stack-editor-list' }, stackRows),
    warnNodes.length ? h('div', { class: 'stack-editor-warnings' }, warnNodes) : null,
    paletteItems.length ? h('div', { class: 'stack-palette' }, paletteItems) : null
  ]);
}

/* ====================================================================
   HIVE CROSS-SECTION — shows real frame content per box
   ==================================================================== */

function _ui_buildHiveCross(colony) {
  /* Ensure layout exists — sync from colony state if needed */
  if (!colony.hiveLayout && typeof colonyWeeklyLayoutSync === 'function') {
    colonyWeeklyLayoutSync(colony);
  }
  var layout     = colony.hiveLayout || { broodBoxes: [], supers: [] };
  var superCount = colony.supers || 0;
  var broodCount = colony.broodBoxes || 1;

  var stack = h('div', { class: 'cross-stack' });

  /* --- Supers (top to bottom = highest index first) ------------------ */
  for (var s = superCount - 1; s >= 0; s--) {
    (function(sidx) {
      var sup          = (layout.supers && layout.supers[sidx]) || { honeyKg: 0, frames: [], honeyType: 'summer', drawnFrames: 0 };
      var drawnFrames  = sup.drawnFrames !== undefined ? Math.floor(sup.drawnFrames) : 11;
      var isFoundation = drawnFrames < 11;
      var fillFrac     = Math.min(1, sup.honeyKg / SIM.honeyPerSuper);
      var fillPct      = (fillFrac * 100).toFixed(0);
      var ht           = (typeof HONEY_TYPES !== 'undefined' && HONEY_TYPES[sup.honeyType]) || {};

      /* Bug A fix: foundation supers show drawn-comb progress, not kg weight */
      var lbl;
      if (isFoundation) {
        lbl = 'Super ' + (sidx + 1) + ' — Foundation (' + drawnFrames + '/11 drawn)';
      } else {
        lbl = 'Super ' + (sidx + 1) + ' — ' + sup.honeyKg.toFixed(1) + ' kg / ' + SIM.honeyPerSuper + ' kg';
        if (ht.name) lbl += ' (' + ht.name + ')';
      }

      var framesEl = _ui_buildCrossFrames(sup.frames || [], 'super', -1, -1, colony);

      var fillColor = fillFrac > 0.75 ? '#c87010' : fillFrac > 0.35 ? '#e8a020' : '#f0c060';

      /* Bug A fix: foundation note inside the box */
      var foundationNote = isFoundation
        ? h('div', { class: 'cross-foundation-note' }, drawnFrames + '/11 frames drawn')
        : null;

      /* Bug B fix: empty drawn comb gets distinct class from new foundation */
      var superCls = 'cross-box cross-super clickable';
      if (isFoundation) superCls += ' cross-super-foundation';
      else if (fillFrac < 0.05) superCls += ' cross-super-empty';

      stack.appendChild(h('div', {
        class: superCls,
        title: lbl + ' — click to manage frames',
        onclick: function() { _ui_openBoxDetail(colony, 'super', sidx); }
      }, [
        h('div', { class: 'cross-box-label' }, lbl),
        framesEl,
        foundationNote,
        h('div', { class: 'cross-fill-bar' }, [
          h('div', { class: 'cross-fill-fill', style: { width: fillPct + '%', background: fillColor } })
        ])
      ]));
    })(s);
  }

  /* --- Queen excluder — Bug C fix: only show when supers are present */
  if (colony.queenExcluder && superCount > 0) {
    stack.appendChild(h('div', { class: 'cross-box cross-excluder', title: 'Queen excluder' }, [
      h('span', { class: 'cross-excluder-label' }, 'QX')
    ]));
  }

  /* --- Brood boxes (top box first, bottom box last) ----------------- */
  var queenFrameIdx = _ui_estimateQueenFrameIdx(colony);
  var qcellFrameIdx = _ui_estimateQCellFrameIdx(colony);

  /* Queen cell state for visual overlays.
     Fog-of-war rule: the cross-section must show what was OBSERVED at the
     last inspection, not the live colony state. If the player has never
     inspected (no known, or heft-only stub) or their known snapshot shows
     no cells, suppress the overlay even if cells exist in the live model.
     Only show cells when colony.known.queenCells matches the live type —
     i.e., the player actually saw them at the last inspection.
     Exception: isImminent (swarm-capped urgency badge on the hive CARD) is
     allowed to read live state for the card's urgency dot, but the peanut
     overlay inside the cross-section detail respects fog-of-war. */
  var qc = colony.queenCells || { type: 'none', count: 0, age: 0, state: 'none' };
  var qcType  = qc.type  || 'none';
  var qcState = qc.state || 'none';
  var qcCount = qc.count || 0;
  var knownCells = (colony.known && !colony.known.heftOnly) ? (colony.known.queenCells || 'none') : 'none';
  /* Only show the peanut overlay if the player observed these cells */
  var hasQCells = (qcType !== 'none' && qcState !== 'none' && knownCells !== 'none');
  var isImminent = (qcType === 'swarm' && qcState === 'capped');

  for (var b = broodCount - 1; b >= 0; b--) {
    (function(bidx) {
      var box = (layout.broodBoxes && layout.broodBoxes[bidx]) || { frames: [] };
      var lbl = broodCount > 1 ? ('Brood box ' + (bidx + 1)) : 'Brood box';
      var qFrame  = (bidx === 0) ? queenFrameIdx : -1;
      var qcFrame = (bidx === 0) ? qcellFrameIdx : -1;

      var framesEl = _ui_buildCrossFrames(box.frames || [], 'brood', qFrame, qcFrame, colony);

      /* Box CSS classes */
      var boxCls = 'cross-box cross-brood clickable';
      if (bidx === 0 && isImminent) boxCls += ' cross-brood-imminent';
      if (colony.demaree && bidx === 1) boxCls += ' cross-brood-demaree';

      /* Label: add Demaree tag on top box */
      var lblText = lbl;
      if (colony.demaree && bidx === 1) {
        var dAge = colony.demaree.age || 0;
        var dChecked = !!colony.demaree.checked;
        lblText += dChecked ? ' [Demaree ✓]' : (dAge >= 1 ? ' [Demaree – CHECK NOW]' : ' [Demaree day 0]');
      }

      /* Queen cell peanut overlay — bottom box only */
      var peanutOverlay = null;
      if (bidx === 0 && hasQCells) {
        var peanuts = [];
        var pCls = 'cross-qcell-peanut'
          + (qcState === 'capped'   ? ' qc-capped' : '')
          + (qcType  === 'swarm'    ? ' qc-swarm'  : '')
          + (qcType  === 'postSwarm' ? ' qc-post-swarm' : '')
          + (qcType  === 'supersedure' || qcType === 'emergency' ? ' qc-super' : '');
        var pCount = Math.min(qcCount, 5);
        for (var pi = 0; pi < pCount; pi++) {
          peanuts.push(h('div', { class: pCls, title: qcType + ' cell (' + qcState + ')' }));
        }
        var overlayCls = (qcType === 'swarm')
          ? 'cross-qcell-overlay cross-qcells-bottom'
          : 'cross-qcell-overlay cross-qcells-face';
        peanutOverlay = h('div', { class: overlayCls }, peanuts);
      }

      var boxChildren = [
        h('div', { class: 'cross-box-label' }, lblText),
        framesEl
      ];
      if (peanutOverlay) boxChildren.push(peanutOverlay);

      stack.appendChild(h('div', {
        class: boxCls,
        title: lbl + ' — click to manage frames',
        onclick: function() { _ui_openBoxDetail(colony, 'brood', bidx); }
      }, boxChildren));
    })(b);
  }

  /* --- Hive floor ---------------------------------------------------- */
  var entranceLabel = { open: 'Open entrance', reduced: 'Reduced entrance', mouseguard: 'Mouse guard' }[colony.entrance] || colony.entrance;
  stack.appendChild(h('div', { class: 'cross-floor' }, [
    h('div', { class: 'cross-entrance-tab', title: entranceLabel })
  ]));

  /* --- Swarm pressure bar ------------------------------------------- */
  var swarmBar = _ui_buildSwarmPressureBar(colony);

  /* --- OSR crystallisation warning ---------------------------------- */
  var osrWarn = null;
  if (colony.osrCrystallised) {
    osrWarn = h('div', { class: 'cross-osr-warn' }, '🍯 OSR honey crystallising — harvest now or lose 70%');
  } else if (colony.osrRisk >= 1) {
    osrWarn = h('div', { class: 'cross-osr-notice' }, '⚠ OSR honey at risk of crystallisation');
  }

  /* --- Autumn supers warning ----------------------------------------- */
  var autumnSuperWarn = null;
  if ((colony.supers || 0) > 0 && typeof Game !== 'undefined') {
    var _wk = ((Game.week - 1) % 52) + 1;
    if (_wk >= 35 && _wk <= 48) {
      autumnSuperWarn = h('div', { class: 'cross-osr-warn' },
        '📦 Supers still on — take them off before treating for varroa');
    }
  }

  /* --- Demaree info block ------------------------------------------- */
  var demareeInfo = null;
  if (colony.demaree) {
    var dAge2 = colony.demaree.age || 0;
    var dChecked2 = !!colony.demaree.checked;
    var dMsg = dChecked2
      ? 'Demaree: checked (week ' + dAge2 + '/3) — emergency cells destroyed'
      : dAge2 >= 1
        ? 'Demaree: URGENT — open top box and destroy emergency cells'
        : 'Demaree: active — check again next week';
    demareeInfo = h('div', { class: 'cross-demaree-info' + ((!dChecked2 && dAge2 >= 1) ? ' qc-urgent' : '') }, dMsg);
  }

  /* --- Queen / entrance meta ----------------------------------------
     Fog-of-war: only show queen details if the colony has been inspected.
     Before first inspection (or heft-only) the player cannot know queen state. */
  var _hasInspected = colony.known && !colony.known.heftOnly;
  var queen = colony.queen;
  var queenParts = [];
  if (!_hasInspected) {
    queenParts.push('Queen status unknown — inspect to find out');
  } else if (queen && queen.present) {
    var qs = queen.virgin ? 'virgin, unmated'
           : queen.state === 'dronelayer' ? 'drone layer'
           : queen.state === 'failing' ? 'failing'
           : 'laying';
    queenParts.push('Queen: ' + qs);
    if (queen.marked) queenParts.push('marked ' + queen.marked);
    if (queen.clipped) queenParts.push('clipped ✂');
    queenParts.push('yr ' + (queen.bornYear || 1));
  } else {
    queenParts.push('No queen');
  }

  /* Engagement update — queen genetics surfacing (when inspected & queen present) */
  var queenGenetics = null;
  if (_hasInspected && queen && queen.present) {
    function _hgLabel(v) { if (v < 0.4) return 'Low'; if (v <= 0.7) return 'Moderate'; return 'High'; }
    function _tpLabel(v) { if (v < 0.4) return 'Calm'; if (v <= 0.7) return 'Variable'; return 'Defensive'; }
    var hg = (typeof queen.hygieneGene === 'number') ? queen.hygieneGene : 0.45;
    var tp = (typeof queen.temperamentGene === 'number') ? queen.temperamentGene : 0.35;
    queenGenetics = h('div', { class: 'cross-meta-line', title: 'Hygiene (High) means workers detect and remove diseased brood — a natural varroa resistance trait.' },
      'Hygiene: ' + _hgLabel(hg) + ' · Temperament: ' + _tpLabel(tp));
  }

  /* --- Queen cells meta line ---------------------------------------- */
  var qcMeta = null;
  if (hasQCells) {
    var qcTypeLabel = { swarm: 'swarm', postSwarm: 'post-swarm', emergency: 'emergency', supersedure: 'supersedure' }[qcType] || qcType;
    var qcDesc = qcCount + ' ' + qcTypeLabel + ' cell' + (qcCount !== 1 ? 's' : '') + ' — ' + qcState;
    if (isImminent) qcDesc += ' — SWARM IMMINENT';
    if (qcType === 'postSwarm') qcDesc += ' — old queen departed; virgin present';
    var qcMetaCls = 'cross-qc-meta' + (isImminent ? ' qc-urgent' : '') + (qcType === 'postSwarm' ? ' qc-urgent' : '');
    qcMeta = h('div', { class: qcMetaCls }, qcDesc);
  }

  var crossChildren = [
    h('div', { class: 'cross-section-title' }, 'Hive cross-section'),
    stack,
    swarmBar
  ];
  if (osrWarn) crossChildren.push(osrWarn);
  if (autumnSuperWarn) crossChildren.push(autumnSuperWarn);
  if (demareeInfo) crossChildren.push(demareeInfo);
  if (qcMeta) crossChildren.push(qcMeta);
  crossChildren.push(h('div', { class: 'cross-meta-line' }, queenParts.join(' · ')));
  if (queenGenetics) crossChildren.push(queenGenetics);
  crossChildren.push(h('div', { class: 'cross-meta-line' }, entranceLabel));
  /* Strain label — surfaces the genetic stock visible at a glance.
     Uses HIVE_STRAINS to look up the icon + short name. */
  if (typeof HIVE_STRAINS !== 'undefined' && colony.strain && HIVE_STRAINS[colony.strain]) {
    var _strain = HIVE_STRAINS[colony.strain];
    crossChildren.push(h('div', { class: 'cross-meta-line strain', title: _strain.desc },
      _strain.icon + ' Strain: ' + _strain.label));
  }
  crossChildren.push(h('div', { class: 'cross-click-hint' }, 'Click any box to manage frames'));

  return h('div', { class: 'hive-cross' }, crossChildren);
}

/* Build a row of 11 frame strips for one box */
function _ui_buildCrossFrames(frames, type, queenFrame, qcellFrame, colony) {
  var FRAMES = 11;
  /* pad to 11 if layout not fully synced yet */
  var fs = frames.slice();
  while (fs.length < FRAMES) fs.push({ drawn: false, combAge: 0, content: { empty: 1 } });

  /* Fog-of-war: if colony has never been inspected (or heft-only), show
     blank unknown frames so the player must inspect to learn what is inside */
  var _fogOfWar = !(colony && colony.known && !colony.known.heftOnly);

  var wrap = h('div', { class: 'cross-frames' });
  for (var fi = 0; fi < FRAMES; fi++) {
    if (_fogOfWar) {
      var unknownStrip = h('div', { class: 'cross-frame-strip cf-unknown', title: 'Inspect to reveal' });
      wrap.appendChild(unknownStrip);
    } else {
      var frame      = fs[fi] || { content: { empty: 1 } };
      var isQueen    = (fi === queenFrame && colony && colony.queen && colony.queen.present && !colony.queen.virgin);
      var isQCells   = (fi === qcellFrame && colony && colony.queenCells && colony.queenCells.type !== 'none'
                       && colony.known && colony.known.queenCells && colony.known.queenCells !== 'none');
      wrap.appendChild(_ui_buildFrameStrip(frame, type, isQueen, isQCells));
    }
  }
  return wrap;
}

/* Single frame strip — a narrow vertical slice coloured by content */
function _ui_buildFrameStrip(frame, type, isQueenFrame, isQCellFrame) {
  var content = frame.content || { empty: 1 };
  var isFoundation = (type === 'super' && frame.drawn === false);
  var cls = 'cross-frame'
    + (isQueenFrame ? ' cf-has-queen' : '')
    + (isQCellFrame ? ' cf-has-qcell' : '')
    + (isFoundation ? ' cf-foundation' : '');
  var strip = h('div', { class: cls });

  /* Bands rendered top→bottom in the strip */
  var bands;
  if (type === 'super') {
    bands = [
      { k: 'empty',  v: content.empty  || 0 },
      { k: 'nectar', v: content.nectar || 0 },
      { k: 'honey',  v: content.honey  || 0 }
    ];
  } else {
    bands = [
      { k: 'honey',    v: content.honey  || 0 },
      { k: 'pollen',   v: content.pollen || 0 },
      { k: 'capped',   v: content.capped || 0 },
      { k: 'larva',    v: content.larvae || 0 },
      { k: 'eggs',     v: content.eggs   || 0 },
      { k: 'drone',    v: content.drone  || 0 },
      { k: 'nectar',   v: content.nectar || 0 },
      { k: 'empty',    v: content.empty  || 0 }
    ];
  }

  var y = 0;
  bands.forEach(function(band) {
    if (band.v < 0.01) return;
    var pct  = Math.min(100 - y, band.v * 100);
    if (pct < 0.5) return;
    var div  = document.createElement('div');
    div.style.cssText = 'position:absolute;left:0;right:0;top:' + y.toFixed(1) + '%;height:' + pct.toFixed(1) + '%;';
    div.className     = 'cf-band cf-' + band.k;
    strip.appendChild(div);
    y += pct;
  });

  if (isQueenFrame) strip.appendChild(h('div', { class: 'cf-queen-dot', title: 'Queen' }));
  if (isQCellFrame) strip.appendChild(h('div', { class: 'cf-qcell-dot', title: 'Queen cells' }));

  return strip;
}

/* Swarm pressure bar — shown below the hive stack */
function _ui_buildSwarmPressureBar(colony) {
  var p    = colony.swarmPressure || 0;
  var week = (typeof Game !== 'undefined' && Game) ? Game.week : 1;
  var inWindow = (typeof _colony_inSwarmWindow === 'function') ? _colony_inSwarmWindow(week) : false;
  if (!inWindow && p < 0.15) return null;

  var pct   = Math.round(p * 100);
  var color = p < 0.4 ? '#4a9e5c' : p < 0.65 ? '#d4820a' : '#c03030';
  var level = p < 0.3 ? 'low' : p < 0.5 ? 'building' : p < 0.65 ? 'high' : 'critical';
  var hasQC = colony.queenCells && colony.queenCells.type === 'swarm';
  var labelText = pct + '% — ' + level + (hasQC ? ' ⚠️ cells present' : '');

  return h('div', { class: 'cross-swarm-bar' }, [
    h('div', { class: 'csb-header' }, [
      h('span', { class: 'csb-label' }, 'Swarm pressure'),
      h('span', { class: 'csb-pct', style: { color: color } }, labelText)
    ]),
    h('div', { class: 'csb-track' }, [
      h('div', { class: 'csb-fill', style: { width: pct + '%', background: color } })
    ])
  ]);
}

/* Estimate which frame index (0-10) the queen is on */
function _ui_estimateQueenFrameIdx(colony) {
  if (!colony.queen || !colony.queen.present || colony.queen.virgin) return -1;
  /* Queen tends toward the centre of the brood nest */
  return 5;
}

/* Estimate which frame index (0-10) queen cells are on */
function _ui_estimateQCellFrameIdx(colony) {
  if (!colony.queenCells || colony.queenCells.type === 'none') return -1;
  /* Swarm cells — lower-edge of brood frames, slightly off-centre */
  return colony.queenCells.type === 'swarm' ? 4 : 5;
}

/* ====================================================================
   BOX DETAIL MODAL — frame-by-frame management
   ==================================================================== */

function _ui_openBoxDetail(colony, boxType, boxIdx) {
  /* Ensure layout exists */
  if (!colony.hiveLayout && typeof colonyWeeklyLayoutSync === 'function') {
    colonyWeeklyLayoutSync(colony);
  }
  var layout = colony.hiveLayout || { broodBoxes: [], supers: [] };
  var box, titleText;

  if (boxType === 'super') {
    box = layout.supers && layout.supers[boxIdx];
    if (!box) { toast('Super data not available — advance the week first.', 'bad'); return; }
    var ht = (typeof HONEY_TYPES !== 'undefined' && HONEY_TYPES[box.honeyType]) || {};
    titleText = 'Super ' + (boxIdx + 1) + ' — ' + box.honeyKg.toFixed(1) + ' kg'
              + (ht.name ? ' (' + ht.name + ')' : '');
  } else {
    box = layout.broodBoxes && layout.broodBoxes[boxIdx];
    if (!box) { toast('Brood box data not available — advance the week first.', 'bad'); return; }
    titleText = colony.broodBoxes > 1 ? ('Brood box ' + (boxIdx + 1)) : 'Brood box';
  }

  var FRAMES   = 11;
  var frames   = box.frames ? box.frames.slice() : [];
  while (frames.length < FRAMES) frames.push({ drawn: false, combAge: 0, content: { empty: 1 } });

  var selectedFrame = Math.floor(FRAMES / 2);
  var showFaceB = false;  /* false = face A (toward you), true = face B (after rotation) */
  var bodyWrap = h('div', { class: 'frame-mgmt-body' });

  /* Compute the 'other side' of a frame. Edge frames store more honey on the outer face;
     central brood frames look nearly identical on both sides. */
  function _faceBContent(content, frameIdx) {
    var c = {};
    Object.keys(content || {}).forEach(function(k) { c[k] = content[k]; });
    var center = (FRAMES - 1) / 2;
    var distFromCenter = Math.abs(frameIdx - center) / center;
    /* Outer face of edge frames has more capped honey, less fresh brood */
    var shift = distFromCenter * 0.12;
    var available = Math.min(shift, c.empty || 0);
    c.honey = Math.min(1, (c.honey || 0) + available);
    c.empty = Math.max(0, (c.empty || 0) - available);
    /* Central frames: face B has slightly fewer eggs — queen laid there a day earlier */
    if (distFromCenter < 0.3) {
      var delta = (c.eggs || 0) * 0.18;
      c.eggs   = Math.max(0, (c.eggs   || 0) - delta);
      c.larvae = Math.min(1, (c.larvae || 0) + delta);
    }
    return c;
  }

  function buildPanel() {
    bodyWrap.innerHTML = '';

    /* ---- Frame strip row ------------------------------------------ */
    var qFrame  = (boxType === 'brood' && boxIdx === 0) ? _ui_estimateQueenFrameIdx(colony) : -1;
    var qcFrame = (boxType === 'brood' && boxIdx === 0) ? _ui_estimateQCellFrameIdx(colony) : -1;

    var thumbRow = h('div', { class: 'fm-thumbs-row' });
    frames.forEach(function(fr, fi) {
      var isQ   = fi === qFrame;
      var isQC  = fi === qcFrame && colony.queenCells && colony.queenCells.type !== 'none'
                  && colony.known && colony.known.queenCells !== 'none';
      var strip = _ui_buildFrameStrip(fr, boxType, isQ, isQC);
      strip.classList.add('fm-frame-thumb');
      if (fi === selectedFrame) strip.classList.add('fm-frame-selected');
      strip.title = 'Frame ' + (fi + 1) + ' — ' + _act_frameLabel(fi, FRAMES);
      strip.appendChild(h('div', { class: 'fm-frame-num' }, String(fi + 1)));
      (function(idx) {
        strip.addEventListener('click', function() { selectedFrame = idx; showFaceB = false; buildPanel(); });
      })(fi);
      thumbRow.appendChild(strip);
    });
    bodyWrap.appendChild(h('div', { class: 'fm-frames-section' }, [
      h('div', { class: 'fm-section-label' }, 'Frames — click to inspect'),
      thumbRow
    ]));

    /* ---- Selected frame detail ------------------------------------- */
    var fr     = frames[selectedFrame];
    var frLbl  = _act_frameLabel(selectedFrame, FRAMES);
    var isQFr  = selectedFrame === qFrame;
    var isQCFr = selectedFrame === qcFrame && colony.queenCells && colony.queenCells.type !== 'none'
                 && colony.known && colony.known.queenCells !== 'none';

    /* Face A = the side facing you when you lift the frame;
       Face B = after rotating 180° (keeping the top at the top) */
    var displayContent = showFaceB && fr.drawn
      ? _faceBContent(fr.content, selectedFrame)
      : (fr.content || { empty: 1 });
    var queenOnThisFace = isQFr && !showFaceB;  /* queen seen on face A only */

    var detailRight = h('div', { class: 'fm-detail-right' });

    /* Face indicator + flip button */
    var faceLabel = showFaceB ? 'Face B' : 'Face A';
    var flipBtn = h('button', {
      class: 'fm-flip-btn' + (showFaceB ? ' fm-flip-btn--b' : ''),
      title: showFaceB ? 'Rotate back to face A' : 'Rotate frame to see the other side'
    }, [
      h('span', { class: 'fm-flip-icon' }, '🔄'),
      h('span', {}, ' ' + faceLabel)
    ]);
    flipBtn.addEventListener('click', function() { showFaceB = !showFaceB; buildPanel(); });

    detailRight.appendChild(h('div', { class: 'fm-frame-header' }, [
      h('div', { class: 'fm-frame-title' }, 'Frame ' + (selectedFrame + 1) + ' — ' + frLbl),
      flipBtn
    ]));

    /* Frame state tags */
    var stateParts = [ fr.drawn ? 'Drawn comb' : 'Foundation — not yet drawn' ];
    if (fr.combAge > 0) {
      stateParts.push(['new','1 yr','2 yr','3 yr','4 yr','5+ yr'][Math.min(5, fr.combAge)] + ' old');
    }
    if (queenOnThisFace) stateParts.push('Queen seen');
    if (isQFr && showFaceB)  stateParts.push('Queen on face A — flip back to confirm');
    if (isQCFr) stateParts.push('Queen cells (' + colony.queenCells.type + ')');

    var detailLeft;
    if (boxType === 'brood') {
      /* Full hex comb on the left — content varies by face */
      var synFrame = {
        cells:         _ui_contentToCells(displayContent),
        hasQueen:      queenOnThisFace,
        queenCellType: (colony.queenCells && colony.queenCells.type) || 'none',
        label:         frLbl
      };
      if (!isQCFr) synFrame.cells.qcell = 0;
      else synFrame.cells.qcell = Math.min((colony.queenCells && colony.queenCells.count) || 0, 4);
      detailLeft = h('div', { class: 'fm-comb-col' }, [
        _ui_buildComb(synFrame)
      ]);
    } else {
      /* Super frame: hex comb showing honey cells */
      var fillFrac = (fr.content.honey || 0) + (fr.content.nectar || 0);
      var S = 99; /* cell scale (11 cols × 9 rows = 99 cells) */
      var cappedN  = Math.round(fillFrac * 0.75 * S);
      var nectarN  = Math.round(fillFrac * 0.25 * S);
      var emptyN   = Math.max(0, S - cappedN - nectarN);
      var superCombFrame = {
        cells: {
          honey: cappedN, nectar: nectarN, empty: emptyN,
          eggs: 0, larva: 0, capbrood: 0, dronebr: 0, pollen: 0,
          qcell: 0, disease: 0, mite: 0, found: 0
        },
        hasQueen: false, queenCellType: 'none', label: frLbl
      };
      var pctLabel = h('div', { class: 'fm-sfv-pct' }, (fillFrac * 100).toFixed(0) + '% full');
      detailLeft = h('div', { class: 'fm-comb-col' }, [
        h('div', { class: 'fm-super-comb-wrap' }, [
          _ui_buildComb(superCombFrame),
          pctLabel
        ])
      ]);
    }

    var detailSide = h('div', { class: 'fm-comb-side' }, [
      h('div', { class: 'fm-frame-state' }, stateParts.join(' · ')),
      boxType === 'brood' ? _ui_buildCombLegend(colony) : null,
      boxType === 'brood' ? h('div', { class: 'fm-comb-tip' }, [
        h('b', {}, 'Reading the comb: '),
        'The brood nest sits centrally — eggs (pale) at the heart, larvae around them, capped brood (brown) on the outer ring. Pollen bands hug the brood; honey arches over the top and fills the outer frames.'
      ]) : null
    ]);

    bodyWrap.appendChild(h('div', { class: 'fm-detail-wrap' }, [detailLeft, detailSide]));

    /* ---- Super summary (supers only) ------------------------------- */
    if (boxType === 'super') {
      var cap    = SIM.honeyPerSuper;
      var filPct = Math.round(box.honeyKg / cap * 100);
      var ht2    = (typeof HONEY_TYPES !== 'undefined' && HONEY_TYPES[box.honeyType]) || {};
      var advice = '';
      if (filPct >= 80)            advice = '✓ This super is nearly full — add another or harvest soon.';
      else if (filPct > 0 && filPct < 20) advice = '⚠ Only a small amount so far — check back when the flow is on.';

      bodyWrap.appendChild(h('div', { class: 'fm-super-info' }, [
        h('div', { class: 'fm-si-row' }, [
          h('span', {}, 'Total honey: '),
          h('b', {}, box.honeyKg.toFixed(1) + ' kg / ' + cap + ' kg (' + filPct + '% full)')
        ]),
        ht2.name ? h('div', { class: 'fm-si-row' }, [
          h('span', {}, 'Honey type: '),
          h('b', {}, ht2.name),
          ht2.note ? h('span', { class: 'fm-si-note' }, ' — ' + ht2.note) : null
        ]) : null,
        advice ? h('div', { class: 'fm-si-advice ' + (filPct >= 80 ? 'good' : 'warn') }, advice) : null
      ]));
    }
  }

  buildPanel();

  function _backToHive() { closeModal(); if (colony.alive) openHiveDetail(colony, 'actions'); }
  var buttons = [{ label: '← Back', act: _backToHive }];
  if (boxType === 'super' && colony.alive) {
    buttons.unshift({ label: '🍯 Harvest honey', cls: 'btn-leaf', act: function() {
      closeModal();
      _ui_openHarvestDialog(colony);
    } });
  }

  openModal({ title: titleText, body: bodyWrap, wide: true, buttons: buttons });
}

/* Convert layout content fractions to inspection-style cell counts (0..200) */
function _ui_contentToCells(content) {
  var S = 200;
  var c = content || {};
  return {
    eggs:     Math.round((c.eggs   || 0) * S),
    larva:    Math.round((c.larvae || 0) * S),
    capbrood: Math.round((c.capped || 0) * S),
    dronebr:  Math.round((c.drone  || 0) * S),
    honey:    Math.round((c.honey  || 0) * S),
    nectar:   Math.round((c.nectar || 0) * S),
    pollen:   Math.round((c.pollen || 0) * S),
    empty:    Math.round((c.empty  || 0) * S),
    qcell: 0, disease: 0, mite: 0, found: 0
  };
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
  var qcLabel = { swarm: 'Swarm cells', postSwarm: 'Post-swarm cells', emergency: 'Emergency cells', supersedure: 'Supersedure cells' }[qc] || (qc === 'none' ? 'None' : cap(qc));
  rows.push(row('Queen cells', qcLabel,
    qc === 'swarm' || qc === 'postSwarm' ? 'bad' : qc === 'none' ? 'good' : 'warn',
    qc === 'none' ? 'No swarm preparations under way.'
      : qc === 'swarm' ? 'The colony means to swarm — take swarm-control action now.'
      : qc === 'postSwarm' ? 'The old queen has left with the swarm. A virgin is present and should mate within a week or two — leave well alone unless she fails.'
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

  /* Last inspected timestamp */
  var inspWeek = known.week || 0;
  var curWeek  = (typeof Game !== 'undefined' && Game) ? Game.week : inspWeek;
  var weeksBack = curWeek - inspWeek;
  var inspLabel = weeksBack <= 0 ? 'This week'
    : weeksBack === 1 ? '1 week ago'
    : weeksBack + ' weeks ago';
  var inspTone = weeksBack >= 3 ? 'warn' : 'neutral';

  rows.push(row('Last inspected', inspLabel, inspTone,
    weeksBack >= 3
      ? 'It has been a while — the colony\'s situation may have changed since this snapshot was taken.'
      : weeksBack >= 1 ? 'The snapshot below was taken ' + weeksBack + ' week' + (weeksBack === 1 ? '' : 's') + ' ago.'
      : 'Inspected today — this is a fresh read.'));

  return h('div', {}, [
    h('div', { class: 'card-title', text: 'What you saw last inspection' }),
    h('div', { class: 'known-list' }, rows)
  ]);
}

/* Returns the honey kg in the top super (for remove-super disable logic) */
function _ui_topSuperHoney(colony) {
  if (!colony || (colony.supers || 0) === 0) return 0;
  if (colony.hiveLayout && colony.hiveLayout.supers && colony.hiveLayout.supers.length > 0) {
    var top = colony.hiveLayout.supers[colony.hiveLayout.supers.length - 1];
    return top ? (top.honeyKg || 0) : 0;
  }
  return (colony.superHoney || 0) / Math.max(colony.supers, 1);
}

function _ui_buildDeadPanel(colony) {
  var cause = colony.deadReason || 'Unknown cause';
  var weekDied = colony.deadWeek || null;
  var weeksAgo = weekDied ? Math.max(0, Game.week - weekDied) : null;

  var clearBtn = h('button', {
    class: 'btn btn-sm btn-primary',
    text: '📦 Clear the site',
    onclick: function() {
      var supers = colony.supers || 0;
      var boxes  = colony.broodBoxes || 1;
      Game.inventory.spareHives = (Game.inventory.spareHives || 0) + 1;
      if (supers > 0) Game.inventory.supers = (Game.inventory.supers || 0) + supers;
      colony.cleared = true;
      logEvent('📦', 'Cleared ' + colony.name + '. Equipment returned to stock.', 'plain');
      toast('Equipment back in stock — hive and supers recovered.', 'good');
      render();
    }
  });
  if (colony.cleared) clearBtn.disabled = true;

  var tips = {
    'starvation':    'Feed colonies in autumn — 2 kg sugar syrup per week until stores feel heavy when you heft the hive.',
    'varroa':        'Treat in late summer once the main crop is off. Aim for a mite count below 1 per 100 bees before winter.',
    'queenlessness': 'Check for eggs every two weeks during spring and summer. Act quickly — a queenless colony only has weeks.',
    'chilling':      'In spring, size the colony to its bee numbers — a small cluster cannot cover a large brood nest.',
    'unknown':       'Keep a hive diary so you can spot what changed in the weeks before a loss.'
  };
  var tipKey = Object.keys(tips).find(function(k) { return cause.toLowerCase().indexOf(k) !== -1; }) || 'unknown';

  return h('div', { class: 'dead-colony-panel' }, [
    h('div', { class: 'dead-col-header' }, [
      h('span', { class: 'dead-col-icon' }, '🪦'),
      h('div', {}, [
        h('div', { class: 'dead-col-title' }, colony.name + ' — colony lost'),
        h('div', { class: 'dead-col-cause' }, 'Cause: ' + cause +
          (weeksAgo !== null ? ' · ' + weeksAgo + ' week' + (weeksAgo === 1 ? '' : 's') + ' ago' : ''))
      ])
    ]),
    h('p', { class: 'dead-col-tip' }, '💡 ' + tips[tipKey]),
    h('div', { class: 'dead-col-actions' }, [
      colony.cleared
        ? h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Equipment already recovered.')
        : [
            h('p', { style: { fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '8px' } },
              'Recover the hive and any supers, then buy a new nucleus when you\'re ready.'),
            clearBtn
          ]
    ])
  ]);
}

function _ui_buildActionButtons(colony) {
  var dead = !colony.alive;
  if (dead) return _ui_buildDeadPanel(colony);

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

  /* === Queen state summary === */
  var queenSummary = (function() {
    if (dead) {
      return h('div', { class: 'queen-summary qs-dead' }, [
        h('span', { class: 'qs-ico' }, '💀'),
        h('span', { class: 'qs-text' }, 'Colony lost — ' + (colony.deadReason || 'unknown cause'))
      ]);
    }
    /* Fog of war: until the colony has been inspected, the queen's state
       is genuinely not known to the player. The cross-section area says
       "Queen status unknown — inspect to find out" — we used to contradict
       it here with "Queen present — 14 weeks old" pulled straight from
       the data model. Mirror the fog-of-war so the two surfaces agree. */
    var _hasInspectedQS = colony.known && !colony.known.heftOnly;
    if (!_hasInspectedQS) {
      return h('div', { class: 'queen-summary qs-unknown' }, [
        h('span', { class: 'qs-ico' }, '❔'),
        h('span', { class: 'qs-text' }, 'Queen status unknown — inspect to find out')
      ]);
    }
    var q = colony.queen;
    var icon, text, cls;
    if (!q || !q.present) {
      if (colony.queenCells) {
        icon = '🥚'; text = 'Queenless — queen cells present'; cls = 'qs-warn';
      } else {
        icon = '⚠️'; text = 'Queenless — no queen found'; cls = 'qs-bad';
      }
    } else {
      var qParts = [];
      /* queen.age counts in WEEKS, not years. Show a beekeeper-style age:
         "X weeks old" for first-year queens, then "year 2", "year 3"
         once she has overwintered. Previously rendered as "year 14"
         when the queen was only 14 weeks old. */
      if (q.age != null) {
        if (q.age < 52) qParts.push(q.age + ' week' + (q.age === 1 ? '' : 's') + ' old');
        else qParts.push('year ' + (Math.floor(q.age / 52) + 1));
      }
      if (q.marked) qParts.push('marked');
      if (q.clipped) qParts.push('clipped');
      icon = '👑';
      text = 'Queen present' + (qParts.length ? ' — ' + qParts.join(', ') : '');
      cls = 'qs-ok';
    }
    return h('div', { class: 'queen-summary ' + cls }, [
      h('span', { class: 'qs-ico' }, icon),
      h('span', { class: 'qs-text' }, text)
    ]);
  })();

  /* Before first inspection there's nothing useful you can DO without
     looking inside the hive. Make the Inspect button visually own the
     row alone for that first beat — it's the one action that earns the
     others. After a first inspection, it returns to the normal lineup. */
  var _firstInspection = !(colony.known && !colony.known.heftOnly);
  var inspectBtn = h('button', {
    class: 'btn btn-sm btn-primary' + (_firstInspection ? ' btn-block' : ''),
    text: _firstInspection ? '🔍 Inspect the hive (start here)' : '🔍 Inspect the hive',
    onclick: function() {
      if (dead) { toast('This colony has died.', 'bad'); return; }
      closeModal();
      openInspection(colony);
    }
  });
  if (dead) inspectBtn.disabled = true;

  /* === Primary actions === */
  var primary = h('div', { class: 'action-primary-row' + (_firstInspection ? ' first-inspection' : '') }, [
    inspectBtn,
    abtn('🍯 Harvest', 'btn-leaf', 'harvest',
      dead || (colony.supers || 0) === 0 || (colony.superHoney || 0) === 0,
      dead ? 'This colony has died' : (colony.supers || 0) === 0 ? 'No supers on the hive to harvest' : 'Nothing in the supers yet'),
    abtn('🌿 Feed', 'btn-action', 'feed', dead, 'This colony has died'),
    abtn('💊 Treat varroa', 'btn-action', 'treat',
      dead || !!(colony.treatment && colony.treatment.weeksLeft > 0),
      dead ? 'This colony has died' : 'Treatment already active — wait for it to finish'),
    abtn('📦 Add super', 'btn-action', 'addSuper',
      dead || (colony.supers || 0) >= 5 || (Game.inventory.supers || 0) < 1,
      dead ? 'This colony has died'
           : (colony.supers || 0) >= 5 ? 'Plenty of supers on already'
           : 'No supers in stock — buy from Market → Supplies')
  ]);

  /* === Management actions === */
  var mgmt = h('div', { class: 'action-group' }, [
    h('div', { class: 'action-group-title' }, '🔧 Hive management'),
    h('div', { class: 'btn-row' }, [
      abtn('Clearer board', '', 'fitClearerBoard',
        dead || (colony.supers || 0) === 0 || !!colony.clearerFitted,
        dead ? 'This colony has died' : (colony.supers || 0) === 0 ? 'No supers on the hive' : 'Clearer board already fitted — harvest when ready'),
      abtn('Take box off', '', 'removeSuper',
        dead || (colony.supers || 0) === 0 || _ui_topSuperHoney(colony) >= 0.5,
        dead ? 'This colony has died' : (colony.supers || 0) === 0 ? 'No supers to remove' : 'Top super still has honey — harvest it first'),
      abtn('Add brood box', '', 'addBroodBox',
        dead || colony.broodBoxes >= 2 || (Game.inventory.broodBoxes || 0) < 1,
        dead ? 'This colony has died'
             : colony.broodBoxes >= 2 ? 'Already on double brood'
             : 'No brood boxes in stock — buy from Market → Supplies'),
      abtn('Entrance', '', 'entrance', dead, 'This colony has died'),
      abtn('Monitor varroa', '', 'monitorVarroa', dead, 'This colony has died'),
      abtn('Heft colony', '', 'heftColony', dead, 'This colony has died'),
      abtn('Move hive', '', 'moveHive',
        dead || !Game.apiaries || Game.apiaries.length < 2,
        dead ? 'This colony has died' : 'Only one apiary — add another to move hives between them')
    ])
  ]);

  /* === Swarm control === */
  var swarm = h('div', { class: 'action-group' }, [
    h('div', { class: 'action-group-title' }, '🐝 Swarm control'),
    h('div', { class: 'btn-row' }, [
      abtn('Artificial swarm', '', 'artificialSwarm', dead, 'This colony has died'),
      abtn('Nucleus method', '', 'nucleusMethod', dead, 'This colony has died'),
      abtn('Split colony', '', 'split', dead, 'This colony has died'),
      abtn('Remove queen cells', '', 'removeQueenCells',
        dead || (!!(colony.queenCells && colony.queenCells.type === 'emergency' && (!colony.queen || !colony.queen.present))),
        dead ? 'This colony has died' : 'Cannot remove emergency cells — they are raising the only queen this colony has'),
      abtn('Clip queen', '', 'clipQueen', dead || !(colony.queen && colony.queen.present),
        'No queen present to clip'),
      abtn('Demaree method', '', 'demareeMethod',
        dead || !!colony.demaree || (Game.inventory.broodBoxes || 0) < 1,
        dead ? 'This colony has died'
             : colony.demaree ? 'Demaree already in progress'
             : 'No brood boxes in stock — buy from Market → Supplies'),
      colony.demaree && !colony.demaree.checked
        ? abtn('Demaree check', colony.demaree.age >= 1 ? 'btn-danger' : '', 'demareeCheck', dead, 'This colony has died')
        : null
    ])
  ]);

  /* === Queen & colony === */
  var queenGroup = h('div', { class: 'action-group' }, [
    h('div', { class: 'action-group-title' }, '👑 Queen and colony'),
    h('div', { class: 'btn-row' }, [
      abtn('Requeen', '', 'requeen', dead, 'This colony has died'),
      abtn('Mark queen', '', 'markQueen',
        dead || !(colony.queen && colony.queen.present && !colony.queen.marked),
        'No unmarked queen to mark'),
      abtn('Rear queens', '', 'rearQueens', dead, 'This colony has died'),
      abtn('Unite colonies', '', 'unite',
        dead || (typeof aliveColonies === 'function' && aliveColonies().length < 2),
        'No other colony to unite with')
    ])
  ]);

  /* === Danger zone — destructive, irreversible === */
  var dangerZone = h('div', { class: 'action-danger-zone' }, [
    h('div', { class: 'action-group-title' }, '⚠️ Danger zone'),
    h('div', { class: 'btn-row' }, [
      abtn('Sell colony', 'btn-danger', 'sellColony', dead, 'This colony has died')
    ])
  ]);

  return h('div', {}, [queenSummary, primary, mgmt, swarm, queenGroup, dangerZone]);
}

/* ====================================================================
   ACTION EDUCATION DIALOG
   Every action opens a guided dialog: what it is, why and when it is
   done, what to watch for, plus this colony's current situation —
   then confirms. It teaches as you go, and re-reads as a reminder.
   ==================================================================== */

/* ====================================================================
   HARVEST DIALOG — per-super selection
   ==================================================================== */
function _ui_openHarvestDialog(colony) {
  if (!colony || !colony.alive) { toast('Colony is not alive.', 'bad'); return; }
  if ((colony.supers || 0) === 0) { toast('No supers on this hive to harvest.', 'bad'); return; }

  /* Ensure layout is synced */
  if (!colony.hiveLayout && typeof colonyWeeklyLayoutSync === 'function') colonyWeeklyLayoutSync(colony);
  var layout = colony.hiveLayout || { supers: [] };

  var cap = (typeof SIM !== 'undefined' && SIM.honeyPerSuper) ? SIM.honeyPerSuper : 13;
  var hasClearer = !!(Game.inventory && Game.inventory.tools && Game.inventory.tools.clearerBoard);

  /* Build one row per super */
  var checked = []; /* which supers are ticked for harvest */
  var rows = [];

  for (var si = 0; si < colony.supers; si++) {
    var sup = (layout.supers && layout.supers[si]) || { honeyKg: colony.superHoney / colony.supers, honeyType: 'summer' };
    var kg  = sup.honeyKg || 0;
    var pct = Math.round(kg / cap * 100);
    var ht  = (typeof HONEY_TYPES !== 'undefined' && HONEY_TYPES[sup.honeyType]) || {};

    /* Default: tick supers that are ≥ 60% full */
    checked[si] = pct >= 60;

    var fillColor = pct >= 80 ? '#4a9e5c' : pct >= 40 ? '#d4901f' : '#b03f24';
    var fillBar = h('div', { class: 'harv-fill-bar' }, [
      h('div', { class: 'harv-fill-fill', style: { width: pct + '%', background: fillColor } })
    ]);

    var cb = h('input', { type: 'checkbox', class: 'harv-cb', id: 'harv-cb-' + si });
    cb.checked = checked[si];
    (function(idx, checkbox) {
      checkbox.addEventListener('change', function() {
        checked[idx] = checkbox.checked;
        /* Update jar yield estimate dynamically */
        var yieldEl = document.getElementById('harv-yield-note');
        if (yieldEl) {
          var tot = 0;
          for (var k = 0; k < checked.length; k++) {
            if (checked[k]) {
              var s2 = (layout.supers && layout.supers[k]) || { honeyKg: colony.superHoney / colony.supers };
              tot += (s2.honeyKg || 0);
            }
          }
          var jars = Math.floor(tot * 1000 / 454);
          yieldEl.textContent = jars > 0
            ? '~ ' + jars + ' standard 1 lb jar' + (jars !== 1 ? 's' : '') + ' estimated from selected supers.'
            : 'Select a super above to see estimated jar yield.';
        }
      });
    })(si, cb);

    var row = h('div', { class: 'harv-super-row' }, [
      h('label', { class: 'harv-super-label', 'for': 'harv-cb-' + si }, [
        cb,
        h('span', { class: 'harv-super-num' }, 'Super ' + (si + 1)),
        fillBar,
        h('span', { class: 'harv-kg' }, kg.toFixed(1) + ' kg'),
        h('span', { class: 'harv-pct' }, '(' + pct + '%)'),
        ht.name ? h('span', { class: 'harv-type' }, ht.name) : null
      ])
    ]);
    rows.push(row);
  }

  /* Jar yield estimate: 454 g per lb jar, ~340 g per 12 oz jar. Use 454 g (1 lb) as standard. */
  var totalSelectedKg = 0;
  for (var ci = 0; ci < checked.length; ci++) {
    if (checked[ci]) {
      var csup = (layout.supers && layout.supers[ci]) || { honeyKg: colony.superHoney / colony.supers };
      totalSelectedKg += (csup.honeyKg || 0);
    }
  }
  var jarYield = Math.floor(totalSelectedKg * 1000 / 454);

  var yieldNote = h('div', { class: 'harv-note', id: 'harv-yield-note' },
    jarYield > 0
      ? '~ ' + jarYield + ' standard 1 lb jar' + (jarYield !== 1 ? 's' : '') + ' estimated from selected supers.'
      : 'Select a super above to see estimated jar yield.');

  var boxStaysNote = h('div', { class: 'harv-note' },
    '🍯 Box stays on hive — frames are emptied and left for the bees to refill. Use "Take box off" to physically remove an empty box.');

  var note = hasClearer
    ? h('div', { class: 'harv-note' }, '✓ You have a clearer board — bees cleared cleanly, no honey loss.')
    : h('div', { class: 'harv-note warn' }, '⚠ No clearer board — you\'ll brush bees off and lose ~8% of the honey.');

  var body = h('div', { class: 'harv-body' }, [
    h('div', { class: 'harv-intro' }, 'Select which supers to harvest. The box stays on the hive — only the honey is taken:'),
    h('div', { class: 'harv-rows' }, rows),
    boxStaysNote,
    yieldNote,
    note
  ]);

  function doHarvest() {
    /* Harvest in reverse-index order so splice doesn't shift indices */
    var toHarvest = [];
    for (var i = 0; i < checked.length; i++) { if (checked[i]) toHarvest.push(i); }
    if (toHarvest.length === 0) { toast('No supers selected.', 'bad'); return; }

    var totalKg = 0;
    for (var j = toHarvest.length - 1; j >= 0; j--) {
      var res = harvestSuperAt(colony, toHarvest[j]);
      if (res.ok) totalKg += res.kg;
    }
    closeModal();
    render();
    if (colony.alive) openHiveDetail(colony, 'actions');
  }

  function backToHive() { closeModal(); if (colony.alive) openHiveDetail(colony, 'actions'); }

  openModal({
    title: '🍯 Harvest honey — ' + colony.name,
    body: body,
    buttons: [
      { label: '🍯 Harvest selected', cls: 'btn-leaf', act: doHarvest },
      { label: 'Cancel', act: backToHive }
    ]
  });
}

function _ui_actionDialog(key, colony) {
  if (key === 'harvest') { _ui_openHarvestDialog(colony); return; }
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
  function back() { closeModal(); if (colony.alive) openHiveDetail(colony, 'actions'); }

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
        if (colony.alive) openHiveDetail(colony, 'actions');
      } }
    ] });
  }
}

/* What an action costs — money, or kit it consumes */
function _ui_actionCost(key, colony) {
  if (key === 'addSuper') {
    var _supersOwned = (Game.inventory && Game.inventory.supers) || 0;
    if (_supersOwned > 0) {
      return { amount: 0, note: 'Using a super from your stock (' + _supersOwned + ' available). Fit a queen excluder separately if you need to keep the queen out of the supers.' };
    }
    return { amount: null, note: 'No supers in stock — buy one from the Market (Supplies tab) first. They cost £' + COSTS.superAdd + ' each.' };
  }
  if (key === 'fitQueenExcluder') {
    var qxOwned = (Game.inventory.queenExcluders || 0) > 0;
    return { amount: qxOwned ? 0 : COSTS.queenExcluder,
      note: qxOwned ? 'Using a queen excluder from your stock.'
                    : 'Buying a wire queen excluder (£' + COSTS.queenExcluder + '). Placed between the brood box and supers.' };
  }
  if (key === 'removeQueenExcluder') {
    return { amount: 0, note: 'Free — removes the excluder and returns it to your equipment stock.' };
  }
  if (key === 'placeNewspaper') {
    var npOwned = (Game.inventory.newspaper || 0) > 0;
    return { amount: npOwned ? 0 : 1,
      note: npOwned ? 'Using newspaper from your stock.'
                    : '£1 for a sheet of newspaper. Placed between the two brood boxes for a slow unite.' };
  }
  if (key === 'addBroodBox') {
    var _bbOwned = (Game.inventory && Game.inventory.broodBoxes) || 0;
    if (_bbOwned > 0) {
      return { amount: 0, note: 'Using a brood box from your stock (' + _bbOwned + ' available). Gives the queen more laying space.' };
    }
    return { amount: null, note: 'No brood boxes in stock — buy one from the Market (Supplies tab) first. They cost £' + COSTS.broodBoxAdd + ' each.' };
  }
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
  if (key === 'harvest') return { amount: 0, note: 'The box stays on the hive after harvest. Extracting and bottling the honey costs a little later.' };
  if (key === 'removeSuper') return { amount: 0, note: 'Free — takes the empty box off the hive and returns it to your equipment stock.' };
  if (key === 'heftColony') return { amount: 0, note: 'Free — just lift the back of the hive to feel its weight.' };
  if (key === 'fitClearerBoard') {
    var cbCost = !(Game.inventory && Game.inventory.tools && Game.inventory.tools.clearerBoard) ? 8 : 0;
    return { amount: cbCost, note: cbCost ? 'Hire a clearer board for one night (£8). Fit it this evening and harvest tomorrow morning.' : 'You own a clearer board — fit it tonight and harvest tomorrow.' };
  }
  if (key === 'demareeMethod') {
    var _demareebbOwned = (Game.inventory && Game.inventory.broodBoxes) || 0;
    if (_demareebbOwned > 0) {
      return { amount: 0, note: 'Uses a brood box from your stock (' + _demareebbOwned + ' available). The colony stays intact — no hive used for a new colony.' };
    }
    return { amount: null, note: 'No brood boxes in stock — buy one from the Market (Supplies tab) first. They cost £' + COSTS.broodBoxAdd + ' each.' };
  }
  if (key === 'demareeCheck') return { amount: 0, note: 'Free — just open the top box and destroy the emergency cells.' };
  if (key === 'moveHive') return { amount: typeof COSTS !== 'undefined' ? COSTS.movehive : 25, note: 'Transport and strapping. Foragers may return to the old site — expect a short-term drop in numbers.' };
  if (key === 'rearQueens') return { amount: 0, note: 'Free, but needs a strong colony (18,000+ bees) and skill level 5 or above.' };
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
      if (colony.alive) openHiveDetail(colony, 'actions');
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

  if (key === 'moveHive') {
    var otherApiaries = (Game.apiaries || []).filter(function(a) { return a.id !== colony.apiaryId; });
    if (!otherApiaries.length) return { run: function() { return { ok: false, msg: 'No other apiary to move to.' }; }, confirmLabel: 'Move' };
    return { options: otherApiaries.map(function(ap) {
      return opt('Move to ' + ap.name, 'Costs £' + (typeof COSTS !== 'undefined' ? COSTS.movehive : 25) + ' — foragers may return to old site.',
        function() { return moveHive(colony, ap.id); });
    }) };
  }

  var runners = {
    addSuper: function() { return addSuper(colony); },
    addBroodBox: function() { return addBroodBox(colony); },
    removeSuper: function() { return removeSuper(colony); },
    fitClearerBoard: function() { return fitClearerBoard(colony); },
    heftColony: function() { return heftColony(colony); },
    artificialSwarm: function() { return artificialSwarm(colony); },
    nucleusMethod: function() { return nucleusMethod(colony); },
    split: function() { return splitColony(colony); },
    removeQueenCells: function() { return removeQueenCells(colony); },
    clipQueen: function() { return clipQueen(colony); },
    demareeMethod: function() { return demareeMethod(colony); },
    demareeCheck: function() { return demareeCheck(colony); },
    requeen: function() { return requeen(colony, 'bought'); },
    markQueen: function() { return markQueen(colony); },
    rearQueens: function() { return rearQueens(colony); },
    monitorVarroa: function() { return monitorVarroa(colony, 'sugar'); },
    harvest: function() { return harvestColony(colony); },
    sellColony: function() { return sellColony(colony, false); },
    fitQueenExcluder: function() { return fitQueenExcluder(colony); },
    removeQueenExcluder: function() { return removeQueenExcluder(colony); },
    placeNewspaper: function() { return placeNewspaper(colony); },
    unite: function() {
      var others = aliveColonies().filter(function(c) { return c.id !== colony.id; })
        .sort(function(a, b) { return b.population - a.population; });
      if (!others.length) return { ok: false, msg: 'No other colony to unite with.' };
      return uniteColonies(colony, others[0]);
    }
  };
  var labels = {
    addSuper: 'Add the super', addBroodBox: 'Add the brood box',
    removeSuper: 'Take the box off', fitClearerBoard: 'Fit the clearer board',
    heftColony: 'Heft the hive',
    artificialSwarm: 'Carry out the artificial swarm', nucleusMethod: 'Make up the nucleus',
    split: 'Make the split', removeQueenCells: 'Knock the cells down',
    clipQueen: 'Clip the queen',
    demareeMethod: 'Carry out the Demaree', demareeCheck: 'Destroy the emergency cells',
    requeen: 'Buy and introduce a new queen',
    markQueen: 'Mark the queen', rearQueens: 'Start queen rearing',
    monitorVarroa: 'Take a sugar-roll sample',
    harvest: 'Take the honey off', sellColony: 'Sell this colony',
    fitQueenExcluder: 'Fit the queen excluder',
    removeQueenExcluder: 'Remove the queen excluder',
    placeNewspaper: 'Place newspaper between brood boxes',
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
  if (key === 'heftColony') {
    var wkInYr = ((Game.week - 1) % 52) + 1;
    var isWinter = (wkInYr <= 8 || wkInYr >= 44);
    return isWinter
      ? 'it is deep winter — hefting is the safe way to check stores without breaking the cluster.'
      : 'hefting gives a rough stores reading at any time of year without opening the hive.';
  }
  if (key === 'removeSuper') {
    var ts = _ui_topSuperHoney(colony);
    if (ts >= 0.5) return 'the top super still has ' + ts.toFixed(1) + ' kg of honey — harvest it before removing the box.';
    return 'the top super is nearly empty and ready to come off.';
  }
  if (key === 'fitClearerBoard') {
    return colony.clearerFitted
      ? 'the clearer board is already fitted — the bees should have cleared overnight. Ready to harvest.'
      : 'fit it tonight and the super should be bee-free by morning.';
  }
  if (key === 'demareeMethod') {
    if (!colony.queenExcluder) return 'a queen excluder must be fitted first before you can carry out a Demaree.';
    if (!colony.known || !colony.known.queenSeen) return 'you need to find the queen at inspection before you can carry out a Demaree.';
    return 'swarm pressure is ' + (colony.swarmPressure > 0.5 ? 'high — a Demaree would relieve it without losing any bees.' : 'moderate. Consider this if cells appear.');
  }
  if (key === 'demareeCheck') {
    if (!colony.demaree) return 'no Demaree in progress.';
    var dAge = colony.demaree.age || 0;
    return dAge >= 1
      ? 'the Demaree is ' + dAge + ' week(s) old — emergency cells in the top box must be destroyed now before a virgin emerges.'
      : 'the Demaree was carried out this week. Return in 7 days to destroy the emergency cells.';
  }
  if (key === 'moveHive') {
    var curApiary = (Game.apiaries || []).find(function(a) { return a.id === colony.apiaryId; });
    return 'currently at ' + (curApiary ? curApiary.name : 'unknown apiary') + '. Moving costs foragers — the colony will rebuild.';
  }
  if (key === 'rearQueens') {
    var sl2 = (typeof skillLevel === 'function') ? skillLevel(Game.skillXp) : 1;
    if (sl2 < 5) return 'queen rearing requires skill level 5 — you are at level ' + sl2 + '. Keep practising inspections and swarm control.';
    if (colony.population < 18000) return 'the colony needs to be at peak summer strength (18,000+ bees). Currently around ' + Math.round((colony.population || 0) / 1000) + 'k bees.';
    return 'the colony is strong enough to act as a cell raiser.';
  }
  if (key === 'fitQueenExcluder') {
    if (colony.queenExcluder) return 'a queen excluder is already fitted on this hive.';
    if ((colony.supers || 0) === 0) return 'no supers are on the hive yet — fit the excluder before adding a super, or add the super first.';
    return 'without a queen excluder the queen can move up into the supers and lay there, ruining the honey.';
  }
  if (key === 'removeQueenExcluder') {
    if (!colony.queenExcluder) return 'no queen excluder is fitted.';
    if ((colony.supers || 0) > 0) return 'supers are still on the hive — the queen can now access them. Remove supers first if this is not intentional.';
    return 'returning the excluder to stock.';
  }
  if (key === 'placeNewspaper') {
    if ((colony.broodBoxes || 1) < 2) return 'you need a double-brood hive to use newspaper uniting.';
    if (colony.stack && colony.stack.some(function(i) { return i.type === 'newspaper'; })) return 'newspaper is already in place — wait for the bees to chew through it.';
    return 'the bees from both boxes will chew through the newspaper over about a week, combining gradually and reducing fighting.';
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

  /* Deep winter = hard block. Bad-but-not-winter weather = soft warning with option to proceed. */
  if (report.hardBlock) {
    openModal({
      title: 'Cannot inspect in deep winter',
      body: h('div', { class: 'modal-body' }, [
        h('div', { class: 'explainer' }, [
          h('div', { class: 'explainer-body' }, [
            h('p', { text: report.blockReason }),
            h('p', { html: '<b>What to do instead:</b> heft the hive from behind — if it feels light, slide a block of fondant under the crown board. No need to open it until March.' })
          ])
        ])
      ]),
      buttons: [{ label: 'OK — I\'ll wait', cls: 'btn-primary', act: closeModal }]
    });
    return;
  }

  /* Suboptimal weather: warn but allow the player to proceed.
     In a week-based game the player picks the best day of the week.
     Blocking entirely for rain/cool weather would lock them out for weeks. */
  if (report.weatherWarning) {
    openModal({
      title: 'Conditions are not ideal',
      body: h('div', { class: 'modal-body' }, [
        h('div', { class: 'explainer' }, [
          h('div', { class: 'explainer-body' }, [
            h('p', { text: report.blockReason }),
            h('p', { html: '<b>When to inspect:</b> choose a calm, dry day above 12°C when foragers are flying. Inspecting in poor conditions makes disease signs and queen cells harder to spot, and the bees more defensive.' })
          ])
        ])
      ]),
      buttons: [
        { label: 'OK — I\'ll wait', cls: 'btn-secondary', act: closeModal },
        { label: 'Inspect anyway', cls: 'btn-primary', act: function() {
          closeModal();
          _openInspectionModal(colony, report);
        }}
      ]
    });
    return;
  }

  _openInspectionModal(colony, report);
}

/* Separated so the "Inspect anyway" button on the weather warning can call it directly. */
function _openInspectionModal(colony, report) {
  var frames = report.frames || [];
  var selected = 0;
  var seen = {};        // frame index -> true once it has been lifted
  var answers = {};     // frame index -> { chosen, correct }
  var faceFlip = {};    // frame index -> true when showing face B
  seen[0] = true;

  /* The teaching Q&A runs only until the player has completed one full
     inspection — after that, lifting a frame just shows its reading. */
  var teaching = !(Game.flags && Game.flags.inspectionTaught);

  /* Produce face B cells: edge frames gain honey on outer face, central frames
     have a slightly earlier-stage brood pattern (queen laid on face A first) */
  function _insp_faceBCells(cells, frameIdx) {
    var N = frames.length || 11;
    var center = (N - 1) / 2;
    var dist = Math.abs(frameIdx - center) / (center || 1);
    var c = {};
    Object.keys(cells || {}).forEach(function(k) { c[k] = cells[k] || 0; });
    var shift = Math.round(dist * 0.12 * (c.empty || 0));
    if (shift > 0) {
      c.honey = (c.honey || 0) + shift;
      c.empty = Math.max(0, (c.empty || 0) - shift);
    }
    if (dist < 0.3) {
      var delta = Math.round((c.eggs || 0) * 0.2);
      c.eggs  = Math.max(0, c.eggs - delta);
      c.larva = (c.larva || 0) + delta;
    }
    return c;
  }

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
        onclick: function() { selected = idx; seen[idx] = true; faceFlip[idx] = false; build(); }
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
    var isFlipped = !!faceFlip[selected];
    /* Build the display cells — face B is a computed variation of face A */
    var displayCells = isFlipped ? _insp_faceBCells(fr.cells, selected) : (fr.cells || {});
    var displayFr = { cells: displayCells, hasQueen: fr.hasQueen && !isFlipped,
                      queenCellType: fr.queenCellType, label: fr.label };

    /* Flip button */
    var inspFlipBtn = h('button', {
      class: 'fm-flip-btn' + (isFlipped ? ' fm-flip-btn--b' : ''),
      title: isFlipped ? 'Rotate back to face A' : 'Rotate frame to see the other side'
    }, [
      h('span', { class: 'fm-flip-icon' }, '🔄'),
      h('span', {}, isFlipped ? ' Face B' : ' Face A')
    ]);
    inspFlipBtn.addEventListener('click', function() {
      faceFlip[selected] = !faceFlip[selected];
      build();
    });

    modalBody.appendChild(h('div', { class: 'inspect-detail' }, [
      _ui_buildComb(displayFr),
      h('div', { class: 'inspect-detail-read' }, [
        h('div', { class: 'inspect-frame-header' }, [
          h('div', { class: 'card-title' }, 'Frame ' + (selected + 1) + (fr.label ? ' — ' + fr.label : '')),
          inspFlipBtn
        ]),
        displayFr.hasQueen ? h('div', { class: 'find-result found' }, [
          h('span', { class: 'queen-mini' }), ' The queen is on this frame'
        ]) : (fr.hasQueen && isFlipped ? h('div', { class: 'find-result found' }, [
          h('span', { class: 'queen-mini' }), ' Queen on face A — flip back to see her'
        ]) : null),
        _ui_buildCombLegend(frames)
      ])
    ]));

    /* the teaching question for the frame in hand — use face A content for quiz */
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

      /* Top-of-summary verdict: one calibrated sentence so the player
         knows whether what they just saw is normal for this stage of
         the colony. Without it, a brand-new player has read 11 frames
         but has no baseline to judge them against. Computed from the
         report's own summary lines plus colony size. */
      var verdict = _ui_inspectionVerdict(colony, report);
      var summaryChildren = [];
      if (verdict) {
        summaryChildren.push(h('div', { class: 'inspect-verdict' }, verdict));
      }
      summaryChildren.push(h('h4', {}, 'The five questions'));
      summaryChildren.push(h('ul', {}, (report.summary || []).map(function(s) {
        return h('li', { class: (/^Urgent:/.test(s) ? 'sum-urgent' : null), text: s });
      })));
      var summaryNode = h('div', { class: 'inspect-summary' }, summaryChildren);
      if (report.lesson) {
        summaryNode.appendChild(h('div', { class: 'explain lesson', style: { marginTop: '10px' } }, [
          h('b', { text: 'To learn: ' }), report.lesson
        ]));
      }
      modalBody.appendChild(summaryNode);

      /* Engagement update — frame colour legend */
      modalBody.appendChild(h('div', { class: 'frame-legend' }, [
        h('span', { class: 'fl-item' }, [h('span', { class: 'fl-sw fl-honey' }), 'Honey']),
        h('span', { class: 'fl-item' }, [h('span', { class: 'fl-sw fl-brood' }), 'Brood']),
        h('span', { class: 'fl-item' }, [h('span', { class: 'fl-sw fl-pollen' }), 'Pollen']),
        h('span', { class: 'fl-item' }, [h('span', { class: 'fl-sw fl-empty' }), 'Empty drawn comb'])
      ]));

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
    buttons: [
      { label: 'Back to hive →', cls: '', act: function() {
        if (report && report.xp) addXp(report.xp);
        closeModal(); render(); openHiveDetail(colony, 'actions');
      }},
      { label: 'Done', cls: 'btn-primary', act: function() {
        if (report && report.xp) addXp(report.xp);
        closeModal(); render();
      }}
    ]
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
  var virgInSitu = colony.queenCells &&
    (colony.queenCells.type === 'postSwarm' || colony.queenCells.type === 'emergency') &&
    colony.queenCells.state !== 'emerged';
  if (!virgInSitu && (!colony.queen || !colony.queen.present ||
      (colony.queen && colony.queen.state === 'dronelayer') || colony.layingWorkers)) {
    out.push({ action: 'requeen',
      text: 'The colony has a serious queen problem — requeen it, or unite it with a strong colony.' });
  }
  if (virgInSitu && (!colony.queen || !colony.queen.present)) {
    out.push({ action: null,
      text: 'No mated queen yet, but virgin cells are present — give her time to emerge and mate before intervening.' });
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

/* ====================================================================
   _ui_advisorDirectAction(itemText, colonyName) -> { key, label } | null
   Pure function: maps an advisor message to the specific in-game
   action the player should take, with a labelled CTA. Used by the
   apiary action-list to render "Treat Rose →" / "Feed Rose →" / etc.
   Returns null when no specific action matches (caller falls back to
   the generic "Open →" hive-detail button).
   Pure to make it easy to test without DOM rendering.
   ==================================================================== */
function _ui_advisorDirectAction(itemText, colonyName) {
  var t = itemText || '';
  if (/varroa/i.test(t)) {
    return { key: 'treat', label: 'Treat ' + colonyName + ' →' };
  }
  if (/short of food|low on stores|critically low|starve|feed/i.test(t)) {
    return { key: 'feed', label: 'Feed ' + colonyName + ' →' };
  }
  if (/swarm cells|artificial swarm/i.test(t)) {
    return { key: 'artificialSwarm', label: 'Artificial swarm →' };
  }
  return null;
}

/* Build the action-list button for one advisor item — direct shortcut
   when we can, generic "Open →" fallback otherwise. */
function _ui_advisorActionButton(item, matchCol) {
  if (!item || !matchCol) return null;
  var direct = _ui_advisorDirectAction(item.text || '', matchCol.name);
  if (direct && typeof _ui_actionDialog === 'function') {
    return h('button', {
      class: 'btn btn-xs action-open-btn',
      onclick: function () {
        try { closeModal(); } catch (e) {}
        _ui_actionDialog(direct.key, matchCol);
      }
    }, direct.label);
  }
  return h('button', {
    class: 'btn btn-xs action-open-btn',
    onclick: function () { openHiveDetail(matchCol, 'actions'); }
  }, 'Open →');
}

/* ====================================================================
   _ui_inspectionVerdict(colony, report) -> string|null
   One calibrated sentence the player walks away from an inspection
   with — "is what I just saw normal for this colony at this stage?"
   A real mentor's first sentence when a new beekeeper hands back the
   frame. Without it, the summary is a list of facts and the player
   has no baseline to judge them against.
   ==================================================================== */
function _ui_inspectionVerdict(colony, report) {
  if (!report || !report.summary) return null;
  var name = colony && colony.name ? colony.name : 'The colony';
  var summary = report.summary;
  var hasUrgent = summary.some(function (s) { return /^urgent/i.test(s || ''); });
  if (hasUrgent) {
    return name + ' needs your attention — see the urgent items below.';
  }
  var queenOk    = summary.some(function (s) { return /Queen: present|fresh eggs confirm/i.test(s || ''); });
  var diseaseFlag = summary.some(function (s) { return /foulbrood|signs of|heavy varroa infestation/i.test(s || ''); });
  if (!queenOk) {
    return name + ' has no confirmed queen yet — the headline of the inspection. Look again in a few days.';
  }
  if (diseaseFlag) {
    return name + ' has a health issue to act on — see Health in the summary.';
  }
  var fob = 0;
  try { if (typeof framesOfBees === 'function') fob = framesOfBees(colony) || 0; } catch (e) {}
  if (fob >= 9) {
    return name + ' reads as a strong colony — brood in the centre, stores on the outside. Nothing alarming.';
  }
  if (fob >= 4) {
    return name + ' reads as a building colony — exactly what a nuc should look like at this stage.';
  }
  return name + ' is a small colony for now — watch the build-up and inspect again in 7-9 days.';
}

/* Comb legend — colour key for the hex cells in the comb pattern.
   Originally rendered all 11 cell types every time, which dropped 11
   labels on a first-time player who has only ever seen 4 of them in
   their colony. Now context-aware: pass a colony and the legend shows
   only the cell types actually present in any of its frames, plus the
   always-relevant baselines (Empty + Eggs + Larva + Capped brood +
   Honey). Rare types — Disease, Mite, Drone brood, Queen cell — only
   surface in the legend the day they first appear in the colony,
   making their first appearance a real landing moment instead of a
   permanent fixture in the key. */
function _ui_buildCombLegend(framesOrColony) {
  var items = [
    { cls: 'empty',    label: 'Empty',        always: true  },
    { cls: 'eggs',     label: 'Eggs',         always: true  },
    { cls: 'larva',    label: 'Larva',        always: true  },
    { cls: 'capbrood', label: 'Capped brood', always: true  },
    { cls: 'dronebr',  label: 'Drone brood',  always: false, key: 'dronebr' },
    { cls: 'honey',    label: 'Honey',        always: true  },
    { cls: 'nectar',   label: 'Nectar',       always: false, key: 'nectar' },
    { cls: 'pollen',   label: 'Pollen',       always: false, key: 'pollen' },
    { cls: 'qcell',    label: 'Queen cell',   always: false, key: 'qcell' },
    { cls: 'disease',  label: 'Disease',      always: false, key: 'disease' },
    { cls: 'mite',     label: 'Mite',         always: false, key: 'mite' }
  ];

  /* Accept either a frames[] array (from an inspection report) or a
     colony object that exposes one. Collect the cell-type keys actually
     present so the legend can hide rare types until they appear. */
  var present = null;
  var fs = null;
  if (Array.isArray(framesOrColony)) {
    fs = framesOrColony;
  } else if (framesOrColony && Array.isArray(framesOrColony.knownFrames || framesOrColony.frames)) {
    fs = framesOrColony.knownFrames || framesOrColony.frames;
  }
  if (fs) {
    present = {};
    fs.forEach(function (fr) {
      Object.keys((fr && fr.cells) || {}).forEach(function (k) {
        if (fr.cells[k] > 0) present[k] = true;
      });
    });
  }

  var keepers = items.filter(function (it) {
    if (it.always) return true;
    if (!present) return true;          /* no colony context — preserve old behaviour */
    return !!present[it.key];
  });

  var spans = keepers.map(function (it) {
    return h('span', {}, [
      h('i', { class: 'cell ' + it.cls, style: { clipPath: 'none', borderRadius: '2px' } }),
      it.label
    ]);
  });
  return h('div', { class: 'comb-legend' }, spans);
}

/* ====================================================================
   ENGAGEMENT UPDATE — swarm naming, honey show entry, goals widget
   ==================================================================== */

function _ui_openSwarmNamingModal() {
  if (!Game.flags || !Game.flags.pendingSwarm) return;
  var ps = Game.flags.pendingSwarm;
  var apiary = (Game.apiaries || []).find(function(a) { return a.id === ps.apiaryId; });
  var nameInput;

  var body = h('div', {}, [
    h('p', { text: 'They have settled in well — a cluster of bees clinging to the bait frames inside, calm and orderly. Now they need a proper home. Give them a name and welcome them to ' + (apiary ? apiary.name : 'your apiary') + '.' }),
    h('div', { class: 'field' }, [
      h('label', { text: 'Colony name' }),
      (nameInput = h('input', { type: 'text', value: ps.name, style: { width: '100%' } }))
    ])
  ]);

  openModal({
    title: 'Hive the Swarm',
    body: body,
    buttons: [{
      label: 'Hive them',
      cls: 'btn-primary',
      act: function() {
        var nm = (nameInput.value || '').trim() || ps.name;
        var newCol = makeColony({
          name: nm,
          apiaryId: ps.apiaryId,
          source: 'caught',
          population: ps.pop,
          year: gameYear()
        });
        newCol.origin = 'caught';
        if (!Array.isArray(newCol.diary)) newCol.diary = [];
        newCol.diary.unshift({
          week: Game.week,
          date: dateLabel(Game.week),
          weather: Game.weatherType || 'mixed',
          queenSeen: false, eggsFound: false,
          queenCells: 'none', stores: 'unknown', varroa: null, disease: null,
          note: 'Caught as a swarm. Origin unknown — run a varroa wash before trusting them.'
        });
        Game.colonies.push(newCol);
        Game.stats.swarmsCaught = (Game.stats.swarmsCaught || 0) + 1;
        Game.flags.pendingSwarm = null;
        addXp(8);
        logEvent('🐝', 'Caught swarm hived as ' + nm + '.', 'good');
        toast(nm + ' is yours.', 'good');
        closeModal();
        saveGame();
        render();
      }
    }]
  });
}

function openHoneyShowEntry() {
  var jars = (Game.inventory && Game.inventory.jars) || {};
  var availTypes = Object.keys(jars).filter(function(t) { return (jars[t] || 0) >= 1; });
  if (!availTypes.length) {
    if (typeof closeModal === 'function') closeModal();
    return;
  }
  var selected = {};
  var honeyNames = { spring: 'Spring Blossom', summer: 'Summer Honey', heather: 'Heather', lime: 'Lime', oilseed: 'OSR', ivy: 'Ivy' };

  function build() {
    var rows = availTypes.map(function(t) {
      var nm = honeyNames[t] || (HONEY_TYPES[t] && HONEY_TYPES[t].name) || t;
      var checked = !!selected[t];
      var row = h('label', { style: 'display:flex;gap:8px;padding:6px;border:1px solid var(--line);border-radius:4px;cursor:pointer;margin-bottom:4px;' }, [
        h('input', {
          type: 'checkbox',
          checked: checked ? 'checked' : null,
          onchange: function(e) {
            selected[t] = e.target.checked;
            /* Cap at 3 selected */
            var cnt = 0;
            Object.keys(selected).forEach(function(k) { if (selected[k]) cnt++; });
            if (cnt > 3) {
              selected[t] = false;
              e.target.checked = false;
              toast('You can enter at most 3 classes.', 'plain');
            }
          }
        }),
        h('span', { text: nm + ' (' + jars[t] + ' jars)' })
      ]);
      return row;
    });
    var body = h('div', {}, [
      h('p', { text: 'Choose up to 3 honey types to enter. One jar is consumed per entry.' }),
      h('div', {}, rows)
    ]);
    openModal({
      title: 'Enter County Honey Show',
      body: body,
      buttons: [
        { label: 'Submit entries', cls: 'btn-primary', act: function() {
          var types = Object.keys(selected).filter(function(k) { return selected[k]; });
          if (typeof enterHoneyShow === 'function') enterHoneyShow(types);
        }},
        { label: 'Cancel', cls: '', act: closeModal }
      ]
    });
  }
  build();
}

if (typeof window !== 'undefined') {
  window.openHoneyShowEntry = openHoneyShowEntry;
}

/* Goals widget — illuminated checklist grouped by tier.

   Plate-led rebuild: each tier opens with a small-caps display heading
   over a thin gold rule. Each goal is a hand-drawn check-mark indicator
   built from CSS (no emoji, no icon font) followed by the title in
   Spectral. Completed goals: ochre-filled indicator + italic ink-soft
   body. Pending goals: hollow indicator + ink body. The section
   headings use IM Fell English to match the rest of the chrome. */
function _ui_buildGoalsWidget() {
  if (typeof GOALS === 'undefined') return null;
  var done = (Game.flags && Game.flags.completedGoals) || [];
  var tiers = [
    { key: 'survival', label: 'Survival · Year 1' },
    { key: 'growth',   label: 'Growth · Year 2-3' },
    { key: 'mastery',  label: 'Mastery · Year 3+' }
  ];
  var tierNodes = tiers.map(function(tier) {
    var items = GOALS.filter(function(g) { return g.tier === tier.key; });
    var doneCount = items.filter(function(g) { return done.indexOf(g.id) !== -1; }).length;
    var rows = items.map(function(g) {
      var isDone = done.indexOf(g.id) !== -1;
      /* The check-mark indicator is a small SVG so the curve and tick
         render cleanly at any zoom and on retina. CSS-only would lose
         the hand-drawn feel. */
      var mark = h('span', { class: 'goal-mark' + (isDone ? ' goal-mark-done' : ' goal-mark-todo'), title: isDone ? 'Completed' : 'Pending' });
      mark.innerHTML = isDone
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" class="goal-mark-ring"></circle><path d="M7 12.5 L10.5 16 L17 9" class="goal-mark-tick"></path></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" class="goal-mark-ring"></circle></svg>';
      return h('div', { class: 'goal-item ' + (isDone ? 'done' : 'todo'), title: g.desc }, [
        mark,
        h('div', { class: 'goal-body' }, [
          h('div', { class: 'goal-title', text: g.title }),
          h('div', { class: 'goal-desc', text: g.desc })
        ])
      ]);
    });
    return h('div', { class: 'goals-tier' }, [
      h('div', { class: 'goals-tier-head' }, [
        h('span', { class: 'goals-tier-title', text: tier.label }),
        h('span', { class: 'goals-tier-count', text: doneCount + ' / ' + items.length })
      ]),
      h('div', { class: 'goals-tier-list' }, rows)
    ]);
  });
  return h('div', { class: 'goals-widget card' }, [
    h('div', { class: 'goals-widget-head' }, 'Goals'),
    h('div', { class: 'goals-widget-body' }, tierNodes)
  ]);
}

/* Diary panel — hive record book */
function _ui_buildDiaryPanel(colony) {
  if (!Array.isArray(colony.diary)) colony.diary = [];
  if (!colony.diary.length) {
    return h('div', { class: 'colony-known-note', text: 'No diary entries yet. Each inspection adds one automatically. You can write a note against any entry — it will be saved with the colony.' });
  }
  var WEATHER_ICONS = { fine: '☀️', mixed: '⛅', cool: '☁️', wet: '🌧️', cold: '❄️', storm: '🌬️', heatwave: '🔥' };
  var entries = colony.diary.map(function(entry, idx) {
    var badges = [];
    if (entry.queenSeen) badges.push(h('span', { class: 'diary-badge good' }, '👑 Queen seen'));
    if (entry.eggsFound) badges.push(h('span', { class: 'diary-badge good' }, '🥚 Eggs'));
    if (entry.queenCells && entry.queenCells !== 'none') {
      badges.push(h('span', { class: 'diary-badge warn' }, '👑 ' + entry.queenCells + ' cells'));
    }
    if (entry.disease) badges.push(h('span', { class: 'diary-badge bad' }, '🦠 ' + entry.disease));
    if (entry.varroa && entry.varroa !== 'none' && entry.varroa !== 'unchecked') {
      badges.push(h('span', { class: 'diary-badge' }, '🔴 varroa ' + entry.varroa));
    }
    if (entry.stores && entry.stores !== 'unknown') {
      var sCls = (entry.stores === 'critical' || entry.stores === 'low') ? 'warn' : '';
      badges.push(h('span', { class: 'diary-badge ' + sCls }, '🍯 ' + entry.stores));
    }

    var noteArea = h('textarea', {
      class: 'diary-note',
      placeholder: 'Add your own note...',
      oninput: function(e) {
        entry.note = e.target.value;
        if (typeof saveGame === 'function') saveGame();
      }
    });
    noteArea.value = entry.note || '';

    return h('div', { class: 'diary-entry' }, [
      h('div', { class: 'diary-head' }, [
        h('b', { text: entry.date || ('Wk ' + entry.week) }),
        h('span', { title: entry.weather }, WEATHER_ICONS[entry.weather] || '⛅')
      ]),
      badges.length ? h('div', { class: 'diary-badges' }, badges) : null,
      noteArea
    ]);
  });
  return h('div', { class: 'diary-list' }, entries);
}
