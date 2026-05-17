/* ====================================================================
   THE APIARIST — actions.js
   Player actions and the inspection mechanic.
   Depends on: data.js, colony.js (makeColony, populationBand,
   varroaInfestation, framesOfBrood, framesOfBees, colonyCongestion)
   and game.js helpers (spend, earn, logEvent, toast, render, addXp,
   gameYear, weather, aliveColonies, diff).
   ==================================================================== */

/* ------------------------------------------------------------------ */
/* Private helpers                                                      */
/* ------------------------------------------------------------------ */

/* Clamp a value to [lo, hi]. */
function _act_clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

/* Integer in range [lo, hi] inclusive. */
function _act_randInt(lo, hi){ return lo + Math.floor(Math.random() * (hi - lo + 1)); }

/* Gaussian-ish noise: mean 0, approximate std ~1. */
function _act_noise(){ return (Math.random() + Math.random() + Math.random() - 1.5) / 0.75; }

/* ------------------------------------------------------------------ */
/* INSPECTION — core mechanic                                           */
/* ------------------------------------------------------------------ */

/**
 * inspectColony(colony) -> InspectionReport
 *
 * Reveals the colony's true state to the player through the fog-of-war
 * snapshot (colony.known). Skill gates what is actually observed.
 *
 * InspectionReport shape:
 *   { ok, weatherOk, frames:[FrameView], findings:[{icon,text}],
 *     summary:[string], lesson:string|null, xp:number }
 *
 * FrameView shape:
 *   { index, label, cells:{empty,found,eggs,larva,capbrood,dronebr,
 *     nectar,honey,pollen,qcell,disease,mite}, hasQueen:bool, note:string }
 */
function inspectColony(colony) {
  const report = {
    ok: true,
    weatherOk: true,
    frames: [],
    findings: [],
    summary: [],
    lesson: null,
    xp: 0,
  };

  /* ---- Weather / season suitability -------------------------------- */
  const wx = weather();
  const season = seasonOfWeek(Game.week);
  const deepWinter = (season === 'winter') && (() => {
    const m = monthOfWeek(Game.week);
    return m === 11 || m === 0 || m === 1; // Dec, Jan, Feb
  })();

  const weatherOk = wx.inspect && !deepWinter;
  report.weatherOk = weatherOk;

  if (!weatherOk) {
    /* Still proceed but note the disruption and set the colony back */
    if (deepWinter) {
      report.findings.push({ icon: '❄️', text: 'Opened in deep winter — chilled the brood and disturbed the cluster.' });
    } else {
      report.findings.push({ icon: '⛅', text: 'Poor weather for an inspection — the bees are unsettled and flying poorly.' });
    }
    /* Chill brood slightly and raise temperament */
    colony.capped = Math.max(0, colony.capped - Math.floor(colony.capped * 0.04));
    colony.larvae = Math.max(0, colony.larvae - Math.floor(colony.larvae * 0.03));
    colony.temperament = _act_clamp(colony.temperament + 0.08, 0, 1);
  }

  /* ---- Equipment checks -------------------------------------------- */
  const hasSuit = Game.inventory.tools.suit;
  const hasSmoker = Game.inventory.tools.smoker;
  const hasHiveTool = Game.inventory.tools.hiveTool;

  if (!hasSuit) {
    report.findings.push({ icon: '⚠️', text: 'No bee suit — the bees are more defensive without protection.' });
    colony.temperament = _act_clamp(colony.temperament + 0.10, 0, 1);
  }
  if (!hasSmoker) {
    report.findings.push({ icon: '⚠️', text: 'No smoker — this makes the bees considerably harder to manage.' });
    colony.temperament = _act_clamp(colony.temperament + 0.12, 0, 1);
  }

  /* ---- Skill level -------------------------------------------------- */
  const skill = skillLevel(Game.skillXp); // 1..10

  /* ---- Build the frame layout --------------------------------------- */
  /* A National brood box holds 11 frames. Layout from outside in:
     frame 0: mostly stores / honey
     frame 1: stores + pollen
     frames 2-3: pollen + some capped brood
     frames 4-6: core brood (centre = eggs, then larvae, then capped)
     frames 7-8: pollen + some capped brood
     frame 9: stores + pollen
     frame 10: mostly stores / honey
     Drone brood tends to appear on outer brood frames.
     Queen cells: on bottom bars of brood frames (swarm / supersedure / emergency). */

  const totalFrames = 11;
  /* Derive total cells per frame: roughly 4200 cells per side, 2 sides = 8400,
     but we'll use scaled integer counts for display (max ~200 per frame). */
  const CELL_SCALE = 200; // display cells per frame

  /* Distribute colony's actual totals across frames proportionally */
  /* Eggs concentrated in frames 4-6; larvae 3-7; capped 2-8; stores 0-1, 9-10 */
  /* Queen is on one of the brood frames if present and found */

  /* Determine queen findability */
  let queenFound = false;
  if (colony.queen && colony.queen.present && colony.queen.state === 'laying') {
    const isMarked = !!colony.queen.marked;
    /* Base find chance by skill. Marked queen much easier to spot. */
    let findChance;
    if (skill <= 2)      findChance = isMarked ? 0.65 : 0.30;
    else if (skill <= 4) findChance = isMarked ? 0.82 : 0.52;
    else if (skill <= 6) findChance = isMarked ? 0.95 : 0.75;
    else                 findChance = isMarked ? 0.99 : 0.92;
    queenFound = Math.random() < findChance;
  }

  /* Determine which frame has the queen (frames 4-6) */
  const queenFrame = _act_randInt(4, 6);

  /* Did the beekeeper see eggs? Eggs are proof the queen is laying even when
     she is not spotted. One shared observation, used by findings + summary. */
  const sawEggs = colony.eggs > 100 && (queenFound || skill >= 3 || Math.random() < 0.45 + skill * 0.07);

  /* Disease visibility — early/low disease may be missed at low skill */
  let diseaseVisible = null;
  for (const [did, severity] of Object.entries(colony.diseases)) {
    if (severity > 0) {
      /* Low skill misses low severity */
      let visThreshold;
      if (skill <= 2)      visThreshold = 0.55;
      else if (skill <= 4) visThreshold = 0.30;
      else if (skill <= 6) visThreshold = 0.15;
      else                 visThreshold = 0.05;
      if (severity >= visThreshold) {
        diseaseVisible = did;
        break;
      }
    }
  }

  /* Mite visibility: visible if varroa infestation is moderate+ */
  const varroaRate = varroaInfestation(colony); // 0..1 proxy
  let miteVisible = varroaRate > (skill <= 3 ? 0.06 : 0.03);

  /* Queen cell visibility */
  let qcellsVisible = colony.queenCells.type !== 'none';
  if (skill <= 2 && colony.queenCells.count <= 2) {
    /* Beginners may miss just one or two cells */
    qcellsVisible = Math.random() < 0.6;
  }

  /* Build frames */
  for (let i = 0; i < totalFrames; i++) {
    const frame = {
      index: i,
      label: _act_frameLabel(i, totalFrames),
      cells: {
        empty: 0, found: 0,
        eggs: 0, larva: 0, capbrood: 0, dronebr: 0,
        nectar: 0, honey: 0, pollen: 0,
        qcell: 0, disease: 0, mite: 0,
      },
      hasQueen: false,
      note: '',
    };

    /* ---- Allocate cells by frame position ------------------------- */
    const dist = _act_frameDist(i, totalFrames, colony, queenFrame,
                                qcellsVisible, diseaseVisible, miteVisible, CELL_SCALE);
    Object.assign(frame.cells, dist.cells);

    /* Queen marker */
    if (i === queenFrame && queenFound) {
      frame.hasQueen = true;
      frame.cells.found = 1; // one "found" queen cell indicator
    }

    /* Per-frame note */
    frame.note = dist.note;

    /* Queen-cell type carried onto the frame so the comb can draw them
       in the right place — swarm cells on the bottom bar, supersedure
       and emergency cells on the face of the comb. */
    frame.queenCellType = (frame.cells.qcell > 0) ? colony.queenCells.type : 'none';

    report.frames.push(frame);
  }

  /* ---- Findings ----------------------------------------------------- */
  /* Queen / laying evidence */
  if (queenFound) {
    const col = colony.queen.marked ? ` (${colony.queen.marked}-marked)` : '';
    report.findings.push({ icon: '👑', text: `Queen seen${col} on frame ${queenFrame + 1} — looking well.` });
  } else if (colony.queen && colony.queen.present) {
    if (sawEggs) {
      report.findings.push({ icon: '🥚', text: 'Eggs and young larvae present — the queen is laying, even though she was not spotted.' });
    } else {
      report.findings.push({ icon: '❓', text: 'The queen was not spotted and no eggs were seen — worth checking again in a few days.' });
    }
  }

  /* Queenless / drone layer / laying workers */
  if (!colony.queen || !colony.queen.present || colony.queen.state === 'absent') {
    report.findings.push({ icon: '🚨', text: 'No queen found, no eggs visible. This colony may be queenless.' });
  } else if (colony.queen.state === 'dronelayer') {
    report.findings.push({ icon: '🚨', text: 'Scattered drone brood in worker cells — the queen is a drone layer. She must be replaced.' });
  } else if (colony.layingWorkers) {
    report.findings.push({ icon: '🚨', text: 'Multiple eggs per cell and scattered drone brood — laying workers are present. Difficult to rescue.' });
  }

  /* Brood quality */
  const rawBroodFrames = framesOfBrood(colony);
  const broodFrameLabel = (Math.round(rawBroodFrames) || 1);
  const allStages = colony.eggs > 50 && colony.larvae > 50 && colony.capped > 50;
  if (rawBroodFrames < 0.4) {
    report.findings.push({ icon: '🚨', text: 'Almost no brood in the box — the colony is queenless, failing, or has recently swarmed.' });
  } else if (colony.capped > 200 && colony.eggs < 50 && colony.larvae < 50) {
    report.findings.push({ icon: '⚠️', text: 'Capped brood but no fresh eggs or larvae — the queen has stopped laying, or the colony has just swarmed.' });
  } else if (rawBroodFrames >= 6) {
    report.findings.push({ icon: '✅', text: `A solid brood nest across about ${Math.round(rawBroodFrames)} frames — a strong, healthy colony.` });
  } else if (rawBroodFrames >= 3) {
    report.findings.push({ icon: '🐣', text: `Brood across about ${Math.round(rawBroodFrames)} frames, all stages present — building along well.` });
  } else {
    report.findings.push({ icon: '🐣', text: `Only about ${broodFrameLabel} frame${broodFrameLabel === 1 ? '' : 's'} of brood — modest for now, but the stages are there.` });
  }

  /* Queen cells */
  if (qcellsVisible && colony.queenCells.type !== 'none') {
    const qc = colony.queenCells;
    if (qc.type === 'swarm') {
      report.findings.push({ icon: '🐝', text: `${qc.count} swarm cell${qc.count !== 1 ? 's' : ''} on the bottom bars — the colony is preparing to swarm. Act today.` });
      report.lesson = 'Swarm cells on the bottom bars mean the colony has decided to swarm. Removing them alone will not stop this — you need to split the colony or use an artificial swarm.';
    } else if (qc.type === 'supersedure') {
      report.findings.push({ icon: '👑', text: `${qc.count} supersedure cell${qc.count !== 1 ? 's' : ''} present — the colony is quietly replacing its queen.` });
      report.lesson = 'Supersedure cells are usually built in the middle of the comb rather than on the bottom bar. The colony knows the current queen is failing and is replacing her — usually best left alone.';
    } else if (qc.type === 'emergency') {
      report.findings.push({ icon: '🚨', text: `${qc.count} emergency cell${qc.count !== 1 ? 's' : ''} — the colony has lost its queen and is raising a new one from existing larvae.` });
      report.lesson = 'Emergency cells are made from young larvae on the face of the comb. The colony is doing its best to recover from queenlessness — give it time and space.';
    }
  }

  /* Stores */
  const totalStores = colony.honey + colony.superHoney;
  let storesBand;
  if (totalStores < 3)      { storesBand = 'critical'; report.findings.push({ icon: '🍯', text: `Stores critically low — around ${totalStores.toFixed(1)} kg. Feed immediately.` }); }
  else if (totalStores < 8)  { storesBand = 'low';      report.findings.push({ icon: '🍯', text: `Stores looking light (around ${totalStores.toFixed(1)} kg). Consider feeding.` }); }
  else if (totalStores < 18) { storesBand = 'ok';       report.findings.push({ icon: '🍯', text: `Good stores — the colony is well provisioned for now.` }); }
  else                       { storesBand = 'heavy';    report.findings.push({ icon: '🍯', text: `Heavy with stores — may need another super soon.` }); }

  /* Varroa sign */
  let varroaBand;
  if (!miteVisible)            varroaBand = 'none';
  else if (varroaRate < 0.02)  varroaBand = 'low';
  else if (varroaRate < 0.04)  varroaBand = 'moderate';
  else if (varroaRate < 0.06)  varroaBand = 'high';
  else                         varroaBand = 'severe';

  if (miteVisible && varroaRate > 0.02) {
    if (varroaRate >= 0.06) {
      report.findings.push({ icon: '🔴', text: 'Heavy varroa load — mites visible on many bees. Treat as soon as the honey is off.' });
    } else if (varroaRate >= 0.04) {
      report.findings.push({ icon: '🔴', text: 'Significant varroa infestation. Begin monitoring closely and plan treatment.' });
    } else {
      report.findings.push({ icon: '🔴', text: 'Low varroa signs — keep monitoring with alcohol wash or drop counts.' });
    }
  }

  /* Disease */
  let knownDisease = null;
  if (diseaseVisible) {
    const d = DISEASES[diseaseVisible];
    knownDisease = diseaseVisible;
    if (d.notifiable) {
      report.findings.push({ icon: '🚨', text: `Signs of ${d.name} (${d.short}) — ${d.sign}. This is a notifiable disease. Contact the seasonal bee inspector immediately.` });
    } else {
      report.findings.push({ icon: '⚠️', text: `Signs of ${d.name}: ${d.sign}.` });
    }
    if (!report.lesson) {
      report.lesson = d.desc;
    }
  }

  /* Chalkbrood mummies on floor — common low-skill find */
  if (colony.diseases.chalkbrood > 0.05 && !diseaseVisible && skill >= 2) {
    report.findings.push({ icon: '⚠️', text: 'A few chalk-white mummies on the floor — chalkbrood present at a low level.' });
    knownDisease = 'chalkbrood';
  }

  /* Pests */
  const knownPests = [];
  if (colony.waspPressure > 0.4) {
    knownPests.push('wasps');
    report.findings.push({ icon: '🐝', text: 'Wasps are trying to rob — reduce the entrance to help the guards.' });
  }
  if (colony.mouse) {
    knownPests.push('mice');
    report.findings.push({ icon: '🐭', text: 'Mouse damage inside the hive — fit a mouse guard now.' });
  }
  if (colony.waxMoth > 0.3) {
    knownPests.push('waxmoth');
    report.findings.push({ icon: '🦋', text: 'Wax moth tunnels visible in the comb. The colony needs strengthening.' });
  }
  if (colony.hornet > 0.1) {
    knownPests.push('hornet');
    report.findings.push({ icon: '🟡', text: 'Asian hornets hawking at the entrance — report this sighting immediately.' });
  }

  /* Congestion / space */
  const congestion = colonyCongestion(colony);
  let spaceAdvice = '';
  if (congestion > 0.85) {
    spaceAdvice = 'Very crowded — add another super or brood box urgently.';
    report.findings.push({ icon: '📦', text: spaceAdvice });
  } else if (congestion > 0.65) {
    spaceAdvice = 'Getting full — a super would give them more room.';
    report.findings.push({ icon: '📦', text: spaceAdvice });
  } else if (congestion < 0.25 && colony.supers > 1) {
    spaceAdvice = 'Plenty of space — could remove a super.';
  }

  /* Temper observation */
  let temperNote;
  if (colony.temperament < 0.25)      temperNote = 'calm';
  else if (colony.temperament < 0.6)  temperNote = 'lively';
  else                                 temperNote = 'defensive';

  if (temperNote === 'defensive') {
    report.findings.push({ icon: '😤', text: 'The bees are very defensive today — use plenty of smoke and work carefully.' });
  }

  /* ---- Summary (the Five Questions) -------------------------------- */
  /* 1. Is the colony queenright? */
  if (queenFound) {
    report.summary.push('Queen: present and seen laying.');
  } else if (sawEggs) {
    report.summary.push('Queen: not seen, but fresh eggs confirm she was laying within the last three days.');
  } else {
    report.summary.push('Queen: not confirmed — no queen and no eggs seen. Inspect again in a few days.');
  }

  /* 2. Is there brood in all stages? */
  if (allStages) {
    const bq = rawBroodFrames >= 6 ? 'a solid nest' : rawBroodFrames >= 3 ? 'building well' : 'modest but healthy';
    report.summary.push(`Brood: all stages present, ${bq} (about ${broodFrameLabel} frame${broodFrameLabel === 1 ? '' : 's'}).`);
  } else if (colony.capped > 200) {
    report.summary.push('Brood: capped brood only, no fresh eggs — the queen has stopped or recently left.');
  } else {
    report.summary.push('Brood: almost none — the colony needs attention.');
  }

  /* 3. Are there signs of disease or pests? */
  if (knownDisease) {
    report.summary.push('Health: signs of ' + (DISEASES[knownDisease] ? DISEASES[knownDisease].name : knownDisease) + ' — act on this.');
  } else if (miteVisible && varroaRate >= 0.055) {
    report.summary.push('Health: a heavy varroa infestation — treat as soon as the honey is off, or the colony will not see spring.');
  } else if (miteVisible && varroaRate >= 0.035) {
    report.summary.push('Health: varroa is high — plan a treatment soon.');
  } else if (miteVisible && varroaRate > 0.02) {
    report.summary.push('Health: varroa is building — keep monitoring and plan a treatment.');
  } else {
    report.summary.push('Health: no obvious disease or pest issues noted.');
  }

  /* 4. Are the stores adequate? */
  const storeLabel = { critical: 'critically low', low: 'low', ok: 'adequate', heavy: 'plentiful' }[storesBand];
  report.summary.push(`Stores: ${storeLabel} (approx. ${totalStores.toFixed(0)} kg).`);

  /* 5. Is there room for expansion? */
  if (congestion > 0.75) {
    report.summary.push('Space: very little — act before the bees do.');
  } else if (congestion > 0.5) {
    report.summary.push('Space: reasonable, but keep an eye on it.');
  } else {
    report.summary.push('Space: plenty of room.');
  }

  /* ---- Lead the summary with the single most urgent thing, if any --- */
  var _crisis = null;
  if (knownDisease && DISEASES[knownDisease] && DISEASES[knownDisease].notifiable) {
    _crisis = 'Urgent: signs of ' + DISEASES[knownDisease].name + ', a notifiable disease. Stop, and contact the bee inspector before doing anything else.';
  } else if (miteVisible && varroaRate >= 0.055) {
    _crisis = 'Urgent: the varroa load is at a crisis level. This colony will not survive the winter unless it is treated.';
  } else if (!queenFound && !sawEggs && colony.capped < 300) {
    _crisis = 'Urgent: no queen and no brood seen. The colony may be queenless — it needs a new queen, or uniting with a strong colony.';
  } else if (storesBand === 'critical') {
    _crisis = 'Urgent: the colony is almost out of food. Feed it now, before it starves.';
  }
  if (_crisis) report.summary.unshift(_crisis);

  /* ---- Swarm season lesson ---------------------------------------- */
  if (!report.lesson && season === 'spring' && colony.swarmPressure > 0.5) {
    report.lesson = 'Swarm pressure is building. Inspect every seven to nine days through the spring and have a spare hive ready.';
  }

  /* ---- XP award ----------------------------------------------------- */
  let xp = 10; // base inspection XP
  if (!weatherOk) xp -= 2; // penalty for bad-weather inspection
  if (season === 'spring') xp += 3; // swarm season is a teaching moment
  if (queenFound) xp += 2;
  if (colony.queen && colony.queen.marked && queenFound) xp += 1; // small bonus for finding marked queen
  if (knownDisease) xp += 4; // spotted a disease problem
  if (qcellsVisible && colony.queenCells.type === 'swarm') xp += 5;
  report.xp = xp;
  addXp(xp);

  /* ---- Write colony.known ------------------------------------------ */
  const knownStatus = _act_deriveStatus(colony, storesBand, diseaseVisible, qcellsVisible);

  let knownQueenStatus = 'ok';
  if (colony.layingWorkers) {
    knownQueenStatus = 'laying-workers';
  } else if (!colony.queen || !colony.queen.present || colony.queen.state === 'absent') {
    knownQueenStatus = 'queenless';
  } else if (colony.queen.state === 'dronelayer') {
    knownQueenStatus = 'drone-layer';
  }

  colony.known = {
    week: Game.week,
    status: knownStatus,
    populationBand: populationBand(colony.population),
    queenSeen: queenFound,
    eggsSeen: sawEggs,
    queenStatus: knownQueenStatus,
    brood: _act_broodQuality(colony, skill),
    queenCells: (qcellsVisible && colony.queenCells.type !== 'none') ? colony.queenCells.type : 'none',
    stores: storesBand,
    varroaSign: miteVisible ? varroaBand : 'unchecked',
    disease: knownDisease,
    pests: knownPests,
    temper: temperNote,
    space: spaceAdvice || (congestion < 0.4 ? 'plenty of room' : 'comfortable'),
    note: _act_knownNote(colony, queenFound, storesBand, knownDisease, qcellsVisible),
  };

  colony.lastInspected = Game.week;

  /* Log the inspection */
  logEvent('🔍', `Inspected ${colony.name}. ${report.findings.length} item${report.findings.length !== 1 ? 's' : ''} noted.`, 'plain');

  render();
  return report;
}

/* Derive frame cells for display — realistic layout */
function _act_frameDist(i, totalFrames, colony, queenFrame,
                        qcellsVisible, diseaseVisible, miteVisible, SCALE) {
  const mid  = (totalFrames - 1) / 2;
  const dist = Math.abs(i - mid);

  let cells = { empty:0, found:0, eggs:0, larva:0, capbrood:0, dronebr:0,
                nectar:0, honey:0, pollen:0, qcell:0, disease:0, mite:0 };

  /* --- Brood: a nest centred on the box. It spreads as wide, and packs as
         densely, as the colony's actual brood — so the comb genuinely
         changes week to week as the queen's laying rises and falls. --- */
  const totalBrood = colony.eggs + colony.larvae + colony.capped;
  const broodEquiv = totalBrood / 6500;                     // packed-frame equivalents
  const broodReach = Math.max(0.8, (broodEquiv + 2) / 2);   // half-width of the nest

  function broodWeight(d) { return Math.max(0, 1 - d / (broodReach + 0.35)); }
  let broodSum = 0;
  for (let f = 0; f < totalFrames; f++) broodSum += broodWeight(Math.abs(f - mid));
  if (broodSum <= 0) broodSum = 1;

  const broodFrac = (totalBrood > 30)
    ? Math.min(0.85, broodWeight(dist) / broodSum * broodEquiv)
    : 0;

  if (broodFrac > 0.01) {
    cells.eggs     = Math.round(SCALE * broodFrac * (colony.eggs   / totalBrood));
    cells.larva    = Math.round(SCALE * broodFrac * (colony.larvae / totalBrood));
    cells.capbrood = Math.round(SCALE * broodFrac * (colony.capped / totalBrood));
    if (colony.drones > 2000 && dist > broodReach - 1.5 && dist < broodReach + 0.7) {
      cells.dronebr = Math.round(SCALE * 0.05);
    }
  }
  const broodUsed = cells.eggs + cells.larva + cells.capbrood + cells.dronebr;
  let free = Math.max(0, SCALE - broodUsed);

  /* --- Honey: scaled to what the colony is actually holding, drawn to the
         outer frames and arching over the brood. --- */
  const honeyEquiv = (colony.honey || 0) / 2.3;             // ~2.3 kg per full frame
  function honeyWeight(d) { return 0.25 + d / (mid + 1); }  // edge-biased
  let honeySum = 0;
  for (let g = 0; g < totalFrames; g++) honeySum += honeyWeight(Math.abs(g - mid));
  const honeyFrac = Math.min(0.9, honeyWeight(dist) / honeySum * honeyEquiv);
  cells.honey = Math.round(free * honeyFrac);
  free = Math.max(0, free - cells.honey);

  /* --- Pollen: a band hugging the brood nest. --- */
  const nearNest = (dist > broodReach - 1.4 && dist < broodReach + 1.3);
  const pollenFrac = (nearNest ? 0.20 : 0.05) *
                     Math.min(1.4, 0.45 + (colony.pollen || 0) / 700);
  cells.pollen = Math.round(free * pollenFrac);
  free = Math.max(0, free - cells.pollen);

  /* --- Fresh nectar — a little. --- */
  cells.nectar = Math.round(free * 0.12);

  let note = broodFrac > 0.4 ? 'Heavy brood.'
    : broodFrac > 0.1 ? 'Brood and stores.'
    : cells.honey > SCALE * 0.35 ? 'Honey stores.' : 'Drawn comb.';

  /* Disease markers across the brood frames */
  if (diseaseVisible && broodFrac > 0.05) {
    const dis = (colony.diseases && colony.diseases[diseaseVisible]) || 0;
    cells.disease = Math.round(SCALE * dis * 0.15);
    if (DISEASES[diseaseVisible]) note += ` ${DISEASES[diseaseVisible].short} signs.`;
  }

  /* Mite markers on capped brood */
  if (miteVisible && cells.capbrood > 0) {
    cells.mite = Math.max(1, Math.round(cells.capbrood * 0.06));
  }

  /* Queen cells concentrated on the central brood frame */
  if (qcellsVisible && i === queenFrame && colony.queenCells.count > 0) {
    cells.qcell = Math.min(colony.queenCells.count, 4);
    note += ' Queen cells present.';
  }

  /* Whatever is left is empty drawn comb */
  const used = cells.eggs + cells.larva + cells.capbrood + cells.dronebr +
               cells.honey + cells.pollen + cells.nectar +
               cells.disease + cells.mite + cells.qcell;
  cells.empty = Math.max(0, SCALE - used);

  return { cells, note };
}

/* Label for frame position */
function _act_frameLabel(i, total) {
  if (i === 0 || i === total - 1) return 'Outer store frame';
  if (i === 1 || i === total - 2) return 'Store and pollen frame';
  if (i === 2 || i === total - 3) return 'Pollen and brood frame';
  const mid = Math.floor(total / 2);
  if (i === mid) return 'Central brood frame';
  return 'Brood frame';
}

/* Derive overall known status */
function _act_deriveStatus(colony, storesBand, diseaseVisible, qcellsVisible) {
  if (!colony.alive) return 'bad';
  if (storesBand === 'critical') return 'bad';
  if (diseaseVisible && DISEASES[diseaseVisible] && DISEASES[diseaseVisible].notifiable) return 'bad';
  if (colony.queen && colony.queen.state === 'dronelayer') return 'bad';
  if (colony.layingWorkers) return 'bad';
  if (storesBand === 'low') return 'warn';
  if (diseaseVisible) return 'warn';
  if (qcellsVisible && colony.queenCells.type === 'swarm') return 'warn';
  if (colony.varroa > 0 && varroaInfestation(colony) > 0.04) return 'warn';
  return 'ok';
}

/* Brood quality descriptor */
function _act_broodQuality(colony, skill) {
  const frames = framesOfBrood(colony);
  if (frames === 0) return 'none';
  if (frames < 2) return 'poor';
  /* Low skill: less granular assessment */
  if (skill <= 2) return frames >= 4 ? 'good' : 'patchy';
  if (frames >= 6) return 'excellent';
  if (frames >= 4) return 'good';
  if (frames >= 2) return 'patchy';
  return 'poor';
}

/* One-line known snapshot note */
function _act_knownNote(colony, queenFound, storesBand, disease, qcellsVisible) {
  if (qcellsVisible && colony.queenCells.type === 'swarm') return 'Swarm cells present — action needed.';
  if (disease) return `${DISEASES[disease] ? DISEASES[disease].name : disease} signs observed.`;
  if (storesBand === 'critical') return 'Stores critically low.';
  if (!queenFound && (!colony.queen || !colony.queen.present)) return 'No queen confirmed.';
  if (queenFound) return 'Queenright, brood present.';
  return 'Colony inspected — no major concerns.';
}

/* ------------------------------------------------------------------ */
/* HUSBANDRY                                                            */
/* ------------------------------------------------------------------ */

/**
 * addSuper(colony) -> {ok, msg}
 * Add a super. Also adds a queen excluder if not already fitted.
 */
function addSuper(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  let totalCost = COSTS.superAdd;
  let msg = '';
  if (!colony.queenExcluder) {
    totalCost += COSTS.queenExcluder;
    msg += 'Queen excluder added too. ';
  }
  if (!spend(totalCost, `Super added to ${colony.name}`)) {
    return { ok: false, msg: `Not enough funds — this would cost £${totalCost.toFixed(2)}.` };
  }
  colony.supers++;
  if (!colony.queenExcluder) {
    colony.queenExcluder = true;
    msg += `Super added and queen excluder fitted (£${totalCost.toFixed(2)}).`;
  } else {
    msg = `Super added to ${colony.name} (£${COSTS.superAdd.toFixed(2)}).`;
  }
  /* Keep visual layout in sync immediately (sync also runs weekly) */
  if (colony.hiveLayout) {
    if (!colony.hiveLayout.supers) colony.hiveLayout.supers = [];
    colony.hiveLayout.supers.push(_colony_makeLayoutSuper());
  }
  logEvent('📦', msg, 'plain');
  render();
  return { ok: true, msg };
}

/**
 * removeSuper(colony) -> {ok, msg}
 * Remove a super (only if empty or spare).
 */
function removeSuper(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (colony.supers <= 0) return { ok: false, msg: 'No supers to remove.' };
  /* Don't allow removal if the super has significant honey */
  if (colony.superHoney > 2) {
    return { ok: false, msg: 'The super still has honey in it — harvest or clear it first.' };
  }
  colony.supers--;
  if (colony.hiveLayout && colony.hiveLayout.supers && colony.hiveLayout.supers.length > 0) {
    colony.hiveLayout.supers.pop();
  }
  const msg = `Super removed from ${colony.name}.`;
  logEvent('📦', msg, 'plain');
  render();
  return { ok: true, msg };
}

/**
 * addBroodBox(colony) -> {ok, msg}
 * Add a second brood box (maximum 2).
 */
function addBroodBox(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (colony.broodBoxes >= 2) return { ok: false, msg: 'Two brood boxes is the maximum.' };
  if (!spend(COSTS.broodBoxAdd, `Second brood box for ${colony.name}`)) {
    return { ok: false, msg: `Not enough funds — a brood box costs £${COSTS.broodBoxAdd.toFixed(2)}.` };
  }
  colony.broodBoxes = 2;
  if (colony.hiveLayout) {
    if (!colony.hiveLayout.broodBoxes) colony.hiveLayout.broodBoxes = [];
    colony.hiveLayout.broodBoxes.push(_colony_makeLayoutBox('brood'));
  }
  const msg = `Second brood box added to ${colony.name} (£${COSTS.broodBoxAdd.toFixed(2)}). The queen now has more room to lay.`;
  logEvent('🪵', msg, 'good');
  render();
  return { ok: true, msg };
}

/**
 * demareeMethod(colony) -> {ok, msg}
 *
 * The Demaree method — keeps the colony intact while relieving congestion.
 * The queen is left in a new brood box on the original floor with one frame
 * of open brood. All the remaining brood goes into a box above the supers,
 * separated from the queen by two queen excluders. The colony "feels" like
 * it has swarmed but you keep all the bees and foragers.
 *
 * CRITICAL PATH DEPENDENCY: the top box will raise emergency cells from
 * its youngest larvae. Player MUST inspect within 7 days (one tick) and
 * call demareeCheck() to destroy those cells, or a cast swarm may issue.
 */
function demareeMethod(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (colony.demaree) return { ok: false, msg: 'A Demaree is already in progress on this hive.' };
  if (!colony.queenExcluder) return { ok: false, msg: 'You need a queen excluder fitted first.' };

  const weekOfYear = ((typeof Game !== 'undefined' && Game.week) || 1);
  const wkIdx = ((weekOfYear - 1) % 52);
  if (wkIdx < 13 || wkIdx > 30) {
    return { ok: false, msg: 'The Demaree method is a swarm-season manipulation — do it in late April to July when the colony is at risk of swarming.' };
  }

  /* Must have found the queen at last inspection */
  if (!colony.known || !colony.known.queenSeen) {
    return { ok: false, msg: 'You need to find the queen before you can do a Demaree — inspect the hive first and locate her.' };
  }

  const boxCost = 35;
  if (!spend(boxCost, `Spare brood box for Demaree on ${colony.name}`)) {
    return { ok: false, msg: `Not enough funds — a spare brood box costs £${boxCost}.` };
  }

  /* Set up the Demaree state */
  colony.demaree = { age: 0, checked: false, topBroodFrames: 8 };

  /* Immediate relief: swarm pressure drops sharply, queen cells destroyed if any */
  colony.swarmPressure = Math.min(colony.swarmPressure, 0.15);
  if (colony.queenCells.type === 'swarm') {
    colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
  }

  const msg = `Demaree carried out on ${colony.name} (£${boxCost}). The queen is in the lower box; all other brood is above the supers. You have 7 days to come back and destroy the emergency cells in the top box — do not miss this check or the colony may swarm from above.`;
  logEvent('🔄', msg, 'good');
  render();
  return { ok: true, msg };
}

/**
 * demareeCheck(colony) -> {ok, msg}
 *
 * The critical day-7 check after a Demaree. Player destroys all emergency
 * queen cells in the top box. If done in time, the Demaree holds and no
 * cast swarm is possible (top box larvae too old to rear queens after this).
 */
function demareeCheck(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (!colony.demaree) return { ok: false, msg: 'No Demaree in progress on this hive.' };
  if (colony.demaree.age >= 2) {
    return { ok: false, msg: 'The top brood has all emerged — the Demaree has already resolved naturally.' };
  }

  colony.demaree.checked = true;

  /* Destroy any emergency cells that may have formed */
  if (colony.queenCells.type === 'emergency') {
    colony.queenCells = { type: 'none', count: 0, age: 0, state: 'none' };
  }

  /* Swarm pressure remains low */
  colony.swarmPressure = Math.min(colony.swarmPressure, 0.20);

  const msg = `Demaree check complete on ${colony.name}. Emergency cells in the top box destroyed — no queen can emerge from there now. The top brood will hatch over the next 2 weeks, leaving an extra box of empty drawn comb.`;
  logEvent('✅', msg, 'good');
  render();
  return { ok: true, msg };
}

/**
 * fitClearerBoard(colony) -> {ok, msg}
 *
 * Fit a clearer board between the super and the brood box the evening
 * before harvest. Bees move down through the one-way escapes and cannot
 * return — super is bee-free the next day, no brushing needed.
 */
function fitClearerBoard(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if ((colony.supers || 0) === 0) return { ok: false, msg: 'No supers on this hive to fit a clearer board for.' };
  if (colony.clearerFitted) return { ok: false, msg: 'Clearer board is already fitted — harvest when ready.' };

  /* Check inventory or charge hire fee */
  let cost = 0;
  if (!Game.inventory.tools.clearerBoard) {
    cost = 8;
    if (!spend(cost, `Hire a clearer board for ${colony.name}`)) {
      return { ok: false, msg: `Not enough funds — hiring a clearer board costs £${cost}.` };
    }
  }

  colony.clearerFitted = true;

  const msg = `Clearer board fitted on ${colony.name}${cost ? ` (hired for £${cost})` : ''}. Leave it overnight — the bees will clear from the supers and you can harvest clean tomorrow.`;
  logEvent('🍯', msg, 'plain');
  render();
  return { ok: true, msg };
}

/**
 * setEntrance(colony, mode) -> {ok, msg}
 * Set entrance mode: 'open', 'reduced', or 'mouseguard'. Free and instant.
 */
function setEntrance(colony, mode) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  const modes = { open: 'fully open', reduced: 'reduced', mouseguard: 'mouse guard fitted' };
  if (!modes[mode]) return { ok: false, msg: `Unknown entrance mode: ${mode}.` };
  colony.entrance = mode;
  const msg = `Entrance on ${colony.name} now ${modes[mode]}.`;
  logEvent('🚪', msg, 'plain');
  render();
  return { ok: true, msg };
}

/**
 * feedColony(colony, kg, kind) -> {ok, msg}
 * Feed with syrup or fondant. kind: 'syrup1' | 'syrup2' | 'fondant'
 */
function feedColony(colony, kg, kind) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (!kg || kg <= 0) return { ok: false, msg: 'Specify how many kilograms to feed.' };

  const validKinds = { syrup1: true, syrup2: true, fondant: true };
  if (!validKinds[kind]) return { ok: false, msg: `Unknown feed type: ${kind}.` };

  /* Sugar consumption per kg of feed.
     syrup1 (1:1): 1 kg sugar dissolved in 1 L water → ~1 kg sugar per kg syrup.
     syrup2 (2:1): 2 kg sugar dissolved in 1 L water → ~0.67 kg sugar per kg syrup.
     fondant: pre-made; uses sugar from stock at ~0.8 kg/kg (already processed). */
  const sugarRatio = { syrup1: 1.0, syrup2: 0.67, fondant: 0.80 }[kind];
  const sugarNeeded = Math.round(kg * sugarRatio * 100) / 100;

  /* Check sugar stock */
  if ((Game.inventory.sugar || 0) < sugarNeeded) {
    return {
      ok: false,
      msg: 'You only have ' + (Game.inventory.sugar || 0) + ' kg of sugar in stock. ' +
           'Buy more from the Market (the Supplies tab).'
    };
  }

  /* Consume sugar — no cash charge (paid at purchase) */
  Game.inventory.sugar = Math.round(((Game.inventory.sugar || 0) - sugarNeeded) * 100) / 100;

  /* Colony feeding boost.
     2:1 syrup is energy-dense — bees convert it well to stores (~0.9 kg stores per kg syrup).
     1:1 syrup is lighter — bees must evaporate more water (~0.7 kg stores per kg syrup).
     Fondant is concentrated but less digestible in active season (~0.75 kg stores per kg). */
  const feedConversion = { syrup1: 0.70, syrup2: 0.90, fondant: 0.75 }[kind];
  colony.feeding = (colony.feeding || 0) + kg * feedConversion;

  /* Warn if feeding syrup with honey supers on */
  let warning = '';
  if ((kind === 'syrup1' || kind === 'syrup2') && colony.supers > 0) {
    warning = ' Warning: feeding syrup with honey supers on can contaminate the crop.';
  }

  /* Fondant only appropriate in emergency winter feeding */
  const season = seasonOfWeek(Game.week);
  if (kind === 'fondant' && season !== 'winter') {
    warning += ' Fondant is an emergency feed — syrup works better outside winter.';
  }

  const kindLabel = { syrup1: '1:1 syrup (spring stimulation)', syrup2: '2:1 syrup (store building)', fondant: 'fondant (emergency)' }[kind];

  const msg = `${colony.name} fed ${kg} kg of ${kindLabel} (used ${sugarNeeded} kg of sugar from stock).${warning}`;
  logEvent('🍯', msg, warning ? 'bad' : 'plain');
  render();
  return { ok: true, msg };
}

/**
 * treatColony(colony, treatmentId) -> {ok, msg}
 * Apply a varroa treatment.
 */
function treatColony(colony, treatmentId) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  const t = TREATMENTS[treatmentId];
  if (!t) return { ok: false, msg: `Unknown treatment: ${treatmentId}.` };

  /* MAQS (formic acid) is the ONLY treatment approved for use with supers on.
     All other treatments contaminate honey — supers must be off first. */
  if (colony.supers > 0 && !t.harvestSafe && treatmentId !== 'maqs') {
    return { ok: false, msg: `Cannot apply ${t.name} while honey supers are on — it will contaminate the crop. Remove the supers first.` };
  }
  if (colony.supers > 0 && treatmentId === 'maqs') {
    /* MAQS with supers: honey is safe but should be labelled */
    warnings = warnings || [];
    warnings.push('MAQS can be used with supers on — honey remains safe to eat but note the treatment dates for your records.');
  }

  /* Check treatment stock — paid for at Market, not here */
  if (!Game.inventory.treatStock) Game.inventory.treatStock = {};
  if ((Game.inventory.treatStock[treatmentId] || 0) < 1) {
    return { ok: false, msg: `You have no ${t.name} in stock. Buy it from the Market (the Supplies tab).` };
  }

  /* Consume one unit from stock */
  Game.inventory.treatStock[treatmentId] -= 1;

  let warnings = [];

  /* Temperature warnings */
  const wx = weather();
  /* Use warmth proxy: warmth 1.0 = approx 20°C. Scale: cold=5°C, heatwave=32°C */
  const approxTemp = 5 + wx.warmth * 27;
  if (approxTemp < (t.tempMin || 0)) {
    warnings.push(`It is too cold for ${t.name} to work well (needs at least ${t.tempMin}°C).`);
  }
  if (approxTemp > (t.tempMax || 40)) {
    warnings.push(`It is very hot — ${t.name} may stress the bees or harm the queen at these temperatures.`);
  }

  /* Broodless-only treatments */
  const hasActiveBrood = colony.eggs > 0 || colony.larvae > 0 || colony.capped > 0;
  if (t.broodlessOnly && hasActiveBrood) {
    warnings.push(`${t.name} only works in the broodless period. With brood present it will barely touch the mites sealed in the cells — wait until mid-winter.`);
  }

  colony.treatment = { id: treatmentId, weeksLeft: t.weeks };

  let msg = `${t.name} applied to ${colony.name}.`;
  if (warnings.length) {
    msg += ' ' + warnings.join(' ');
    logEvent('💊', msg, 'bad');
  } else {
    logEvent('💊', msg, 'good');
  }
  render();
  return { ok: true, msg };
}

/**
 * monitorVarroa(colony, method) -> {ok, msg, estimate}
 * Methods: 'drop' | 'sugar' | 'alcohol' | 'drone'
 * Returns an estimate of varroa load with realistic sampling noise.
 */
function monitorVarroa(colony, method) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.', estimate: null };

  /* Accuracy by method (how close to true rate the estimate is) */
  const accuracy = { drop: 0.55, sugar: 0.75, alcohol: 0.92, drone: 0.68 };
  const acc = accuracy[method] || 0.7;

  const trueRate = varroaInfestation(colony); // 0..1
  /* Noise: low-accuracy methods can be off by ±50% of true value */
  const noise = (1 - acc) * (Math.random() * 2 - 1);
  const estimate = _act_clamp(trueRate + trueRate * noise, 0, 1);

  /* Update known.varroaSign based on estimate */
  let sign;
  if (estimate < 0.01)      sign = 'none';
  else if (estimate < 0.02) sign = 'low';
  else if (estimate < 0.04) sign = 'moderate';
  else if (estimate < 0.06) sign = 'high';
  else                      sign = 'severe';

  if (colony.known) colony.known.varroaSign = sign;

  const methodLabel = { drop: 'natural drop count', sugar: 'sugar roll', alcohol: 'alcohol wash', drone: 'drone brood uncapping' }[method] || method;
  const pct = (estimate * 100).toFixed(1);

  let advice = '';
  if (estimate > 0.05)      advice = ' This is a high infestation — treat immediately.';
  else if (estimate > 0.03) advice = ' Getting high — plan treatment soon.';
  else if (estimate > 0.01) advice = ' Low-moderate. Keep monitoring monthly.';
  else                      advice = ' Low load — keep monitoring.';

  addXp(3);
  const msg = `Varroa ${methodLabel} on ${colony.name}: estimated ${pct}% infestation (${sign}).${advice}`;
  logEvent('🔴', msg, estimate > 0.04 ? 'bad' : 'plain');
  render();
  return { ok: true, msg, estimate };
}

/* ------------------------------------------------------------------ */
/* SWARM CONTROL                                                        */
/* ------------------------------------------------------------------ */

/**
 * artificialSwarm(colony) -> {ok, msg}
 * The Pagden artificial swarm. Requires a spare hive.
 * Old queen + flying bees go to new site; original keeps brood + queen cells.
 */
function artificialSwarm(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (!colony.queen || !colony.queen.present) {
    return { ok: false, msg: 'The colony is queenless — artificial swarm requires a queen.' };
  }
  if (Game.inventory.spareHives < 1) {
    return { ok: false, msg: 'You need a spare complete hive to do an artificial swarm. Buy one first.' };
  }

  Game.inventory.spareHives--;

  /* New colony: old queen + flying bees (roughly 60% of foragers depart) */
  /* Flying bees are experienced foragers — ~40% of total adult population */
  const flyingBees = Math.round(colony.population * 0.40);
  const newPop = flyingBees;
  const remainPop = colony.population - flyingBees;

  const newColony = makeColony({
    name: _act_nextHiveName(),
    apiaryId: colony.apiaryId,
    source: 'split',
    population: newPop,
    queenQuality: colony.queen.layQuality,
    varroa: Math.round(colony.varroa * 0.35), // flying bees carry some mites
    year: gameYear(),
  });

  /* Transfer the queen to the new colony */
  newColony.queen = Object.assign({}, colony.queen);
  newColony.queen.age = colony.queen.age;
  newColony.swarmPressure = 0;
  newColony.queenCells = { type: 'none', count: 0, age: 0 };

  /* The original site keeps the brood and raises a new queen from the cells */
  colony.population = remainPop;
  colony.swarmPressure = 0; /* The swarming impulse is resolved */
  colony.queen = null; /* The old queen has gone to the new hive */
  /* The retained cells become a replacement queen, with no further swarm */
  colony.queenCells = { type: 'emergency', count: Math.max(2, colony.queenCells.count || 3), age: 0 };

  Game.colonies.push(newColony);
  Game.stats.splitsMade++;

  addXp(20);
  const msg = `Artificial swarm completed. ${colony.name} retains the brood and queen cells; the old queen and flying bees are in the new colony ${newColony.name}. The original will raise a new queen.`;
  logEvent('🐝', msg, 'good');
  toast('Artificial swarm done — the model swarm-control method.', 'good');
  render();
  return { ok: true, msg };
}

/**
 * splitColony(colony) -> {ok, msg}
 * Deliberate increase split. Requires a nucBox or spare hive.
 */
function splitColony(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  const hasSpace = Game.inventory.nucBoxes > 0 || Game.inventory.spareHives > 0;
  if (!hasSpace) return { ok: false, msg: 'You need a nucleus box or spare hive to make a split.' };

  if (colony.population < 8000) {
    return { ok: false, msg: 'The colony is not strong enough to split safely — it needs to be building well.' };
  }

  /* Use a nucBox if available, otherwise spare hive */
  if (Game.inventory.nucBoxes > 0) {
    Game.inventory.nucBoxes--;
  } else {
    Game.inventory.spareHives--;
  }

  /* Split: new nuc gets about 30% of bees and some brood */
  const splitPop = Math.round(colony.population * 0.30);
  colony.population -= splitPop;
  const splitEggs = Math.round(colony.eggs * 0.25);
  const splitLarvae = Math.round(colony.larvae * 0.25);
  const splitCapped = Math.round(colony.capped * 0.25);
  colony.eggs   -= splitEggs;
  colony.larvae -= splitLarvae;
  colony.capped -= splitCapped;

  const newColony = makeColony({
    name: _act_nextHiveName(),
    apiaryId: colony.apiaryId,
    source: 'split',
    population: splitPop,
    varroa: Math.round(colony.varroa * 0.25),
    year: gameYear(),
  });
  newColony.eggs   = splitEggs;
  newColony.larvae = splitLarvae;
  newColony.capped = splitCapped;
  newColony.queen  = null; /* One part will raise a queen */
  newColony.queenCells = { type: 'emergency', count: _act_randInt(3, 6), age: 0 };

  Game.colonies.push(newColony);
  Game.stats.splitsMade++;

  addXp(12);
  const msg = `Split made — ${newColony.name} has bees and brood, and will raise an emergency queen. ${colony.name} retains the original queen.`;
  logEvent('🔀', msg, 'good');
  render();
  return { ok: true, msg };
}

/**
 * nucleusMethod(colony) -> {ok, msg}
 * Take the queen and a couple of frames into a nuc; original raises a new queen.
 */
function nucleusMethod(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (!colony.queen || !colony.queen.present) {
    return { ok: false, msg: 'The colony has no queen to move into a nuc.' };
  }
  if (Game.inventory.nucBoxes < 1) {
    return { ok: false, msg: 'You need a nucleus box for the nucleus method.' };
  }

  Game.inventory.nucBoxes--;

  /* The nuc takes the queen and a small contingent of bees */
  const nucPop = Math.round(colony.population * 0.25);
  colony.population -= nucPop;

  const newColony = makeColony({
    name: _act_nextHiveName(),
    apiaryId: colony.apiaryId,
    source: 'split',
    population: nucPop,
    queenQuality: colony.queen.layQuality,
    varroa: Math.round(colony.varroa * 0.2),
    year: gameYear(),
  });
  newColony.queen = Object.assign({}, colony.queen);
  newColony.queenCells = { type: 'none', count: 0, age: 0 };
  newColony.swarmPressure = 0;

  /* Original loses its queen and raises an emergency queen */
  colony.queen = null;
  colony.queenCells = { type: 'emergency', count: _act_randInt(4, 8), age: 0 };
  colony.swarmPressure = _act_clamp(colony.swarmPressure - 0.4, 0, 1);

  Game.colonies.push(newColony);
  Game.stats.splitsMade++;

  addXp(10);
  const msg = `Nucleus method complete. Queen moved with ${nucPop.toLocaleString()} bees to ${newColony.name}. ${colony.name} will raise a new queen from its emergency cells.`;
  logEvent('🔀', msg, 'good');
  render();
  return { ok: true, msg };
}

/**
 * removeQueenCells(colony) -> {ok, msg}
 * Knock down queen cells. Does NOT fix swarming — the colony rebuilds quickly.
 */
function removeQueenCells(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (colony.queenCells.type === 'none' || colony.queenCells.count === 0) {
    return { ok: false, msg: 'No queen cells found to remove.' };
  }

  const hadType = colony.queenCells.type;
  colony.queenCells = { type: 'none', count: 0, age: 0 };
  /* Swarm pressure is UNCHANGED — the colony will rebuild cells within days */

  const msg = `Queen cells removed from ${colony.name}. However, with swarm pressure still high the bees will draw new cells within the week. This alone will not prevent swarming — a split or artificial swarm is needed.`;
  const lesson = 'Removing queen cells is a short-term measure only. The impulse to swarm is still there. Unless you address the underlying congestion and desire to swarm, new cells will appear within a week.';
  logEvent('✂️', `Queen cells knocked down on ${colony.name}.`, hadType === 'swarm' ? 'bad' : 'plain');
  render();
  return { ok: true, msg, lesson };
}

/**
 * clipQueen(colony) -> {ok, msg}
 * Clip a wing of the queen. Prevents her flying if the colony tries to swarm.
 */
function clipQueen(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (!colony.queen || !colony.queen.present) {
    return { ok: false, msg: 'No queen present to clip.' };
  }
  if (colony.queen.clipped) {
    return { ok: false, msg: 'The queen has already been clipped.' };
  }
  if (colony.queen.virgin) {
    return { ok: false, msg: 'Do not clip a virgin queen before her mating flight.' };
  }

  colony.queen.clipped = true;
  addXp(3);
  const msg = `Queen's wing clipped on ${colony.name}. If the colony tries to swarm, the queen cannot fly and the attempt will fail — buying you time to take proper action.`;
  logEvent('✂️', msg, 'plain');
  render();
  return { ok: true, msg };
}

/**
 * catchSwarm() -> {ok, msg}
 * Collect a reported swarm. Requires a spare hive or nucBox.
 */
function catchSwarm() {
  const hasSpace = Game.inventory.spareHives > 0 || Game.inventory.nucBoxes > 0;
  if (!hasSpace) {
    return { ok: false, msg: 'You need a spare hive or nucleus box to house a caught swarm.' };
  }

  if (Game.inventory.nucBoxes > 0) {
    Game.inventory.nucBoxes--;
  } else {
    Game.inventory.spareHives--;
  }

  /* A caught swarm typically has a mated queen and is queenright from the start */
  const pop = _act_randInt(Math.round(SIM.caughtSwarmPop * 0.7), SIM.caughtSwarmPop);
  const newColony = makeColony({
    name: _act_nextHiveName(),
    apiaryId: Game.ui.selectedApiary || (Game.apiaries[0] ? Game.apiaries[0].id : 0),
    source: 'caught',
    population: pop,
    varroa: _act_randInt(50, 300), // unknown history — could be anything
    year: gameYear(),
  });

  Game.colonies.push(newColony);
  Game.stats.swarmsCaught++;

  addXp(8);
  const msg = `Swarm caught and hived as ${newColony.name} — around ${pop.toLocaleString()} bees. Their varroa history is unknown; monitor carefully and treat if needed.`;
  logEvent('🐝', msg, 'good');
  toast('Swarm caught! Free bees -- but check their health early.', 'good');
  render();
  return { ok: true, msg };
}

/* ------------------------------------------------------------------ */
/* QUEENS                                                               */
/* ------------------------------------------------------------------ */

/**
 * requeen(colony, source) -> {ok, msg}
 * source: 'bought' | 'reared' | 'own'
 */
function requeen(colony, source) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };

  const boughtPrice = CATALOG.bees.find(function(b){ return b.id === 'matedqueen'; });
  const queenCost = boughtPrice ? boughtPrice.price : 42; // £42 default

  if (source === 'bought') {
    if (!spend(queenCost, `Mated queen for ${colony.name}`)) {
      return { ok: false, msg: `Not enough funds — a mated queen costs £${queenCost.toFixed(2)}.` };
    }
  } else if (source === 'reared') {
    /* Use one of the player's own reared queens from the inventory */
    if (!Game.inventory.rearedQueens || Game.inventory.rearedQueens <= 0) {
      return { ok: false, msg: 'You have no reared queens available to use.' };
    }
    Game.inventory.rearedQueens--;
  }
  /* 'own' = use a queen from within the colony (e.g. from a supersedure cell) — no cost */

  /* Small chance of rejection */
  const rejectionChance = source === 'bought' ? 0.12 : source === 'reared' ? 0.08 : 0.15;
  if (Math.random() < rejectionChance) {
    /* Queen rejected and killed */
    const msg = `The bees rejected the new queen and balled her. ${colony.name} is now queenless. Give them a few days to calm down before trying again.`;
    logEvent('👑', msg, 'bad');
    toast('Queen rejected.', 'bad');
    render();
    return { ok: false, msg };
  }

  /* Replace the old queen */
  colony.queen = {
    present: true,
    age: 0,
    layQuality: source === 'bought' ? _act_randRange(0.85, 1.15) : _act_randRange(0.70, 1.05),
    mated: true,
    virgin: false,
    marked: false,
    clipped: false,
    temperamentGene: Math.random() * 0.5, // bought queens tend toward calm
    hygieneGene: source === 'bought' ? _act_randRange(0.5, 0.9) : _act_randRange(0.3, 0.8),
    state: 'laying',
    bornYear: gameYear(),
  };
  colony.layingWorkers = false;
  colony.swarmPressure = 0;

  addXp(8);
  const sourceLabel = { bought: 'bought mated queen', reared: 'queen of your own rearing', own: 'queen raised within the colony' }[source] || source;
  const msg = `${colony.name} requeened with a ${sourceLabel}. She has been accepted and should begin laying within a few days.`;
  logEvent('👑', msg, 'good');
  render();
  return { ok: true, msg };
}

/* Helper: random float in [lo, hi] */
function _act_randRange(lo, hi){ return lo + Math.random() * (hi - lo); }

/**
 * uniteColonies(weak, strong) -> {ok, msg}
 * Newspaper method: merge weak into strong. Weak colony is removed.
 */
function uniteColonies(weak, strong) {
  if (!weak.alive)  return { ok: false, msg: `${weak.name} is no longer alive.` };
  if (!strong.alive) return { ok: false, msg: `${strong.name} is no longer alive.` };
  if (weak.id === strong.id) return { ok: false, msg: 'Cannot unite a colony with itself.' };

  /* The weaker / older queen is lost; strong colony's queen survives */
  strong.population = Math.round(strong.population + weak.population * 0.85); // some bees drift or are lost
  strong.honey      = Math.min(SIM.broodBoxStoreCap, strong.honey + weak.honey * 0.7);
  strong.pollen     = strong.pollen + weak.pollen * 0.7;
  strong.varroa     = strong.varroa + Math.round(weak.varroa * 0.85);

  /* Mark weak colony as dead */
  weak.alive = false;
  weak.deadReason = `United into ${strong.name} via newspaper method`;
  weak.deadWeek = Game.week;

  addXp(6);
  const msg = `${weak.name} united into ${strong.name} using the newspaper method. The bees will fight through the paper over a day or two and accept each other. The weaker queen has been removed.`;
  logEvent('📰', msg, 'good');
  toast(`${weak.name} united into ${strong.name}.`, 'good');
  render();
  return { ok: true, msg };
}

/**
 * markQueen(colony) -> {ok, msg}
 * Mark the queen with the correct colour for the current year.
 */
function markQueen(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  if (!colony.queen || !colony.queen.present) {
    return { ok: false, msg: 'No queen present to mark.' };
  }
  if (colony.queen.marked) {
    return { ok: false, msg: `The queen is already marked (${colony.queen.marked}).` };
  }
  if (colony.queen.virgin) {
    return { ok: false, msg: 'Wait until the queen is mated and laying before marking her.' };
  }

  const colour = queenColourForYear(gameYear());
  colony.queen.marked = colour;

  addXp(4);
  const msg = `Queen on ${colony.name} marked ${colour} for ${gameYear()}. She will be much easier to find at future inspections.`;
  logEvent('🎨', msg, 'good');
  render();
  return { ok: true, msg };
}

/**
 * rearQueens(colony) -> {ok, msg}
 * Requires skill >= 5 and a strong colony. Sets the colony as a cell raiser.
 */
function rearQueens(colony) {
  if (!colony.alive) return { ok: false, msg: 'This colony is no longer alive.' };
  const skill = skillLevel(Game.skillXp);
  if (skill < 5) {
    return { ok: false, msg: `Queen rearing requires skill level 5 or above (you are level ${skill}). Keep practising your inspections and swarm control.` };
  }
  if (colony.population < 18000) {
    return { ok: false, msg: 'The colony is not strong enough to rear queens reliably — it needs to be at peak summer strength.' };
  }
  if (!colony.queen || !colony.queen.present || colony.queen.state !== 'laying') {
    return { ok: false, msg: 'The cell raiser needs a laying queen to provide quality worker bees.' };
  }

  /* Over the next few weeks (simplified) the colony raises queens.
     Represent as producing reared queens that get added to the stat counter.
     A real game loop in simulation.js/colony.js would track progress week by week;
     here we set a flag and award them over coming weeks. For now, award 4 queens
     immediately (simplified model — a real cell raiser yields 4-15 cells). */
  const yielded = _act_randInt(3, 8);
  Game.stats.queensReared = (Game.stats.queensReared || 0) + yielded;
  Game.inventory.rearedQueens = (Game.inventory.rearedQueens || 0) + yielded;

  addXp(25);
  const msg = `${colony.name} is being used as a cell raiser. Over the next few weeks you should get around ${yielded} good queen cells from this stock. These queens are available for requeening or making up nucs.`;
  logEvent('👑', msg, 'good');
  toast(`Queen rearing started — expect up to ${yielded} queens.`, 'good');
  render();
  return { ok: true, msg };
}

/* ------------------------------------------------------------------ */
/* Private utilities                                                    */
/* ------------------------------------------------------------------ */

/* Pick the next hive name from the pool, cycling if exhausted */
function _act_nextHiveName() {
  const used = new Set(Game.colonies.map(function(c){ return c.name; }));
  for (const name of HIVE_NAMES) {
    if (!used.has(name)) return name;
  }
  /* All names used — generate a numbered fallback */
  return 'Colony ' + (Game.nextColonyId || Game.colonies.length + 1);
}
