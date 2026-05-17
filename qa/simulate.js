/**
 * The Apiarist — Simulations v7
 * 125 runs, 25 strategies × 5 seeds. 3-year horizon.
 * Reports both cash AND enterprise value (cash + honey + colonies + equipment).
 * Multi-colony support: executor handles colonyIdx, strategies manage all colonies.
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const BASE_URL    = 'http://127.0.0.1:7890';
const REPORT_PATH = path.join(__dirname, 'simulation-report.md');
const KG_PER_JAR  = 0.34;

/* ── 25 Strategies × 5 seeds = 125 runs ─────────────────────────────────── */
const STRATEGIES = [
  // --- Original 12 ---
  { id:'lean',           name:'Lean Baseline',        diff:'apprentice', fn: leanPlay },
  { id:'market',         name:'Market Rush',          diff:'apprentice', fn: marketPlay },
  { id:'honey_max',      name:'Honey Maximiser',      diff:'apprentice', fn: honeyMaxPlay },
  { id:'extractor',      name:'Own Extractor',        diff:'apprentice', fn: extractorPlay },
  { id:'scale_2',        name:'Scale 2 Colonies',     diff:'apprentice', fn: scale2Play },
  { id:'swarm_split',    name:'Swarm & Split',        diff:'apprentice', fn: swarmSplitPlay },
  { id:'fed_hard',       name:'Fed Hard',             diff:'apprentice', fn: fedHardPlay },
  { id:'conservative',   name:'Conservative',         diff:'apprentice', fn: conservativePlay },
  { id:'colony_farm',    name:'Colony Farm (EV)',     diff:'apprentice', fn: colonyFarmPlay },
  { id:'heather',        name:'Heather Specialist',   diff:'apprentice', fn: heatherPlay,        site:'moorland' },
  { id:'varroa_clean',   name:'Varroa Clean',         diff:'apprentice', fn: varroaCleanPlay },
  { id:'full_send',      name:'Full Send',            diff:'apprentice', fn: fullSendPlay },
  // --- New 13 ---
  { id:'urban',          name:'Urban Garden',         diff:'apprentice', fn: urbanPlay,          site:'urban' },
  { id:'farmland',       name:'Farmland OSR',         diff:'apprentice', fn: farmlandPlay,       site:'farmland' },
  { id:'orchard',        name:'Orchard Spring',       diff:'apprentice', fn: orchardPlay,        site:'orchard' },
  { id:'no_treat',       name:'No Treatment',         diff:'apprentice', fn: noTreatPlay },
  { id:'apivar',         name:'Apivar Post-Harvest',  diff:'apprentice', fn: apivarPlay },
  { id:'rep_rush',       name:'Rep Rush',             diff:'apprentice', fn: repRushPlay },
  { id:'jar_hoarder',    name:'Jar Hoarder',          diff:'apprentice', fn: jarHoarderPlay },
  { id:'super_stacker',  name:'Super Stacker',        diff:'apprentice', fn: superStackerPlay },
  { id:'heather_scale',  name:'Heather Scale',        diff:'apprentice', fn: heatherScalePlay,   site:'moorland' },
  { id:'urban_scale',    name:'Urban Scale',          diff:'apprentice', fn: urbanScalePlay,     site:'urban' },
  { id:'patient_scale',  name:'Patient Scale',        diff:'apprentice', fn: patientScalePlay },
  { id:'full_tools',     name:'Full Toolkit',         diff:'apprentice', fn: fullToolsPlay },
  { id:'oxalic_only',    name:'Oxalic Only',          diff:'apprentice', fn: oxalicOnlyPlay },
];
const RUNS = [];
STRATEGIES.forEach(s => { for (let i=1;i<=5;i++) RUNS.push({...s, runId:`${s.id}-${i}`}); });

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Actions for every alive colony. fn(col, colonyIdx, state) → acts[] */
function forAllColonies(state, fn) {
  const acts = [];
  (state.colonies || []).forEach((col, i) => {
    fn(col, i, state).forEach(a => acts.push(a));
  });
  return acts;
}

/** Buy enough jars to cover all current honey + buffer. Buy sugar if low. */
function commonSetup(state, nCols) {
  nCols = nCols || Math.max(state.colonyCount, 1);
  const acts = [];
  const jarsForHoney = Math.ceil((state.inv.totalHoney || 0) / KG_PER_JAR);
  const targetJars   = Math.max(48 * nCols, jarsForHoney + 24);
  if (state.inv.emptyJars < targetJars && state.cash > 50) {
    const packs = Math.ceil((targetJars - state.inv.emptyJars) / 24);
    acts.push({a:'buySup', item:'jarpack', qty: Math.min(packs, 8)});
  }
  const sugarTarget = 8 + nCols * 4; // 12 for 1, 16 for 2 — enough without over-buying
  if (state.inv.sugar < sugarTarget && state.cash > 40)
    acts.push({a:'buySup', item:'sugarbag', qty: Math.min(3 + nCols, 6)});
  return acts;
}

/** Bottle all honey then sell via best available channel.
 *  Shop (0.6×) is WORSE than gate (1.0×) — never use it unless explicitly overflow.
 *  Heather honey: 30% pressing loss, so floor(kg * 0.70 / KG_PER_JAR) jars. */
function sellPipeline(state) {
  const acts = [];
  let jarsAvail = state.inv.emptyJars;
  Object.entries(state.inv.honeyByType || {}).forEach(([type, kg]) => {
    if (kg >= KG_PER_JAR && jarsAvail > 0) {
      const yieldFactor = type === 'heather' ? 0.70 : 1.0; // heather: 30% pressing loss
      const jars = Math.min(Math.floor(kg * yieldFactor / KG_PER_JAR), jarsAvail);
      if (jars > 0) acts.push({a:'bottle', type, jars});
      jarsAvail -= jars;
    }
  });
  // Channel priority: market (1.18×, rep≥12) > gate (1.0×) > online (1.12×, rep≥45)
  // NEVER shop (0.6× — consignment, lower than gate)
  Object.entries(state.inv.jarsByType || {}).forEach(([type, n]) => {
    if (n > 0) {
      if      (state.reputation >= 12) acts.push({a:'sell', channel:'market', type, n});
      else                             acts.push({a:'sell', channel:'gate',   type, n});
    }
  });
  return acts;
}

/** Buy the right quantity of varroa treatments for all alive colonies — called ONCE per tick.
 *  Prevents multi-colony strategies from buying N packs simultaneously (one per colony).
 *  opts.noTreat   — skip everything
 *  opts.oxalicOnly — winter oxalic only (no mid-season treatment)
 *  opts.apivar    — apivar post-harvest wk36-44 (95% efficacy, residue risk, no supers)
 *  opts.useFormic — formic acid mid-summer wk22-30 (harvestSafe)
 *  default        — apiguard wk29-43 + winter oxalic */
function buyTreatments(state, opts) {
  opts = opts || {};
  const wk    = state.wkOfYear;
  const acts  = [];
  const nCols = (state.colonies || []).length || 1;

  if (opts.noTreat) return acts;

  if (opts.oxalicOnly) {
    if (wk >= 49 || wk <= 3) {
      const need = Math.max(0, nCols - (state.inv.treatStock.oxalicVap||0));
      if (need > 0) acts.push({a:'buySup', item:'oxalicVap', qty: need});
    }
    return acts;
  }

  if (opts.apivar) {
    if (wk >= 36 && wk <= 44) {
      const need = Math.max(0, nCols - (state.inv.treatStock.apivar||0));
      if (need > 0) acts.push({a:'buySup', item:'apivar', qty: need});
    }
  } else if (opts.useFormic) {
    if (wk >= 22 && wk <= 30) {
      const need = Math.max(0, nCols - (state.inv.treatStock.formic||0));
      if (need > 0) acts.push({a:'buySup', item:'formic', qty: need});
    }
  } else {
    const apiguardWindow = (wk >= 29 && wk <= 43); // 29-35 standard, 37-43 heather
    if (apiguardWindow) {
      const need = Math.max(0, nCols - (state.inv.treatStock.apiguard||0));
      if (need > 0) acts.push({a:'buySup', item:'apiguard', qty: need});
    }
  }
  if (wk >= 49 || wk <= 3) {
    const need = Math.max(0, nCols - (state.inv.treatStock.oxalicVap||0));
    if (need > 0) acts.push({a:'buySup', item:'oxalicVap', qty: need});
  }
  return acts;
}

/** Standard per-colony management block. Treatment buying is NOT here — call
 *  buyTreatments() once per tick at the strategy level instead. */
function colonyRoutine(col, i, state, opts) {
  opts = opts || {};
  const wk   = state.wkOfYear;
  const acts = [];

  // Feed
  const springFeedThreshold  = opts.heavyFeed ? 15 : 8;
  const autumnFeedThreshold  = opts.heavyFeed ? 18 : 12;
  const feedKg = opts.heavyFeed ? 8 : 5;
  if (col.honey < springFeedThreshold && wk >= 10 && wk <= 18 && state.inv.sugar >= feedKg)
    acts.push({a:'feed', kind: opts.heavyFeed ? 'syrup2' : 'syrup1', kg: feedKg, colonyIdx: i});
  if (col.honey < autumnFeedThreshold && wk >= 34 && wk <= 44 && state.inv.sugar >= 3)
    acts.push({a:'feed', kind:'fondant', kg:3, colonyIdx: i});

  // Inspect
  const inspFreq = opts.moreInspect ? 1 : (wk >= 16 && wk <= 36 ? 2 : 4);
  if (col.wkSinceInsp >= inspFreq) acts.push({a:'inspect', colonyIdx: i});

  // Swarm control — cap colonies if maxCols set (prevents over-expansion bankrupting cash)
  const canSwarm = col.swarmPressure >= 0.5 && state.inv.spareHives > 0
    && (!opts.maxCols || state.colonyCount < opts.maxCols);
  if (canSwarm) acts.push({a:'artificialSwarm', colonyIdx: i});

  // Double brood if opts say so and stock available
  if (opts.doubleBrood && col.broodBoxes < 2 && state.inv.broodBoxes > 0 && wk >= 16 && wk <= 28)
    acts.push({a:'addBroodBox', colonyIdx: i});

  // QX + supers
  if (!col.qx && state.inv.queenExcluders > 0 && wk >= 18 && wk <= 38)
    acts.push({a:'fitQX', colonyIdx: i});
  const maxSupers = opts.maxSupers || 1;
  if (col.supers < maxSupers && col.qx && state.inv.supers > 0 && wk >= 18 && wk <= 38)
    acts.push({a:'addSuper', colonyIdx: i});

  // Harvest window
  const harvestFrom = opts.earlyHarvest ? 26 : 30;
  const harvestTo   = opts.earlyHarvest ? 36 : 40;
  if (!col.clearerFitted && col.supers > 0 && wk >= harvestFrom && wk <= harvestTo)
    acts.push({a:'fitClearerBoard', colonyIdx: i});
  if (col.clearerFitted)
    acts.push({a:'harvest', colonyIdx: i});

  // Apply treatment (buying handled by buyTreatments() at strategy level)
  if (!opts.noTreat) {
    if (opts.oxalicOnly) {
      if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'oxalicVap', colonyIdx: i});
    } else if (opts.apivar) {
      if (wk >= 36 && wk <= 44 && (state.inv.treatStock.apivar||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'apivar', colonyIdx: i});
      if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'oxalicVap', colonyIdx: i});
    } else if (opts.useFormic) {
      if (wk >= 22 && wk <= 30 && (state.inv.treatStock.formic||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'formic', colonyIdx: i});
      if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'oxalicVap', colonyIdx: i});
    } else {
      if (wk >= 29 && wk <= 35 && (state.inv.treatStock.apiguard||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'apiguard', colonyIdx: i});
      if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
        acts.push({a:'treat', id:'oxalicVap', colonyIdx: i});
    }
  }

  return acts;
}

/** Equipment purchase block: QX, supers, brood boxes for N colonies.
 *  opts.targetSupers  — override inventory super target (default: nCols+1)
 *  opts.settlingTank  — buy settling tank (£45, +£22 EV)
 *  opts.refractometer — buy refractometer (£22, +£11 EV) */
function buyEquipment(state, opts) {
  opts = opts || {};
  const nCols  = Math.max(state.colonyCount, 1);
  const acts   = [];
  const cash   = state.cash;
  const floor  = opts.cashFloor || 0;

  if (cash - floor > 15 * nCols && state.inv.queenExcluders < nCols)
    acts.push({a:'buySup', item:'queenExcluder', qty: nCols - state.inv.queenExcluders});

  // targetSupers lets strategies that want 4-per-colony stock the right quantity
  const wantSupers = opts.targetSupers !== undefined ? opts.targetSupers : (nCols + 1);
  if (cash - floor > 50 && state.inv.supers < wantSupers)
    acts.push({a:'buySup', item:'super', qty: Math.min(wantSupers - state.inv.supers, 6)});

  if (opts.doubleBrood && cash - floor > 60 && state.inv.broodBoxes < nCols)
    acts.push({a:'buySup', item:'broodBox', qty: nCols - state.inv.broodBoxes});

  if (opts.extractor && !state.inv.tools.extractor && cash - floor > 100)
    acts.push({a:'buyTool', id:'extractor'});

  if (opts.settlingTank && !state.inv.tools.settlingTank && cash - floor > 150)
    acts.push({a:'buyTool', id:'settlingTank'});

  if (opts.refractometer && !state.inv.tools.refractometer && cash - floor > 50)
    acts.push({a:'buyTool', id:'refractometer'});

  return acts;
}

/* ── 1. LEAN ─────────────────────────────────────────────────────────────── */
function leanPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];

  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:1}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:1})));
  return acts;
}

/* ── 2. MARKET RUSH ──────────────────────────────────────────────────────── */
/* Inspect every week during swarm season (builds rep faster), sell in small  */
/* batches of 6 jars to hit the gate's capacity limit repeatedly (more rep).  */
function marketPlay(state) {
  const wk   = state.wkOfYear;
  const acts = [...commonSetup(state), ...buyTreatments(state)];

  // Sell in small batches to maximise rep events
  let jarsAvail = state.inv.emptyJars;
  Object.entries(state.inv.honeyByType || {}).forEach(([type, kg]) => {
    if (kg >= KG_PER_JAR && jarsAvail > 0) {
      const jars = Math.min(Math.floor(kg / KG_PER_JAR), jarsAvail);
      acts.push({a:'bottle', type, jars});
      jarsAvail -= jars;
    }
  });
  Object.entries(state.inv.jarsByType || {}).forEach(([type, n]) => {
    if (n > 0) {
      // market (1.18×) > gate (1.0×) — NEVER shop (0.6×, worse than gate)
      // gate in small batches (≤7) to maximise rep gain events early on
      if      (state.reputation >= 12) acts.push({a:'sell', channel:'market', type, n});
      else                             acts.push({a:'sell', channel:'gate',   type, n: Math.min(n, 7)});
    }
  });

  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:1}));
  if (!state.hasColony) return acts;

  // Inspect weekly in swarm season to build reputation faster
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:1, moreInspect: wk >= 14 && wk <= 38})));
  return acts;
}

/* ── 3. HONEY MAXIMISER ─────────────────────────────────────────────────── */
function honeyMaxPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];

  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:3, doubleBrood:true, extractor:true}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:3, doubleBrood:true, heavyFeed:true})));
  return acts;
}

/* ── 4. OWN EXTRACTOR ───────────────────────────────────────────────────── */
function extractorPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2})));
  return acts;
}

/* ── 5. SCALE 2 COLONIES (properly managed) ─────────────────────────────── */
function scale2Play(state) {
  const acts = [...commonSetup(state, 2), ...sellPipeline(state), ...buyTreatments(state)];

  // Acquire hives before bees
  if (state.inv.spareHives < 1 && state.cash > 150) acts.push({a:'buyHive'});
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  // 2nd colony: wait until Y2 post-harvest cash. Pre-harvest, natural splits expand for free.
  if (state.colonyCount === 1 && state.inv.spareHives > 0 && state.yr >= 2 && state.cash > 600)
    acts.push({a:'buyBees'});

  const nCols = Math.max(state.colonyCount, 1);
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));

  // Cap at 3 colonies — strategy is "scale to 2", not "maximise colony count"
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, maxCols:3})));

  return acts;
}

/* ── 6. SWARM & SPLIT ────────────────────────────────────────────────────── */
/* Keep a spare hive ready, let the colony build pressure, artificialSwarm.   */
/* Once split, manage both colonies fully.                                     */
function swarmSplitPlay(state) {
  const acts = [...commonSetup(state, state.colonyCount || 1), ...sellPipeline(state), ...buyTreatments(state)];

  // Always keep 1 spare hive ready for splits
  if (state.inv.spareHives < 1 && state.cash > 130) acts.push({a:'buyHive'});
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});

  acts.push(...buyEquipment(state, {maxSupers:2, extractor: state.colonyCount > 1}));

  acts.push(...forAllColonies(state, (col, i) => {
    // Lower swarm threshold — intervene at 0.5 pressure; cap at 5 to avoid over-expansion cash burn
    const opts = {maxSupers:2, maxCols:5};
    const colActs = colonyRoutine(col, i, state, opts);
    return colActs;
  }));

  return acts;
}

/* ── 7. FED HARD ────────────────────────────────────────────────────────── */
function fedHardPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, heavyFeed:true})));
  return acts;
}

/* ── 8. CONSERVATIVE ────────────────────────────────────────────────────── */
/* Never drop below £500. Buy nothing unless surplus over floor.              */
function conservativePlay(state) {
  const FLOOR = 500;
  const acts  = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];

  if (!state.hasColony && state.inv.spareHives > 0 && state.cash - FLOOR > 130)
    acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:1, cashFloor: FLOOR}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:1})));
  return acts;
}

/* ── 9. FULL SEND ────────────────────────────────────────────────────────── */
/* Extractor + double brood + 3 supers + 2+ colonies + heavy feed.            */
/* 2nd bought colony waits until Y2 (post-harvest cash). Before that, natural */
/* swarm splits expand the operation without draining pre-harvest runway.     */
function fullSendPlay(state) {
  const nCols = Math.max(state.colonyCount, 1);
  const acts  = [...commonSetup(state, nCols), ...sellPipeline(state), ...buyTreatments(state)];

  if (state.inv.spareHives < 1 && state.cash > 350) acts.push({a:'buyHive'});
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  // 2nd bought colony only after Y1 harvest cash flowing — splits do free expansion before that
  if (state.colonyCount === 1 && state.inv.spareHives > 0 && state.yr >= 2 && state.cash > 800)
    acts.push({a:'buyBees'});

  // Equipment: phase-in with cash. Extractor + double brood only after meaningful income.
  // Gate on cash > 800 in Y2+ to avoid bankrupting from equipment before revenue catches up.
  const bigKit = (state.yr >= 2 && state.cash > 800) || state.cash > 1200;
  acts.push(...buyEquipment(state, {maxSupers: bigKit ? 3 : 2, doubleBrood: bigKit, extractor: bigKit}));

  // Cap at 5 colonies — full send is expensive, more than 5 bankrupt it
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers: bigKit ? 3 : 2, doubleBrood: bigKit, heavyFeed:true, maxCols:5})));

  return acts;
}

/* ── 10. HEATHER SPECIALIST ──────────────────────────────────────────────── */
/* Moorland site: heather honey at £20/jar is 60% more than summer.           */
/* Delay harvest until heather flow (wks 33-38). Keep 2 supers for volume.   */
function heatherPlay(state) {
  const wk   = state.wkOfYear;
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];

  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) => {
    const colActs = [];
    // Standard care
    if (col.honey < 8 && wk >= 10 && wk <= 18 && state.inv.sugar >= 5)
      colActs.push({a:'feed', kind:'syrup1', kg:5, colonyIdx: i});
    if (col.honey < 12 && wk >= 34 && wk <= 44 && state.inv.sugar >= 3)
      colActs.push({a:'feed', kind:'fondant', kg:3, colonyIdx: i});
    if (col.wkSinceInsp >= (wk >= 16 && wk <= 36 ? 2 : 4))
      colActs.push({a:'inspect', colonyIdx: i});
    if (col.swarmPressure >= 0.5 && state.inv.spareHives > 0)
      colActs.push({a:'artificialSwarm', colonyIdx: i});

    if (!col.qx && state.inv.queenExcluders > 0 && wk >= 18 && wk <= 38)
      colActs.push({a:'fitQX', colonyIdx: i});
    // Add supers during summer + heather flow
    if (col.supers < 2 && col.qx && state.inv.supers > 0 && wk >= 18 && wk <= 38)
      colActs.push({a:'addSuper', colonyIdx: i});

    // Harvest AFTER heather flow (wk 35-42) to capture heather honey
    if (!col.clearerFitted && col.supers > 0 && wk >= 35 && wk <= 42)
      colActs.push({a:'fitClearerBoard', colonyIdx: i});
    if (col.clearerFitted)
      colActs.push({a:'harvest', colonyIdx: i});

    // Apply treatments (bought by buyTreatments() call above — heather uses wk 37-43 apiguard)
    if (wk >= 37 && wk <= 43 && (state.inv.treatStock.apiguard||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'apiguard', colonyIdx: i});
    if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'oxalicVap', colonyIdx: i});

    return colActs;
  }));

  return acts;
}

/* ── 11. VARROA CLEAN ────────────────────────────────────────────────────── */
/* Formic acid mid-summer (harvestSafe — works through cappings, supers on).  */
/* Oxalic midwinter. Near-zero varroa = max worker lifespan = max honey.      */
function varroaCleanPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state, {useFormic:true})];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, useFormic:true})));
  return acts;
}

/* ── 9b. COLONY FARM (EV-maximiser) ─────────────────────────────────────── */
/* Optimises enterprise value via colony count: splits > bought colonies.     */
/* Deliberately lean on expensive upfront kit — formic (£23) and double-brood */
/* (£52) bankrupted every run. Uses apiguard post-harvest instead. Keeps 1    */
/* spare hive ready for the next split. Never buys 2nd colony until Y2 cash   */
/* is flowing — natural splits are free; bought colonies drain runway.        */
function colonyFarmPlay(state) {
  const nCols = Math.max(state.colonyCount, 1);
  const acts  = [...commonSetup(state, nCols), ...sellPipeline(state), ...buyTreatments(state)];

  // 1 spare hive — but only buy when enough cash runway remains (£350+)
  if (state.inv.spareHives < 1 && state.cash > 350) acts.push({a:'buyHive'});
  if (!state.hasColony && state.inv.spareHives > 0)  acts.push({a:'buyBees'});

  // Bought 2nd colony only after Y1 harvest cash has arrived — splits do the rest
  if (state.colonyCount === 1 && state.inv.spareHives > 0 && state.yr >= 2 && state.cash > 500)
    acts.push({a:'buyBees'});

  // Buy extractor early — £15 hire fee per bottling is worse than £80 one-time cost
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));

  // Cap at 4 colonies — beyond that treatment/equipment costs outpace income
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, maxCols:4})
  ));
  return acts;
}

/* ── 13. URBAN GARDEN ────────────────────────────────────────────────────── */
/* Urban site: lower nectar (0.83) but warmth bonus → earlier colony build.   */
/* Fit QX from wk16, harvest wk30-40. Less spray risk than farmland.          */
function urbanPlay(state) {
  const wk   = state.wkOfYear;
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) => {
    const colActs = [];
    if (col.honey < 8 && wk >= 10 && wk <= 18 && state.inv.sugar >= 5)
      colActs.push({a:'feed', kind:'syrup1', kg:5, colonyIdx:i});
    if (col.honey < 12 && wk >= 34 && wk <= 44 && state.inv.sugar >= 3)
      colActs.push({a:'feed', kind:'fondant', kg:3, colonyIdx:i});
    if (col.wkSinceInsp >= (wk >= 14 && wk <= 38 ? 2 : 4))
      colActs.push({a:'inspect', colonyIdx:i});
    if (col.swarmPressure >= 0.5 && state.inv.spareHives > 0)
      colActs.push({a:'artificialSwarm', colonyIdx:i});
    // Warmth bonus: fit QX slightly earlier wk16
    if (!col.qx && state.inv.queenExcluders > 0 && wk >= 16 && wk <= 38)
      colActs.push({a:'fitQX', colonyIdx:i});
    if (col.supers < 2 && col.qx && state.inv.supers > 0 && wk >= 16 && wk <= 38)
      colActs.push({a:'addSuper', colonyIdx:i});
    if (!col.clearerFitted && col.supers > 0 && wk >= 30 && wk <= 40)
      colActs.push({a:'fitClearerBoard', colonyIdx:i});
    if (col.clearerFitted)
      colActs.push({a:'harvest', colonyIdx:i});
    if (wk >= 29 && wk <= 35 && (state.inv.treatStock.apiguard||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'apiguard', colonyIdx:i});
    if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'oxalicVap', colonyIdx:i});
    return colActs;
  }));
  return acts;
}

/* ── 14. FARMLAND OSR ────────────────────────────────────────────────────── */
/* Farmland/OSR: heavy spring crop wk14-19, harvest early (wk22-30) before    */
/* oilseed sets solid. Nectar 1.0, spray risk 0.13. Heavy pre-OSR feeding.   */
function farmlandPlay(state) {
  const wk   = state.wkOfYear;
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) => {
    const colActs = [];
    // Heavy spring feeding: max colony size for OSR flow
    if (col.honey < 12 && wk >= 10 && wk <= 18 && state.inv.sugar >= 8)
      colActs.push({a:'feed', kind:'syrup2', kg:8, colonyIdx:i});
    if (col.honey < 12 && wk >= 34 && wk <= 44 && state.inv.sugar >= 3)
      colActs.push({a:'feed', kind:'fondant', kg:3, colonyIdx:i});
    if (col.wkSinceInsp >= (wk >= 14 && wk <= 38 ? 2 : 4))
      colActs.push({a:'inspect', colonyIdx:i});
    if (col.swarmPressure >= 0.5 && state.inv.spareHives > 0 && state.colonyCount < 3)
      colActs.push({a:'artificialSwarm', colonyIdx:i});
    // Fit QX early wk14 to catch OSR flow
    if (!col.qx && state.inv.queenExcluders > 0 && wk >= 14 && wk <= 38)
      colActs.push({a:'fitQX', colonyIdx:i});
    if (col.supers < 2 && col.qx && state.inv.supers > 0 && wk >= 14 && wk <= 38)
      colActs.push({a:'addSuper', colonyIdx:i});
    // Harvest wk22-30: get OSR out before it crystallises
    if (!col.clearerFitted && col.supers > 0 && wk >= 22 && wk <= 30)
      colActs.push({a:'fitClearerBoard', colonyIdx:i});
    if (col.clearerFitted)
      colActs.push({a:'harvest', colonyIdx:i});
    if (wk >= 29 && wk <= 35 && (state.inv.treatStock.apiguard||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'apiguard', colonyIdx:i});
    if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'oxalicVap', colonyIdx:i});
    return colActs;
  }));
  return acts;
}

/* ── 15. ORCHARD SPRING ──────────────────────────────────────────────────── */
/* Orchard site: pollen 1.22 bonus → strong spring build. Harvest spring      */
/* blossom early (wk24-32). Lower nectar (0.92) but colony build-up is great. */
function orchardPlay(state) {
  const wk   = state.wkOfYear;
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) => {
    const colActs = [];
    if (col.honey < 10 && wk >= 10 && wk <= 18 && state.inv.sugar >= 5)
      colActs.push({a:'feed', kind:'syrup1', kg:5, colonyIdx:i});
    if (col.honey < 12 && wk >= 34 && wk <= 44 && state.inv.sugar >= 3)
      colActs.push({a:'feed', kind:'fondant', kg:3, colonyIdx:i});
    if (col.wkSinceInsp >= (wk >= 14 && wk <= 38 ? 2 : 4))
      colActs.push({a:'inspect', colonyIdx:i});
    if (col.swarmPressure >= 0.5 && state.inv.spareHives > 0)
      colActs.push({a:'artificialSwarm', colonyIdx:i});
    // Fit QX early wk14 for spring blossom
    if (!col.qx && state.inv.queenExcluders > 0 && wk >= 14 && wk <= 38)
      colActs.push({a:'fitQX', colonyIdx:i});
    if (col.supers < 2 && col.qx && state.inv.supers > 0 && wk >= 14 && wk <= 38)
      colActs.push({a:'addSuper', colonyIdx:i});
    // Harvest spring blossom wk24-32
    if (!col.clearerFitted && col.supers > 0 && wk >= 24 && wk <= 32)
      colActs.push({a:'fitClearerBoard', colonyIdx:i});
    if (col.clearerFitted)
      colActs.push({a:'harvest', colonyIdx:i});
    if (wk >= 29 && wk <= 35 && (state.inv.treatStock.apiguard||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'apiguard', colonyIdx:i});
    if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'oxalicVap', colonyIdx:i});
    return colActs;
  }));
  return acts;
}

/* ── 16. NO TREATMENT ────────────────────────────────────────────────────── */
/* Saves ~£37/colony/year in treatment costs. Risk: varroa buildup → collapse.*/
/* Good EV control — shows cost of varroa management vs. lost colony EV.      */
function noTreatPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state, {noTreat:true})];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, noTreat:true})));
  return acts;
}

/* ── 17. APIVAR POST-HARVEST ─────────────────────────────────────────────── */
/* Apivar (amitraz strips): 95% efficacy vs apiguard 84%. Applied post-harvest*/
/* wk36-44 when supers are off (residue risk). Stronger varroa control.       */
function apivarPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state, {apivar:true})];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, apivar:true})));
  return acts;
}

/* ── 18. REP RUSH ────────────────────────────────────────────────────────── */
/* Inspect every week to build reputation fast. Routes to online (1.12×) once */
/* rep≥45, market (1.18×) once rep≥12. Small gate batches of ≤7 jars early   */
/* to maximise individual rep-gain events before market unlocks.              */
function repRushPlay(state) {
  const acts = [...commonSetup(state), ...buyTreatments(state)];

  // Bottle all honey
  let jarsAvail = state.inv.emptyJars;
  Object.entries(state.inv.honeyByType || {}).forEach(([type, kg]) => {
    if (kg >= KG_PER_JAR && jarsAvail > 0) {
      const yieldFactor = type === 'heather' ? 0.70 : 1.0;
      const jars = Math.min(Math.floor(kg * yieldFactor / KG_PER_JAR), jarsAvail);
      if (jars > 0) acts.push({a:'bottle', type, jars});
      jarsAvail -= jars;
    }
  });
  // Channel priority: online (1.12×, cap 18) when rep≥45 → market (1.18×) when rep≥12 → gate batches
  Object.entries(state.inv.jarsByType || {}).forEach(([type, n]) => {
    if (n > 0) {
      if      (state.reputation >= 45) acts.push({a:'sell', channel:'online', type, n});
      else if (state.reputation >= 12) acts.push({a:'sell', channel:'market', type, n});
      else                             acts.push({a:'sell', channel:'gate',   type, n: Math.min(n, 7)});
    }
  });

  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;

  // Inspect every single week — fastest possible rep accumulation
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, moreInspect:true})));
  return acts;
}

/* ── 19. JAR HOARDER ─────────────────────────────────────────────────────── */
/* Bottle everything immediately but hold inventory. Maximise EV throughout.  */
/* Cash-out blitz only in Y3 wk44+ when 3-year honey collection is all sold.  */
function jarHoarderPlay(state) {
  const acts = [...commonSetup(state), ...buyTreatments(state)];

  // Bottle everything regardless of season
  let jarsAvail = state.inv.emptyJars;
  Object.entries(state.inv.honeyByType || {}).forEach(([type, kg]) => {
    if (kg >= KG_PER_JAR && jarsAvail > 0) {
      const yieldFactor = type === 'heather' ? 0.70 : 1.0;
      const jars = Math.min(Math.floor(kg * yieldFactor / KG_PER_JAR), jarsAvail);
      if (jars > 0) acts.push({a:'bottle', type, jars});
      jarsAvail -= jars;
    }
  });
  // Hold — only sell in Y3 wk44+ blitz (or if going broke: cash < 80)
  const emergencySell = state.cash < 80;
  if (state.yr >= 3 && state.wkOfYear >= 44 || emergencySell) {
    Object.entries(state.inv.jarsByType || {}).forEach(([type, n]) => {
      if (n > 0) {
        if      (state.reputation >= 12) acts.push({a:'sell', channel:'market', type, n});
        else                             acts.push({a:'sell', channel:'gate',   type, n});
      }
    });
  }

  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;

  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2})));
  return acts;
}

/* ── 20. SUPER STACKER ───────────────────────────────────────────────────── */
/* 4 supers per colony for maximum honey volume. Double brood to support the  */
/* colony weight. Heavy feeding to maximise build-up and winter survival.     */
function superStackerPlay(state) {
  const nCols = Math.max(state.colonyCount, 1);
  const acts  = [...commonSetup(state, nCols), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  // Stock 4 supers per colony + 2 buffer
  acts.push(...buyEquipment(state, {maxSupers:4, targetSupers: nCols * 4 + 2, extractor:true, doubleBrood:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:4, doubleBrood:true, heavyFeed:true})));
  return acts;
}

/* ── 21. HEATHER SCALE ───────────────────────────────────────────────────── */
/* Moorland site + expand to 3-4 colonies. Heather flow (wk31-35) at £20/jar */
/* = 60% more than summer honey. Volume + premium = highest EV potential.    */
function heatherScalePlay(state) {
  const wk    = state.wkOfYear;
  const nCols = Math.max(state.colonyCount, 1);
  const acts  = [...commonSetup(state, nCols), ...sellPipeline(state), ...buyTreatments(state)];

  if (state.inv.spareHives < 1 && state.cash > 250) acts.push({a:'buyHive'});
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  if (state.colonyCount === 1 && state.inv.spareHives > 0 && state.yr >= 2 && state.cash > 600)
    acts.push({a:'buyBees'});

  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));

  acts.push(...forAllColonies(state, (col, i) => {
    const colActs = [];
    if (col.honey < 8 && wk >= 10 && wk <= 18 && state.inv.sugar >= 5)
      colActs.push({a:'feed', kind:'syrup1', kg:5, colonyIdx:i});
    if (col.honey < 12 && wk >= 34 && wk <= 44 && state.inv.sugar >= 3)
      colActs.push({a:'feed', kind:'fondant', kg:3, colonyIdx:i});
    if (col.wkSinceInsp >= (wk >= 16 && wk <= 36 ? 2 : 4))
      colActs.push({a:'inspect', colonyIdx:i});
    // Cap splits at 4 colonies total
    if (col.swarmPressure >= 0.5 && state.inv.spareHives > 0 && state.colonyCount < 4)
      colActs.push({a:'artificialSwarm', colonyIdx:i});
    if (!col.qx && state.inv.queenExcluders > 0 && wk >= 18 && wk <= 38)
      colActs.push({a:'fitQX', colonyIdx:i});
    if (col.supers < 2 && col.qx && state.inv.supers > 0 && wk >= 18 && wk <= 38)
      colActs.push({a:'addSuper', colonyIdx:i});
    // Harvest after heather flow (wk35-42)
    if (!col.clearerFitted && col.supers > 0 && wk >= 35 && wk <= 42)
      colActs.push({a:'fitClearerBoard', colonyIdx:i});
    if (col.clearerFitted)
      colActs.push({a:'harvest', colonyIdx:i});
    // Apiguard post-heather harvest (wk37-43)
    if (wk >= 37 && wk <= 43 && (state.inv.treatStock.apiguard||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'apiguard', colonyIdx:i});
    if ((wk >= 49 || wk <= 3) && (state.inv.treatStock.oxalicVap||0) > 0 && !col.treatment)
      colActs.push({a:'treat', id:'oxalicVap', colonyIdx:i});
    return colActs;
  }));
  return acts;
}

/* ── 22. URBAN SCALE ─────────────────────────────────────────────────────── */
/* Urban site + scale to 3 colonies. Warmth bonus helps early build; lower    */
/* nectar (0.83) partially offset by colony longevity and urban foraging mix.  */
function urbanScalePlay(state) {
  const nCols = Math.max(state.colonyCount, 1);
  const acts  = [...commonSetup(state, nCols), ...sellPipeline(state), ...buyTreatments(state)];

  if (state.inv.spareHives < 1 && state.cash > 250) acts.push({a:'buyHive'});
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  if (state.colonyCount === 1 && state.inv.spareHives > 0 && state.yr >= 2 && state.cash > 600)
    acts.push({a:'buyBees'});

  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, maxCols:3})));
  return acts;
}

/* ── 23. PATIENT SCALE ───────────────────────────────────────────────────── */
/* Never buy a 2nd colony until £1800 cash — maximum financial buffer before  */
/* expansion. Avoids the cash-starve trap, exits Y3 with healthy reserve.     */
function patientScalePlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  // Only buy hive when runway is strong
  if (state.inv.spareHives < 1 && state.cash > 400) acts.push({a:'buyHive'});
  // Only scale when very confident — £1800 cash floor
  if (state.colonyCount === 1 && state.inv.spareHives > 0 && state.cash > 1800)
    acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, maxCols:4})));
  return acts;
}

/* ── 24. FULL TOOLKIT ────────────────────────────────────────────────────── */
/* Buy extractor (£80→£40 EV) + settlingTank (£45→£22 EV) + refractometer    */
/* (£22→£11 EV) immediately. Pure EV asset accumulation strategy.            */
function fullToolsPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state)];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true, settlingTank:true, refractometer:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2})));
  return acts;
}

/* ── 25. OXALIC ONLY ─────────────────────────────────────────────────────── */
/* Skip mid-season treatments (apiguard £14/colony, formic £23/colony).       */
/* Winter oxalic vap only (£9/colony). Saves ~£14-23/colony/year; risk is     */
/* some varroa mid-season build-up reducing population and honey yield.       */
function oxalicOnlyPlay(state) {
  const acts = [...commonSetup(state), ...sellPipeline(state), ...buyTreatments(state, {oxalicOnly:true})];
  if (!state.hasColony && state.inv.spareHives > 0) acts.push({a:'buyBees'});
  acts.push(...buyEquipment(state, {maxSupers:2, extractor:true}));
  if (!state.hasColony) return acts;
  acts.push(...forAllColonies(state, (col, i) =>
    colonyRoutine(col, i, state, {maxSupers:2, oxalicOnly:true})));
  return acts;
}

/* ── In-browser executor ─────────────────────────────────────────────────── */
/* Supports act.colonyIdx to target a specific alive colony (0-indexed).      */
const EXECUTOR = `
(function run(actions) {
  var results = [];
  for (var idx = 0; idx < actions.length; idx++) {
    var act = actions[idx];
    try {
      var r;
      var alive = (Game.colonies||[]).filter(function(c){return c.alive;});
      var colony = alive[typeof act.colonyIdx === 'number' ? act.colonyIdx : 0] || alive[0] || null;

      if (act.a === 'buyBees') {
        r = buyFromCatalog('bees','nuc',1);
      } else if (act.a === 'buyHive') {
        r = buyFromCatalog('hives','hive',1);
      } else if (act.a === 'buyTool') {
        r = buyFromCatalog('tools', act.id, 1);
      } else if (act.a === 'buySup') {
        r = buySupply(act.item, act.qty||1);
      } else if (act.a === 'inspect') {
        if (!colony) { results.push({a:'inspect',ok:false,msg:'no colony'}); continue; }
        var ir = inspectColony(colony);
        if (ir && ir.ok && ir.xp) addXp(ir.xp);
        r = ir;
      } else if (act.a === 'feed') {
        if (!colony) { results.push({a:'feed',ok:false,msg:'no colony'}); continue; }
        r = feedColony(colony, act.kg||5, act.kind||'syrup1');
      } else if (act.a === 'fitQX') {
        if (!colony) { results.push({a:'fitQX',ok:false,msg:'no colony'}); continue; }
        r = fitQueenExcluder(colony);
      } else if (act.a === 'addSuper') {
        if (!colony) { results.push({a:'addSuper',ok:false,msg:'no colony'}); continue; }
        r = addSuper(colony);
      } else if (act.a === 'addBroodBox') {
        if (!colony) { results.push({a:'addBroodBox',ok:false,msg:'no colony'}); continue; }
        r = addBroodBox(colony);
      } else if (act.a === 'fitClearerBoard') {
        if (!colony) { results.push({a:'fitClearerBoard',ok:false,msg:'no colony'}); continue; }
        r = fitClearerBoard(colony);
      } else if (act.a === 'harvest') {
        if (!colony) { results.push({a:'harvest',ok:false,msg:'no colony'}); continue; }
        r = harvestColony(colony);
      } else if (act.a === 'artificialSwarm') {
        if (!colony) { results.push({a:'artificialSwarm',ok:false,msg:'no colony'}); continue; }
        r = artificialSwarm(colony);
      } else if (act.a === 'treat') {
        if (!colony) { results.push({a:'treat',ok:false,msg:'no colony'}); continue; }
        r = treatColony(colony, act.id);
      } else if (act.a === 'bottle') {
        r = extractAndBottle(act.type, act.jars);
      } else if (act.a === 'sell') {
        var jarsLeft = act.n;
        var totalIncome = 0;
        var lastR;
        while (jarsLeft > 0) {
          lastR = sellHoney(act.channel, act.type, jarsLeft);
          if (!lastR || !lastR.ok) break;
          totalIncome += (lastR.income || 0);
          var remaining = (Game.inventory.jars && Game.inventory.jars[act.type]) || 0;
          if (remaining >= jarsLeft) break;
          jarsLeft = remaining;
        }
        r = {ok: totalIncome > 0, income: totalIncome, msg: lastR ? lastR.msg : 'sell failed'};
      } else {
        r = {ok:false, msg:'unknown action ' + act.a};
      }
      results.push({a: act.a, ok: r?r.ok:false, msg: r?r.msg:'', income: r&&r.income||0});
    } catch(e) {
      results.push({a: act.a, ok: false, err: e.message});
    }
  }
  return results;
})
`;

/* ── State reader ────────────────────────────────────────────────────────── */
function readState(page) {
  return page.evaluate(() => {
    if (!window.Game) return null;
    var wk       = Game.week;
    var wkOfYear = ((wk-1)%52)+1;
    var yr       = Math.floor((wk-1)/52)+1;
    var alive    = (Game.colonies||[]).filter(function(c){return c.alive;});

    var honeyByType = {};
    var h = Game.inventory.honey;
    if (h && typeof h==='object') Object.keys(h).forEach(function(t){ honeyByType[t] = h[t]||0; });
    var jarsByType = {};
    var j = Game.inventory.jars;
    if (j && typeof j==='object') Object.keys(j).forEach(function(t){ jarsByType[t] = j[t]||0; });
    var totalHoney = Object.values(honeyByType).reduce(function(s,v){return s+(v||0);},0);

    return {
      week: wk, wkOfYear, yr,
      cash: Game.cash,
      reputation: Math.round((Game.reputation||0)*10)/10,
      hasColony: alive.length > 0,
      colonyCount: alive.length,
      // First alive colony shortcut (for single-colony strategies)
      colony: alive[0] ? {
        pop:           alive[0].population,
        honey:         alive[0].honey||0,
        varroa:        Math.round(alive[0].varroa||0),
        supers:        alive[0].supers||0,
        broodBoxes:    alive[0].broodBoxes||1,
        qx:            !!alive[0].queenExcluder,
        clearerFitted: !!alive[0].clearerFitted,
        swarmPressure: Math.round((alive[0].swarmPressure||0)*100)/100,
        treatment:     alive[0].treatment||null,
        superHoney:    Math.round((alive[0].superHoney||0)*10)/10,
        wkSinceInsp:   alive[0].lastInspected
          ? Math.max(0, wkOfYear - (((alive[0].lastInspected-1)%52)+1)) : 999,
      } : null,
      // All colonies (for multi-colony strategies)
      colonies: alive.map(function(col) {
        return {
          pop:           col.population,
          honey:         col.honey||0,
          varroa:        Math.round(col.varroa||0),
          supers:        col.supers||0,
          broodBoxes:    col.broodBoxes||1,
          qx:            !!col.queenExcluder,
          clearerFitted: !!col.clearerFitted,
          swarmPressure: Math.round((col.swarmPressure||0)*100)/100,
          treatment:     col.treatment||null,
          superHoney:    Math.round((col.superHoney||0)*10)/10,
          wkSinceInsp:   col.lastInspected
            ? Math.max(0, wkOfYear - (((col.lastInspected-1)%52)+1)) : 999,
        };
      }),
      wkSinceInsp: alive[0] && alive[0].lastInspected
        ? Math.max(0, wkOfYear - (((alive[0].lastInspected-1)%52)+1)) : 999,
      inv: {
        spareHives:     Game.inventory.spareHives||0,
        supers:         Game.inventory.supers||0,
        queenExcluders: Game.inventory.queenExcluders||0,
        broodBoxes:     Game.inventory.broodBoxes||0,
        sugar:          Game.inventory.sugar||0,
        emptyJars:      Game.inventory.emptyJars||0,
        treatStock:     Game.inventory.treatStock||{},
        tools:          Game.inventory.tools||{},
        honeyByType,
        jarsByType,
        totalHoney:     Math.round(totalHoney*10)/10,
      },
      stats: Game.stats||{},
      ev:    typeof enterpriseValue === 'function' ? enterpriseValue() : 0,
    };
  });
}

/* ── Single run ──────────────────────────────────────────────────────────── */
async function runSim(browser, run) {
  const log  = [];
  const bugs = [];
  let finalState = null;
  const note = m => log.push(m);

  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => bugs.push({run:run.runId, wk:'?', yr:'?', a:'JS_ERROR', err:e.message}));

  try {
    await page.goto(BASE_URL, { waitUntil:'networkidle', timeout:15000 });
    await page.evaluate(([name, diff]) => {
      if (typeof startNewGame === 'function') startNewGame(name, diff);
    }, [`Sim_${run.id}`, run.diff]);
    await page.waitForTimeout(300);
    await page.evaluate(() => { if (typeof closeModal==='function') closeModal(); });

    // Set site if specified
    if (run.site) {
      await page.evaluate(s => {
        if (Game.apiaries && Game.apiaries.length > 0) Game.apiaries[0].siteType = s;
      }, run.site);
    }

    const startCash = (await readState(page))?.cash || 0;
    note(`START diff=${run.diff}${run.site ? ' site='+run.site : ''} cash=£${startCash}`);

    for (let w = 0; w < 164; w++) {
      const state = await readState(page);
      if (!state) { note('State read failed'); break; }
      finalState = state;

      if (state.wkOfYear === 1 && w > 0)
        note(`=== Y${state.yr} cash=£${state.cash} rep=${state.reputation} cols=${state.colonyCount} honey=${state.inv.totalHoney}kg ===`);

      const decisions = run.fn(state);

      if (decisions.length > 0) {
        const results = await page.evaluate(
          ([src, acts]) => { var fn = eval(src); return fn(acts); },
          [EXECUTOR, decisions]
        );
        for (const r of results) {
          if (r.err) {
            bugs.push({run:run.runId, wk:state.wkOfYear, yr:state.yr, a:r.a, err:r.err});
          } else if (!r.ok && r.msg) {
            const expected = /No spare hive|no colony|Nothing in|No supers|No queen|No brood|already active|already fitted|already in progress|maximum|minimum|cannot|not enough|can't|can only|winter|spring|swarm season|nothing to sell|Unknown sales|Need.*reputation|no other|only have 0|not showing signs|Clearer board|no queen excluder|no super|not yet|no treatment|outside|too cold|too hot|queenless|no mated|weather|broodless|mite|natural|cannot split|need.*inspect|supers on|remove.*super|inspect before|before removing|need.*super|not enough|not a|no.*kit|queen.*present|population.*low/i;
            if (!expected.test(r.msg)) {
              bugs.push({run:run.runId, wk:state.wkOfYear, yr:state.yr, a:r.a, err:r.msg});
              note(`FAIL ${r.a}: ${r.msg.substring(0,80)}`);
            }
          } else if (r.ok && r.income > 0) {
            note(`SELL £${r.income.toFixed(2)} (${r.a})`);
          }
        }
        await page.evaluate(() => { if (typeof render==='function') render(); });
      }

      const ok = await page.evaluate(() => {
        if (typeof advanceWeek==='function') { advanceWeek(); return true; }
        return false;
      });
      if (!ok) { bugs.push({run:run.runId,wk:state.wkOfYear,yr:state.yr,a:'advance',err:'missing'}); break; }

      await page.waitForTimeout(50);

      if (state.yr >= 3 && state.wkOfYear >= 52) break;
    }

    finalState = await readState(page);
    const fs2 = finalState;
    note(`FINAL cash=£${fs2?.cash} ev=£${fs2?.ev||0} rep=${fs2?.reputation} cols=${fs2?.colonyCount} jars_sold=${fs2?.stats?.jarsSold||0} harvested=${(fs2?.stats?.honeyHarvested||0).toFixed(1)}kg splits=${fs2?.stats?.splitsMade||0} lost=${fs2?.stats?.coloniesLost||0}`);

  } catch(e) {
    bugs.push({run:run.runId, wk:'?', yr:'?', a:'FATAL', err:e.message});
  } finally {
    await ctx.close();
  }

  return { run, finalState, log, bugs };
}

/* ── Reporting ───────────────────────────────────────────────────────────── */
function buildReport(results, durationMs) {
  const byCash = [...results].sort((a,b) => (b.finalState?.cash||0) - (a.finalState?.cash||0));
  const byEV   = [...results].sort((a,b) => (b.finalState?.ev||0)   - (a.finalState?.ev||0));

  let md = `# The Apiarist — 125-Run Simulation Report\n\n`;
  md += `**${results.length} runs across 25 strategies × 5 seeds | ${Math.round(durationMs/1000)}s | ${new Date().toISOString().slice(0,10)}**\n\n`;
  md += `_Two metrics: Cash (liquid) and Enterprise Value (cash + honey inventory + colony value + equipment at book)._\n\n`;

  // ── Cash Leaderboard
  md += `## Cash Leaderboard\n\n`;
  md += `| Rank | Run | Strategy | Cash | EV | Jars | Harvested | Rep | Cols | Splits | Lost | Bugs |\n`;
  md += `|------|-----|----------|------|----|------|-----------|-----|------|--------|------|------|\n`;
  byCash.forEach((r, i) => {
    const fs = r.finalState;
    md += `| ${i+1} | ${r.run.runId} | ${r.run.name} | **£${fs?.cash||0}** | £${fs?.ev||0} | ${fs?.stats?.jarsSold||0} | ${(fs?.stats?.honeyHarvested||0).toFixed(1)}kg | ${fs?.reputation||0} | ${fs?.colonyCount||0} | ${fs?.stats?.splitsMade||0} | ${fs?.stats?.coloniesLost||0} | ${r.bugs.length} |\n`;
  });

  // ── EV Leaderboard
  md += `\n## Enterprise Value Leaderboard\n\n`;
  md += `_EV = cash + bottled jars (market price) + bulk honey (gate) + honey in supers (80%) + colony value + equipment at 50% book_\n\n`;
  md += `| Rank | Run | Strategy | EV | Cash | Cols | Splits | Honey in supers | Bugs |\n`;
  md += `|------|-----|----------|----|------|------|--------|-----------------|------|\n`;
  byEV.forEach((r, i) => {
    const fs = r.finalState;
    const superHoney = (fs?.colonies||[]).reduce((s,c) => s+(c.superHoney||0), 0);
    md += `| ${i+1} | ${r.run.runId} | ${r.run.name} | **£${fs?.ev||0}** | £${fs?.cash||0} | ${fs?.colonyCount||0} | ${fs?.stats?.splitsMade||0} | ${superHoney.toFixed(1)}kg | ${r.bugs.length} |\n`;
  });

  // ── Strategy averages (both metrics)
  const stratAvg = {};
  results.forEach(r => {
    const k = r.run.id;
    if (!stratAvg[k]) stratAvg[k] = {name:r.run.name, cash:[], ev:[], bugs:0};
    stratAvg[k].cash.push(r.finalState?.cash||0);
    stratAvg[k].ev.push(r.finalState?.ev||0);
    stratAvg[k].bugs += r.bugs.length;
  });
  md += `\n## Strategy Averages\n\n`;
  md += `| Strategy | Avg Cash | Min→Max Cash | Avg EV | Min→Max EV | Bugs |\n`;
  md += `|----------|----------|-------------|--------|-----------|------|\n`;
  Object.entries(stratAvg)
    .sort((a,b) => {
      const avgA = a[1].cash.reduce((s,v)=>s+v,0)/a[1].cash.length;
      const avgB = b[1].cash.reduce((s,v)=>s+v,0)/b[1].cash.length;
      return avgB - avgA;
    })
    .forEach(([k, v]) => {
      const avgC = Math.round(v.cash.reduce((s,x)=>s+x,0)/v.cash.length);
      const avgE = Math.round(v.ev.reduce((s,x)=>s+x,0)/v.ev.length);
      md += `| ${v.name} | £${avgC} | £${Math.min(...v.cash)}→£${Math.max(...v.cash)} | £${avgE} | £${Math.min(...v.ev)}→£${Math.max(...v.ev)} | ${v.bugs} |\n`;
    });

  // ── Best cash run detail
  const bestCash = byCash[0];
  md += `\n## Best Cash Run: ${bestCash.run.runId} — ${bestCash.run.name}\n\n`;
  md += `Cash: **£${bestCash.finalState?.cash||0}** | EV: £${bestCash.finalState?.ev||0}\n\n`;
  bestCash.log.forEach(l => { md += `- ${l}\n`; });

  // ── Best EV run detail (only if different from best cash)
  const bestEV = byEV[0];
  if (bestEV.run.runId !== bestCash.run.runId) {
    md += `\n## Best EV Run: ${bestEV.run.runId} — ${bestEV.run.name}\n\n`;
    md += `EV: **£${bestEV.finalState?.ev||0}** | Cash: £${bestEV.finalState?.cash||0}\n\n`;
    bestEV.log.forEach(l => { md += `- ${l}\n`; });
  }

  // ── Bugs
  const allBugs = results.flatMap(r => r.bugs);
  md += `\n## Bugs Found (${allBugs.length} total)\n\n`;
  if (allBugs.length === 0) {
    md += `None.\n`;
  } else {
    const bugMap = {};
    allBugs.forEach(b => {
      const k = `${b.a}|${b.err?.substring(0,60)}`;
      if (!bugMap[k]) bugMap[k] = {a:b.a, err:b.err, runs:new Set(), count:0};
      bugMap[k].runs.add(b.run);
      bugMap[k].count++;
    });
    md += `| Action | Error | Runs | Count |\n|--------|-------|------|-------|\n`;
    Object.values(bugMap)
      .sort((a,b) => b.count - a.count)
      .forEach(b => {
        md += `| \`${b.a}\` | ${b.err?.substring(0,70)} | ${[...b.runs].join(', ')} | ${b.count} |\n`;
      });
  }

  // ── Per-run detail (condensed, sorted by EV)
  md += `\n## Per-Run Detail (sorted by EV)\n\n`;
  byEV.forEach(r => {
    const fs = r.finalState;
    md += `### ${r.run.runId} — ${r.run.name}\n`;
    md += `Cash: **£${fs?.cash||0}** | EV: **£${fs?.ev||0}** | Jars: ${fs?.stats?.jarsSold||0} | Harvested: ${(fs?.stats?.honeyHarvested||0).toFixed(1)}kg | Rep: ${fs?.reputation||0} | Cols: ${fs?.colonyCount||0} | Splits: ${fs?.stats?.splitsMade||0} | Lost: ${fs?.stats?.coloniesLost||0} | Bugs: ${r.bugs.length}\n`;
    r.log.filter(l => l.startsWith('=== Y') || l.startsWith('SELL') || l.startsWith('FINAL') || l.startsWith('FAIL')).forEach(l => { md += `  - ${l}\n`; });
    md += '\n';
  });

  return md;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
(async () => {
  const t0      = Date.now();
  const BATCH   = 10;
  const browser = await chromium.launch({ headless:true });

  console.log(`Running ${RUNS.length} simulations (25 strategies × 5 seeds) in batches of ${BATCH}...`);
  const results = [];

  for (let i = 0; i < RUNS.length; i += BATCH) {
    const batch = RUNS.slice(i, i + BATCH);
    process.stdout.write(`Batch ${Math.floor(i/BATCH)+1}: ${batch.map(r=>r.runId).join(', ')} ... `);
    const batchResults = await Promise.all(batch.map(run => runSim(browser, run)));
    batchResults.forEach(r => results.push(r));
    console.log('done');
  }

  await browser.close();
  const durationMs = Date.now() - t0;

  // Sort and print leaderboard — cash
  const sorted  = [...results].sort((a,b) => (b.finalState?.cash||0) - (a.finalState?.cash||0));
  const sortedEV = [...results].sort((a,b) => (b.finalState?.ev||0)   - (a.finalState?.ev||0));
  const maxCash = sorted[0]?.finalState?.cash || 1;
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`CASH LEADERBOARD`);
  console.log(`${'─'.repeat(80)}`);
  sorted.forEach((r, i) => {
    const cash = r.finalState?.cash || 0;
    const ev   = r.finalState?.ev   || 0;
    const bar  = '█'.repeat(Math.round(25 * cash / maxCash));
    const jars = r.finalState?.stats?.jarsSold || 0;
    const cols = r.finalState?.colonyCount || 0;
    const bugs = r.bugs.length;
    console.log(` ${String(i+1).padStart(2)}. ${r.run.runId.padEnd(16)} cash=£${String(cash).padStart(5)}  ev=£${String(ev).padStart(5)}  ${bar.padEnd(25)}  jars=${jars} cols=${cols} bugs=${bugs}`);
  });

  const maxEV = sortedEV[0]?.finalState?.ev || 1;
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`EV LEADERBOARD (cash + honey + colonies + equipment)`);
  console.log(`${'─'.repeat(80)}`);
  sortedEV.forEach((r, i) => {
    const ev   = r.finalState?.ev   || 0;
    const cash = r.finalState?.cash || 0;
    const bar  = '█'.repeat(Math.round(25 * ev / maxEV));
    const cols = r.finalState?.colonyCount || 0;
    const splits = r.finalState?.stats?.splitsMade || 0;
    console.log(` ${String(i+1).padStart(2)}. ${r.run.runId.padEnd(16)} ev=£${String(ev).padStart(5)}  cash=£${String(cash).padStart(5)}  ${bar.padEnd(25)}  cols=${cols} splits=${splits}`);
  });

  // Strategy averages
  const stratAvg = {};
  results.forEach(r => {
    const k = r.run.id;
    if (!stratAvg[k]) stratAvg[k] = {name:r.run.name, cash:[], ev:[]};
    stratAvg[k].cash.push(r.finalState?.cash||0);
    stratAvg[k].ev.push(r.finalState?.ev||0);
  });
  console.log(`\nStrategy averages (sorted by avg cash):`);
  Object.entries(stratAvg)
    .sort((a,b) => (b[1].cash.reduce((s,v)=>s+v,0)/b[1].cash.length) - (a[1].cash.reduce((s,v)=>s+v,0)/a[1].cash.length))
    .forEach(([k, v]) => {
      const avgC = Math.round(v.cash.reduce((s,x)=>s+x,0)/v.cash.length);
      const avgE = Math.round(v.ev.reduce((s,x)=>s+x,0)/v.ev.length);
      console.log(`  ${v.name.padEnd(24)} avg cash=£${String(avgC).padStart(5)}  avg ev=£${avgE}`);
    });

  const totalBugs = results.reduce((s,r) => s + r.bugs.length, 0);
  const uniqueBugs = new Set(results.flatMap(r => r.bugs.map(b => b.a + b.err?.substring(0,40)))).size;
  console.log(`\nTotal bugs: ${totalBugs} (${uniqueBugs} unique)`);

  const report = buildReport(results, durationMs);
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Duration: ${Math.round(durationMs/1000)}s`);
})();
