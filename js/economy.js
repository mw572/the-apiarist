/* ====================================================================
   THE APIARIST — economy.js
   Money, the market, and honey processing.
   Depends on: data.js (globals), game.js (Game, spend, earn, logEvent,
               gameYear, diff, aliveColonies, coloniesIn),
               colony.js (makeColony, colonyValue),
               ui.js (toast, fmtMoney).
   All money via spend()/earn(). All journal lines via logEvent().
   Every public function returns {ok:bool,msg:string} unless noted.
   ==================================================================== */

/* ---- private helpers ------------------------------------------------ */

/* Pick the next unused name from an array of candidate names.
   Used for both hive and apiary naming. */
function _econ_freeName(nameList, usedNames) {
  for (const n of nameList) {
    if (!usedNames.includes(n)) return n;
  }
  // All canonical names used — append a number.
  return nameList[0] + ' ' + (usedNames.length + 1);
}

function _econ_usedHiveNames() {
  return Game.colonies.map(function(c) { return c.name; });
}

function _econ_usedApiaryNames() {
  return Game.apiaries.map(function(a) { return a.name; });
}

/* Ensure a key exists in an object with a numeric default. */
function _econ_ensureKey(obj, key, def) {
  if (obj[key] === undefined || obj[key] === null) obj[key] = def !== undefined ? def : 0;
}

/* Round a price to the nearest penny, sensibly. */
function _econ_roundPrice(n) {
  return Math.round(n * 100) / 100;
}

/* ---- buySupply(id, qty) --------------------------------------------- */
/*
 * Purchases consumable supplies: sugar bags, jar packs, or varroa treatments.
 * id:  'sugarbag' | 'jarpack' | a key of TREATMENTS
 * qty: integer quantity (defaults to 1)
 * Returns {ok, msg}
 */
function buySupply(id, qty) {
  qty = Math.max(1, Math.floor(qty || 1));

  var sugarbag = CATALOG.supplies && CATALOG.supplies.find(function(s){ return s.id === 'sugarbag'; });
  var jarpack  = CATALOG.supplies && CATALOG.supplies.find(function(s){ return s.id === 'jarpack'; });

  if (id === 'sugarbag') {
    if (!sugarbag) return { ok: false, msg: 'Sugar bags are not available in the catalogue.' };
    var cost = _econ_roundPrice(qty * sugarbag.price);
    if (!spend(cost, qty + ' x ' + sugarbag.name)) {
      return { ok: false, msg: qty + ' x ' + sugarbag.name + ' costs ' + fmtMoney(cost) + ' and you only have ' + fmtMoney(Game.cash) + '.' };
    }
    Game.inventory.sugar = (Game.inventory.sugar || 0) + qty * sugarbag.kg;
    var kgAdded = qty * sugarbag.kg;
    logEvent('🛍️', 'Bought ' + qty + ' x ' + sugarbag.name + ' (' + kgAdded + ' kg) for ' + fmtMoney(cost) + '.', 'plain');
    toast(kgAdded + ' kg of sugar added to stock.', 'good');
    return { ok: true, msg: 'You now have ' + Game.inventory.sugar + ' kg of sugar in stock.' };
  }

  if (id === 'jarpack') {
    if (!jarpack) return { ok: false, msg: 'Jar packs are not available in the catalogue.' };
    var cost = _econ_roundPrice(qty * jarpack.price);
    if (!spend(cost, qty + ' x ' + jarpack.name)) {
      return { ok: false, msg: qty + ' x ' + jarpack.name + ' costs ' + fmtMoney(cost) + ' and you only have ' + fmtMoney(Game.cash) + '.' };
    }
    Game.inventory.emptyJars = (Game.inventory.emptyJars || 0) + qty * jarpack.count;
    var jarsAdded = qty * jarpack.count;
    logEvent('🪧', 'Bought ' + qty + ' x ' + jarpack.name + ' (' + jarsAdded + ' jars) for ' + fmtMoney(cost) + '.', 'plain');
    toast(jarsAdded + ' empty jars added to stock.', 'good');
    return { ok: true, msg: 'You now have ' + Game.inventory.emptyJars + ' empty jars in stock.' };
  }

  var treatment = TREATMENTS[id];
  if (treatment) {
    var cost = _econ_roundPrice(qty * treatment.price);
    if (!spend(cost, qty + ' x ' + treatment.name)) {
      return { ok: false, msg: qty + ' x ' + treatment.name + ' costs ' + fmtMoney(cost) + ' and you only have ' + fmtMoney(Game.cash) + '.' };
    }
    if (!Game.inventory.treatStock) Game.inventory.treatStock = {};
    Game.inventory.treatStock[id] = (Game.inventory.treatStock[id] || 0) + qty;
    logEvent('💊', 'Bought ' + qty + ' x ' + treatment.name + ' for ' + fmtMoney(cost) + '.', 'plain');
    toast(qty + ' x ' + treatment.name + ' added to stock.', 'good');
    return { ok: true, msg: 'You have ' + Game.inventory.treatStock[id] + ' x ' + treatment.name + ' in stock.' };
  }

  return { ok: false, msg: 'Unknown supply.' };
}

/* ---- buyFromCatalog(category, id, qty) ------------------------------ */
/*
 * category: 'bees' | 'hives' | 'tools'
 * id: an id within that category
 * qty: integer quantity (tools always 1)
 * Returns {ok, msg}
 */
function buyFromCatalog(category, id, qty) {
  qty = Math.max(1, Math.floor(qty || 1));

  // Locate the item in the catalogue.
  var items = CATALOG[category];
  if (!items) {
    return { ok: false, msg: 'Unknown category: ' + category + '.' };
  }
  var item = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === id) { item = items[i]; break; }
  }
  if (!item) {
    return { ok: false, msg: 'Item not found in catalogue.' };
  }

  // Mated queens are purchased through requeen(), not the catalogue.
  if (id === 'matedqueen') {
    return { ok: false, msg: 'A mated queen needs to be bought for a specific colony. Use the Requeen action instead.' };
  }

  // Tools are one-offs.
  if (category === 'tools') {
    qty = 1;
    if (Game.inventory.tools[id]) {
      return { ok: false, msg: 'You already have ' + item.name.toLowerCase() + '.' };
    }
  }

  var totalCost = _econ_roundPrice(item.price * qty);

  if (!spend(totalCost, qty > 1 ? qty + 'x ' + item.name : item.name)) {
    return {
      ok: false,
      msg: 'You cannot afford ' + (qty > 1 ? qty + ' x ' : '') + item.name +
           ' (' + fmtMoney(totalCost) + '). You have ' + fmtMoney(Game.cash) + '.'
    };
  }

  // Apply effect.
  if (category === 'hives') {
    if (id === 'hive')     { Game.inventory.spareHives += qty; }
    if (id === 'nucbox')   { Game.inventory.nucBoxes   += qty; }
    if (id === 'baithive') { Game.inventory.baitHives  += qty; }

    var hiveDesc = qty === 1 ? item.name : qty + ' x ' + item.name;
    logEvent('🪵', 'Bought ' + hiveDesc + ' for ' + fmtMoney(totalCost) + '.', 'plain');
    toast('Bought ' + hiveDesc + '.', 'good');
    return { ok: true, msg: 'Bought ' + hiveDesc + '.' };
  }

  if (category === 'tools') {
    Game.inventory.tools[id] = true;
    logEvent('🔧', 'Bought ' + item.name + ' for ' + fmtMoney(totalCost) + '.', 'plain');
    toast(item.name + ' added to your kit.', 'good');
    return { ok: true, msg: item.name + ' added to your kit.' };
  }

  if (category === 'bees') {
    // nuc or colony — requires a spare hive.
    if (Game.inventory.spareHives < 1) {
      // Refund — money already spent above; but we should not have spent it yet.
      // Actually spend() was called — we need to refund.
      earn(totalCost, 'Refund — no spare hive available');
      return {
        ok: false,
        msg: 'You need a hive ready to put them in first. Buy a complete National hive, then try again.'
      };
    }

    // Consume one spare hive.
    Game.inventory.spareHives -= 1;

    var source = (id === 'nuc') ? 'nuc' : 'colony';
    var apiaryId = Game.ui.selectedApiary;

    // Validate the selected apiary exists.
    var apiaryOk = false;
    for (var ai = 0; ai < Game.apiaries.length; ai++) {
      if (Game.apiaries[ai].id === apiaryId) { apiaryOk = true; break; }
    }
    if (!apiaryOk && Game.apiaries.length > 0) {
      apiaryId = Game.apiaries[0].id;
    }

    var queenQuality = 0.7 + Math.random() * 0.3 * diff().robustQueens;
    var newColony = makeColony({
      source:       source,
      apiaryId:     apiaryId,
      name:         _econ_freeName(HIVE_NAMES, _econ_usedHiveNames()),
      week:         Game.week,
      year:         gameYear(),
      queenQuality: queenQuality,
    });
    Game.colonies.push(newColony);

    var colDesc = item.name + ' (' + newColony.name + ')';
    logEvent('📦', 'Bought ' + colDesc + ' for ' + fmtMoney(totalCost) + '.', 'good');
    toast(newColony.name + ' is installed and ready.', 'good');
    return { ok: true, msg: newColony.name + ' installed at ' + (apiaryOk ? 'your selected apiary' : 'your apiary') + '.' };
  }

  return { ok: false, msg: 'Unhandled catalogue category.' };
}

/* ---- establishApiary(siteType) -------------------------------------- */
/*
 * siteType: key of SITE_TYPES
 * Returns {ok, msg}
 */
function establishApiary(siteType) {
  // Reasonable cap: 6 apiaries.
  if (Game.apiaries.length >= 6) {
    return { ok: false, msg: 'You already have six apiaries. Managing more than that is a stretch for one beekeeper.' };
  }

  if (!SITE_TYPES[siteType]) {
    return { ok: false, msg: 'Unknown site type.' };
  }

  if (!spend(COSTS.newApiary, 'New apiary — site clearance and setup')) {
    return {
      ok: false,
      msg: 'Setting up a new apiary costs ' + fmtMoney(COSTS.newApiary) + ' and you have ' + fmtMoney(Game.cash) + '.'
    };
  }

  var apiary = {
    id:       Game.nextApiaryId++,
    name:     _econ_freeName(APIARY_NAMES, _econ_usedApiaryNames()),
    siteType: siteType,
    founded:  Game.week,
  };
  Game.apiaries.push(apiary);

  var siteLabel = SITE_TYPES[siteType].label;
  logEvent('📍', 'Established ' + apiary.name + ' (' + siteLabel + ') for ' + fmtMoney(COSTS.newApiary) + '.', 'good');
  toast(apiary.name + ' is ready for hives.', 'good');
  return { ok: true, msg: apiary.name + ' established at a ' + siteLabel.toLowerCase() + ' site.' };
}

/* ---- harvestColony(colony) ------------------------------------------ */
/*
 * Clears supers of capped honey into Game.inventory.honey.
 * Returns {ok, msg, kg, type}
 */
function harvestColony(colony) {
  if (!colony || !colony.alive) {
    return { ok: false, msg: 'Colony is not alive.', kg: 0, type: null };
  }
  if (colony.supers < 1) {
    return { ok: false, msg: 'There are no supers on ' + colony.name + ' to harvest.', kg: 0, type: null };
  }
  // Almost nothing in the supers — still take them off (for winter, or to
  // clear the way for varroa treatment), but nothing is worth extracting.
  if (colony.superHoney < 1) {
    colony.superHoney = 0;
    colony.supers = 0;
    var clearedMsg = 'Cleared the supers from ' + colony.name + '. There was barely anything in them, so it was left for the bees.';
    logEvent('📦', clearedMsg, 'plain');
    toast('Supers cleared from ' + colony.name + '.', 'plain');
    return { ok: true, msg: clearedMsg, kg: 0, type: null };
  }

  var kg = colony.superHoney;
  var type = colony.superHoneyType || 'summer';
  var msgs = [];

  // Moisture note for context — not a hard block.
  var season = seasonOfWeek(Game.week);
  var isHeightOfFlow = (season === 'summer' && forageNectar(Game.week) > 0.7);
  if (isHeightOfFlow) {
    msgs.push('Some frames may have unripe honey at the height of the flow — check moisture before bottling.');
  }

  // OSR crystallisation: FIX (Issue C) — harvestColony had no crystallisation
  // check at all. If the beekeeper bulk-harvests after OSR honey has set in
  // the comb, most of it is lost. The per-super harvestSuperAt() already had
  // this check; harvestColony() now mirrors it.
  if (colony.osrCrystallised && type === 'oilseed') {
    var crystalLoss = _econ_roundPrice(kg * 0.70);
    kg = _econ_roundPrice(kg - crystalLoss);
    msgs.push('The OSR honey had crystallised in the comb — most could not be extracted by centrifuge (' + crystalLoss.toFixed(1) + ' kg lost). Extract OSR honey within two weeks of the flow ending, before it sets.');
    colony.osrCrystallised = false;
    colony.osrRisk = 0;
  }

  // No clearer board: messier harvest, lose ~8%.
  if (!Game.inventory.tools.clearerBoard) {
    var loss = _econ_roundPrice(kg * 0.08);
    kg = _econ_roundPrice(kg - loss);
    msgs.push('Without a clearer board you had to brush bees off, and lost a little honey in the process (' + loss.toFixed(2) + ' kg).');
  }

  // Cappings wax: roughly 1–1.5% of honey weight.
  var waxGain = _econ_roundPrice(kg * 0.013);
  Game.inventory.wax = _econ_roundPrice((Game.inventory.wax || 0) + waxGain);

  // Move honey into bulk inventory.
  _econ_ensureKey(Game.inventory.honey, type, 0);
  Game.inventory.honey[type] = _econ_roundPrice(Game.inventory.honey[type] + kg);

  // Reset the colony — all supers come off together for extraction.
  colony.superHoney = 0;
  colony.supers = 0;
  // Keep hiveLayout in sync immediately so the frame cross-section does not
  // show honey-filled supers after a harvest (the weekly sync would fix this
  // next tick, but we render() right after the harvest action).
  if (colony.hiveLayout) colony.hiveLayout.supers = [];

  // Stats.
  Game.stats.honeyHarvested = _econ_roundPrice((Game.stats.honeyHarvested || 0) + kg);
  colony.productionThisYear = _econ_roundPrice((colony.productionThisYear || 0) + kg);

  var honeyName = (HONEY_TYPES[type] && HONEY_TYPES[type].name) ? HONEY_TYPES[type].name : type;
  var baseMsg = 'Harvested ' + kg.toFixed(1) + ' kg of ' + honeyName + ' from ' + colony.name + '.';
  if (msgs.length) baseMsg += ' ' + msgs.join(' ');

  logEvent('🍯', baseMsg, 'good');
  toast(kg.toFixed(1) + ' kg of ' + honeyName + ' in the tank.', 'good');
  return { ok: true, msg: baseMsg, kg: kg, type: type };
}

/* ---- harvestSuperAt(colony, superIdx) -------------------------------- */
/*
 * Harvests honey from a single super by index. The super BOX stays on the
 * hive with empty drawn comb — bees can refill it next flow.
 * To physically remove the box, use removeEmptySuper() afterwards.
 * Returns {ok, msg, kg, type}
 */
function harvestSuperAt(colony, superIdx) {
  if (!colony || !colony.alive) return { ok: false, msg: 'Colony is not alive.', kg: 0 };
  if (colony.supers < 1) return { ok: false, msg: 'No supers on this hive.', kg: 0 };

  var layout = colony.hiveLayout;
  var superKg = 0;
  var type = colony.superHoneyType || 'summer';

  if (layout && layout.supers && layout.supers[superIdx]) {
    superKg = layout.supers[superIdx].honeyKg || 0;
    type = layout.supers[superIdx].honeyType || type;
  } else {
    superKg = colony.superHoney / Math.max(colony.supers, 1);
  }

  var msgs = [];

  if (superKg < 0.5) {
    /* Nearly empty — nothing worth extracting, but box stays on hive */
    _colony_emptySuperAt(colony, superIdx);
    var emptyMsg = 'Super ' + (superIdx + 1) + ' on ' + colony.name + ' had barely anything in it — left for the bees to clean up. The box stays on the hive.';
    logEvent('📦', emptyMsg, 'plain');
    return { ok: true, msg: emptyMsg, kg: 0, type: null };
  }

  var kg = superKg;

  /* Moisture note */
  var season = (typeof seasonOfWeek === 'function') ? seasonOfWeek(Game.week) : 'summer';
  var isHeightOfFlow = (season === 'summer' && (typeof forageNectar === 'function') && forageNectar(Game.week) > 0.7);
  if (isHeightOfFlow) msgs.push('Some frames may have unripe honey — check moisture before bottling.');

  /* OSR crystallisation: frames mostly ruined if left too long */
  if (colony.osrCrystallised && type === 'oilseed') {
    var crystalLoss = _econ_roundPrice(kg * 0.70);
    kg = _econ_roundPrice(kg - crystalLoss);
    msgs.push('The OSR honey had partially crystallised in the comb — most could not be extracted (' + crystalLoss.toFixed(1) + ' kg lost).');
    colony.osrCrystallised = false;
    colony.osrRisk = 0;
  }

  /* Clearer board */
  var hasClearer = colony.clearerFitted || (Game.inventory.tools && Game.inventory.tools.clearerBoard);
  if (!hasClearer) {
    var loss = _econ_roundPrice(kg * 0.08);
    kg = _econ_roundPrice(kg - loss);
    msgs.push('Without a clearer board you had to brush bees off, losing ' + loss.toFixed(2) + ' kg.');
  }
  colony.clearerFitted = false;

  /* Cappings wax */
  Game.inventory.wax = _econ_roundPrice((Game.inventory.wax || 0) + _econ_roundPrice(kg * 0.013));

  /* Move honey to inventory */
  _econ_ensureKey(Game.inventory.honey, type, 0);
  Game.inventory.honey[type] = _econ_roundPrice(Game.inventory.honey[type] + kg);

  /* Stats */
  Game.stats.honeyHarvested = _econ_roundPrice((Game.stats.honeyHarvested || 0) + kg);
  colony.productionThisYear = _econ_roundPrice((colony.productionThisYear || 0) + kg);

  /* Empty the super frames but KEEP the box on the hive */
  _colony_emptySuperAt(colony, superIdx);

  var honeyName = (HONEY_TYPES[type] && HONEY_TYPES[type].name) ? HONEY_TYPES[type].name : type;
  var baseMsg = 'Harvested ' + kg.toFixed(1) + ' kg of ' + honeyName + ' from super ' + (superIdx + 1) + ' on ' + colony.name + '. The empty box is left on the hive — remove it when ready or leave for the next flow.';
  if (msgs.length) baseMsg += ' ' + msgs.join(' ');

  logEvent('🍯', baseMsg, 'good');
  toast(kg.toFixed(1) + ' kg of ' + honeyName + ' in the tank.', 'good');
  return { ok: true, msg: baseMsg, kg: kg, type: type };
}

/* ---- _colony_emptySuperAt(colony, idx) ------------------------------- */
/* Zeroes the honey in a super's frames without removing the box.
   The drawn comb stays — bees can refill it next flow. */
function _colony_emptySuperAt(colony, idx) {
  var layout = colony.hiveLayout;
  var removedKg = 0;

  if (layout && layout.supers && layout.supers[idx]) {
    var sup = layout.supers[idx];
    removedKg = sup.honeyKg || 0;
    sup.honeyKg = 0;
    sup.honeyType = 'summer'; /* reset type ready for next flow */
    /* Empty all frames but mark them as drawn (comb remains) */
    if (sup.frames) {
      sup.frames.forEach(function(f) {
        f.content = { honey: 0, nectar: 0, empty: 1, eggs: 0, larvae: 0, capped: 0, pollen: 0, drone: 0 };
        f.drawn = true; /* drawn comb persists after harvest */
        f.crystallised = false;
      });
    }
    sup.drawnFrames = 11; /* All comb drawn after a harvest */
  } else {
    removedKg = colony.supers > 0 ? colony.superHoney / colony.supers : 0;
  }

  colony.superHoney = Math.max(0, _econ_roundPrice((colony.superHoney || 0) - removedKg));
  if (colony.superHoney < 0.01) colony.superHoney = 0;
}

/* ---- _colony_removeSuperAt(colony, idx) ------------------------------ */
/* Physically removes a super box from the hive. Used by removeEmptySuper().
   Only call this when actually taking the box off — not on harvest. */
function _colony_removeSuperAt(colony, idx) {
  var removedKg = 0;
  if (colony.hiveLayout && colony.hiveLayout.supers && colony.hiveLayout.supers[idx]) {
    removedKg = colony.hiveLayout.supers[idx].honeyKg || 0;
    colony.hiveLayout.supers.splice(idx, 1);
  } else if (colony.supers > 0) {
    removedKg = colony.superHoney / Math.max(colony.supers, 1);
  }
  colony.superHoney = Math.max(0, _econ_roundPrice((colony.superHoney || 0) - removedKg));
  colony.supers = Math.max(0, (colony.supers || 1) - 1);
  if (colony.supers === 0) {
    colony.superHoney = 0;
    colony.queenExcluder = false; /* QX has no function with no supers */
  }
}

/* ---- extractAndBottle(honeyType, jarCount) -------------------------- */
/*
 * Turns bulk honey kg into labelled jars.
 * Returns {ok, msg}
 */
function extractAndBottle(honeyType, jarCount) {
  jarCount = Math.max(1, Math.floor(jarCount || 1));

  var KG_PER_JAR = 0.34; // a 227g / half-pound jar holds ~0.34 kg of honey
  var kgNeeded = _econ_roundPrice(jarCount * KG_PER_JAR);

  _econ_ensureKey(Game.inventory.honey, honeyType, 0);
  if (Game.inventory.honey[honeyType] < kgNeeded) {
    var available = Math.floor(Game.inventory.honey[honeyType] / KG_PER_JAR);
    return {
      ok: false,
      msg: 'You only have ' + Game.inventory.honey[honeyType].toFixed(2) + ' kg of that honey — enough for about ' + available + ' jar' + (available === 1 ? '' : 's') + '.'
    };
  }

  // Check empty jar stock before doing anything else.
  if ((Game.inventory.emptyJars || 0) < jarCount) {
    return {
      ok: false,
      msg: 'You only have ' + (Game.inventory.emptyJars || 0) + ' empty jar' +
           ((Game.inventory.emptyJars || 0) === 1 ? '' : 's') +
           '. Buy more from the Market (the Supplies tab).'
    };
  }

  var msgs = [];
  var extraCost = 0;

  // Extractor: own it or hire the association's.
  var isHeather = (honeyType === 'heather');
  if (!Game.inventory.tools.extractor) {
    if (isHeather) {
      // Heather honey is thixotropic — it must be pressed, not spun.
      msgs.push('Heather honey cannot be spun in a conventional extractor; it must be pressed. The association\'s press costs the same hire fee.');
    } else {
      msgs.push('You hired the association extractor for ' + fmtMoney(COSTS.extractorHire) + '.');
    }
    extraCost += COSTS.extractorHire;
  } else if (isHeather) {
    msgs.push('Heather honey is thixotropic and must be pressed rather than spun. Make sure you have a press or loosener to hand.');
  }

  // Extractor hire is a service (if applicable) — spend that now.
  if (extraCost > 0 && !spend(extraCost, 'Extractor hire — ' + jarCount + ' jars')) {
    return {
      ok: false,
      msg: 'Hiring the association extractor costs ' + fmtMoney(extraCost) + ' and you have ' + fmtMoney(Game.cash) + '.'
    };
  }

  // Moisture nudge.
  if (Game.inventory.tools.refractometer) {
    msgs.push('Check the refractometer — anything above 20% moisture can ferment in the jar.');
  } else {
    msgs.push('A refractometer would let you check moisture before bottling; without one you are trusting the bees.');
  }

  // Settling tank nudge.
  if (Game.inventory.tools.settlingTank) {
    msgs.push('Your settling tank will clear any air bubbles and surface wax before you lid up.');
  }

  // Deduct honey and empty jars; add filled jars to inventory.
  Game.inventory.honey[honeyType] = _econ_roundPrice(Game.inventory.honey[honeyType] - kgNeeded);
  Game.inventory.emptyJars = (Game.inventory.emptyJars || 0) - jarCount;
  _econ_ensureKey(Game.inventory.jars, honeyType, 0);
  Game.inventory.jars[honeyType] += jarCount;

  var honeyName = (HONEY_TYPES[honeyType] && HONEY_TYPES[honeyType].name) ? HONEY_TYPES[honeyType].name : honeyType;
  var costNote = extraCost > 0 ? ' Extractor hire: ' + fmtMoney(extraCost) + '.' : '';
  var baseMsg = 'Bottled ' + jarCount + ' jar' + (jarCount === 1 ? '' : 's') + ' of ' + honeyName + '.' + costNote;
  if (msgs.length) baseMsg += ' ' + msgs.join(' ');

  logEvent('🫙', baseMsg, 'plain');
  toast(jarCount + ' jar' + (jarCount === 1 ? '' : 's') + ' ready to sell.', 'good');
  return { ok: true, msg: baseMsg };
}

/* ---- marketPrice(honeyType, channelId) ------------------------------ */
/*
 * Returns the price in pence-rounded pounds per jar for a given honey type
 * and sales channel, adjusted for current reputation.
 * Returns a number (£).
 */
function marketPrice(honeyType, channelId) {
  var honeyData   = HONEY_TYPES[honeyType];
  var channelData = SALES[channelId];
  if (!honeyData || !channelData) return 0;

  // Base: honey face value * channel multiplier * small reputation premium.
  var price = honeyData.value * channelData.priceMul * (1 + Game.reputation / 200);
  return _econ_roundPrice(price);
}

/* ---- sellHoney(channelId, honeyType, jarCount) ---------------------- */
/*
 * Returns {ok, msg, income}
 */
function sellHoney(channelId, honeyType, jarCount) {
  var channel = SALES[channelId];
  if (!channel) {
    return { ok: false, msg: 'Unknown sales channel.', income: 0 };
  }

  // Reputation gate.
  if (Game.reputation < channel.repNeed) {
    return {
      ok: false,
      msg: 'You need a local reputation of at least ' + channel.repNeed + ' to sell via ' + channel.name + '. Yours is currently ' + Math.floor(Game.reputation) + '. Sell at the gate and build word of mouth first.',
      income: 0
    };
  }

  // Cap at channel capacity.
  jarCount = Math.min(jarCount, channel.capacity);
  if (jarCount < 1) {
    return { ok: false, msg: 'Nothing to sell.', income: 0 };
  }

  _econ_ensureKey(Game.inventory.jars, honeyType, 0);
  if (Game.inventory.jars[honeyType] < jarCount) {
    return {
      ok: false,
      msg: 'You only have ' + Game.inventory.jars[honeyType] + ' jar' + (Game.inventory.jars[honeyType] === 1 ? '' : 's') + ' of that honey.',
      income: 0
    };
  }

  var pricePerJar = marketPrice(honeyType, channelId);
  var gross = _econ_roundPrice(pricePerJar * jarCount);

  // Channel costs.
  var costs = channel.perVisitCost || 0;
  if (channel.postage) {
    costs = _econ_roundPrice(costs + channel.postage * jarCount);
  }

  var income = _econ_roundPrice(gross - costs);

  earn(income, 'Honey sales — ' + jarCount + ' jar' + (jarCount === 1 ? '' : 's') + ' via ' + channel.name);

  // Deduct jars.
  Game.inventory.jars[honeyType] -= jarCount;

  // Reputation bump: small, diminishing feel is fine — cap at 100.
  var repGain = Math.max(0.5, 2 - Game.reputation / 80);
  Game.reputation = Math.min(100, Game.reputation + repGain);

  Game.stats.jarsSold = (Game.stats.jarsSold || 0) + jarCount;

  var honeyName = (HONEY_TYPES[honeyType] && HONEY_TYPES[honeyType].name) ? HONEY_TYPES[honeyType].name : honeyType;
  var msg = 'Sold ' + jarCount + ' jar' + (jarCount === 1 ? '' : 's') + ' of ' + honeyName +
            ' via ' + channel.name + ' for ' + fmtMoney(income) +
            (costs > 0 ? ' (after ' + fmtMoney(costs) + ' in costs)' : '') + '.';

  logEvent('💰', msg, 'good');
  toast(fmtMoney(income) + ' from ' + jarCount + ' jar' + (jarCount === 1 ? '' : 's') + '.', 'good');
  return { ok: true, msg: msg, income: income };
}

/* ---- sellColony(colony, asNuc) --------------------------------------- */
/*
 * Sells a live colony (asNuc=true sells a smaller portion for 80% value).
 * Returns {ok, msg}
 */
function sellColony(colony, asNuc) {
  if (!colony || !colony.alive) {
    return { ok: false, msg: 'That colony is not available to sell.' };
  }

  // Refuse to sell an AFB colony — it must be destroyed, not sold.
  if (colony.diseases && colony.diseases.afb > 0.1) {
    return {
      ok: false,
      msg: 'You cannot sell ' + colony.name + ': it has signs of American Foul Brood. A diseased colony cannot be sold on. It must be reported and the hive destroyed.'
    };
  }

  var price = _econ_roundPrice(colonyValue(colony) * (asNuc ? 0.8 : 1.0));

  earn(price, (asNuc ? 'Nuc sale — ' : 'Colony sale — ') + colony.name);

  // Mark as sold rather than dead — simulation should treat this as gone.
  colony.alive = false;
  colony.deadReason = asNuc ? 'sold as nuc' : 'sold';
  colony.deadWeek = Game.week;

  var msg = (asNuc ? 'Sold a nucleus from ' : 'Sold ') + colony.name + ' for ' + fmtMoney(price) + '.';
  logEvent('🤝', msg, 'good');
  toast(colony.name + ' sold for ' + fmtMoney(price) + '.', 'good');
  return { ok: true, msg: msg };
}

/* ---- renderWax() ---------------------------------------------------- */
/*
 * Sells all accumulated beeswax at ~£14/kg.
 * Returns {ok, msg}
 */
function renderWax() {
  var WAX_PRICE_PER_KG = 14; // Realistic UK beeswax price per kg (craft/cosmetic grade).
  var kg = Game.inventory.wax || 0;

  if (kg < 0.05) {
    return { ok: false, msg: 'You have barely any wax to sell. It builds up from cappings at each harvest.' };
  }

  var income = _econ_roundPrice(kg * WAX_PRICE_PER_KG);
  earn(income, 'Beeswax — ' + kg.toFixed(2) + ' kg');
  Game.inventory.wax = 0;

  var msg = 'Sold ' + kg.toFixed(2) + ' kg of rendered beeswax for ' + fmtMoney(income) + '.';
  logEvent('🕯️', msg, 'good');
  toast(fmtMoney(income) + ' for your beeswax.', 'good');
  return { ok: true, msg: msg };
}

/* ---- makeCutComb(colony) -------------------------------------------- */
/*
 * Premium comb-honey packs. Requires skill >= 4 and enough super honey.
 * Returns {ok, msg}
 */
function makeCutComb(colony) {
  if (!colony || !colony.alive) {
    return { ok: false, msg: 'Colony is not alive.' };
  }
  if (skillLevel(Game.skillXp) < 4) {
    return {
      ok: false,
      msg: 'Cut comb is a skilled technique. You will be able to produce it once you reach skill level 4 (currently ' + skillLevel(Game.skillXp) + ').'
    };
  }
  if (colony.supers < 1 || colony.superHoney <= 4) {
    return {
      ok: false,
      msg: colony.name + ' does not have enough capped comb honey in the supers yet. Wait until the super is well filled (over 4 kg) before cutting sections.'
    };
  }

  // Each cut-comb pack uses roughly 0.4 kg of super honey.
  var KG_PER_PACK = 0.4;
  var packs = Math.floor(colony.superHoney / KG_PER_PACK);
  if (packs < 1) {
    return { ok: false, msg: 'Not quite enough for even one pack.' };
  }

  // Cap at a sensible batch — the whole super at once is realistic.
  var kgUsed = _econ_roundPrice(packs * KG_PER_PACK);
  colony.superHoney = _econ_roundPrice(colony.superHoney - kgUsed);
  _econ_ensureKey(Game.inventory, 'cutComb', 0);
  Game.inventory.cutComb += packs;

  var msg = 'Cut ' + packs + ' section' + (packs === 1 ? '' : 's') + ' of comb honey from ' + colony.name + '. Each pack sells for a premium.';
  logEvent('🍯', msg, 'good');
  toast(packs + ' cut-comb pack' + (packs === 1 ? '' : 's') + ' ready.', 'good');
  return { ok: true, msg: msg };
}

/* ---- pollinationContract(apiaryId) ---------------------------------- */
/*
 * Pays per hive at orchard or farmland sites in spring.
 * Once per spring per apiary (tracked via a per-apiary flag).
 * Returns {ok, msg}
 */
function pollinationContract(apiaryId) {
  // Find the apiary.
  var apiary = null;
  for (var i = 0; i < Game.apiaries.length; i++) {
    if (Game.apiaries[i].id === apiaryId) { apiary = Game.apiaries[i]; break; }
  }
  if (!apiary) {
    return { ok: false, msg: 'Apiary not found.' };
  }

  var siteData = SITE_TYPES[apiary.siteType];
  if (!siteData || !siteData.pollination) {
    return {
      ok: false,
      msg: apiary.name + ' is a ' + (siteData ? siteData.label.toLowerCase() : 'unknown') + ' site. Pollination contracts are only available at orchard and farmland sites.'
    };
  }

  // Must be spring.
  var season = seasonOfWeek(Game.week);
  if (season !== 'spring') {
    return { ok: false, msg: 'Pollination contracts run in spring, when the blossom is out. Come back in April or May.' };
  }

  // Once per spring per apiary.
  if (!Game.flags.pollinationPaid) Game.flags.pollinationPaid = {};
  var key = apiaryId + '_' + Math.floor(Game.week / 52);
  if (Game.flags.pollinationPaid[key]) {
    return { ok: false, msg: 'You have already collected the pollination payment for ' + apiary.name + ' this spring.' };
  }

  // Count alive colonies at this apiary.
  var hivesHere = 0;
  for (var c = 0; c < Game.colonies.length; c++) {
    if (Game.colonies[c].alive && Game.colonies[c].apiaryId === apiaryId) hivesHere++;
  }
  if (hivesHere < 1) {
    return { ok: false, msg: 'There are no hives at ' + apiary.name + ' to offer for pollination.' };
  }

  var RATE_PER_HIVE = 45; // ~£45/hive — standard UK orchard pollination rate.
  var income = _econ_roundPrice(hivesHere * RATE_PER_HIVE);

  earn(income, 'Pollination contract — ' + apiary.name);
  Game.flags.pollinationPaid[key] = true;

  var msg = 'Pollination contract paid for ' + hivesHere + ' hive' + (hivesHere === 1 ? '' : 's') + ' at ' + apiary.name + ': ' + fmtMoney(income) + '.';
  logEvent('🍎', msg, 'good');
  toast(fmtMoney(income) + ' pollination fee collected.', 'good');
  return { ok: true, msg: msg };
}
