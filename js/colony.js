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
    frames:      _colony_makeFrames(11, false, 0),
    honeyKg:     0,
    honeyType:   'summer',
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
    /* Bottom super fills first; upper supers only start receiving once the
       lower one is >75% full. This matches how bees actually work upward. */
    var prevSuperFull = true;
    for (var pi = 0; pi < si; pi++) {
      if ((layout.supers[pi].honeyKg || 0) < cap * 0.75) { prevSuperFull = false; break; }
    }

    var thisCap = prevSuperFull ? cap : cap * 0.20;  // upper supers get very little until lower is 75%+
    sup.honeyKg   = Math.min(thisCap, remaining);
    remaining     = Math.max(0, remaining - sup.honeyKg);
    sup.honeyType = colony.superHoneyType || 'summer';
    sup.osr       = colony.osrCrystallised && colony.superHoneyType === 'osr';

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
    // Default: newly hived nucleus
    population = opts.population !== undefined ? opts.population : SIM.nucPopulation;
    eggs    = 4000;
    larvae  = 5000;
    capped  = 7000;
    drones  = 250;
    honey   = 3;
    superHoney = 0;
    pollen  = 0.8;
    varroa  = opts.varroa !== undefined ? opts.varroa : SIM.varroaStart;
  }

  const layQuality = opts.queenQuality !== undefined
    ? opts.queenQuality
    : _colony_randRange(0.78, 1.15);

  return {
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

    demaree:   null,     // { age, checked, topBroodFrames } — set by demareeMethod action
    osrRisk:   0,        // weeks since OSR flow ended without harvesting
    osrCrystallised: false,

    treatment: null,
    feeding:   0,

    productionThisYear: 0,
    _starvingWeeks: 0,

    hiveLayout: null,
  };
}

/* ====================================================================
   colonyWeeklyUpdate(colony, ctx) -> events[]
   Runs one full week of colony biology. Mutates colony. Returns events.
   NEVER touches colony.known.
   ==================================================================== */
function colonyWeeklyUpdate(colony, ctx){
  if (!colony.alive) return [];

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

  if (queen && queen.present && !queen.virgin && queen.state !== 'absent'){
    const baseLay = SIM.peakLayPerWeek
      * (_colony_LAY_CURVE[wkIdx] || 0)
      * queen.layQuality;

    const pollenFactor = _colony_clamp(
      0.35 + ctx.pollen * 0.8 + Math.min(colony.pollen, 1) * 0.3, 0, 1);

    // Space is limited by brood already occupying cells, and by honey
    // backfilling the brood nest beyond a comfortable level.
    const spaceFactor = _colony_clamp(
      1.05 - currentBrood / (colony.broodBoxes * 33000)
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

  const emerged = Math.round(emergingRaw * broodSurvival);
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
        weeklyEfficacy = weeklyEfficacy * 0.15;  // mites in sealed brood are mostly protected
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

  const infest = varroaInfestation(colony);

  // DWV rises sharply once varroa exceeds a threshold; clears slowly otherwise
  if (infest > 0.04){
    colony.dwv = Math.min(1, colony.dwv + (infest - 0.04) * 2.0);
  } else {
    colony.dwv = Math.max(0, colony.dwv - 0.10);
  }

  // --- 6. ADULT MORTALITY ------------------------------------------
  let baseMort;
  if (season === 'winter'){
    baseMort = 0.028 + (1 - colony.winterBeeHealth) * 0.20;  // unhealthy winter bees die fast
  } else if (season === 'spring'){
    baseMort = 0.085;
  } else if (season === 'summer'){
    baseMort = 0.13;  // high summer turnover is normal
  } else {
    baseMort = 0.055;  // autumn bees are increasingly long-lived winter bees
  }

  const extraMort = colony.dwv    * 0.12
                  + colony.cbpv   * 0.20
                  + dis.nosema    * 0.08
                  + infest        * 0.40
                  + ((season === 'spring' || season === 'summer') ? ctx.weather.fly * 0.04 : 0);

  const totalMort = _colony_clamp(baseMort + extraMort, 0, 0.6);
  const deaths    = Math.round(colony.population * totalMort);
  colony.population = Math.max(0, colony.population - deaths);

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

  if (honeyDelta >= 0){
    // Surplus: fill brood nest comfort zone, then overflow to supers
    const spaceInNest = SIM.broodNestComfort - colony.honey;
    if (spaceInNest > 0){
      const toNest = Math.min(honeyDelta, spaceInNest);
      colony.honey += toNest;
      const leftover = honeyDelta - toNest;
      if (leftover > 0){
        if (colony.supers > 0){
          const superCap = colony.supers * SIM.honeyPerSuper;
          const superSpace = superCap - colony.superHoney;
          colony.superHoney += Math.min(leftover, superSpace);
          colony.superHoneyType = honeyTypeForWeek(week, ctx.siteType || 'rural');
          colony.productionThisYear += Math.min(leftover, superSpace);
          // Surplus beyond super cap is lost — overflow increases swarm pressure (backfilling)
          if (leftover > superSpace){
            colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.04, 0, 1);
          }
        } else {
          // No supers: store in brood box up to physical cap
          const nestCap   = colony.broodBoxes * SIM.broodBoxStoreCap;
          const nestSpace  = nestCap - colony.honey;
          colony.honey   += Math.min(leftover, nestSpace);
          if (leftover > nestSpace){
            // Completely backfilled — strong upward pressure on swarming
            colony.swarmPressure = _colony_clamp(colony.swarmPressure + 0.07, 0, 1);
          }
        }
      }
    } else {
      // Brood nest already at comfort; all goes to super or box
      if (colony.supers > 0){
        const superCap   = colony.supers * SIM.honeyPerSuper;
        const superSpace  = superCap - colony.superHoney;
        const toSuper    = Math.min(honeyDelta, superSpace);
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
  colony.superHoney = _colony_clamp(colony.superHoney, 0, colony.supers * SIM.honeyPerSuper);

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
  // Chalkbrood and sacbrood: strong hygienic colonies suppress them; weak ones worsen
  const hygieneStr = queen ? queen.hygieneGene : 0.3;
  const colonyStrength = _colony_clamp(colony.population / 20000, 0, 1);
  const suppressionFactor = hygieneStr * colonyStrength;

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

  // AFB crisis kills the colony
  if (dis.afb > 0.7){
    colony.alive      = false;
    colony.deadReason = 'American Foul Brood';
    colony.deadWeek   = week;
    events.push({ type: 'died', colony: colony, reason: 'American Foul Brood' });
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
        colony.queenCells = { type: 'emergency', count: 5, age: 0, state: 'larvae' };
        events.push({ type: 'demareeUnchecked', colony: colony });
      }
    }
    if (colony.demaree.age >= 3) {
      // Top box brood all emerged — top box becomes stores, demaree complete
      events.push({ type: 'demareeComplete', colony: colony });
      colony.demaree = null;
    }
  }

  // --- 11b. OSR crystallisation ------------------------------------
  // Oilseed rape honey crystallises in the comb ~10-14 days after the flow ends.
  // If not harvested in time the frames are ruined.
  if (colony.superHoney > 0 && colony.superHoneyType === 'osr') {
    const osrFlowActive = ctx.nectar > 0.35 && wkIdx >= 14 && wkIdx <= 21;
    if (!osrFlowActive && wkIdx >= 16 && wkIdx <= 28) {
      colony.osrRisk = (colony.osrRisk || 0) + 1;
      if (colony.osrRisk >= 2 && !colony.osrCrystallised) {
        colony.osrCrystallised = true;
        events.push({ type: 'osrCrystal', colony: colony });
      }
    } else {
      colony.osrRisk = 0;
    }
  } else if (!colony.superHoney || colony.superHoney < 0.5) {
    colony.osrRisk = 0;
    colony.osrCrystallised = false;
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
    const startAge = (weeksSinceInspect >= 2) ? 1 : 0;  // already capped if overdue
    colony.queenCells = {
      type:  'swarm',
      count: 5 + _colony_randInt(0, 15),   // 5-20 cells (realistic range)
      age:   startAge,
      state: startAge >= 1 ? 'capped' : 'larvae'
    };
    events.push({ type: 'queencells', colony: colony });
  }

  // --- 11d. Swarm cells age: larvae→capped (age 1) = swarm fires ---
  if (colony.queenCells.type === 'swarm'){
    colony.queenCells.age++;
    colony.queenCells.state = colony.queenCells.age >= 1 ? 'capped' : 'larvae';

    if (colony.queenCells.age >= 1) {
      // First cell CAPPED — swarm fires unless queen is clipped
      if (queen && queen.clipped) {
        // Clipped queen exits hive but FALLS to the ground — cannot fly.
        // Swarm mills outside for hours, then returns to the hive.
        // NO bees are lost. BUT the cells are still capped and NOT destroyed.
        // Next tick: first virgin emerges and CAN fly → she leads the delayed swarm.
        events.push({ type: 'swarmAborted', colony: colony });
        // Cells continue as postSwarm — virgin emerges next tick
        colony.queenCells = {
          type:  'postSwarm',
          count: colony.queenCells.count,
          age:   0,
          state: 'capped',
          clippedAbort: true     // old (clipped) queen still present
        };
        // Pressure barely drops — the impulse is not satisfied
        colony.swarmPressure = _colony_clamp(colony.swarmPressure - 0.08, 0, 1);
      } else {
        // PRIME SWARM ISSUES — old queen leaves with 50-60% of workforce
        const swarmFrac = _colony_randRange(0.50, 0.62);
        events.push({ type: 'swarm', colony: colony });
        colony.population      = Math.round(colony.population * (1 - swarmFrac));
        colony.swarmedThisYear = true;
        colony.swarmPressure   = 0;
        // Cells remain capped — virgin emerges next tick from postSwarm
        colony.queenCells = {
          type:  'postSwarm',
          count: colony.queenCells.count,
          age:   0,
          state: 'capped',
          clippedAbort: false
        };
        // Old queen is gone — colony.queen will be replaced by virgin from cells
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

        // CAST SWARM: strong colony + many cells = real chance of secondary swarm
        if (colony.population > 14000 && cellCount > 5 && _colony_rand() < 0.42) {
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
  if (colony.queenCells.type === 'emergency'){
    colony.queenCells.age++;
    colony.queenCells.state = colony.queenCells.age >= 1 ? 'capped' : 'larvae';
    if (colony.queenCells.age >= 2){
      colony.queen           = _colony_virginFromParent(colony.queen, year);
      colony.queenCells      = { type: 'none', count: 0, age: 0, state: 'none' };
      colony.layingWorkers   = false;
      colony._queenlessWeeks = 0;
    }
  }

  // Handle virgin queens — mating flight resolution
  if (queen && queen.present && queen.virgin){
    queen.age++;
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
        || queen.age > 95
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
  } else {
    colony._queenlessWeeks = 0;
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
  const season = seasonOfWeek(colony.established);  // use established as a proxy isn't perfect
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

/* Human-readable population band */
function populationBand(n){
  if (n < 1500)  return 'a handful';
  if (n < 6000)  return 'small';
  if (n < 13000) return 'building';
  if (n < 22000) return 'strong';
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
