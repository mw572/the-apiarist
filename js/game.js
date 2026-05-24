/* ====================================================================
   THE APIARIST — game.js
   The spine: game state, save/load, the weekly controller, the mentor.
   Loaded last. init() runs on DOMContentLoaded.
   ==================================================================== */

var Game = null;
var SAVE_KEY = 'apiarist-save-v2';
var _presentQueue = [];

/* --- small global helpers (used by every module) -------------------- */

function gameYear(){ return Game ? Math.floor((Game.week - 1) / 52) + 1 : 1; }
function diff(){ return DIFFICULTY[(Game && Game.difficulty)] || DIFFICULTY.beekeeper; }
function weather(){ return WEATHER[(Game && Game.weatherType)] || WEATHER.mixed; }
function currentApiary(){
  if (!Game || !Game.apiaries.length) return null;
  return Game.apiaries.find(a => a.id === Game.ui.selectedApiary) || Game.apiaries[0];
}
function coloniesIn(apiaryId){ return Game ? Game.colonies.filter(c => c.apiaryId === apiaryId) : []; }
function aliveColonies(){ return Game ? Game.colonies.filter(c => c.alive) : []; }
function hiveCount(){ return aliveColonies().length; }
function colonyById(id){ return Game ? Game.colonies.find(c => c.id === id) || null : null; }

function logEvent(icon, text, tone){
  if (!Game) return;
  Game.log.unshift({ week: Game.week, icon: icon || '•', text: text, tone: tone || 'plain' });
  if (Game.log.length > 240) Game.log.length = 240;
}

function spend(amount, desc){
  if (!Game) return false;
  amount = Math.round(amount);
  if (Game.cash < amount){
    if (typeof toast === 'function') toast('Not enough money for that', 'bad');
    return false;
  }
  Game.cash -= amount;
  Game.ledger.unshift({ week: Game.week, desc: desc || 'Purchase', amount: -amount });
  if (Game.ledger.length > 400) Game.ledger.length = 400;
  return true;
}

function earn(amount, desc){
  if (!Game) return false;
  amount = Math.round(amount);
  Game.cash += amount;
  Game.ledger.unshift({ week: Game.week, desc: desc || 'Income', amount: amount });
  if (Game.ledger.length > 400) Game.ledger.length = 400;
  if (Game.yearStats) Game.yearStats.income = (Game.yearStats.income || 0) + amount;
  /* Track best year honey income for goal */
  if (Game.flags && desc && /honey/i.test(desc)) {
    if (!Game.flags._yrHoneyIncome) Game.flags._yrHoneyIncome = { yr: gameYear(), val: 0 };
    if (Game.flags._yrHoneyIncome.yr !== gameYear()) {
      Game.flags._yrHoneyIncome = { yr: gameYear(), val: 0 };
    }
    Game.flags._yrHoneyIncome.val += amount;
    if (Game.flags._yrHoneyIncome.val > (Game.flags.bestYearHoneyIncome || 0)) {
      Game.flags.bestYearHoneyIncome = Game.flags._yrHoneyIncome.val;
    }
  }
  return true;
}

function addXp(n){
  if (!Game || !n) return;
  var before = skillLevel(Game.skillXp);
  Game.skillXp += n;
  var after = skillLevel(Game.skillXp);
  if (after > before){
    logEvent('🎓', 'Your beekeeping skill rose to level ' + after + '.', 'good');
    if (typeof toast === 'function') toast('Beekeeping skill — level ' + after, 'good');
    if (SKILL_UNLOCKS[after]) notable({ kind:'toast', text: SKILL_UNLOCKS[after], tone:'good' });
  }
}

function notable(p){ if (p) _presentQueue.push(p); }

/* --- new game -------------------------------------------------------- */

function startNewGame(name, difficulty, region){
  if (!DIFFICULTY[difficulty]) difficulty = 'beekeeper';
  /* Region defaults to UK — the only one playable in v1. Anything
     locked or unknown is coerced to uk so a save file from a future
     build that locked region 'us_ne' won't crash here. */
  if (!region || !REGIONS[region] || !REGIONS[region].available) region = 'uk';
  name = (name || '').trim() || 'Beekeeper';
  var d = DIFFICULTY[difficulty];

  Game = {
    version: 2,
    difficulty: difficulty,
    region:     region,
    beekeeperName: name,
    week: SIM.startWeek,
    cash: d.startCash,
    apiaries: [],
    colonies: [],
    nextColonyId: 1,
    nextApiaryId: 1,
    inventory: {
      spareHives: 1,            // one hive ready and waiting for your first bees
      nucBoxes: 0,
      baitHives: 0,
      tools: { suit:true, smoker:true, hiveTool:true, gloves:false, clearerBoard:false,
               extractor:false, settlingTank:false, refractometer:false, uncappingKit:false },
      honey: {}, jars: {}, cutComb: 0, wax: 0, rearedQueens: 0,
      sugar: 10,
      emptyJars: 0,
      candles: 0,
      treatStock: {},
      broodBoxes: 0,       // extra brood boxes in stock (bought from Market → Supplies)
      supers: 0,           // super boxes in stock (bought from Market → Supplies)
      queenExcluders: 0,   // physical QX items in stock (bought from Market → Supplies)
      newspaper: 0,        // sheets of newspaper for the uniting method
    },
    skillXp: 0,
    reputation: 0,
    yearQuality: 0.5 + Math.random() * 0.25,   // a kind-ish first year
    weatherType: 'mixed',
    log: [],
    ledger: [],
    advisor: [],
    flags: {
      beeBase: false, foodHygiene: false, tutorialStep: 0,
      seenExplainers: {}, swarmSeasonWarned: false,
      salesChannels: { gate: true }, lastWinterYear: 0,
      pendingSwarm: null, completedGoals: [], honeyShowRibbons: [],
      seenDisease: false, bestYearHoneyIncome: 0, successfulSplits: 0,
    },
    stats: { honeyHarvested:0, coloniesLost:0, swarmsLost:0, swarmsCaught:0,
             wintersSurvived:0, splitsMade:0, queensReared:0, jarsSold:0, showWins:0 },
    yearStats: { honeyKg:0, income:0, coloniesStarted:0, coloniesLost:0 },
    pendingSamples: [],    // honey-composition lab queue
    completedSamples: [],  // returned lab reports
    marketplaceAds: [],    // NPC neighbour ads
    ui: { view:'apiary', selectedApiary: 1, selectedColony: null },
  };

  Game.apiaries.push({ id: Game.nextApiaryId++, name: APIARY_NAMES[0],
                       siteType: 'rural', founded: Game.week });
  Game.ui.selectedApiary = Game.apiaries[0].id;

  logEvent('🌼', 'You set up as a beekeeper. ' + APIARY_NAMES[0] + ' is ready for its first colony.', 'good');

  /* Reset module-level simulation state so it doesn't carry over from a previous game */
  if (typeof _sim_hornetApiaries !== 'undefined') { _sim_hornetApiaries = {}; }
  if (typeof _sim_yearsPlayed    !== 'undefined') { _sim_yearsPlayed    = 0;  }
  if (typeof _sim_wetStreak      !== 'undefined') { _sim_wetStreak      = 0;  }
  if (typeof _ui_sceneCache      !== 'undefined') { _ui_sceneCache      = {}; }

  if (typeof generateWeather === 'function') generateWeather();
  if (typeof buildAdvisor === 'function') buildAdvisor();

  saveGame();
  render();

  if (typeof showExplainer === 'function'){
    showExplainer('welcome', 'Welcome to beekeeping',
      '<p>It is <b>' + dateLabel(Game.week) + '</b>. You have an empty hive, a suit and a ' +
      'smoker. Time to get some bees.</p>' +
      '<div class="explain lesson"><b>Your first job.</b> Open the <b>Market</b> and buy a ' +
      '<b>nucleus</b> — five frames of bees, brood and a laying queen. The gentlest way to start.</div>' +
      '<p class="muted tiny">Bees reward attention and punish neglect, just like the real thing.</p>');
  }
}

/* --- save migration -------------------------------------------------- */
/* Normalise colony fields that may be missing in saves from earlier builds.
   Called every time a save is loaded, before handing Game to the engine.
   Rules:
   - queenCells must have all four fields: type, count, age, state.
     A save with {type:'swarm', count:2} (missing age/state) would cause
     colony.queenCells.age++ to produce NaN, permanently blocking swarm logic.
   - _highVarroaWeeks and _hopelessWeeks default to 0 if absent.
   - osrRisk / osrBroodRisk default to 0 if absent.
*/
function _migrateSave(g) {
  if (!g || !Array.isArray(g.colonies)) return;
  /* Region — added in v1.0 region picker. Default any pre-region
     save to 'uk' since that was the implicit world the game already
     simulated. */
  if (typeof g.region !== 'string' || !REGIONS[g.region]) g.region = 'uk';
  /* Lab sample queues — added in honey-composition v1. Default to
     empty arrays so older saves don't crash on the weekly check. */
  if (!Array.isArray(g.pendingSamples))    g.pendingSamples    = [];
  if (!Array.isArray(g.completedSamples))  g.completedSamples  = [];
  /* Marketplace ads — added in neighbour-marketplace v1. Empty by
     default; refresh runs weekly from advanceWeek. */
  if (!Array.isArray(g.marketplaceAds))    g.marketplaceAds    = [];
  g.colonies.forEach(function(c) {
    /* Strain — added in the bee-strains v1 commit. Default any pre-
       strain colony to 'local' so legacy saves keep behaving as
       baseline (all trait multipliers 1.0). */
    if (typeof c.strain !== 'string' ||
        (typeof HIVE_STRAINS !== 'undefined' && !HIVE_STRAINS[c.strain])) {
      c.strain = 'local';
    }
    /* queenCells: ensure all four fields are present and not NaN */
    if (!c.queenCells || typeof c.queenCells !== 'object') {
      c.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
    } else {
      if (typeof c.queenCells.type  !== 'string') c.queenCells.type  = 'none';
      if (typeof c.queenCells.count !== 'number' || isNaN(c.queenCells.count)) c.queenCells.count = 0;
      if (typeof c.queenCells.age   !== 'number' || isNaN(c.queenCells.age))   c.queenCells.age   = 0;
      if (typeof c.queenCells.state !== 'string') {
        /* infer state from type+age when possible */
        if (c.queenCells.type === 'none') {
          c.queenCells.state = 'none';
        } else if (c.queenCells.age >= 1) {
          c.queenCells.state = 'capped';
        } else {
          c.queenCells.state = 'larvae';
        }
      }
    }

    /* numeric trackers: default to 0 if absent or NaN */
    if (typeof c._highVarroaWeeks !== 'number' || isNaN(c._highVarroaWeeks)) c._highVarroaWeeks = 0;
    if (typeof c._hopelessWeeks   !== 'number' || isNaN(c._hopelessWeeks))   c._hopelessWeeks   = 0;
    if (typeof c.osrRisk          !== 'number' || isNaN(c.osrRisk))          c.osrRisk          = 0;
    if (typeof c.osrBroodRisk     !== 'number' || isNaN(c.osrBroodRisk))     c.osrBroodRisk     = 0;
    if (typeof c.winterBeeHealth  !== 'number' || isNaN(c.winterBeeHealth))  c.winterBeeHealth  = 1;

    /* Stack migration: build physical stack from legacy fields if absent */
    if (!c.stack || !Array.isArray(c.stack)) {
      if (typeof _colony_buildStackFromLegacy === 'function') {
        c.stack = _colony_buildStackFromLegacy(c);
      }
    }
    if (typeof c.newspaperWeeksInPlace !== 'number') c.newspaperWeeksInPlace = 0;
    if (!Array.isArray(c._stackWarnings))            c._stackWarnings = [];
    if (typeof c._isDemareeStackPattern !== 'boolean') c._isDemareeStackPattern = false;
    /* Queen rearing cooldown stamp — null means never reared */
    if (typeof c._rearingQueensWeek !== 'number') c._rearingQueensWeek = 0;
    /* Engagement update */
    if (typeof c.lastOaTrickleWeek === 'undefined') c.lastOaTrickleWeek = null;
    if (!Array.isArray(c.diary)) c.diary = [];
    if (!c.queen) c.queen = {};
    if (c.queen && typeof c.queen.hygieneGene !== 'number') c.queen.hygieneGene = Math.random() * 0.7 + 0.2;
    if (c.queen && typeof c.queen.temperamentGene !== 'number') c.queen.temperamentGene = Math.random() * 0.5 + 0.15;
  });

  /* Inventory fields added with hive assembly mechanic */
  if (g.inventory) {
    if (typeof g.inventory.broodBoxes !== 'number')    g.inventory.broodBoxes = 0;
    if (typeof g.inventory.supers !== 'number')        g.inventory.supers = 0;
    if (typeof g.inventory.queenExcluders !== 'number') g.inventory.queenExcluders = 0;
    if (typeof g.inventory.newspaper !== 'number')      g.inventory.newspaper = 0;
    if (!g.inventory.honey || typeof g.inventory.honey !== 'object') g.inventory.honey = {};
    if (!g.inventory.jars  || typeof g.inventory.jars  !== 'object') g.inventory.jars  = {};
    if (typeof g.inventory.emptyJars !== 'number') g.inventory.emptyJars = 0;
    if (typeof g.inventory.wax !== 'number') g.inventory.wax = 0;
    if (typeof g.inventory.candles !== 'number') g.inventory.candles = 0;
  }

  /* Stats — ensure all counters exist */
  if (!g.stats || typeof g.stats !== 'object') {
    g.stats = {};
  }
  var _statDefaults = ['honeyHarvested','jarsSold','swarmsLost','queensReared',
    'coloniesLost','wintersSurvived','colonyDeaths','inspections','showWins','swarmsCaught','splitsMade'];
  _statDefaults.forEach(function(k) {
    if (typeof g.stats[k] !== 'number') g.stats[k] = 0;
  });

  /* Engagement update — year stats accumulator */
  if (!g.yearStats || typeof g.yearStats !== 'object') {
    g.yearStats = { honeyKg: 0, income: 0, coloniesStarted: 0, coloniesLost: 0 };
  }
  if (typeof g.yearStats.honeyKg !== 'number') g.yearStats.honeyKg = 0;
  if (typeof g.yearStats.income !== 'number') g.yearStats.income = 0;
  if (typeof g.yearStats.coloniesStarted !== 'number') g.yearStats.coloniesStarted = 0;
  if (typeof g.yearStats.coloniesLost !== 'number') g.yearStats.coloniesLost = 0;

  /* Flags — ensure object and required sub-keys exist */
  if (!g.flags || typeof g.flags !== 'object') g.flags = {};
  if (!g.flags.seenExplainers || typeof g.flags.seenExplainers !== 'object') {
    g.flags.seenExplainers = {};
  }
  if (!g.flags.salesChannels || typeof g.flags.salesChannels !== 'object') {
    g.flags.salesChannels = { gate: true };
  }
  if (typeof g.flags.lastWinterYear !== 'number') g.flags.lastWinterYear = 0;
  /* Engagement update flags */
  if (typeof g.flags.pendingSwarm === 'undefined') g.flags.pendingSwarm = null;
  if (!Array.isArray(g.flags.completedGoals)) g.flags.completedGoals = [];
  if (!Array.isArray(g.flags.honeyShowRibbons)) g.flags.honeyShowRibbons = [];
  if (typeof g.flags.seenDisease !== 'boolean') g.flags.seenDisease = false;
  if (typeof g.flags.bestYearHoneyIncome !== 'number') g.flags.bestYearHoneyIncome = 0;
  if (typeof g.flags.successfulSplits !== 'number') g.flags.successfulSplits = 0;

  /* Reputation — clamp to valid range; injected saves cannot have rep > 100 or < 0 */
  if (typeof g.reputation !== 'number' || isNaN(g.reputation)) g.reputation = 0;
  g.reputation = Math.max(0, Math.min(100, g.reputation));

  /* Game.week — must be a finite positive number or the simulation maths produce NaN everywhere */
  if (typeof g.week !== 'number' || !isFinite(g.week) || g.week < 1) g.week = SIM.startWeek || 14;

  /* Apiaries — ensure each has an id; missing id crashes render */
  if (Array.isArray(g.apiaries)) {
    g.apiaries.forEach(function(a, i) {
      if (!a.id) a.id = i + 1;
    });
  }
}

/* --- save / load ----------------------------------------------------- */

function saveGame(){
  if (!Game) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game)); }
  catch(e){ /* storage full or unavailable — game still playable this session */ }
}

function hasSave(){
  try { return !!localStorage.getItem(SAVE_KEY); } catch(e){ return false; }
}

function loadGame(){
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    var g = JSON.parse(raw);
    if (!g || g.version !== 2) return false;
    _migrateSave(g);
    Game = g;
    if (!Game.ui) Game.ui = { view:'apiary', selectedApiary: Game.apiaries[0].id, selectedColony:null };
    /* Reset simulation caches so stale state doesn't persist across loads */
    if (typeof _sim_hornetApiaries !== 'undefined') { _sim_hornetApiaries = {}; }
    if (typeof _sim_yearsPlayed    !== 'undefined') { _sim_yearsPlayed    = 0;  }
    if (typeof _sim_wetStreak      !== 'undefined') { _sim_wetStreak      = 0;  }
    if (typeof _ui_sceneCache      !== 'undefined') { _ui_sceneCache      = {}; }
    if (typeof buildAdvisor === 'function') buildAdvisor();
    render();
    return true;
  } catch(e){ return false; }
}

function deleteSave(){
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
}

/* ---- file-based save / load — a portable backup the player owns ----- */
function exportSaveFile(){
  if (!Game) return false;
  try {
    var blob = new Blob([JSON.stringify(Game)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var yr   = (typeof gameYear === 'function') ? gameYear() : 1;
    var wk   = ((Game.week - 1) % 52) + 1;
    var who  = String(Game.beekeeperName || 'beekeeper').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var a = document.createElement('a');
    a.href = url;
    a.download = 'the-apiarist-' + who + '-yr' + yr + 'wk' + wk + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    return true;
  } catch(e){ return false; }
}

function loadSaveObject(obj){
  if (!obj || obj.version !== 2 ||
      !Array.isArray(obj.colonies) || !Array.isArray(obj.apiaries) || !obj.apiaries.length){
    return { ok: false, msg: 'That file is not a valid Apiarist save.' };
  }
  _migrateSave(obj);
  Game = obj;
  if (!Game.ui) Game.ui = { view: 'apiary', selectedApiary: Game.apiaries[0].id, selectedColony: null };
  if (!Game.flags) Game.flags = {};
  saveGame();
  if (typeof buildAdvisor === 'function') buildAdvisor();
  if (typeof render === 'function') render();
  return { ok: true, msg: 'Loaded ' + (Game.beekeeperName || 'your apiary') +
    ' — year ' + ((typeof gameYear === 'function') ? gameYear() : '?') + '.' };
}

/* --- the weekly controller ------------------------------------------ */

var _advancingWeek = false;
function _checkGameOver(presentables){
  if (gameYear() <= 1) return;
  if (aliveColonies().length > 0) return;
  if ((Game.inventory.spareHives || 0) > 0) return;
  if (Game.cash >= 100) return;
  /* Softlock: no bees, no hives, not enough money to buy a nuc (~£180 min) */
  if (Game.flags && Game.flags.gameOverShown) return;
  if (Game.flags) Game.flags.gameOverShown = true;
  presentables.push({
    kind : 'modal',
    title: 'Your apiary has failed',
    body : '<p>You have no colonies, no spare hives, and not enough money to start again. This run is over.</p>' +
           '<p>That is not unusual — most beekeepers lose everything at least once. What matters is what you take from it. When you are ready, start a new game and put those lessons to work.</p>' +
           '<p><button onclick="if(confirm(\'Start a new game? Your current game will be lost.\')){ localStorage.removeItem(\'theApiaristSave\'); location.reload(); }" style="margin-top:12px;padding:8px 16px;border-radius:8px;background:var(--honey);border:none;cursor:pointer;font-weight:700;">Start a new game</button></p>',
  });
}

function advanceWeek(){
  if (!Game || _advancingWeek) return;
  _advancingWeek = true;
  _presentQueue = [];

  var presentables = [];
  if (typeof runWeek === 'function') presentables = runWeek() || [];
  presentables = presentables.concat(_presentQueue);
  _presentQueue = [];

  _yearMaintenance();
  _checkWinterSurvival();
  _logOverdueInspections();
  if (typeof _checkSampleResults === 'function') _checkSampleResults();
  if (typeof _refreshMarketplaceAds === 'function') _refreshMarketplaceAds();
  _checkGameOver(presentables);
  saveGame();
  render();
  _advancingWeek = false;
  /* Brief amber flash so the player feels time moving */
  var _stg = document.querySelector('.stage');
  if (_stg) {
    _stg.classList.add('week-flash');
    setTimeout(function() { _stg.classList.remove('week-flash'); }, 450);
  }
  _present(presentables);
}

/* run several weeks quietly, stopping when something wants attention */
function advanceToEvent(){
  if (!Game) return;
  for (var i = 0; i < 8; i++){
    advanceWeek();
    var urgent = (Game.advisor || []).some(function(a){ return a.tone === 'bad'; });
    if (urgent) break;
    if (document.querySelector('#modal-root .modal-overlay')) break;
  }
}

function _yearMaintenance(){
  /* clear out long-dead colonies; the hive kit comes back to you */
  var kept = [];
  for (var i = 0; i < Game.colonies.length; i++){
    var c = Game.colonies[i];
    if (!c.alive && (Game.week - (c.deadWeek || Game.week)) >= 6){
      Game.inventory.spareHives += 1;
      logEvent('🧹', 'You cleared out the empty ' + c.name + ' hive. The kit is ready to reuse.', 'plain');
    } else {
      kept.push(c);
    }
  }
  Game.colonies = kept;
  if (Game.ui.selectedColony && !colonyById(Game.ui.selectedColony)) Game.ui.selectedColony = null;

  /* Year-end snapshot: capture the population of every living colony
     by name. The next year's spring mentor uses this to show "Rose was
     at 9,000 last spring, Ivy is at 12,618" — a wisdom-accumulates beat
     that costs almost nothing. Stored as a flat name→population map. */
  if (!Game.flags.yearSnapshots) Game.flags.yearSnapshots = {};
  var yearJustEnded = gameYear() - 1;
  if (yearJustEnded >= 1) {
    var snap = {};
    Game.colonies.forEach(function (c) {
      if (c.alive) snap[c.name] = Math.round(c.population || 0);
    });
    Game.flags.yearSnapshots[yearJustEnded] = snap;
  }
}

/* ====================================================================
   getYearOnYearLine() -> string|null
   In spring of year 2+, compares each living colony's current population
   against the same colony's population at the end of the previous year.
   Returns a single sentence the apiary view shows once, calmly, as
   accumulated wisdom rather than a metric.
   ==================================================================== */
function getYearOnYearLine() {
  if (!Game) return null;
  var year = gameYear();
  if (year < 2) return null;
  var wk = ((Game.week - 1) % 52) + 1;
  /* Only surface this in early spring (weeks 14-18), when the comparison
     means something — populations rebuilding after winter. */
  if (wk < 14 || wk > 18) return null;
  var snap = Game.flags && Game.flags.yearSnapshots && Game.flags.yearSnapshots[year - 1];
  if (!snap) return null;
  var alive = aliveColonies();
  if (!alive.length) return null;
  /* Find a colony that was alive at end of last year too, so the comparison is real. */
  var match = null;
  for (var i = 0; i < alive.length; i++) {
    if (snap[alive[i].name] != null) { match = alive[i]; break; }
  }
  if (!match) return null;
  var was = snap[match.name];
  var now = Math.round(match.population || 0);
  return 'Last spring, ' + match.name + ' was at ' + was.toLocaleString() +
         ' bees. Today she is at ' + now.toLocaleString() + '.';
}

/* ====================================================================
   _logOverdueInspections()
   During swarm season (weeks 14-30), if any alive colony has gone
   ≥10 days without an inspection, write a single quiet "overdue" line
   into the journal. Fires once per gap — re-inspecting the colony
   clears the latch and lets the next missed cycle log again.

   The point: a real beekeeper's notebook has the gap recorded in it.
   The game keeps the same record without preaching about it. Players
   who develop the habit feel the gap in their own log.
   ==================================================================== */
function _logOverdueInspections(){
  if (!Game) return;
  var wk = ((Game.week - 1) % 52) + 1;
  /* Only fire in swarm season — outside that window, a 9-day gap is fine. */
  if (wk < 14 || wk > 30) return;
  aliveColonies().forEach(function (c) {
    if (!c.lastInspected) return;
    var gap = Game.week - c.lastInspected;
    if (gap >= 10 && c._lastOverdueAt !== c.lastInspected) {
      c._lastOverdueAt = c.lastInspected;
      logEvent('🕘', c.name + ' — inspection overdue, ' + gap + ' days since last open.', 'warn');
    }
  });
}

function _checkWinterSurvival(){
  /* count a winter survived once the colonies reach mid-spring alive */
  var wk = ((Game.week - 1) % 52) + 1;
  if (wk >= 18 && wk <= 20 && Game.flags.lastWinterYear !== gameYear()){
    Game.flags.lastWinterYear = gameYear();
    if (aliveColonies().length > 0){
      Game.stats.wintersSurvived += 1;
      /* XP: surviving winter is the single hardest milestone in beekeeping —
         15 XP per colony alive at mid-spring (weeks 18-20). Getting all your
         colonies through winter is a Year 2 goal and deserves real recognition. */
      var survivingCount = aliveColonies().length;
      addXp(15 * survivingCount);
      logEvent('🌷', 'Your bees came through the winter. That is the hardest part of the year.', 'good');
      if (typeof showExplainer === 'function'){
        notable({ kind:'explainer', id:'first-winter',
          title:'Through the winter',
          body:'<p>A colony that reaches spring alive has passed ' +
               'the real test of beekeeping. Most winter losses are starvation or varroa damage ' +
               'to the winter bees — both avoidable with autumn feeding and timely mite ' +
               'treatment.</p><p>Now the year begins again: build-up, then swarm season.</p>' });
      }
    }
  }
}

function _present(list){
  var shownBig = false;
  for (var i = 0; i < list.length; i++){
    var p = list[i];
    if (!p) continue;
    if (p.kind === 'toast'){
      if (typeof toast === 'function') toast(p.text, p.tone || 'plain');
    } else if (!shownBig && (p.kind === 'explainer' || p.kind === 'modal')){
      shownBig = true;
      if (p.kind === 'explainer' && typeof showExplainer === 'function'){
        showExplainer(p.id, p.title, p.body);
      } else if (typeof openModal === 'function'){
        openModal({ title: p.title, body: p.body,
          buttons: [{ label:'Noted', cls:'btn-primary', act: closeModal }] });
      }
    } else {
      if (typeof toast === 'function') toast(p.text || p.title || 'News from the apiary', p.tone || 'plain');
    }
  }
}

/* --- the mentor ------------------------------------------------------ */
/* Returns one short, contextual line of advice, or null. Loud early on,
   then quietens as the beekeeper finds their feet. */

/* ====================================================================
   The Winter Letter
   --------------------------------------------------------------------
   In real beekeeping the deep-winter months (December through February
   in the UK) are dormant — the colony is clustered, you cannot open the
   hive, and there is nothing to do but listen. The game has reflected
   this faithfully and, in doing so, created a retention void: a player
   who closes the app in mid-winter has nothing pulling them back.

   The Winter Letter is the answer. It is an in-world note that
   summarises, in a calm and seasonal voice, what each living colony
   is sitting with — population, stores, queen age, the most recent
   unresolved thing about her — and gives one specific anticipation
   the player should be carrying into spring. The same content a real
   beekeeper's January notebook would carry.

   It surfaces as a soft inline block at the top of the apiary view
   whenever the season is winter and at least one colony is alive.
   Nothing else changes about the simulation — the letter is a UI
   surface over existing state.

   The 100× change identified by the gamification critique: turning
   the dormancy period from a retention void into a feature.
   ==================================================================== */
function buildWinterLetter() {
  if (!Game) return null;
  var season = seasonOfWeek(Game.week);
  if (season !== 'winter') return null;
  var alive = aliveColonies();
  if (!alive.length) return null;

  var wkInYr = ((Game.week - 1) % 52) + 1;
  /* "Mid-February" style date — uses the same dateLabel the topbar uses. */
  var when = dateLabel(Game.week);

  var lines = [];

  alive.forEach(function (c) {
    var pop = Math.round(c.population || 0);
    var stores = Math.round((c.honey || 0) * 10) / 10;
    var queenLabel = '';
    if (c.queen && c.queen.present) {
      var ya = c.queen.age || 0;
      queenLabel = ya < 52
        ? c.queen.age + 'wk queen'
        : 'year ' + (Math.floor(ya / 52) + 1) + ' queen';
    } else {
      queenLabel = 'queen status unclear';
    }

    /* The one anticipation — pick the most pressing unresolved thing. */
    var anticipation;
    if (!c.lastInspected) {
      anticipation = 'never been inspected — plan for it in the first mild spell.';
    } else if (stores < 12) {
      anticipation = 'stores look light. When the first warm day comes, heft the back of the hive before opening.';
    } else if (pop < 5000) {
      anticipation = 'small cluster. Cold snaps will press hard — keep the entrance reduced and the lid undisturbed.';
    } else if (c.queen && c.queen.age && c.queen.age > 100) {
      anticipation = 'queen is in her third year. Watch her laying pattern when brood-rearing restarts.';
    } else if (wkInYr >= 4 && wkInYr <= 8) {
      anticipation = 'first brood should be hatching soon. The cluster will start to break.';
    } else {
      anticipation = 'going steady. Listen at the entrance on the next still afternoon.';
    }

    lines.push({
      name: c.name,
      meta: pop + ' bees · ' + stores + 'kg stores · ' + queenLabel,
      anticipation: anticipation,
    });
  });

  /* Closing one-liner — context for what the season is doing. */
  var closing;
  if (wkInYr >= 49 || wkInYr <= 2) {
    closing = 'The shortest days are now. Bees are inside, queen has paused. The least you do, the better.';
  } else if (wkInYr <= 5) {
    closing = 'Daylight is creeping back. The queen will start to lay again on the first mild spell.';
  } else {
    closing = 'Spring is coming, but not yet. Heft for weight. Do not open the hive in cold weather.';
  }

  return { when: when, lines: lines, closing: closing };
}

function mentorLine(){
  if (!Game) return null;
  var wk = ((Game.week - 1) % 52) + 1;
  var alive = aliveColonies();
  var experienced = skillLevel(Game.skillXp) >= 5 && gameYear() > 2;
  /* Master mode is explicitly "no hand-holding" — match that in voice
     from the very first line. Apprentice keeps the warm full sentence
     that genuinely teaches; Master speaks like a senior beekeeper who
     assumes you already know what a nuc is. */
  var isMaster = Game.difficulty === 'master';

  if (alive.length === 0){
    if (Game.inventory.spareHives > 0) {
      if (isMaster) return 'A hive is ready. The Market opens when you need it.';
      return 'You have a hive ready and waiting. Head to the Market and buy a nucleus — five ' +
             'frames of bees with a laying queen, the kindest way to start.';
    }
    if (isMaster) return 'No hive, no bees. Both live in the Market.';
    return 'You will need a hive before you can house any bees. Complete National hives are in the Market.';
  }

  /* a never-inspected colony */
  var fresh = alive.find(function(c){ return !c.lastInspected; });
  if (fresh){
    if (weather().inspect)
      return fresh.name + ' has not been looked at yet. A calm, mild day like this is just ' +
             'right — open it up and meet your bees.';
    return 'Hold off opening the hive until it warms up. Cold, wet days chill the brood.';
  }

  /* known queen cells */
  var celled = alive.find(function(c){ return c.known && c.known.queenCells && c.known.queenCells !== 'none'; });
  if (celled && celled.known.queenCells === 'swarm')
    return 'You saw swarm cells in ' + celled.name + '. That colony means to leave. Act now — ' +
           'an artificial swarm is the textbook answer.';

  /* known low stores */
  var hungry = alive.find(function(c){ return c.known && (c.known.stores === 'critical' || c.known.stores === 'low'); });
  if (hungry)
    return hungry.name + ' looked light on stores. Bees starve faster than anything else kills ' +
           'them. Feed them before you do anything else.';

  /* known disease */
  var sick = alive.find(function(c){ return c.known && c.known.disease; });
  if (sick)
    return 'You spotted disease in ' + sick.name + '. Check the Handbook — foul brood is ' +
           'notifiable and serious.';

  /* overdue inspections in swarm season */
  if (wk >= 14 && wk <= 30){
    var overdue = alive.find(function(c){ return c.lastInspected && (Game.week - c.lastInspected) >= 2; });
    if (overdue)
      return 'It is swarm season. A colony can build queen cells in a week — do not let nine ' +
             'days pass between inspections.';
  }

  if (experienced) return null;   /* a seasoned beekeeper needs less hand-holding */

  /* seasonal nudges for the still-learning */
  if (wk >= 31 && wk <= 38)
    return 'The main flow is ending. Take your honey crop, then treat for varroa straight away.';
  if (wk >= 39 && wk <= 44)
    return 'Autumn now. Feed them heavy 2:1 syrup until each hive is heavy to lift, and fit mouse guards.';
  if (wk >= 45 || wk <= 8)
    return 'Leave the hives shut for winter. Just heft them on a dry day to feel the weight of their stores.';
  if (wk >= 9 && wk <= 13)
    return 'Spring is stirring. On the first warm, calm day, check each colony is queenright and has stores.';

  return null;
}

/* --- Enterprise Value ----------------------------------------------- */
/* Total business value: cash + honey + colonies + equipment at 50% book. */

function enterpriseValue(){
  if (!Game) return 0;
  var KG_PER_JAR = 0.34;
  var ev = Game.cash;

  // Bottled honey jars in stock (at market price 1.18×)
  var jars = Game.inventory.jars || {};
  Object.keys(jars).forEach(function(type){
    var n = jars[type] || 0;
    var ht = HONEY_TYPES[type];
    if (n > 0 && ht) ev += n * ht.value * 1.18;
  });

  // Bulk honey in inventory (at gate price — not yet bottled)
  var honey = Game.inventory.honey || {};
  Object.keys(honey).forEach(function(type){
    var kg = honey[type] || 0;
    var ht = HONEY_TYPES[type];
    if (kg > 0 && ht) {
      var yieldFactor = type === 'heather' ? 0.70 : 1.0;
      ev += Math.floor(kg * yieldFactor / KG_PER_JAR) * ht.value;
    }
  });

  // Honey still in supers on hive (extractable value)
  var alive = Game.colonies.filter(function(c){ return c.alive; });
  alive.forEach(function(c){
    if ((c.superHoney || 0) > 0 && c.superHoneyType) {
      var ht = HONEY_TYPES[c.superHoneyType];
      if (ht) {
        var yf = c.superHoneyType === 'heather' ? 0.70 : 1.0;
        ev += Math.floor(c.superHoney * yf / KG_PER_JAR) * ht.value * 0.8; // 80% — not yet harvested
      }
    }
  });

  // Colony value (each alive colony ~ nuc purchase price, scaled by population)
  alive.forEach(function(c){
    var nucVal = 130; // current nuc price
    var sizeFactor = Math.min(1.5, Math.max(0.4, (c.population || 5000) / 15000));
    ev += Math.round(nucVal * sizeFactor);
  });

  // Equipment at 50% second-hand value
  ev += (Game.inventory.spareHives || 0) * 55;          // hives @ 50% of £110
  ev += (Game.inventory.supers || 0) * 22;              // supers @ 50% of £44
  ev += (Game.inventory.broodBoxes || 0) * 26;          // brood boxes @ 50%
  ev += (Game.inventory.queenExcluders || 0) * 4;       // QXs @ 50% of £9
  var tools = Game.inventory.tools || {};
  if (tools.extractor)    ev += 40;  // extractor @ 50% of £80
  if (tools.settlingTank) ev += 22;  // settling tank @ 50%
  if (tools.refractometer) ev += 11;

  return Math.round(ev);
}

/* --- init ------------------------------------------------------------ */

function init(){
  if (typeof render === 'function') render();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
