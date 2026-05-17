/* ====================================================================
   THE APIARIST — colony.js
   Beekeeping biology engine. All colony lifecycle, population dynamics,
   varroa, disease, swarming and derived getters live here.
   Reads globals from data.js. Mutated by actions.js and simulation.js.
   ==================================================================== */

/* --- Private helpers (prefixed _colony_) ----------------------------- */

function _colony_clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

function _colony_rand(){ return Math.random(); }

function _colony_randRange(lo, hi){ return lo + _colony_rand() * (hi - lo); }

function _colony_randInt(lo, hi){ return Math.floor(_colony_randRange(lo, hi + 1)); }

/* 52-element array: fraction of peak queen laying by week index (0 = week 1).
   Mirrors a UK queen's annual laying pattern: broodless in deep winter,
   building from late Jan, peaking late April/May, easing through summer,
   near-zero from mid-October. */
const _colony_LAY_CURVE = [
  0.00, 0.00, 0.02, 0.05, 0.09, 0.13, 0.19, 0.27, 0.36,  // wk 1-9   Jan–Feb
  0.46, 0.57, 0.68, 0.78,                                  // wk 10-13 Mar–early Apr
  0.86, 0.92, 0.97, 1.00, 0.99, 0.95, 0.90,               // wk 14-20 Apr–mid May
  0.84, 0.78, 0.76, 0.78,                                  // wk 21-24 June
  0.80, 0.82, 0.83, 0.82, 0.80, 0.77, 0.73, 0.67,         // wk 25-32 July–Aug
  0.60, 0.53, 0.45, 0.36, 0.28,                            // wk 33-37 Sep
  0.20, 0.13, 0.08, 0.04, 0.02,                            // wk 38-42 Oct
  0.01, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,  // wk 43-52 Nov–Dec
];

/* Which season we are in, from a raw week integer */
function _colony_season(week){
  const m = monthOfWeek(week);
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

/* Is a week inside the main swarm season? */
function _colony_inSwarmWindow(week){
  const w = ((week - 1) % 52) + 1;
  return w >= 14 && w <= 30;
}

/* Make a fresh virgin queen whose genetics are derived from a parent queen */
function _colony_virginFromParent(parentQueen, bornYear){
  return {
    present: true,
    age: 0,
    layQuality: 0,    // set when mated
    mated: false,
    virgin: true,
    marked: false,
    clipped: false,
    // genetics are a blend of parent + some random variation
    temperamentGene: _colony_clamp(
      (parentQueen ? parentQueen.temperamentGene : 0.35) + _colony_randRange(-0.12, 0.12), 0, 1),
    hygieneGene: _colony_clamp(
      (parentQueen ? parentQueen.hygieneGene : 0.45) + _colony_randRange(-0.10, 0.10), 0, 1),
    state: 'virgin',
    bornYear: bornYear || 1,
  };
}

/* Make a fully mated replacement queen (used for supersedure) */
function _colony_matedQueen(sourceQueen, bornYear){
  const v = _colony_virginFromParent(sourceQueen, bornYear);
  v.mated = true;
  v.virgin = false;
  v.state = 'laying';
  v.layQuality = _colony_clamp(
    _colony_randRange(0.78, 1.15) * (sourceQueen ? 0.5 + sourceQueen.hygieneGene * 0.5 : 0.9),
    0.5, 1.3);
  return v;
}

/* ====================================================================
   HIVE STACK — physical component ordering
   colony.stack is an ordered array (bottom→top) of component objects.
   It is the source of truth for which components are fitted and how they
   are arranged. The legacy boolean/count fields (broodBoxes, supers,
   queenExcluder, clearerFitted) are DERIVED from the stack each tick.
   ==================================================================== */

/* Build a stack from legacy colony fields (used during migration and
   when initialising a newly created colony). */
function _colony_buildStackFromLegacy(c) {
  var stack = [];
  var broodCount  = c.broodBoxes || 1;
  var superCount  = c.supers     || 0;
  var hasQX       = !!(c.queenExcluder);
  var hasClearer  = !!(c.clearerFitted);

  for (var i = 0; i < broodCount; i++) {
    stack.push({ type: 'broodBox', id: 'bb' + i });
  }
  /* QX sits above brood, below supers — only insert it if there are supers
     or it was explicitly fitted (e.g. added before supers as prep). */
  if (hasQX) {
    stack.push({ type: 'queenExcluder', id: 'qx0' });
  }
  /* Clearer board sits above the QX, below the supers (one-way escape). */
  if (hasClearer && superCount > 0) {
    stack.push({ type: 'clearerBoard', id: 'cb0' });
  }
  for (var s = 0; s < superCount; s++) {
    stack.push({ type: 'super', id: 'sup' + s });
  }
  return stack;
}

/* Update the legacy derived fields from the current stack contents.
   Called at the start of every weekly tick and after any stack mutation.
   Existing simulation code reads these fields unchanged — this keeps
   the stack as the single source of truth without touching callers. */
function _colony_deriveFromStack(colony) {
  if (!colony.stack || !colony.stack.length) return;
  var stack = colony.stack;

  var broodBoxCount = 0;
  var superCount    = 0;
  var firstQXIdx    = -1;
  var firstSuperIdx = -1;
  var hasClearer    = false;
  var hasNewspaper  = false;

  for (var i = 0; i < stack.length; i++) {
    var t = stack[i].type;
    if (t === 'broodBox')        broodBoxCount++;
    else if (t === 'super')    { superCount++; if (firstSuperIdx < 0) firstSuperIdx = i; }
    else if (t === 'queenExcluder') { if (firstQXIdx < 0) firstQXIdx = i; }
    else if (t === 'clearerBoard') hasClearer = true;
    else if (t === 'newspaper')    hasNewspaper = true;
  }

  colony.broodBoxes = Math.max(1, broodBoxCount);
  colony.supers     = superCount;

  /* QX is "active" (blocking queen) only when it sits between the lowest
     brood box and the first super. A QX above all supers does not protect them. */
  colony.queenExcluder = (firstQXIdx !== -1 && (firstSuperIdx < 0 || firstQXIdx < firstSuperIdx));
  colony.clearerFitted  = hasClearer;

  if (!hasNewspaper) colony.newspaperWeeksInPlace = 0;
}

/* Return an array of warning strings about the current stack arrangement.
   Also sets colony._stackWarnings for the UI to display. */
function _colony_validateStack(colony) {
  var warnings = [];
  var stack = colony.stack || [];

  var types        = stack.map(function(i) { return i.type; });
  var broodBoxCount= types.filter(function(t) { return t === 'broodBox'; }).length;
  var superCount   = types.filter(function(t) { return t === 'super'; }).length;
  var qxIndices    = [];
  var superIndices = [];
  types.forEach(function(t, idx) {
    if (t === 'queenExcluder') qxIndices.push(idx);
    if (t === 'super')         superIndices.push(idx);
  });

  if (superCount > 0 && qxIndices.length === 0) {
    warnings.push('No queen excluder between brood and supers — the queen may lay in the honey frames.');
  }
  /* QX exists but is above all supers — wrong position */
  if (qxIndices.length > 0 && superIndices.length > 0) {
    var lowestQX    = Math.min.apply(null, qxIndices);
    var lowestSuper = Math.min.apply(null, superIndices);
    if (lowestQX > lowestSuper) {
      warnings.push('Queen excluder is above the supers — it needs to sit between the brood box and the lowest super.');
    }
  }
  /* Newspaper without two brood boxes */
  if (types.indexOf('newspaper') > -1 && broodBoxCount < 2) {
    warnings.push('Newspaper in stack but only one brood box — you need two hive bodies for the newspaper method.');
  }
  /* Demaree pattern detection: broodBox, QX, super(s), QX, broodBox */
  var isDemaree = (
    broodBoxCount === 2 &&
    qxIndices.length >= 2 &&
    superCount > 0 &&
    types[0] === 'broodBox' &&
    types[types.length - 1] === 'broodBox'
  );
  colony._isDemareeStackPattern = isDemaree;

  colony._stackWarnings = warnings;
  return warnings;
}

/* ====================================================================
   HIVE LAYOUT — persistent visual frame data
   Each colony stores a hiveLayout object: arrays of box objects, each
   with 11 frame objects. Updated weekly by colonyWeeklyLayoutSync().
   ==================================================================== */

function _colony_makeFrames(count, drawn, maxAge) {
  var frames = [];
  for (var i = 0; i < count; i++) {
    frames.push({
      drawn:   drawn,
      combAge: drawn ? _colony_randInt(0, maxAge || 2) : 0,
      content: { eggs:0, larvae:0, capped:0, honey:0, pollen:0, nectar:0, empty:1, drone:0 }
    });
  }
  return frames;
}

function _colony_makeLayoutBox(type) {
  return { type: type, frames: _colony_makeFrames(11, type === 'brood', 3) };
}

function _colony_makeLayoutSuper() {
  return {
    frames:       _colony_makeFrames(11, false, 0),
    honeyKg:      0,
    honeyType:    'summer',
    drawnFrames:  0,   /* undrawn foundation — bees must draw comb before filling */
    clearerBoard: false
  };
}

function _colony_initHiveLayout(broodBoxCount) {
  var boxes = [];
  for (var b = 0; b < (broodBoxCount || 1); b++) {
    boxes.push(_colony_makeLayoutBox('brood'));
  }
  return { broodBoxes: boxes, supers: [] };
}

/* colonyWeeklyLayoutSync(colony)
   Distribute aggregate colony data (eggs, honey, etc.) into the
   persistent frame objects. Safe to call on any colony at any time —
   creates the layout if it does not exist. */
function colonyWeeklyLayoutSync(colony) {
  if (!colony.hiveLayout) {
    colony.hiveLayout = _colony_initHiveLayout(colony.broodBoxes || 1);
  }
  var layout  = colony.hiveLayout;
  var FRAMES  = 11;

  /* --- Sync box counts ----------------------------------------------- */
  while (layout.broodBoxes.length < (colony.broodBoxes || 1)) {
    layout.broodBoxes.push(_colony_makeLayoutBox('brood'));
  }
  while (layout.broodBoxes.length > (colony.broodBoxes || 1)) {
    layout.broodBoxes.pop();
  }
  while (layout.supers.length < (colony.supers || 0)) {
    layout.supers.push(_colony_makeLayoutSuper());
  }
  while (layout.supers.length > (colony.supers || 0)) {
    layout.supers.pop();
  }

  /* --- Distribute brood and stores across brood box frames ----------- */
  /* Real "rainbow" pattern: eggs at centre (warmest), larvae ring around them,
     capped brood large central mass, pollen band at nest edge, honey arch outer frames.
     Each stage occupies a different distance zone, not a blurred Gaussian. */

  var totalBoxFrames = layout.broodBoxes.length * FRAMES;
  var totalBrood = colony.eggs + colony.larvae + colony.capped;
  var broodEquiv = totalBrood / 6500;   // frames-equivalent of brood
  var gMid = (totalBoxFrames - 1) / 2;

  /* Zone radii (in frame-units from centre).
     Eggs:   innermost 1.0 frames from centre
     Larvae: within 2.2 frames
     Capped: within broodReach frames (expands with population)
     Pollen: 0.8 frames band just outside capped zone
     Honey:  outer frames + top arch on all frames                */
  var broodReach   = Math.max(1.0, Math.min(5.0, broodEquiv * 0.55 + 0.8));
  var eggsReach    = Math.min(1.0, broodReach * 0.40);
  var larvaeReach  = Math.min(2.2, broodReach * 0.70);
  var pollenInner  = broodReach - 0.2;
  var pollenOuter  = broodReach + 1.1;

  /* Brood totals for proportional distribution */
  var tb = Math.max(1, totalBrood);

  layout.broodBoxes.forEach(function(box, boxIdx) {
    box.frames.forEach(function(frame, fi) {
      var gfi  = boxIdx * FRAMES + fi;
      var dist = Math.abs(gfi - gMid);  // distance from nest centre (in frames)

      var c = { eggs:0, larvae:0, capped:0, honey:0, pollen:0, nectar:0, empty:0, drone:0 };

      /* --- Brood zones --- */
      if (totalBrood > 100) {
        if (dist <= eggsReach) {
          /* Egg zone: youngest, most central */
          var eggShare = Math.max(0, 1 - dist / (eggsReach + 0.1));
          c.eggs = Math.min(0.55, eggShare * (colony.eggs / tb) * 3.5);
        }
        if (dist <= larvaeReach) {
          var larvaShare = Math.max(0, 1 - dist / (larvaeReach + 0.2));
          c.larvae = Math.min(0.65, larvaShare * (colony.larvae / tb) * 2.8);
        }
        if (dist <= broodReach) {
          var cappedShare = Math.max(0, 1 - dist / (broodReach + 0.4));
          c.capped = Math.min(0.80, cappedShare * (colony.capped / tb) * 2.2);
        }
        /* Drone brood: outer edges of brood nest in spring/summer */
        if (dist >= broodReach - 1.2 && dist <= broodReach + 0.5 && colony.drones > 800) {
          c.drone = Math.min(0.08, (colony.drones / 3000) * 0.08);
        }
      }

      var broodUsed = c.eggs + c.larvae + c.capped + c.drone;
      var free = Math.max(0, 1 - broodUsed);

      /* --- Pollen band: sits between brood edge and honey stores --- */
      var inPollenBand = dist >= pollenInner && dist <= pollenOuter;
      if (inPollenBand && colony.pollen > 0.2) {
        var pBand = Math.min(free, 0.25 * Math.min(1.5, colony.pollen / 600));
        c.pollen = pBand;
        free = Math.max(0, free - c.pollen);
      } else if (colony.pollen > 0.3 && dist < pollenInner) {
        /* Pollen pockets within brood nest on frames that aren't brood-full */
        c.pollen = Math.min(free * 0.3, 0.08 * Math.min(1, colony.pollen / 600));
        free = Math.max(0, free - c.pollen);
      }

      /* --- Honey: outer frames dominant, arch at top of all frames ---
         Formula: outer frames get more honey; also a baseline arch exists
         on all frames (honey at top corners = the classic pattern).         */
      var outerBias  = Math.min(0.9, 0.15 + (dist / (gMid + 0.5)) * 0.75);
      var honeyStore = colony.honey / Math.max(1, colony.broodBoxes * SIM.broodBoxStoreCap);
      var honeyFrac  = outerBias * honeyStore * 1.4;
      c.honey = Math.min(free, Math.min(0.92, honeyFrac));
      free    = Math.max(0, free - c.honey);

      /* Nectar: small amount on active frames near nest */
      if (dist < broodReach + 1.5) {
        c.nectar = Math.min(free, 0.04);
        free = Math.max(0, free - c.nectar);
      }

      c.empty = Math.max(0, free);

      frame.content = c;
      if ((broodUsed > 0.05 || c.honey > 0.05) && !frame.drawn) frame.drawn = true;
      if (frame.drawn && _colony_rand() < 0.001) {
        frame.combAge = Math.min(5, frame.combAge + 1);
      }
    });
  });

  /* --- Distribute superHoney across supers (bottom super fills first) --
     Within each super, honey fills centre frames before edges (realistic:
     bees work from above the brood cluster outward).                       */

  /* Centre-outward frame weights for an 11-frame super */
  var _superFW = [0.12, 0.28, 0.52, 0.75, 0.92, 1.00, 0.92, 0.75, 0.52, 0.28, 0.12];
  var _superFWSum = _superFW.reduce(function(s, v) { return s + v; }, 0);

  var remaining = colony.superHoney || 0;
  var cap = SIM.honeyPerSuper;

  layout.supers.forEach(function(sup, si) {
    /* Advance comb drawing: bees draw ~1 frame per 5,000 bees per week,
       capped at 11 (a full super). Only progresses while the colony is active. */
    if (sup.drawnFrames === undefined) sup.drawnFrames = 0;
    if (sup.drawnFrames < 11) {
      var drawRate = Math.floor((colony.population || 0) / 5000);
      sup.drawnFrames = Math.min(11, sup.drawnFrames + drawRate);
    }

    /* Mark individual frames as drawn, working outward from centre.
       Centre frames are warmest and drawn first — matches real bee behaviour. */
    if (sup.frames && sup.frames.length === 11) {
      var _drawOrder = [5,4,6,3,7,2,8,1,9,0,10];
      for (var _di = 0; _di < 11; _di++) {
        sup.frames[_drawOrder[_di]].drawn = (_di < Math.floor(sup.drawnFrames));
      }
    }

    /* Bottom super fills first; upper supers only start receiving once the
       lower one is >75% full. This matches how bees actually work upward. */
    var prevSuperFull = true;
    for (var pi = 0; pi < si; pi++) {
      if ((layout.supers[pi].honeyKg || 0) < cap * 0.75) { prevSuperFull = false; break; }
    }

    /* Honey can only go into drawn comb — scale capacity by drawn fraction */
    var drawnFrac = Math.min(1, (sup.drawnFrames || 0) / 11);
    var thisCap = prevSuperFull ? cap * drawnFrac : cap * 0.20 * drawnFrac;
    sup.honeyKg   = Math.min(thisCap, remaining);
    remaining     = Math.max(0, remaining - sup.honeyKg);
    /* Lock honey type: set on first fill; allow update when super is <20% full
       and the current flow type changes (e.g. colony moved to moorland for heather). */
    var _prevFrac = (sup._prevHoneyKg || 0) / Math.max(cap, 0.1);
    var _flowType = colony.superHoneyType || 'summer';
    if ((_prevFrac === 0 && sup.honeyKg > 0) ||
        (_prevFrac < 0.20 && sup.honeyKg > 0 && sup.honeyType !== _flowType)) {
      sup.honeyType = _flowType;
    }
    sup._prevHoneyKg = sup.honeyKg;
    sup.osr       = colony.osrCrystallised && colony.superHoneyType === 'oilseed';

    var fillFrac = sup.honeyKg / cap;

    /* Per-frame distribution: centre frames get most honey */
    sup.frames.forEach(function(frame, fi) {
      var fw       = _superFW[fi] / _superFWSum * FRAMES;   // weight × 11 / sum
      /* Scale so total across all frames equals fillFrac */
      var frameFill = Math.min(1.0, fillFrac * fw * 1.05);
      var cappedF  = frameFill * 0.78;   /* capped honey */
      var nectarF  = frameFill * 0.18;   /* uncapped/incoming nectar */
      var emptyF   = Math.max(0, 1 - cappedF - nectarF);
      frame.content = { honey: cappedF, nectar: nectarF, empty: emptyF,
                        eggs:0, larvae:0, capped:0, pollen:0, drone:0 };
      if (frameFill > 0.05 && !frame.drawn) frame.drawn = true;
      frame.crystallised = sup.osr;
    });
  });
}

/* ====================================================================
   makeColony(opts) -> Colony
   opts: { name, apiaryId, source, id, week, year,
           population?, queenQuality?, varroa?, queenAge? }
   ==================================================================== */
function makeColony(opts){
  opts = opts || {};
  const source = opts.source || 'nuc';
  const week   = opts.week   || SIM.startWeek;
  const year   = opts.year   || 1;

  /* --- brood, population and stores depend on source --- */
  let population, eggs, larvae, capped, drones, honey, superHoney, pollen, varroa;
  let queenPresent = true;
  let queenVirgin  = false;
  let queenMated   = true;
  let queenAge     = opts.queenAge !== undefined ? opts.queenAge : 14;

  if (source === 'colony'){
    // A purchased full colony — already established
    population = opts.population !== undefined ? opts.population : SIM.fullColonyPop;
    eggs    = 5500;
    larvae  = 7000;
    capped  = 10000;
    drones  = 500;
    honey   = 8;
    superHoney = 0;
    pollen  = 1.4;
    varroa  = opts.varroa !== undefined ? opts.varroa : SIM.varroaStart * 2.2;  // more mites in a full colony
  } else if (source === 'swarm' || source === 'caught'){
    // A swarm has NO brood — eggs and larvae all left in the old hive
    population = opts.population !== undefined ? opts.population : SIM.caughtSwarmPop;
    eggs    = 0;
    larvae  = 0;
    capped  = 0;
    drones  = 0;
    honey   = 0.4;  // bees fill their honey stomachs before swarming — they have some stores
    superHoney = 0;
    pollen  = 0.1;
    varroa  = opts.varroa !== undefined ? opts.varroa : Math.floor(SIM.varroaStart * 0.55);  // lower — no brood to harbour mites
    // A caught swarm may have a virgin queen if the colony has already swarmed and cast
    if (opts.virgin){
      queenVirgin = true;
      queenMated  = false;
      queenAge    = 0;
    }
  } else if (source === 'split'){
    // Values provided by the split operation in actions.js
    population = opts.population !== undefined ? opts.population : Math.floor(SIM.nucPopulation * 0.8);
    eggs    = opts.eggs    !== undefined ? opts.eggs    : 2000;
    larvae  = opts.larvae  !== undefined ? opts.larvae  : 3000;
    capped  = opts.capped  !== undefined ? opts.capped  : 4000;
    drones  = 100;
    honey   = opts.honey   !== undefined ? opts.honey   : 3;
    superHoney = 0;
    pollen  = opts.pollen  !== undefined ? opts.pollen  : 0.6;
    varroa  = opts.varroa  !== undefined ? opts.varroa  : SIM.varroaStart;
  } else {
    // Default: newly hived nucleus (5-frame nuc transferred to an 11-frame box)
    // Real nucs arrive with a tight brood nest and light stores — 6 frames are empty foundation
    population = opts.population !== undefined ? opts.population : SIM.nucPopulation;
    eggs    = 1500;   // ~1 frame centre eggs
    larvae  = 2500;   // partial frame larvae around brood nest
    capped  = 4000;   // ~1 frame capped brood
    drones  = 100;
    honey   = 1;      // light stores — outer nuc frames have a small honey arch
    superHoney = 0;
    pollen  = 0.4;
    varroa  = opts.varroa !== undefined ? opts.varroa : SIM.varroaStart;
  }

  const layQuality = opts.queenQuality !== undefined
    ? opts.queenQuality
    : _colony_randRange(0.78, 1.15);

  var _colony = {
    id:          (opts.id !== undefined ? opts.id
                  : ((typeof Game !== 'undefined' && Game) ? Game.nextColonyId++ : 1)),
    name:        opts.name || 'Hive',
    apiaryId:    opts.apiaryId || 0,

    alive:       true,
    deadReason:  null,
    deadWeek:    null,
    established: week,
    source:      source,

    broodBoxes:    1,
    supers:        0,
    queenExcluder: false,
    entrance:      'reduced',

    population: population,
    eggs:       eggs,
    larvae:     larvae,
    capped:     capped,
    drones:     drones,
    winterBeeHealth: 1,

    queen: {
      present:       queenPresent,
      age:           queenAge,
      layQuality:    layQuality,
      mated:         queenMated,
      virgin:        queenVirgin,
      marked:        false,
      clipped:       false,
      temperamentGene: _colony_randRange(0.15, 0.55),
      hygieneGene:     _colony_randRange(0.20, 0.70),
      state:         queenVirgin ? 'virgin' : 'laying',
      bornYear:      year,
    },
    layingWorkers: false,

    honey:         honey,
    superHoney:    superHoney,
    superHoneyType: 'summer',
    broodHoneyType:  'summer',
    pollen:        pollen,

    varroa:  varroa,
    dwv:     0,
    cbpv:    0,
    diseases: { afb: 0, efb: 0, chalkbrood: 0, sacbrood: 0, nosema: 0 },

    waspPressure: 0,
    mouse:        false,
    waxMoth:      0,
    hornet:       0,

    swarmPressure:    0,
    queenCells:       { type: 'none', count: 0, age: 0, state: 'none' },
    swarmedThisYear:  false,

    temperament: opts.temperament !== undefined ? opts.temperament
      : _colony_randRange(0.15, 0.55),

    lastInspected: 0,
    known:         null,

    demaree:   null,
    osrRisk:   0,
    osrCrystallised: false,
    osrBroodRisk: 0,
    osrBroodCrystallised: false,
    _osrLockedCells: 0,

    treatment: null,
    feeding:   0,

    productionThisYear: 0,
    _starvingWeeks: 0,
    _highVarroaWeeks: 0,
    _hopelessWeeks: 0,

    hiveLayout: null,

    /* Physical stack — ordered array of components bottom→top.
       Source of truth for broodBoxes, supers, queenExcluder, clearerFitted. */
    stack: null,
    newspaperWeeksInPlace: 0,
    _stackWarnings: [],
    _isDemareeStackPattern: false,
  };

  /* Build the initial stack from the colony's starting state */
  _colony.stack = _colony_buildStackFromLegacy(_colony);
  return _colony;
}

/* ====================================================================
   colonyWeeklyUpdate(colony, ctx) -> events[]
   Runs one full week of colony biology. Mutates colony. Returns events.
   NEVER touches colony.known.
   ==================================================================== */
function colonyWeeklyUpdate(colony, ctx){
  if (!colony.alive) return [];

  /* Sync legacy derived fields from the stack so all downstream code
     can read colony.broodBoxes / colony.supers / colony.queenExcluder
     as-normal without knowing about the stack. */
  if (colony.stack) {
    _colony_deriveFromStack(colony);
    _colony_validateStack(colony);
  }

  const events  = [];
  const week    = ctx.week;
  const season  = ctx.season;
  const wkIdx   = ((week - 1) % 52);  // 0-based index into _colony_LAY_CURVE
  const year    = ctx.year || 1;

  const queen   = colony.queen;
  const dis     = colony.diseases;

  // --- 1. ALIVE CHECK & QUEEN AGEING --------------------------------
  if (queen && queen.present){
    queen.age++;
  }

  // --- 2. FEEDING ---------------------------------------------------
  if (colony.feeding > 0){
    const taken = Math.min(colony.feeding, 3.5);
    colony.honey  += taken;
    colony.feeding -= taken;
    if (colony.feeding < 0) colony.feeding = 0;
  }

  // --- 3. QUEEN LAYING ----------------------------------------------
  let eggsLaid = 0;
  const currentBrood = colony.eggs + colony.larvae + colony.capped;

  if (queen && queen.present && !queen.virgin && queen.state !== 'absent' && queen.state !== 'caged'){
    const baseLay = SIM.peakLayPerWeek
      * (_colony_LAY_CURVE[wkIdx] || 0)
      * queen.layQuality;

    const pollenFactor = _colony_clamp(
      0.35 + ctx.pollen * 0.8 + Math.min(colony.pollen, 1) * 0.3, 0, 1);

    // Space is limited by brood already occupying cells, and by honey
    // backfilling the brood nest beyond a comfortable level.
    // Issue D fix: crystallised OSR honey in brood box locks cells the queen
    // cannot lay in. _osrLockedCells is set in section 11b-ii each tick.
    const _osrLocked = (colony._osrLockedCells || 0);
    const spaceFactor = _colony_clamp(
      1.05 - (currentBrood + _osrLocked) / (colony.broodBoxes * 33000)
        - Math.max(0, colony.honey - SIM.broodNestComfort) / SIM.broodBoxStoreCap * 0.4,
      0.1, 1);

    // The queen keeps laying through dull weather; only real cold checks her.
    const weatherFactor = _colony_clamp(0.62 + ctx.weather.warmth * 0.32, 0.58, 1.05);

    const healthFactor = _colony_clamp(
      1 - dis.nosema * 0.5
        - colony.dwv   * 0.3
        - dis.efb      * 0.4
        - dis.afb      * 0.6,
      0, 1);

    if (queen.state === 'dronelayer' || colony.layingWorkers){
      // Drone layer / laying workers — small drone brood only
      eggsLaid = Math.round(baseLay * 0.08 * pollenFactor * spaceFactor);
    } else {
      eggsLaid = Math.round(baseLay * pollenFactor * spaceFactor * weatherFactor * healthFactor);
    }
  }

  // --- 4. BROOD PIPELINE -------------------------------------------
  // Simplest 3-bucket model: eggs -> larvae -> capped -> emerge
  // Drone-layer / laying-worker eggs are all drone brood — they produce no workers.
  const isDroneLaying = (queen && queen.state === 'dronelayer') || colony.layingWorkers;
  const emergingRaw = colony.capped;
  colony.capped  = colony.larvae;
  colony.larvae  = colony.eggs;
  colony.eggs    = eggsLaid;

  const infestNow  = varroaInfestation(colony);
  const varroaBroodDamage = _colony_clamp((infestNow - 0.03) * 2.5, 0, 0.55);
  const isStarving = colony.honey <= 0 && colony.superHoney <= 0;

  const broodSurvival = _colony_clamp(
    1 - colony.dwv        * 0.6
      - dis.chalkbrood    * 0.4
      - dis.sacbrood      * 0.3
      - dis.efb           * 0.5
      - dis.afb           * 0.7
      - varroaBroodDamage
      - (isStarving ? 0.5 : 0),
    0, 1);

  // Drone-layer brood emerges as drones, not workers — do not add to worker population
  const emerged = isDroneLaying ? 0 : Math.round(emergingRaw * broodSurvival);
  colony.population += emerged;

  // Drone management
  if (season === 'spring' || season === 'summer'){
    // Colonies raise drones; add a cohort proportional to laying
    colony.drones += Math.round(eggsLaid * 0.06);
    colony.drones  = Math.min(colony.drones, 3000);
  }
  if (wkIdx >= 37 && wkIdx <= 43){
    // Workers expel drones from late September; almost all gone by mid-Oct
    colony.drones = Math.round(colony.drones * 0.55);
  }
  colony.drones = Math.max(0, colony.drones);

  // --- 5. VARROA ---------------------------------------------------
  const broodPresent = colony.capped > 500;
  const rawGrowth    = broodPresent ? ctx.diff.varroaGrowth : 0.96;

  // Hygienic queens slow mite reproduction — they detect and remove infested brood
  const effGrowth = 1 + (rawGrowth - 1) * (1 - (queen ? queen.hygieneGene : 0.35) * 0.5);
  colony.varroa  *= effGrowth;

  // Apply any active treatment
  if (colony.treatment){
    const t = TREATMENTS[colony.treatment.id];
    if (t){
      let weeklyEfficacy = t.efficacy;
      if (t.broodlessOnly && broodPresent){
        // Bug C fix: OA only kills phoretic mites (on the bees). With brood present roughly
        // 60% of mites are sealed inside cells and fully protected. Real-world efficacy
        // against the total mite population therefore drops to ~40%. Previously 0.15 was
        // used, which underestimated the phoretic kill and overstated the overall miss rate.
        weeklyEfficacy = weeklyEfficacy * 0.40;
      }
      const weeksTotal  = t.weeks || 1;
      const wSurvival   = Math.pow(1 - weeklyEfficacy, 1 / weeksTotal);
      colony.varroa    *= wSurvival;

      // Formic acid can harm the queen, especially in warm weather
      if (t.queenRisk && queen && queen.present){
        const riskBase = t.queenRisk * (ctx.weather.warmth > 0.8 ? 1.6 : 1.0);
        if (_colony_rand() < riskBase / weeksTotal){
          queen.state    = 'failing';
          queen.layQuality = Math.max(0.3, queen.layQuality - 0.25);
        }
      }
    }
    colony.treatment.weeksLeft--;
    if (colony.treatment.weeksLeft <= 0) colony.treatment = null;
  }

  colony.varroa = Math.max(0, Math.min(colony.varroa, colony.population * 0.6));

  // Bug D fix — Reinfestation: treated colonies in a populated area re-acquire mites
  // from drifting bees and robbing within weeks. Without this, treating dropped mite
  // load to zero permanently, which is biologically impossible.
  // Rate: 0.1–0.3% of phoretic population per week (higher in summer drift season).
  // Apiary density is approximated by the number of colonies visible in the simulation.
  {
    const wkIdxR = ((week - 1) % 52);
    // Summer (wk 14-35): high forager drift and robbing → higher reinfestation pressure
    // Reduced from 0.003/0.001 — prior rates compounded to colony-killing levels by yr 3
    const driftRate = (wkIdxR >= 13 && wkIdxR <= 34) ? 0.0018 : 0.0005;
    // Each colony in the apiary adds a small contribution (capped at a multiplier of 2.0)
    const apiaryColonyCount = typeof Game !== 'undefined'
      ? Math.min(10, (Game.colonies || []).filter(function(c){ return c.alive && c.apiaryId === colony.apiaryId; }).length)
      : 3;
    const densityMultiplier = Math.min(2.0, 0.5 + apiaryColonyCount * 0.15);
    // Reinfestation: a small absolute mite count based on bee population × rate × density
    const reinfestation = colony.population * driftRate * densityMultiplier;
    colony.varroa += reinfestation;
    colony.varroa = Math.max(0, Math.min(colony.varroa, colony.population * 0.6));
  }

  const infest = varroaInfestation(colony);

  // Bug E fix — High-varroa consecutive-weeks tracker: if infestation stays above
  // 3% for 3+ weeks in a row, virus transmission (DWV) accelerates sharply.
  // This models the real-world collapse curve: sustained high mite load degrades
  // winter bee fat bodies, reducing overwinter survival even after a late treatment.
  if (infest > 0.03) {
    colony._highVarroaWeeks = (colony._highVarroaWeeks || 0) + 1;
  } else {
    colony._highVarroaWeeks = 0;
  }

  // DWV rises sharply once varroa exceeds a threshold; clears slowly otherwise
  // If the colony has had 3+ consecutive high-varroa weeks, DWV escalation doubles —
  // chronic exposure causes disproportionate virus build-up.
  if (infest > 0.04){
    const chronicMultiplier = (colony._highVarroaWeeks >= 3) ? 2.0 : 1.0;
    colony.dwv = Math.min(1, colony.dwv + (infest - 0.04) * 2.0 * chronicMultiplier);
  } else {
    colony.dwv = Math.max(0, colony.dwv - 0.10);
  }

  // --- 6. ADULT MORTALITY ------------------------------------------
  // Autumn mortality is graduated by calendar week, not a single flat value.
  // Old code used 5.5% for all of autumn — this caused a population SPIKE in
  // September/October because summer brood was still emerging while mortality
  // dropped sharply. Real UK colonies contract fast in autumn:
  //   Sep (wkIdx 35-38): old summer foragers still dying at near-summer rates
  //   Oct (wkIdx 39-43): winter bee cohort taking over, rate drops significantly
  //   Nov (wkIdx 44-47): mostly winter bees, slow die-off
  // These graduated rates produce realistic winter populations of 10,000-20,000
  // for a healthy full colony (benchmark: 8,000-15,000 average, up to 20,000 strong).
  let baseMort;
  if (season === 'winter'){
    baseMort = 0.028 + (1 - colony.winterBeeHealth) * 0.20;  // unhealthy winter bees die fast
  } else if (season === 'spring'){
    baseMort = 0.085;
  } else if (season === 'summer'){
    baseMort = 0.11;  // summer turnover — ~9-week lifespan; allows post-swarm recovery
  } else {
    // Autumn: graduated mortality by week index (wkIdx 35=Sep through 47=Nov)
    if (wkIdx <= 38) {
      baseMort = 0.115;  // Sep: summer foragers still dominant, dying fast
    } else if (wkIdx <= 43) {
      baseMort = 0.080;  // Oct: transition — winter bees increasing, summer bees dying off
    } else {
      baseMort = 0.040;  // Nov: mostly long-lived winter bees, much slower turnover
    }
  }

  const extraMort = colony.dwv    * 0.12
                  + colony.cbpv   * 0.20
                  + dis.nosema    * 0.08
                  + infest        * 0.40
                  + ((season === 'spring' || season === 'summer') ? ctx.weather.fly * 0.04 : 0);

  const totalMort = _colony_clamp(baseMort + extraMort, 0, 0.6);
  const deaths    = Math.round(colony.population * totalMort);
  colony.population = Math.max(0, colony.population - deaths);

  // Hard cap: a standard National hive cannot house more than ~80,000 bees.
  // Above this, swarming pressure is extreme and physical space runs out.
  // Bees beyond this level are assumed lost (clustered outside, starved, left).
  colony.population = Math.min(colony.population, 80000);

  // --- 7. FORAGING & STORES ----------------------------------------
  let foragerFraction;
  if (season === 'winter')      foragerFraction = 0.05;
  else if (season === 'spring') foragerFraction = 0.40;
  else if (season === 'summer') foragerFraction = 0.50;
  else                          foragerFraction = 0.35;

  const foragers      = colony.population * foragerFraction;
  const hornetPenalty = 1 - colony.hornet * 0.5;
  const effForage     = ctx.nectar * ctx.weather.fly * hornetPenalty;

  const nectarIncome  = foragers * effForage * SIM.nectarRate * ctx.diff.yieldBonus;
  const pollenIncome  = foragers * ctx.pollen * ctx.weather.fly * SIM.pollenRate;

  // Consumption
  let consumption;
  if (season === 'winter'){
    consumption = colony.population * 0.00005;  // clustering bees burn very little
  } else {
    consumption = colony.population * SIM.upkeepPerBee
                + colony.larvae    * SIM.broodCostHoney;
  }

  const honeyDelta = nectarIncome - consumption;

  /* Effective super capacity limited to drawn comb only.
     Bees cannot store honey in undrawn foundation.
     Read drawnFrames from each super's layout object if available;
     fall back to full capacity for legacy/pre-layout supers. */
  let effectiveSuperCap;
  if (colony.hiveLayout && colony.hiveLayout.supers && colony.hiveLayout.supers.length > 0) {
    effectiveSuperCap = colony.hiveLayout.supers.reduce(function(sum, sup) {
      var drawnFrac = Math.min(1, (sup.drawnFrames !== undefined ? sup.drawnFrames : 11) / 11);
      return sum + SIM.honeyPerSuper * drawnFrac;
    }, 0);
  } else {
    effectiveSuperCap = colony.supers * SIM.honeyPerSuper;
  }

  if (honeyDelta >= 0){
    // Surplus: fill brood nest comfort zone, then overflow to supers
    const spaceInNest = SIM.broodNestComfort - colony.honey;
    if (spaceInNest > 0){
      const toNest = Math.min(honeyDelta, spaceInNest);
      colony.honey += toNest;
      // Tag brood box honey type when nectar income fills it
      if (toNest > 0) colony.broodHoneyType = honeyTypeForWeek(week, ctx.siteType || 'rural');
      const leftover = honeyDelta - toNest;
      if (leftover > 0){
        if (colony.supers > 0){
          const superSpace = effectiveSuperCap - colony.superHoney;
          colony.superHoney += Math.min(leftover, Math.max(0, superSpace));
          colony.superHoneyType = honeyTypeForWeek(week, ctx.siteType || 'rural');
          colony.productionThisYear += Math.min(leftover, Math.max(0, superSpace));
          // Surplus beyond drawn capacity is lost — overflow increases swarm pressure (backfilling)
          if (leftover > superSpace){
            colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.04, 0, 1);
          }
        } else {
          // No supers: store in brood box up to physical cap
          const nestCap   = colony.broodBoxes * SIM.broodBoxStoreCap;
          const nestSpace  = nestCap - colony.honey;
          const toNestNoSuper = Math.min(leftover, nestSpace);
          colony.honey   += toNestNoSuper;
          if (toNestNoSuper > 0) colony.broodHoneyType = honeyTypeForWeek(week, ctx.siteType || 'rural');
          if (leftover > nestSpace){
            // Completely backfilled — strong upward pressure on swarming
            colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.07, 0, 1);
          }
        }
      }
    } else {
      // Brood nest already at comfort; all goes to super or box
      if (colony.supers > 0){
        const superSpace  = effectiveSuperCap - colony.superHoney;
        const toSuper    = Math.min(honeyDelta, Math.max(0, superSpace));
        colony.superHoney += toSuper;
        colony.superHoneyType = honeyTypeForWeek(week, ctx.siteType || 'rural');
        colony.productionThisYear += toSuper;
        if (honeyDelta > superSpace){
          colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.04, 0, 1);
        }
      } else {
        const nestCap   = colony.broodBoxes * SIM.broodBoxStoreCap;
        const nestSpace  = nestCap - colony.honey;
        colony.honey   += Math.min(honeyDelta, nestSpace);
        if (honeyDelta > nestSpace){
          colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.07, 0, 1);
        }
      }
    }
  } else {
    // Deficit: drain honey first, then superHoney
    const deficit = -honeyDelta;
    if (colony.honey >= deficit){
      colony.honey -= deficit;
    } else {
      const remainder = deficit - colony.honey;
      colony.honey    = 0;
      colony.superHoney = Math.max(0, colony.superHoney - remainder);
    }
  }

  // Clamp stores
  colony.honey      = _colony_clamp(colony.honey,      0, colony.broodBoxes * SIM.broodBoxStoreCap);
  colony.superHoney = _colony_clamp(colony.superHoney, 0, effectiveSuperCap);

  // Pollen
  colony.pollen += pollenIncome - colony.larvae * SIM.broodCostPollen;
  colony.pollen *= 0.92;  // old pollen stales and is consumed
  colony.pollen  = _colony_clamp(colony.pollen, 0, colony.broodBoxes * 3);

  // --- 8. STARVATION -----------------------------------------------
  if (colony.honey <= 0 && colony.superHoney <= 0){
    events.push({ type: 'starved', colony: colony });
    colony._starvingWeeks = (colony._starvingWeeks || 0) + 1;
    // Brood crashes when there are no stores
    colony.eggs    = Math.round(colony.eggs    * 0.3);
    colony.larvae  = Math.round(colony.larvae  * 0.3);
    colony.capped  = Math.round(colony.capped  * 0.3);
    // Heavy extra adult mortality
    colony.population = Math.round(colony.population * 0.75);
    if (colony._starvingWeeks > (ctx.diff.starvationGrace || 0) + 1){
      colony.alive      = false;
      colony.deadReason = 'starvation';
      colony.deadWeek   = week;
      events.push({ type: 'died', colony: colony, reason: 'starvation' });
      return events;
    }
  } else {
    colony._starvingWeeks = 0;
  }

  // --- 8 (near-zero). CRITICAL LOW STORES MORTALITY (winter) -------
  // A colony with very little honey (1-3 kg) in deep or mid-winter is
  // effectively starving in slow motion: bees cannot leave the cluster
  // to find food, brood is not being fed, the queen stops laying.
  // Model the accelerating death spiral before stores reach absolute zero:
  // apply progressive population loss so the colony dies around the 2-3 kg
  // mark rather than only at exactly 0 kg — matching what beekeepers observe.
  // Only in winter (low consumption makes this irrelevant in summer).
  if (season === 'winter' && colony.honey > 0 && colony.honey < 3
      && (colony.superHoney || 0) <= 0) {
    // Mortality fraction scales with how close to zero stores are:
    // at 2.9 kg: ~5% extra loss per week; at 0.5 kg: ~25% extra loss per week.
    var _nearZeroMortFrac = 0.05 + (1 - colony.honey / 3) * 0.20;
    colony.population = Math.round(colony.population * (1 - _nearZeroMortFrac));
    if (!colony._nearZeroStarvingWeeks) colony._nearZeroStarvingWeeks = 0;
    colony._nearZeroStarvingWeeks++;
    events.push({ type: 'starved', colony: colony });
    // After 2 consecutive near-zero weeks the colony collapses
    if (colony._nearZeroStarvingWeeks >= 2) {
      colony.alive      = false;
      colony.deadReason = 'starvation';
      colony.deadWeek   = week;
      events.push({ type: 'died', colony: colony, reason: 'starvation' });
      return events;
    }
  } else {
    colony._nearZeroStarvingWeeks = 0;
  }

  // --- 8a. ISOLATION STARVATION (deep winter) ----------------------
  // A small winter cluster cannot move across cold frames to reach honey
  // stored away from the cluster — the classic "starved with full frames
  // on the outside". Fondant placed directly on the top bars resolves this;
  // syrup cannot (too cold for bees to take it down).
  //
  // The reachable-stores threshold scales with cluster size:
  //   pop < 3,000 bees: cluster spans ~2-3 frames; cannot reach stores more
  //     than 3-4 frames away. Only ~10 kg or less is truly adjacent.
  //   pop 3,000-5,000: a slightly larger cluster; up to ~5 kg in adjacent frames.
  //   pop >= 5,000: cluster large enough to bridge to most in-box stores.
  //
  // Only applies deep winter: December (wkIdx 44-51) and Jan-Feb (wkIdx 0-7).
  var _deepWinterWeek = (wkIdx <= 7 || wkIdx >= 44);
  // Isolation threshold: stores that a cluster of this size can physically reach
  var _isolationThreshold = (colony.population < 3000) ? 10 : 5;
  if (_deepWinterWeek && colony.honey > 0
      && colony.honey < _isolationThreshold && colony.population < 5000){
    colony._isolationRisk = (colony._isolationRisk || 0) + 1;
    if (colony._isolationRisk >= 2){
      // After two consecutive weeks of isolation risk, the cluster may fail.
      // A tiny cluster (< 3,000) has a much higher die chance — it cannot
      // maintain cluster temperature while bridging to distant stores.
      var _isolationBaseDie = (colony.population < 3000) ? 0.45 : 0.25;
      var _isolationDie = _colony_rand() < (_isolationBaseDie + (1 - colony.winterBeeHealth) * 0.35);
      if (_isolationDie){
        colony.alive      = false;
        colony.deadReason = 'isolation starvation — cluster too small to reach stores';
        colony.deadWeek   = week;
        events.push({ type: 'died', colony: colony,
                       reason: 'isolation starvation — cluster too small to reach stores' });
        return events;
      }
      // Even without dying, the colony weakens faster from the stress
      colony.population = Math.round(colony.population * 0.88);
      events.push({ type: 'starved', colony: colony });
    }
  } else if (!_deepWinterWeek || colony.honey >= _isolationThreshold || colony.population >= 5000) {
    colony._isolationRisk = 0;
  }

  // --- 8b. PRE-WINTER STORES WARNING (late autumn) -----------------
  // Emit a warning event during the feeding window (wkIdx 35-43 = Sep-Oct)
  // when brood-box stores fall below the safe winter minimum (18 kg).
  // Resets once stores are built back up, so it can re-fire if they drop.
  if (wkIdx >= 35 && wkIdx <= 43 && colony.honey < SIM.winterStoresNeed){
    if (!colony._warnedLowWinterStores){
      colony._warnedLowWinterStores = true;
      events.push({ type: 'low_winter_stores', colony: colony, honey: colony.honey });
    }
  } else if (colony.honey >= SIM.winterStoresNeed){
    colony._warnedLowWinterStores = false;
  }

  // --- 9. DISEASE --------------------------------------------------
  // AFB always worsens — there is no natural recovery
  if (dis.afb > 0){
    dis.afb = Math.min(1, dis.afb + 0.08);
  }
  // EFB worsens when present
  if (dis.efb > 0){
    dis.efb = Math.min(1, dis.efb + 0.05);
  }
  // Nosema: worsens in winter/early spring, recovers in summer
  if (season === 'winter' || wkIdx <= 10){
    dis.nosema = Math.min(1, dis.nosema + 0.04);
  } else {
    dis.nosema = Math.max(0, dis.nosema - 0.06);
  }
  // Chalkbrood and sacbrood: strong hygienic colonies suppress them; weak ones worsen.
  // _ventilationBoost (set by improveVentilation in actions.js) lifts the effective
  // suppressionFactor for 4 weeks — modelling the benefit of reduced hive humidity.
  const hygieneStr = queen ? queen.hygieneGene : 0.3;
  const colonyStrength = _colony_clamp(colony.population / 20000, 0, 1);
  const ventBoostActive = (colony._ventilationBoost || 0) > 0;
  if (ventBoostActive) {
    colony._ventilationBoost = Math.max(0, (colony._ventilationBoost || 0) - 1);
  }
  // Ventilation boost raises effective suppression by 0.25, capped at 1.0
  const suppressionFactor = _colony_clamp(
    hygieneStr * colonyStrength + (ventBoostActive ? 0.25 : 0), 0, 1);

  if (dis.chalkbrood > 0){
    dis.chalkbrood = suppressionFactor > 0.55
      ? Math.max(0, dis.chalkbrood - 0.05)
      : Math.min(1, dis.chalkbrood + 0.02);
  }
  if (dis.sacbrood > 0){
    dis.sacbrood = suppressionFactor > 0.50
      ? Math.max(0, dis.sacbrood - 0.06)
      : Math.min(1, dis.sacbrood + 0.015);
  }

  // Spontaneous minor disease onset — more likely in weak/stressed colonies
  const stressLevel = _colony_clamp(
    (1 - colonyStrength) * 0.6 + infest * 0.4 + (isStarving ? 0.3 : 0), 0, 1);

  if (dis.chalkbrood === 0 && _colony_rand() < 0.009 * stressLevel * ctx.diff.diseaseChance){
    dis.chalkbrood = 0.05;
  }
  if (dis.sacbrood === 0 && _colony_rand() < 0.007 * stressLevel * ctx.diff.diseaseChance){
    dis.sacbrood = 0.05;
  }
  if (dis.nosema === 0 && season === 'winter' && _colony_rand() < 0.012 * stressLevel * ctx.diff.diseaseChance){
    dis.nosema = 0.05;
  }
  // CBPV onset: large colonies in poor weather
  if (colony.cbpv === 0 && colony.population > 28000 && ctx.weather.fly < 0.4 && _colony_rand() < 0.025){
    colony.cbpv = 0.05;
  } else if (colony.cbpv > 0){
    colony.cbpv = Math.max(0, colony.cbpv - 0.05);  // tends to clear on its own
  }

  // Emit disease event when severity crosses the threshold for the first time
  const diseaseThreshold = 0.15;
  const _knownDis = colony._knownDiseaseEvents || {};
  for (const d of ['afb','efb','chalkbrood','sacbrood','nosema']){
    if (dis[d] >= diseaseThreshold && !_knownDis[d]){
      _knownDis[d] = true;
      events.push({ type: 'disease', colony: colony, disease: d });
    }
    // Reset the flag if disease clears (so it can fire again if it recurs)
    if (dis[d] < 0.05) _knownDis[d] = false;
  }
  colony._knownDiseaseEvents = _knownDis;

  // AFB crisis kills the colony AND destroys all equipment (no cure; must be burned)
  if (dis.afb > 0.7){
    colony.alive      = false;
    colony.deadReason = 'American Foul Brood';
    colony.deadWeek   = week;
    // All equipment in an AFB colony must be destroyed — it cannot be reused or returned.
    // We zero out supers and brood boxes here; simulation.js/_sim_resolveEvent handles
    // the player-facing consequences (no refund, equipment condemned).
    colony._afbEquipmentLost = {
      supers:     colony.supers     || 0,
      broodBoxes: colony.broodBoxes || 1,
    };
    colony.supers     = 0;
    colony.superHoney = 0;
    colony.honey      = 0;
    if (colony.hiveLayout) {
      colony.hiveLayout.supers    = [];
      colony.hiveLayout.broodBoxes = [];
    }
    events.push({ type: 'afbDestroy', colony: colony,
                  supers: colony._afbEquipmentLost.supers,
                  broodBoxes: colony._afbEquipmentLost.broodBoxes });
    events.push({ type: 'died', colony: colony, reason: 'American Foul Brood' });
    return events;
  }

  // EFB at very high severity — colony too weak to recover without intervention
  if (dis.efb > 0.75){
    colony.alive      = false;
    colony.deadReason = 'European Foul Brood (colony collapsed)';
    colony.deadWeek   = week;
    events.push({ type: 'died', colony: colony, reason: 'European Foul Brood (colony collapsed)' });
    return events;
  }

  // --- 10. PESTS ---------------------------------------------------
  // Wasps — robbing in late summer / autumn with reduced entrance giving defence bonus
  if (colony.waspPressure > 0.3 && colony.population < 9000){
    const entranceBonus = (colony.entrance === 'reduced' || colony.entrance === 'mouseguard') ? 0.4 : 1.0;
    const robbingDamage = colony.waspPressure * entranceBonus;
    colony.honey     = Math.max(0, colony.honey     - robbingDamage * 0.8);
    colony.population = Math.round(colony.population * (1 - robbingDamage * 0.06));
  }

  // Mouse — can move in during winter if entrance is open
  if (!colony.mouse && season === 'winter' && colony.entrance !== 'mouseguard'){
    if (_colony_rand() < 0.06){  // ~6% chance per winter week without a mouse guard
      colony.mouse = true;
    }
  }
  if (colony.mouse){
    // Mouse causes ongoing comb damage and disturbs clustering bees
    colony.honey      = Math.max(0, colony.honey - 0.4);
    colony.population = Math.round(colony.population * 0.96);
    // Mouse leaves in spring naturally
    if (season === 'spring' && _colony_rand() < 0.4) colony.mouse = false;
  }

  // Wax moth — thrives in weak colonies; a strong colony keeps it in check
  if (colony.population < 5000){
    colony.waxMoth = Math.min(1, colony.waxMoth + 0.04 * (1 - colonyStrength));
  } else {
    colony.waxMoth = Math.max(0, colony.waxMoth - 0.08);
  }
  if (colony.waxMoth > 0.3){
    // Wax moth comb damage reduces usable space
    colony.honey = Math.max(0, colony.honey - colony.waxMoth * 0.3);
  }

  // --- 11. SWARMING ------------------------------------------------
  // Edge 5 fix — defensive normalisation: ensure queenCells always has all
  // required fields. Missing age/state (e.g. from a manually-crafted save or
  // a split that forgot to set them) causes NaN propagation in age++, which
  // means cells never cap and never fire a swarm. Normalise once here.
  if (!colony.queenCells || typeof colony.queenCells !== 'object') {
    colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
  } else {
    if (colony.queenCells.age === undefined || colony.queenCells.age === null
        || typeof colony.queenCells.age !== 'number' || isNaN(colony.queenCells.age)) {
      colony.queenCells.age = 0;
    }
    if (!colony.queenCells.state) colony.queenCells.state = 'none';
    if (!colony.queenCells.type)  colony.queenCells.type  = 'none';
    if (!colony.queenCells.count) colony.queenCells.count = 0;
  }

  // Accumulate swarm pressure from congestion, queen age, and conditions
  if (_colony_inSwarmWindow(week)){
    const cong      = colonyCongestion(colony);
    const ageFactor = queen && queen.present && queen.mated
      ? _colony_clamp(queen.age / 80, 0, 0.5)
      : 0;
    const popFactor  = _colony_clamp((colony.population - 10000) / 30000, 0, 1);
    const condFactor = ctx.nectar * ctx.weather.fly;

    colony.swarmPressure = _colony_clamp(
      colony.swarmPressure
        + cong          * 0.08
        + ageFactor     * 0.02
        + popFactor     * 0.03
        + condFactor    * 0.02,
      0, 1);

    // Demaree keeps pressure suppressed while active
    if (colony.demaree) {
      colony.swarmPressure = _colony_clamp(colony.swarmPressure * 0.60, 0, 0.30);
    }
  } else {
    colony.swarmPressure = _colony_clamp(colony.swarmPressure * 0.80, 0, 1);
  }

  // --- 11a. Demaree progression ------------------------------------
  if (colony.demaree) {
    colony.demaree.age++;
    if (colony.demaree.age === 1 && !colony.demaree.checked) {
      // Day-7 check missed: top box raises emergency cells from youngest larvae.
      // Player must now deal with these or a virgin may emerge and cast.
      if (colony.queenCells.type === 'none') {
        colony.queenCells = { type: 'emergency', count: 5, age: -1, state: 'larvae' };
        events.push({ type: 'demareeUnchecked', colony: colony });
      }
    }
    if (colony.demaree.age >= 3) {
      // Top box brood all emerged — top box becomes stores, demaree complete
      events.push({ type: 'demareeComplete', colony: colony });
      colony.demaree = null;
      // Remove the temporary second brood box from the stack and layout
      if (colony.stack) {
        var _lastBBIdx = -1;
        for (var _si = colony.stack.length - 1; _si >= 0; _si--) {
          if (colony.stack[_si].type === 'broodBox') { _lastBBIdx = _si; break; }
        }
        if (_lastBBIdx > 0) colony.stack.splice(_lastBBIdx, 1);
        _colony_deriveFromStack(colony);
      } else {
        if (colony.broodBoxes > 1) colony.broodBoxes = 1;
      }
      if (colony.hiveLayout && colony.hiveLayout.broodBoxes.length > 1) {
        colony.hiveLayout.broodBoxes.pop();
      }
    }
  }

  // --- 11b. Newspaper uniting — bees chew through after ~1 week ------
  if (colony.stack && colony.stack.some(function(i) { return i.type === 'newspaper'; })) {
    colony.newspaperWeeksInPlace = (colony.newspaperWeeksInPlace || 0) + 1;
    if (colony.newspaperWeeksInPlace >= 2) {
      /* Newspaper has been in place long enough — remove it from the stack.
         The actual colony merge is triggered by the player using uniteColonies
         (now possible once newspaper has been placed). */
      colony.stack = colony.stack.filter(function(i) { return i.type !== 'newspaper'; });
      colony.newspaperWeeksInPlace = 0;
      _colony_deriveFromStack(colony);
      events.push({ type: 'newspaperReady', colony: colony });
    }
  }

  // --- 11c. OSR crystallisation ------------------------------------
  // Oilseed rape (OSR) honey has ~30% glucose — the highest of any common
  // UK honey type. It begins to set in the comb within 10-14 days of the
  // flow ending. Once set it cannot be extracted by centrifuge and will
  // block brood space if it crystallises in the brood box.
  //
  // FIX (Issue A): honeyTypeForWeek() returns 'oilseed' (matching HONEY_TYPES
  // keys). The old code checked superHoneyType === 'osr' which never matched,
  // silently disabling all OSR crystallisation mechanics. All checks now use
  // 'oilseed' consistently.
  //
  // FIX (Issue B): wkIdx is 0-based. OSR farmland flow = wkInYear 14-19
  // = wkIdx 13-18. Old flow-active check used wkIdx >= 14 (off by one) and
  // the post-flow window started at wkIdx 16 (too late). Fixed below.
  //
  // FIX (Issue E): add osrWarning event at 1 week post-flow so the player
  // gets an early alert while the honey is still extractable, not just when
  // crystallisation is already under way.
  //
  // FIX (Issue F): propagate crystallised state per-super (not just colony-
  // level) so each sup.crystallised flag is set individually.
  //
  // Timeline:
  //   wkIdx 13-18, ctx.nectar > 0.50 → flow active, osrRisk stays 0
  //   wkIdx 19+   → risk += 1 each week
  //   osrRisk 1   → fire osrWarning  (still extractable, urgent)
  //   osrRisk >= 2 → fire osrCrystal (honey setting, most extraction lost)
  //
  // FIX (Issue G): colony.superHoneyType is overwritten every week that
  // any honey flows in, so from week 20 onward (spring clover/bramble) it
  // flips to 'spring' even if OSR honey is still sitting in the supers.
  // Guard must also check per-super honeyType so crystallisation continues
  // counting after the OSR flow ends and mixed honey begins arriving.
  var _hasOsrInSupers = colony.superHoneyType === 'oilseed';
  if (!_hasOsrInSupers && colony.hiveLayout && colony.hiveLayout.supers) {
    for (var _osi = 0; _osi < colony.hiveLayout.supers.length; _osi++) {
      if (colony.hiveLayout.supers[_osi].honeyType === 'oilseed' &&
          colony.hiveLayout.supers[_osi].honeyKg > 0) {
        _hasOsrInSupers = true;
        break;
      }
    }
  }
  if (colony.superHoney > 0 && _hasOsrInSupers) {
    // The farmland 1.55× multiplier in simulation.js pushes ctx.nectar above
    // 0.60 during weeks 14-19 on farmland sites. The 0.50 threshold ensures
    // only genuine OSR-site colonies enter the crystallisation path.
    const osrFlowActive = ctx.nectar > 0.50 && wkIdx >= 13 && wkIdx <= 18;
    if (!osrFlowActive && wkIdx >= 18 && wkIdx <= 31) {
      colony.osrRisk = (colony.osrRisk || 0) + 1;
      // One week post-flow: still extractable but beekeeper must act now
      if (colony.osrRisk === 1) {
        events.push({ type: 'osrWarning', colony: colony });
      }
      // Two weeks post-flow: honey setting in comb — extraction badly impaired
      if (colony.osrRisk >= 2 && !colony.osrCrystallised) {
        colony.osrCrystallised = true;
        // Per-super crystallised flag (Issue F fix)
        if (colony.hiveLayout && colony.hiveLayout.supers) {
          colony.hiveLayout.supers.forEach(function(sup) {
            if (sup.honeyType === 'oilseed' && sup.honeyKg > 0) {
              sup.crystallised = true;
            }
          });
        }
        events.push({ type: 'osrCrystal', colony: colony });
      }
    } else if (osrFlowActive) {
      colony.osrRisk = 0;
    }
  } else if (!colony.superHoney || colony.superHoney < 0.5) {
    // Supers empty or harvested — clear OSR state
    colony.osrRisk = 0;
    colony.osrCrystallised = false;
  }

  // --- 11b-ii. OSR crystallisation in BROOD BOX -----------------------
  // Issue D fix: if OSR honey crystallises in the brood box, bees cannot
  // uncap or move it. The queen cannot lay in crystallised cells. This
  // reduces effective brood space and escalates swarm pressure.
  // We model this separately from super crystallisation because the beekeeper
  // cannot extract it — the only remedies are warming frames or cutting comb.
  //
  // Trigger: same timing as super crystallisation (wkIdx >= 20, osrRisk-equivalent
  // based on broodHoneyType === 'oilseed') but tracked via osrBroodRisk so it
  // does not interfere with the super crystallisation counter.
  if (colony.honey > 3 && colony.broodHoneyType === 'oilseed') {
    const broodOsrFlowActive = ctx.nectar > 0.50 && wkIdx >= 13 && wkIdx <= 18;
    if (!broodOsrFlowActive && wkIdx >= 18 && wkIdx <= 31) {
      colony.osrBroodRisk = (colony.osrBroodRisk || 0) + 1;
      if (colony.osrBroodRisk >= 2 && !colony.osrBroodCrystallised) {
        colony.osrBroodCrystallised = true;
        // Crystallised frames in the brood box block queen space.
        // Model this as a direct spaceFactor penalty via swarm pressure spike
        // and a brood space reduction (fewer effective laying cells).
        // The queen cannot lay in wax-hard crystallised cells.
        colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.15, 0, 1);
        events.push({ type: 'osrBroodCrystal', colony: colony });
      }
    } else if (broodOsrFlowActive) {
      colony.osrBroodRisk = 0;
    }
  } else if (colony.honey < 1) {
    colony.osrBroodRisk = 0;
    colony.osrBroodCrystallised = false;
  }

  // Apply brood space penalty while brood box OSR is crystallised
  // Crystallised cells are effectively unavailable for brood — reduce
  // the queen's effective laying space by capping a fraction of cells
  if (colony.osrBroodCrystallised && colony.queen && colony.queen.present && colony.queen.mated) {
    // Block ~20% of brood box capacity by artificially inflating capped count
    // This feeds into the spaceFactor in section 3 (queen laying) next tick
    const lockedCells = Math.round(colony.broodBoxes * 33000 * 0.20);
    colony._osrLockedCells = lockedCells;
  } else {
    colony._osrLockedCells = 0;
  }

  // --- 11c. Start swarm cells: larvae visible, player has ONE week -
  // Real: queen lays in cup → egg → larva (4 days) → capped (day 8-9).
  // 1 game tick ≈ 7 days → cells appear as larvae, cap on the NEXT tick.
  if (colony.swarmPressure > 0.62
      && colony.queenCells.type === 'none'
      && colony.population > 18000
      && queen && queen.present && queen.mated
      && _colony_inSwarmWindow(week)){
    // If colony hasn't been inspected this week during swarm season,
    // cells may already be capped by the time the player discovers them.
    const weeksSinceInspect = week - (colony.lastInspected || 0);
    // startAge accounts for same-tick increment in section 11d:
    //   Fresh (< 1 week): age -1 → tick makes 0 → larvae visible, 2 weeks to act
    //   Overdue (1 week): age 0  → tick makes 1 → cells capped on discovery, 1 week to act
    //   Very overdue (2+): age 1  → tick makes 2 → swarm fires this tick
    // The 7-day window has real teeth: miss one weekly inspection and cells are
    // already capped when you find them — one week left before the swarm issues.
    const startAge = (weeksSinceInspect >= 2) ? 1 : (weeksSinceInspect >= 1 ? 0 : -1);
    colony.queenCells = {
      type:  'swarm',
      count: 5 + _colony_randInt(0, 15),   // 5-20 cells (realistic range)
      age:   startAge,
      state: startAge >= 1 ? 'capped' : 'larvae'
    };
    events.push({ type: 'queencells', colony: colony });
  }

  // --- 11d. Swarm cells age: larvae→capped (age 1), swarm fires at age 2 ---
  // Real timeline: cells first seen as larvae (age 0 → tick creates them).
  // After one week (age 1) cells are capped — swarm IMMINENT warning.
  // After a second week capped (age 2) the prime swarm issues.
  // Player has one full inspection window between capped and swarm firing.
  if (colony.queenCells.type === 'swarm'){
    colony.queenCells.age++;
    colony.queenCells.state = colony.queenCells.age >= 1 ? 'capped' : 'larvae';

    if (colony.queenCells.age >= 2) {
      // Cells capped for a full week — prime swarm fires unless queen is clipped
      if (queen && queen.clipped) {
        // Clipped queen exits hive but FALLS to the ground — cannot fly.
        // Swarm mills outside for hours, then returns to the hive.
        // NO bees are lost. BUT the cells are still capped and NOT destroyed.
        // Next tick: first virgin emerges and CAN fly → she leads the delayed swarm.
        events.push({ type: 'swarmAborted', colony: colony });
        // Cells continue as postSwarm — virgin emerges NEXT tick (age -1 so same-tick
        // increment brings it to 0, emergence requires >= 1)
        colony.queenCells = {
          type:  'postSwarm',
          count: colony.queenCells.count,
          age:   -1,
          state: 'capped',
          clippedAbort: true     // old (clipped) queen still present
        };
        // Pressure barely drops — the impulse is not satisfied
        colony.swarmPressure = _colony_clamp(colony.swarmPressure - 0.08, 0, 1);
      } else {
        // PRIME SWARM ISSUES — old queen leaves with 55-65% of workforce
        const swarmFrac = _colony_randRange(0.55, 0.65);
        events.push({ type: 'swarm', colony: colony });
        colony.population      = Math.round(colony.population * (1 - swarmFrac));
        colony.swarmedThisYear = true;
        colony.swarmPressure   = 0;
        colony.queen           = null;  // old queen departs with the swarm
        // Cells remain capped — virgin emerges NEXT week (age -1 so same-tick
        // increment to 0; emergence fires when age reaches 1)
        colony.queenCells = {
          type:  'postSwarm',
          count: colony.queenCells.count,
          age:   -1,
          state: 'capped',
          clippedAbort: false
        };
      }
    }
  }

  // --- 11e. PostSwarm cells: capped → virgin emerges (age 1) ------
  if (colony.queenCells.type === 'postSwarm') {
    colony.queenCells.age++;

    if (colony.queenCells.age >= 1) {
      colony.queenCells.state = 'emerged';
      const wasClipAbort  = !!colony.queenCells.clippedAbort;
      const cellCount     = colony.queenCells.count;

      if (wasClipAbort) {
        // Old clipped queen is still present. Virgin emerges and CAN fly.
        // She leads the ACTUAL swarm (one week delayed by the clipping).
        // This IS the real swarm — the clipping only delayed it.
        const swarmFrac = _colony_randRange(0.45, 0.58);
        events.push({ type: 'swarm', colony: colony });
        colony.population      = Math.round(colony.population * (1 - swarmFrac));
        colony.swarmedThisYear = true;
        colony.swarmPressure   = 0;
        // The virgin leaves with the swarm; old clipped queen remains
        // Workers may supersede the old clipped queen shortly (flag for supersedure)
        if (_colony_rand() < 0.60) {
          colony.queenCells = { type: 'supersedure', count: 2, age: 0, state: 'larvae' };
        } else {
          // Old queen survives and continues laying
          colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
        }
      } else {
        // Normal post-primary-swarm: virgin becomes the new queen
        colony.queen = _colony_virginFromParent(queen, year);

        // CAST SWARM: multiple cells remaining after prime swarm = real chance of
        // secondary swarm with a virgin. Population threshold is post-swarm
        // (already halved) so 8000 corresponds to a strong original colony.
        if (colony.population > 8000 && cellCount > 3 && _colony_rand() < 0.42) {
          const castFrac = _colony_randRange(0.22, 0.32);
          events.push({ type: 'castSwarm', colony: colony });
          colony.population = Math.round(colony.population * (1 - castFrac));
        }

        colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
      }
    }
  }

  // --- 11f. Emergency / replacement cells --------------------------
  // Raised from a split, nucleus method, artificial swarm, or missed Demaree check.
  // Only install the virgin when the colony is actually queenless — do NOT
  // overwrite a living queen (e.g. Demaree top box raising cells while the
  // real queen is safely below the QX in the bottom box).
  if (colony.queenCells.type === 'emergency'){
    colony.queenCells.age++;
    colony.queenCells.state = colony.queenCells.age >= 1 ? 'capped' : 'larvae';
    if (colony.queenCells.age >= 2){
      const queenAlive = colony.queen && colony.queen.present
        && colony.queen.state !== 'absent';
      if (!queenAlive) {
        colony.queen           = _colony_virginFromParent(colony.queen, year);
        colony.layingWorkers   = false;
        colony._queenlessWeeks = 0;
      } else {
        // Queen is alive (e.g. missed Demaree check — real queen in bottom box,
        // top box raised emergency cells). A virgin has emerged from the top-box
        // cells and cannot stay in a colony that already has a mated queen.
        // She leads a cast swarm — a real population loss the player needs to see.
        const castFrac = _colony_randRange(0.18, 0.28);
        events.push({ type: 'castSwarm', colony: colony });
        colony.population      = Math.round(colony.population * (1 - castFrac));
        colony.swarmedThisYear = true;
        colony.swarmPressure   = _colony_clamp(colony.swarmPressure - 0.10, 0, 1);
      }
      colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
    }
  }

  // Handle virgin queens — mating flight resolution
  // NOTE: queen.age is already incremented for ALL queens (including virgins) in section 1.
  // Do NOT increment again here — that was causing virgins to age at 2x speed.
  if (queen && queen.present && queen.virgin){
    if (queen.age >= 2){
      // Needs flyable weather over the mating period
      const flyScore   = ctx.weather.fly;
      const mateChance = _colony_clamp(0.2 + flyScore * 0.7, 0.05, 0.9);
      if (_colony_rand() < mateChance){
        // Successful mating
        queen.virgin     = false;
        queen.mated      = true;
        queen.state      = 'laying';
        queen.layQuality = _colony_clamp(
          _colony_randRange(0.70, 1.12) * (0.6 + flyScore * 0.4),  // poor weather = lower quality drones
          0.5, 1.3);
        events.push({ type: 'emerged', colony: colony });
      } else if (queen.age >= 5){
        // Too long unmated — drone-layer or complete failure
        if (_colony_rand() < 0.35){
          queen.virgin  = false;
          queen.mated   = false;
          queen.state   = 'dronelayer';
          events.push({ type: 'queenfail', colony: colony });
        } else if (queen.age >= 8){
          // Queen lost entirely
          queen.present = false;
          queen.state   = 'absent';
          events.push({ type: 'queenfail', colony: colony });
        }
      }
    }
  }

  // Supersedure — colony quietly replaces an ageing or failing queen
  if (queen && queen.present && queen.mated && !queen.virgin){
    // Start supersedure only when there are no cells yet and the colony is
    // not in swarm mode; an ageing or failing queen prompts it.
    if (colony.queenCells.type === 'none' && colony.swarmPressure < 0.45){
      const failing = queen.state === 'failing'
        || queen.age > 156   // 3 game years — earlier threshold was ~1.8yr, biologically too soon
        || queen.layQuality < 0.60;
      if (failing && _colony_rand() < 0.18){
        colony.queenCells = { type: 'supersedure', count: 2, age: 0, state: 'larvae' };
      }
    }
    if (colony.queenCells.type === 'supersedure'){
      colony.queenCells.age++;
      colony.queenCells.state = colony.queenCells.age >= 1 ? 'capped' : 'larvae';
      if (colony.queenCells.age >= 3){
        colony.queen      = _colony_matedQueen(queen, year);
        colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
        events.push({ type: 'supersede', colony: colony });
      }
    }
  }

  // --- 11g. CAGED QUEEN — pheromone deprivation -----------------------
  // When the queen is caged (e.g. for Demaree variant or queen introduction),
  // her pheromones do not circulate. The colony detects the absence within
  // hours and begins raising emergency queen cells from any suitable larvae.
  // The queen continues to exist but is not laying (cage blocks her).
  // After the player calls introduceQueen(), colony.queen.caged is cleared,
  // emergency cells should be destroyed manually before release.
  if (queen && queen.present && queen.caged) {
    queen.state = 'caged';
    // Track how many weeks caged (for the introduce-queen action's release check)
    colony._cagedWeeks = (colony._cagedWeeks || 0) + 1;
    // After 1 week without queen pheromone, bees start emergency cells
    if (colony.queenCells.type === 'none' && colony.eggs + colony.larvae > 200) {
      colony.queenCells = { type: 'emergency', count: _colony_randInt(3, 8), age: -1, state: 'larvae' };
      events.push({ type: 'queencells', colony: colony });
    }
  } else if (queen && queen.present && !queen.caged && queen.state === 'caged') {
    // Queen just released — restore laying state and reset cage counter
    queen.state        = queen.mated ? 'laying' : 'virgin';
    colony._cagedWeeks = 0;
  } else if (!queen || !queen.caged) {
    colony._cagedWeeks = 0;
  }

  // --- 12. QUEEN AGEING --------------------------------------------
  // Lay quality declines naturally after two years
  if (queen && queen.present && queen.mated && queen.age > 78){
    const agingPenalty = (queen.age - 78) * 0.0008;
    queen.layQuality   = Math.max(0.3, queen.layQuality - agingPenalty);
  }

  if (queen && queen.present && (queen.age > 140 || queen.layQuality < 0.45)){
    queen.state = 'failing';
  }

  // Queenless state progression
  if (!queen || !queen.present || queen.state === 'absent'){
    if (!colony.layingWorkers){
      // Count how many weeks queenless (use _queenlessWeeks)
      colony._queenlessWeeks = (colony._queenlessWeeks || 0) + 1;
      // After ~3 weeks with no eggs/larvae and no cells, laying workers develop
      const noHope = (colony.eggs + colony.larvae < 200)
        && colony.queenCells.type === 'none'
        && colony._queenlessWeeks > 3;
      if (noHope) colony.layingWorkers = true;
    }

    // Death spiral: queenless with no queen cells and no fresh brood young enough
    // to raise new cells from. Foragers die of old age with no replacements coming.
    // Laying workers produce drones only — colony cannot recover from this state.
    const trulyQueenless = colony.queenCells.type === 'none'
      && (colony.eggs + colony.larvae < 200);
    if (trulyQueenless) {
      colony._hopelessWeeks = (colony._hopelessWeeks || 0) + 1;
      if (colony._hopelessWeeks >= 5) {
        colony.alive      = false;
        colony.deadReason = 'queenless collapse — no replacement queen was raised';
        colony.deadWeek   = week;
        events.push({ type: 'died', colony: colony, reason: colony.deadReason });
        return events;
      }
    } else {
      colony._hopelessWeeks = 0;
    }
  } else {
    colony._queenlessWeeks = 0;
    colony._hopelessWeeks  = 0;
  }

  // --- 13. WINTER BEE HEALTH ---------------------------------------
  // Late summer/autumn bees that will carry the colony through winter
  if (wkIdx >= 34 && wkIdx <= 43){
    colony.winterBeeHealth = _colony_clamp(
      Math.min(colony.winterBeeHealth,
        1 - infest  * 4   // varroa hammers the fat bodies of winter bees
          - colony.dwv  * 0.6
          - dis.nosema  * 0.4),
      0, 1);
  }
  // Spring clean: by week 18 winter bees are fully replaced by spring bees
  if (wkIdx >= 17 && wkIdx <= 18){
    colony.winterBeeHealth = 1;
  }

  // --- 14. DEATH CHECKS --------------------------------------------
  // Winter minimum viable population: below ~3,000 bees a cluster cannot
  // maintain the 20°C minimum needed to prevent brood chilling or
  // sustain the winter cluster temperature. A colony this small in winter
  // is effectively doomed even with adequate stores and no disease.
  // This is separate from the general dwindling threshold below.
  if (season === 'winter' && colony.population < 3000 && colony.population > 0 && colony.alive) {
    // Give it one week of grace: very small clusters occasionally survive brief spells
    colony._tinyWinterWeeks = (colony._tinyWinterWeeks || 0) + 1;
    if (colony._tinyWinterWeeks >= 2) {
      const reason = colony.winterBeeHealth < 0.5
        ? 'varroa and virus damage to the winter bees'
        : 'colony too small to maintain winter cluster temperature';
      colony.alive      = false;
      colony.deadReason = reason;
      colony.deadWeek   = week;
      events.push({ type: 'died', colony: colony, reason: reason });
      return events;
    }
  } else {
    colony._tinyWinterWeeks = 0;
  }

  // Dwindling — too few bees to survive (threshold higher in spring when they can recover)
  const minPop = (season === 'spring') ? 400 : 700;
  if (colony.population < minPop && colony.alive){
    const reason = (season === 'winter')
      ? (colony.winterBeeHealth < 0.5
          ? 'varroa and virus damage to the winter bees'
          : 'dwindled away over winter')
      : 'dwindled away';
    colony.alive      = false;
    colony.deadReason = reason;
    colony.deadWeek   = week;
    events.push({ type: 'died', colony: colony, reason: reason });
    return events;
  }

  // --- 15. TEMPERAMENT DRIFT ---------------------------------------
  const targetTemp  = queen ? queen.temperamentGene : 0.7;
  const stressBoost = (colony.layingWorkers ? 0.08 : 0)
                    + (colony.waspPressure > 0.4 ? 0.05 : 0)
                    + (ctx.weather.warmth > 1.1 ? 0.04 : 0);

  colony.temperament = _colony_clamp(
    colony.temperament + (targetTemp - colony.temperament) * 0.12 + stressBoost,
    0, 1);

  return events;
}

/* ====================================================================
   Derived getters
   ==================================================================== */

/* Real health status — used by simulation and advisor; NEVER shown directly to the player
   (the player only sees colony.known.status, the observed snapshot from the last inspection) */
function colonyTrueStatus(colony){
  if (!colony.alive) return 'dead';
  const q     = colony.queen;
  const inf   = varroaInfestation(colony);
  const dis   = colony.diseases;
  const totalStores = colony.honey + colony.superHoney;

  // Any of these is immediately bad
  if (dis.afb > 0.3)                               return 'bad';
  if (!q || !q.present || q.state === 'absent')    return 'bad';
  if (q.state === 'dronelayer' || colony.layingWorkers) return 'bad';
  if (colony.population < 3000)                    return 'bad';
  if (inf > SIM.varroaCrisis)                      return 'bad';

  // Winter starvation risk
  const season = seasonOfWeek((typeof Game !== 'undefined' && Game.week) || colony.established);
  // Approximate: use the colony's internal _starvingWeeks as a signal
  if ((colony._starvingWeeks || 0) > 0)             return 'bad';

  // Warning-level issues
  if (q.state === 'failing')                        return 'warn';
  if (q.layQuality < 0.60)                          return 'warn';
  if (inf > 0.025)                                   return 'warn';
  if (dis.efb > 0.2 || dis.nosema > 0.3)           return 'warn';
  if (colony.population < 8000)                     return 'warn';

  // Store check: winter needs are high; active season a bare minimum
  if (totalStores < 4)                              return 'warn';

  return 'ok';
}

/* Frames of brood — converts raw cell counts to frame equivalents.
   A standard National brood frame holds ~6,500 cells across both sides. */
function framesOfBrood(colony){
  return (colony.eggs + colony.larvae + colony.capped) / 6500;
}

/* Frames of bees — a seam (frame covered both sides) holds ~2,200 workers. */
function framesOfBees(colony){
  return colony.population / 2200;
}

/* How cramped is the colony? 0 = plenty of room, 1 = utterly packed.
   Accounts for bee space, brood, and stores relative to available comb. */
function colonyCongestion(colony){
  const totalFrames = colony.broodBoxes * 11 + colony.supers * 11 * 0.6;
  if (totalFrames <= 0) return 1;
  const beesFrames  = framesOfBees(colony);
  const broodFrames = framesOfBrood(colony);
  const storeFrames = (colony.honey + colony.superHoney) / 3.5;  // ~3.5 kg per deep frame of honey
  const used        = beesFrames * 0.5 + broodFrames + storeFrames * 0.5;  // bees and stores overlap
  return _colony_clamp(used / totalFrames, 0, 1);
}

/* Human-readable population band — calibrated to the 0–80,000 range */
function populationBand(n){
  if (n < 2000)  return 'a handful';
  if (n < 9000)  return 'small';
  if (n < 22000) return 'building';
  if (n < 45000) return 'strong';
  return 'huge';
}

/* Infestation rate: mites per adult bee + capped brood (the total susceptible population).
   A ratio above 0.03 (3%) is serious; above SIM.varroaCrisis (4.5%) is a crisis. */
function varroaInfestation(colony){
  const susceptible = colony.population + colony.capped + 1;
  return colony.varroa / susceptible;
}

/* Realistic sale value in pounds.
   A textbook healthy nuc is worth ~£180; a strong established colony ~£280.
   Diseases, high varroa, poor queen, and small population all drag it down sharply. */
function colonyValue(colony){
  if (!colony.alive) return 0;

  const inf    = varroaInfestation(colony);
  const q      = colony.queen;
  const dis    = colony.diseases;
  let base;

  if (colony.population < 5000){
    base = 80;   // small nuc-sized colony
  } else if (colony.population < 15000){
    base = 180;  // solid nucleus
  } else {
    base = 280;  // full colony
  }

  // Queen problems
  if (!q || !q.present || q.state === 'absent') base *= 0.25;
  else if (q.state === 'dronelayer')             base *= 0.35;
  else if (q.state === 'failing')                base *= 0.60;
  else if (q.layQuality < 0.70)                 base *= 0.75;

  // Varroa load
  if (inf > SIM.varroaCrisis)   base *= 0.40;
  else if (inf > 0.025)          base *= 0.65;
  else if (inf > 0.015)          base *= 0.85;

  // Serious diseases
  if (dis.afb > 0.1)       base = 0;          // AFB: worthless, must be destroyed
  if (dis.efb > 0.3)       base *= 0.30;
  if (dis.nosema > 0.4)    base *= 0.60;
  if (dis.chalkbrood > 0.5) base *= 0.75;

  // Low population penalty
  if (colony.population < 3000) base *= 0.30;

  return Math.max(0, Math.round(base));
}
