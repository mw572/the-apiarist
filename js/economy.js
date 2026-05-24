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

  if (id === 'super') {
    var cost = COSTS.superAdd * qty;
    if (!spend(cost, qty + ' super box' + (qty > 1 ? 'es' : ''))) {
      return { ok: false, msg: 'Not enough funds. A super costs £' + COSTS.superAdd + ' each.' };
    }
    Game.inventory.supers = (Game.inventory.supers || 0) + qty;
    logEvent('📦', 'Bought ' + qty + ' super box' + (qty > 1 ? 'es' : '') + ' for £' + cost + '.', 'plain');
    toast(qty + ' super' + (qty > 1 ? 's' : '') + ' added to stock.', 'good');
    return { ok: true, msg: 'You have ' + Game.inventory.supers + ' super' + (Game.inventory.supers !== 1 ? 's' : '') + ' in stock.' };
  }

  if (id === 'broodBox') {
    var cost = COSTS.broodBoxAdd * qty;
    if (!spend(cost, qty + ' brood box' + (qty > 1 ? 'es' : '') + ' (with frames)')) {
      return { ok: false, msg: 'Not enough funds. A brood box costs £' + COSTS.broodBoxAdd + ' each.' };
    }
    Game.inventory.broodBoxes = (Game.inventory.broodBoxes || 0) + qty;
    logEvent('🪵', 'Bought ' + qty + ' brood box' + (qty > 1 ? 'es' : '') + ' for £' + cost + '.', 'plain');
    toast(qty + ' brood box' + (qty > 1 ? 'es' : '') + ' added to stock.', 'good');
    return { ok: true, msg: 'You have ' + Game.inventory.broodBoxes + ' brood box' + (Game.inventory.broodBoxes !== 1 ? 'es' : '') + ' in stock.' };
  }

  if (id === 'queenExcluder') {
    var cost = COSTS.queenExcluder * qty;
    if (!spend(cost, qty + ' queen excluder' + (qty > 1 ? 's' : ''))) {
      return { ok: false, msg: 'Not enough funds. A queen excluder costs £' + COSTS.queenExcluder + ' each.' };
    }
    Game.inventory.queenExcluders = (Game.inventory.queenExcluders || 0) + qty;
    logEvent('🔲', 'Bought ' + qty + ' queen excluder' + (qty > 1 ? 's' : '') + ' for £' + cost + '.', 'plain');
    toast(qty + ' queen excluder' + (qty > 1 ? 's' : '') + ' added to stock.', 'good');
    return { ok: true, msg: 'You have ' + Game.inventory.queenExcluders + ' queen excluder' + (Game.inventory.queenExcluders !== 1 ? 's' : '') + ' in stock.' };
  }

  if (id === 'newspaper') {
    var cost = 1 * qty;
    if (!spend(cost, qty + ' newspaper sheet' + (qty > 1 ? 's' : ''))) {
      return { ok: false, msg: 'Not enough funds. Newspaper costs £1 per sheet.' };
    }
    Game.inventory.newspaper = (Game.inventory.newspaper || 0) + qty;
    logEvent('📰', 'Bought ' + qty + ' newspaper sheet' + (qty > 1 ? 's' : '') + ' for £' + cost + '.', 'plain');
    toast('Newspaper added to stock — place it between hive bodies before uniting.', 'good');
    return { ok: true, msg: 'You have ' + Game.inventory.newspaper + ' newspaper sheet' + (Game.inventory.newspaper !== 1 ? 's' : '') + ' in stock.' };
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

    /* Anything with id starting "nuc" creates a nuc-source colony.
       "colony" creates an established full colony. The strain comes
       from the catalogue item, defaulting to local if absent. */
    var source = (id.indexOf('nuc') === 0) ? 'nuc' : (id === 'colony' ? 'colony' : 'nuc');
    var strain = (item.strain && HIVE_STRAINS[item.strain]) ? item.strain : 'local';
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
      strain:       strain,
      apiaryId:     apiaryId,
      name:         _econ_freeName(HIVE_NAMES, _econ_usedHiveNames()),
      week:         Game.week,
      year:         gameYear(),
      queenQuality: queenQuality,
    });
    Game.colonies.push(newColony);

    var colDesc = item.name + ' (' + newColony.name + ')';
    logEvent('📦', 'Bought ' + colDesc + ' for ' + fmtMoney(totalCost) + '.', 'good');
    /* No internal toast — the UI handler toasts r.msg, and a second
       toast here was firing back-to-back with a near-identical message. */
    return { ok: true, msg: newColony.name + ' is installed and ready.' };
  }

  return { ok: false, msg: 'Unhandled catalogue category.' };
}

/* ====================================================================
   NEIGHBOUR MARKETPLACE (single-player NPC ads)
   --------------------------------------------------------------------
   Other beekeepers in your area occasionally have spare kit, surplus
   nucs in spring, or sugar to clear out. Their ads appear in the
   Market → Neighbours tab. In single-player they are NPC adverts;
   when multiplayer ships (per UNIVERSE-VISION) the same plumbing will
   present ads from real players at the same coordinates.

   Ads rotate weekly. Each ad has a 3-week lifespan and a one-off
   sale (first-come-first-served, even though there is only one
   "customer" in single-player).
   ==================================================================== */
var NEIGHBOUR_NAMES = [
  'Sarah at Bramble Cottage',
  'Tom from Hill Farm',
  'Dr. Elaine — local association',
  'Hawthorn Lane apiary',
  'Mike\'s apiary',
  'Riverside bees',
  'Old Orchard apiary',
  'Linden Tree beekeeper',
];
/* Each template names the kind of thing the neighbour is shilling.
   `weight` is the relative frequency of this template appearing in a
   given weekly draw. `availWk` predicates restrict when it can appear
   (e.g. nucs only in spring). */
var MARKETPLACE_TEMPLATES = [
  { kind: 'usedSuper',   weight: 18, price: [22, 32],
    name: 'Used super box — clean, drawn comb',
    desc: 'Drawn comb saves a year of comb-building. National size.',
    invKey: 'supers', invDelta: 1 },
  { kind: 'usedBroodBox',weight: 10, price: [28, 38],
    name: 'Used brood box with frames',
    desc: 'Cedar, decent condition. National. Comes with frames.',
    invKey: 'broodBoxes', invDelta: 1 },
  { kind: 'usedHive',    weight: 6,  price: [70, 90],
    name: 'Complete used hive — needs bees',
    desc: 'Floor, brood box, queen excluder, super, crown board, roof. Tidy condition.',
    invKey: 'spareHives', invDelta: 1 },
  { kind: 'usedBait',    weight: 12, price: [10, 18],
    name: 'Bait hive — used, set up',
    desc: 'Already seasoned with old comb. Pop it in a tree.',
    invKey: 'baitHives',  invDelta: 1 },
  { kind: 'sugarBag',    weight: 14, price: [4, 6],
    name: 'Sugar — 5kg bag, end of bulk order',
    desc: 'Cheaper than the supplies tab. They bought too much.',
    invKey: 'sugar',      invDelta: 5 },
  { kind: 'jarLot',      weight: 10, price: [7, 11],
    name: 'Empty jars — lot of 24',
    desc: 'Used but clean. Lids in mixed colours.',
    invKey: 'emptyJars',  invDelta: 24 },
  { kind: 'nucLocal',    weight: 15, price: [110, 135],
    name: 'Nucleus — local stock', strain: 'local',
    desc: 'A spare nuc from this year\'s splits. Five frames, laying queen.',
    isColony: true,
    availWk: function (wk) { return wk >= 14 && wk <= 28; } },   /* spring/early summer only */
  { kind: 'nucBuckfast', weight: 5,  price: [155, 180],
    name: 'Nucleus — Buckfast queen', strain: 'buckfast',
    desc: 'Brother Adam stock from a local breeder. Spare from their breeding programme.',
    isColony: true,
    availWk: function (wk) { return wk >= 14 && wk <= 24; } },
];

function _econ_pickTemplate(rng) {
  var wk = ((Game.week - 1) % 52) + 1;
  var pool = MARKETPLACE_TEMPLATES.filter(function (t) {
    return !t.availWk || t.availWk(wk);
  });
  var total = pool.reduce(function (s, t) { return s + t.weight; }, 0);
  var r = rng() * total;
  for (var i = 0; i < pool.length; i++) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* Weekly hook — adds 0-2 new ads, expires old ones. */
function _refreshMarketplaceAds() {
  if (!Game) return;
  if (!Array.isArray(Game.marketplaceAds)) Game.marketplaceAds = [];

  /* Expire old ads — 3-week lifespan. */
  Game.marketplaceAds = Game.marketplaceAds.filter(function (a) {
    return Game.week - a.postedWeek < 3;
  });

  /* Spawn up to 2 new ads with a 60% chance for the first, 30% for the
     second — keeps the board lively without overwhelming. */
  var rng = Math.random;
  if (!Game.flags.nextAdId) Game.flags.nextAdId = 1;
  var added = 0;
  if (rng() < 0.6) added++;
  if (rng() < 0.3) added++;
  for (var i = 0; i < added && Game.marketplaceAds.length < 6; i++) {
    var tpl = _econ_pickTemplate(rng);
    var price = Math.round(tpl.price[0] + rng() * (tpl.price[1] - tpl.price[0]));
    Game.marketplaceAds.push({
      id: Game.flags.nextAdId++,
      seller: NEIGHBOUR_NAMES[Math.floor(rng() * NEIGHBOUR_NAMES.length)],
      kind: tpl.kind,
      name: tpl.name,
      desc: tpl.desc,
      price: price,
      isColony: !!tpl.isColony,
      strain:   tpl.strain || null,
      invKey:   tpl.invKey   || null,
      invDelta: tpl.invDelta || 0,
      postedWeek: Game.week,
    });
  }
}

/* buyMarketplaceAd(adId) -> { ok, msg }
   Executes the transaction against the named ad. */
function buyMarketplaceAd(adId) {
  if (!Game || !Array.isArray(Game.marketplaceAds)) {
    return { ok: false, msg: 'No marketplace yet.' };
  }
  var idx = -1;
  for (var i = 0; i < Game.marketplaceAds.length; i++) {
    if (Game.marketplaceAds[i].id === adId) { idx = i; break; }
  }
  if (idx === -1) return { ok: false, msg: 'That ad has been taken or expired.' };
  var ad = Game.marketplaceAds[idx];
  if (!spend(ad.price, 'Neighbour — ' + ad.name)) {
    return { ok: false, msg: 'You cannot afford ' + ad.name + ' (£' + ad.price + ').' };
  }

  /* Effect: either install a colony or top up inventory. */
  if (ad.isColony) {
    /* Need a spare hive to house the new nuc — refund if not. */
    if (Game.inventory.spareHives < 1) {
      earn(ad.price, 'Refund — no spare hive');
      Game.marketplaceAds.splice(idx, 1);
      return { ok: false, msg: 'You need a spare hive ready before buying a nuc. Refunded £' + ad.price + '.' };
    }
    Game.inventory.spareHives--;
    var newColony = makeColony({
      source: 'nuc',
      strain: ad.strain || 'local',
      apiaryId: Game.ui.selectedApiary || (Game.apiaries[0] && Game.apiaries[0].id),
      name: _econ_freeName(HIVE_NAMES, _econ_usedHiveNames()),
      week: Game.week, year: gameYear(),
      queenQuality: 0.7 + Math.random() * 0.3,
    });
    Game.colonies.push(newColony);
    logEvent('🏘️', 'Bought ' + ad.name + ' from ' + ad.seller + ' for £' + ad.price + '. Installed as ' + newColony.name + '.', 'good');
    Game.marketplaceAds.splice(idx, 1);
    return { ok: true, msg: newColony.name + ' is installed from ' + ad.seller + '.' };
  }

  /* Inventory key with arbitrary delta. */
  if (ad.invKey) {
    if (ad.invKey === 'sugar') {
      Game.inventory.sugar = (Game.inventory.sugar || 0) + ad.invDelta;
    } else if (ad.invKey === 'emptyJars') {
      Game.inventory.emptyJars = (Game.inventory.emptyJars || 0) + ad.invDelta;
    } else {
      Game.inventory[ad.invKey] = (Game.inventory[ad.invKey] || 0) + ad.invDelta;
    }
  }
  logEvent('🏘️', 'Bought ' + ad.name + ' from ' + ad.seller + ' for £' + ad.price + '.', 'good');
  Game.marketplaceAds.splice(idx, 1);
  return { ok: true, msg: ad.name + ' picked up from ' + ad.seller + '.' };
}

/* ====================================================================
   HONEY COMPOSITION SAMPLING
   --------------------------------------------------------------------
   A real beekeeping service: send a small sample to a lab for pollen
   analysis. The lab reports what flowers actually fed your colony
   during the weeks the honey was made — useful for verifying single-
   source claims (heather, manuka) and for understanding your local
   forage. In-game it's a slow-but-cheap action that pays off in
   knowledge rather than cash.

   In single-player the result is deterministic from the honey type
   (real flow data exists in HONEY_COMPOSITIONS below). Multiplayer
   Phase 4 will introduce variation by region and by which weeks the
   bees actually foraged.
   ==================================================================== */
var HONEY_COMPOSITIONS = {
  spring:  [ { src: 'Dandelion',     pct: 35 },
             { src: 'Fruit blossom',  pct: 30 },
             { src: 'Hawthorn',       pct: 18 },
             { src: 'Sycamore',       pct: 10 },
             { src: 'Other',          pct: 7  } ],
  oilseed: [ { src: 'Oilseed rape',   pct: 78 },
             { src: 'Dandelion',      pct: 14 },
             { src: 'Other',          pct: 8  } ],
  summer:  [ { src: 'White clover',   pct: 30 },
             { src: 'Lime',           pct: 18 },
             { src: 'Bramble',        pct: 16 },
             { src: 'Wildflower mix', pct: 22 },
             { src: 'Sweet chestnut', pct: 8  },
             { src: 'Other',          pct: 6  } ],
  lime:    [ { src: 'Lime (Tilia)',   pct: 72 },
             { src: 'Clover',         pct: 15 },
             { src: 'Other',          pct: 13 } ],
  heather: [ { src: 'Calluna heather', pct: 92 },
             { src: 'Bell heather',    pct: 5  },
             { src: 'Other',           pct: 3  } ],
  ivy:     [ { src: 'Ivy (Hedera)',   pct: 94 },
             { src: 'Other',          pct: 6  } ],
};
var SAMPLE_COST       = 25;     // £ per sample
var SAMPLE_TURNAROUND = 4;      // game weeks until result

/* sendHoneySample(honeyType) -> { ok, msg, sampleId? }
   Queues a lab sample for the given honey type. Costs £25 immediately,
   resolves SAMPLE_TURNAROUND weeks later via _checkSampleResults(). */
function sendHoneySample(honeyType) {
  if (!Game || !honeyType) return { ok: false, msg: 'No honey type chosen.' };
  if (!HONEY_COMPOSITIONS[honeyType]) {
    return { ok: false, msg: 'Lab does not recognise that honey type.' };
  }
  var jarsHeld = (Game.inventory.jars && Game.inventory.jars[honeyType]) || 0;
  if (jarsHeld < 1) {
    return { ok: false, msg: 'You need at least one jar of that honey to send a sample.' };
  }
  if (!spend(SAMPLE_COST, 'Lab — honey composition sample')) {
    return { ok: false, msg: 'You cannot afford the £' + SAMPLE_COST + ' lab fee.' };
  }
  if (!Game.pendingSamples) Game.pendingSamples = [];
  if (!Game.flags.nextSampleId) Game.flags.nextSampleId = 1;
  var s = {
    id: Game.flags.nextSampleId++,
    honeyType: honeyType,
    sentWeek: Game.week,
    returnWeek: Game.week + SAMPLE_TURNAROUND,
  };
  Game.pendingSamples.push(s);
  logEvent('🧪', 'Sent a ' + (HONEY_TYPES[honeyType] && HONEY_TYPES[honeyType].name || honeyType) +
    ' sample to the lab (£' + SAMPLE_COST + '). Results back in ' + SAMPLE_TURNAROUND + ' weeks.', 'plain');
  return { ok: true, msg: 'Sample sent. Results back in ' + SAMPLE_TURNAROUND + ' weeks.', sampleId: s.id };
}

/* Run weekly from advanceWeek — resolves any pending samples whose
   returnWeek has arrived, generates a composition result and moves
   them into completedSamples for the Records view to display. */
function _checkSampleResults() {
  if (!Game || !Game.pendingSamples) return;
  if (!Game.completedSamples) Game.completedSamples = [];
  var keep = [];
  Game.pendingSamples.forEach(function (s) {
    if (Game.week >= s.returnWeek) {
      var result = {
        id: s.id, honeyType: s.honeyType,
        sentWeek: s.sentWeek, returnedWeek: Game.week,
        composition: HONEY_COMPOSITIONS[s.honeyType] || [],
      };
      Game.completedSamples.unshift(result);
      var honeyName = (HONEY_TYPES[s.honeyType] && HONEY_TYPES[s.honeyType].name) || s.honeyType;
      logEvent('🧪', 'Lab report back — ' + honeyName + ': mostly ' +
        (result.composition[0] ? result.composition[0].src + ' (' + result.composition[0].pct + '%)' : 'mixed sources') +
        '. See Records → Samples.', 'good');
    } else {
      keep.push(s);
    }
  });
  Game.pendingSamples = keep;
  /* trim to last 30 results */
  if (Game.completedSamples.length > 30) Game.completedSamples.length = 30;
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
    var clearedSupers = colony.supers;
    colony.superHoney = 0;
    colony.supers = 0;
    colony.queenExcluder = false;
    colony.clearerFitted = false; colony.clearerFittedWeeks = 0;
    if (colony.hiveLayout) colony.hiveLayout.supers = [];
    if (colony.stack) {
      colony.stack = colony.stack.filter(function(i) {
        return i.type !== 'super' && i.type !== 'queenExcluder' && i.type !== 'clearerBoard';
      });
    }
    if (clearedSupers > 0) {
      Game.inventory.supers = (Game.inventory.supers || 0) + clearedSupers;
    }
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
  var _hvstWkInYr = ((Game.week - 1) % 52) + 1;
  var isHeightOfFlow = (season === 'summer' && forageNectar(Game.week) > 0.7);
  if (isHeightOfFlow) {
    msgs.push('Some frames may have unripe honey at the height of the flow — check moisture before bottling.');
  }

  // Winter harvest warning — removing ivy or stored honey in deep winter
  // takes away the colony's emergency reserves.
  if ((_hvstWkInYr >= 44 || _hvstWkInYr <= 8) && (type === 'ivy' || type === 'summer')) {
    msgs.push('Harvesting in deep winter removes stores the colony may need to survive until spring. Only take honey if you are confident the colony has at least 15 kg left in the brood box, and feed fondant immediately after.');
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
  // The drawn comb is returned to the spare equipment pool (one super's worth
  // of drawn frames is more valuable than an empty box — the bees have waxed
  // every cell). Give the player credit for one spare hive to represent the
  // empty-but-drawn super they can reuse next season.
  colony.superHoney = 0;
  var supersRemoved = colony.supers;
  colony.supers = 0;
  if (supersRemoved > 0) {
    Game.inventory.supers = (Game.inventory.supers || 0) + supersRemoved;
  }
  // Keep hiveLayout in sync immediately so the frame cross-section does not
  // show honey-filled supers after a harvest (the weekly sync would fix this
  // next tick, but we render() right after the harvest action).
  if (colony.hiveLayout) colony.hiveLayout.supers = [];
  // QX serves no purpose with no supers — clear it.
  colony.queenExcluder = false;
  // Clearer board is consumed by the harvest — reset for the next cycle.
  colony.clearerFitted = false; colony.clearerFittedWeeks = 0;
  // Sync stack — remove all supers, QX, and clearer board
  if (colony.stack) {
    colony.stack = colony.stack.filter(function(i) {
      return i.type !== 'super' && i.type !== 'queenExcluder' && i.type !== 'clearerBoard';
    });
  }

  // Stats.
  Game.stats.honeyHarvested = _econ_roundPrice((Game.stats.honeyHarvested || 0) + kg);
  if (Game.yearStats) Game.yearStats.honeyKg = _econ_roundPrice((Game.yearStats.honeyKg || 0) + kg);
  colony.productionThisYear = _econ_roundPrice((colony.productionThisYear || 0) + kg);

  /* First-harvest celebration (engagement update) */
  if (Game.flags && Game.flags.seenExplainers && !Game.flags.seenExplainers.firstHarvest) {
    Game.flags.seenExplainers.firstHarvest = true;
    var _hName = (HONEY_TYPES[type] && HONEY_TYPES[type].name) ? HONEY_TYPES[type].name : type;
    if (typeof openModal === 'function') {
      setTimeout(function() {
        openModal({
          title: 'First harvest',
          body: '<p>Those first jars feel different from the bulk crop. ' + _hName + ' from your own bees.</p>' +
                '<p>The colour, the smell — this is what the year\'s work was for. Well done.</p>' +
                '<p>Tip: label your jars with the honey type and harvest date. Customers and show judges both care.</p>'
        });
      }, 400);
    }
  }

  var honeyName = (HONEY_TYPES[type] && HONEY_TYPES[type].name) ? HONEY_TYPES[type].name : type;
  var baseMsg = 'Harvested ' + kg.toFixed(1) + ' kg of ' + honeyName + ' from ' + colony.name + '.';
  if (msgs.length) baseMsg += ' ' + msgs.join(' ');
  if (supersRemoved > 0) {
    baseMsg += ' The super box' + (supersRemoved > 1 ? 'es have' : ' has') +
      ' been returned to your equipment stock — you can put ' +
      (supersRemoved > 1 ? 'them' : 'it') + ' back on next season.';
  }

  logEvent('🍯', baseMsg, 'good');
  toast(kg.toFixed(1) + ' kg of ' + honeyName + ' in the tank.', 'good');

  /* First-harvest varroa reminder — fires once, at the teaching moment */
  if (typeof Game !== 'undefined' && Game.flags && !Game.flags.seenExplainers['harvest_varroa_reminder']) {
    Game.flags.seenExplainers['harvest_varroa_reminder'] = true;
    var _wkInYr2 = ((Game.week - 1) % 52) + 1;
    if (_wkInYr2 >= 28 && _wkInYr2 <= 44) {
      Game.advisor = Game.advisor || [];
      Game.advisor.push({
        tone: 'warn',
        text: 'Honey is off. Treat for varroa now — winter bees are being raised and mite damage is invisible until colonies collapse in January.',
      });
    }
  }

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
    /* Edge 4 fix — cap honeyKg to physical maximum: a National super holds at most
       SIM.honeyPerSuper (18 kg extracted). An overfull value (e.g. from direct state
       manipulation or a migration bug) would yield impossible harvest numbers. */
    superKg = Math.min(layout.supers[superIdx].honeyKg || 0, SIM.honeyPerSuper);
    type = layout.supers[superIdx].honeyType || type;
    /* Also correct the stored value so the layout stays consistent */
    layout.supers[superIdx].honeyKg = superKg;
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
  colony.clearerFitted = false; colony.clearerFittedWeeks = 0;

  /* Cappings wax */
  Game.inventory.wax = _econ_roundPrice((Game.inventory.wax || 0) + _econ_roundPrice(kg * 0.013));

  /* Move honey to inventory */
  _econ_ensureKey(Game.inventory.honey, type, 0);
  Game.inventory.honey[type] = _econ_roundPrice(Game.inventory.honey[type] + kg);

  /* Stats */
  Game.stats.honeyHarvested = _econ_roundPrice((Game.stats.honeyHarvested || 0) + kg);
  if (Game.yearStats) Game.yearStats.honeyKg = _econ_roundPrice((Game.yearStats.honeyKg || 0) + kg);
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
    sup._prevHoneyKg = 0; /* reset tracking so honeyType is re-stamped on next refill */
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
  var removedType = 'summer';
  if (colony.hiveLayout && colony.hiveLayout.supers && colony.hiveLayout.supers[idx]) {
    removedKg  = colony.hiveLayout.supers[idx].honeyKg  || 0;
    removedType = colony.hiveLayout.supers[idx].honeyType || 'summer';
    colony.hiveLayout.supers.splice(idx, 1);
  } else if (colony.supers > 0) {
    removedKg = colony.superHoney / Math.max(colony.supers, 1);
    removedType = colony.superHoneyType || 'summer';
  }
  /* Credit residual honey to inventory rather than destroying it */
  if (removedKg > 0) {
    _econ_ensureKey(Game.inventory.honey, removedType, 0);
    Game.inventory.honey[removedType] = _econ_roundPrice(Game.inventory.honey[removedType] + removedKg);
    logEvent('📦', 'Residual ' + removedKg.toFixed(2) + ' kg of honey from the removed super added to your bulk tank.', 'plain');
  }
  colony.superHoney = Math.max(0, _econ_roundPrice((colony.superHoney || 0) - removedKg));
  colony.supers = Math.max(0, (colony.supers || 1) - 1);

  /* Remove the corresponding super item from the stack */
  if (colony.stack) {
    var _superItems = colony.stack.filter(function(i) { return i.type === 'super'; });
    var _removeId = _superItems.length > 0 ? _superItems[_superItems.length - 1].id : null;
    if (_removeId) {
      colony.stack = colony.stack.filter(function(i) { return i.id !== _removeId; });
    }
  }

  if (colony.supers === 0) {
    colony.superHoney = 0;
    /* QX has no function without supers — remove it from stack and return to inventory */
    if (colony.queenExcluder) {
      colony.queenExcluder = false;
      if (colony.stack) {
        var _hadQX = colony.stack.some(function(i) { return i.type === 'queenExcluder'; });
        colony.stack = colony.stack.filter(function(i) { return i.type !== 'queenExcluder'; });
        if (_hadQX && typeof Game !== 'undefined' && Game && Game.inventory) {
          Game.inventory.queenExcluders = (Game.inventory.queenExcluders || 0) + 1;
        }
      }
    }
    if (colony.clearerFitted) {
      colony.clearerFitted = false; colony.clearerFittedWeeks = 0;
      if (colony.stack) colony.stack = colony.stack.filter(function(i) { return i.type !== 'clearerBoard'; });
    }
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
  // For heather honey, bulk stock needed is kgNeeded / 0.70 (30% pressing loss).
  var kgStockNeeded = (honeyType === 'heather')
    ? _econ_roundPrice(kgNeeded / 0.70)
    : kgNeeded;
  if (Game.inventory.honey[honeyType] < kgStockNeeded) {
    var available = (honeyType === 'heather')
      ? Math.floor(Game.inventory.honey[honeyType] * 0.70 / KG_PER_JAR)
      : Math.floor(Game.inventory.honey[honeyType] / KG_PER_JAR);
    var availNote = (honeyType === 'heather') ? ' (after ~30% pressing loss)' : '';
    return {
      ok: false,
      msg: 'You only have ' + Game.inventory.honey[honeyType].toFixed(2) + ' kg of that honey — enough for about ' + available + ' jar' + (available === 1 ? '' : 's') + availNote + '.'
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

  // Heather honey is thixotropic — pressing loses ~30% vs centrifuge.
  // kgNeeded is the theoretical amount for jarCount jars at full yield.
  // We deduct MORE bulk honey (kgNeeded / 0.70) to account for press waste,
  // while the jar count stays the same — you are paying in lost bulk honey.
  var heatherPressLoss = 0;
  var kgToDeduct = kgNeeded;
  if (isHeather) {
    kgToDeduct       = _econ_roundPrice(kgNeeded / 0.70); // bulk needed before 30% press loss
    heatherPressLoss = _econ_roundPrice(kgToDeduct - kgNeeded);
    // Re-check bulk stock after recalculating the true deduction.
    if (Game.inventory.honey[honeyType] < kgToDeduct) {
      var availJars = Math.floor(Game.inventory.honey[honeyType] * 0.70 / KG_PER_JAR);
      return {
        ok: false,
        msg: 'After pressing losses (~30% for heather honey) you only have enough for about ' + availJars + ' jar' + (availJars === 1 ? '' : 's') + '.'
      };
    }
  }

  if (!Game.inventory.tools.extractor) {
    if (isHeather) {
      // Heather honey is thixotropic — it must be pressed, not spun.
      msgs.push('Heather honey cannot be spun in a conventional extractor; it must be pressed. The association\'s press costs the same hire fee. Pressing loses about 30% — ' + heatherPressLoss.toFixed(2) + ' kg stays in the comb as residue.');
    } else {
      msgs.push('You hired the association extractor for ' + fmtMoney(COSTS.extractorHire) + '.');
    }
    extraCost += COSTS.extractorHire;
  } else if (isHeather) {
    msgs.push('Heather honey is thixotropic and must be pressed rather than spun. About 30% stays in the comb (' + heatherPressLoss.toFixed(2) + ' kg lost) — this is normal for pressed heather honey.');
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
  // For heather, kgToDeduct > kgNeeded — the extra goes as pressing waste.
  Game.inventory.honey[honeyType] = _econ_roundPrice(Game.inventory.honey[honeyType] - kgToDeduct);
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
function _econ_seasonalPriceMult(week) {
  var wkInYr = ((week - 1) % 52) + 1;
  if (wkInYr >= 44 || wkInYr <= 4) return 1.25;   // Nov-Jan: Christmas premium
  if (wkInYr >= 5 && wkInYr <= 8)  return 1.15;   // Feb: Valentine's / early year
  return 1.0;
}

function marketPrice(honeyType, channelId) {
  var honeyData   = HONEY_TYPES[honeyType];
  var channelData = SALES[channelId];
  if (!honeyData || !channelData) return 0;

  // Base: honey face value * channel multiplier * small reputation premium.
  // yearQuality (0.5-0.75) shifts price ±15%: good years = slightly lower prices (bumper crop)
  var _yq = (typeof Game !== 'undefined' && Game.yearQuality != null) ? Game.yearQuality : 0.65;
  var _yearMul = 0.925 + _yq * 0.15; // 0.925..1.04 → bad year premium, good year slight discount
  var _wk = (typeof Game !== 'undefined' && Game) ? Game.week : 14;
  var _seasonMul = _econ_seasonalPriceMult(_wk);
  var price = honeyData.value * channelData.priceMul * (1 + Game.reputation / 200) * _yearMul * _seasonMul;
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

/* ====================================================================
   CANDLES — winter workshop product
   ==================================================================== */

function makeCandles(batches) {
  batches = Math.max(1, Math.floor(batches || 1));
  var waxNeeded = batches * CANDLE_WAX_PER_BATCH;
  if ((Game.inventory.wax || 0) < waxNeeded) {
    return { ok: false, msg: 'You only have ' + (Game.inventory.wax || 0).toFixed(2) + ' kg of wax. Each batch of ' + CANDLES_PER_BATCH + ' candles needs ' + CANDLE_WAX_PER_BATCH + ' kg.' };
  }
  var wkInYr = ((Game.week - 1) % 52) + 1;
  if (wkInYr > 8 && wkInYr < 42) {
    return { ok: false, msg: 'Candle-making is a winter workshop activity — come back in October when the season winds down.' };
  }
  Game.inventory.wax = Math.round((Game.inventory.wax - waxNeeded) * 100) / 100;
  var made = batches * CANDLES_PER_BATCH;
  Game.inventory.candles = (Game.inventory.candles || 0) + made;
  if (typeof addXp === 'function') addXp(2 * batches);
  logEvent('🕯️', 'Made ' + made + ' beeswax candles from ' + waxNeeded.toFixed(2) + ' kg of cappings wax. Worth ' + fmtMoney(made * CANDLE_PRICE) + ' to sell.', 'good');

  /* First-time explainer */
  if (Game.flags && Game.flags.seenExplainers && !Game.flags.seenExplainers.firstCandles) {
    Game.flags.seenExplainers.firstCandles = true;
  }
  return { ok: true, msg: made + ' candles made.' };
}

function sellCandles(count) {
  count = Math.min(count, Game.inventory.candles || 0);
  if (count < 1) return { ok: false, msg: 'No candles in stock.' };
  var income = Math.round(count * CANDLE_PRICE * 100) / 100;
  earn(income, 'Candle sales — ' + count + ' beeswax candle' + (count === 1 ? '' : 's'));
  Game.inventory.candles -= count;
  Game.reputation = Math.min(100, (Game.reputation || 0) + Math.max(0.3, 1 - (Game.reputation || 0) / 120));
  logEvent('🕯️', 'Sold ' + count + ' candle' + (count === 1 ? '' : 's') + ' for ' + fmtMoney(income) + '.', 'good');
  return { ok: true, income: income };
}

/* ====================================================================
   HONEY SHOW — county competition
   ==================================================================== */

function enterHoneyShow(types) {
  types = (types || []).slice(0, 3);
  if (!types.length) { if (typeof closeModal === 'function') closeModal(); return; }

  function _randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

  var judgeComments = {
    high: [
      'Exceptional clarity — the judge held it to the light for a long time.',
      'A beautifully presented entry. The colour is spot-on for the variety.',
      'Excellent moisture content, confirmed with the refractometer.'
    ],
    mid: [
      'A solid entry, let down slightly by minor granulation on the shoulder.',
      'Good flavour but the presentation jar had a small air bubble.',
      'Competent work. The colour ran a touch dark for the class.'
    ],
    low: [
      'The moisture level was concerning — at risk of fermentation.',
      'Granulation had progressed too far before extraction.',
      'Presentation jar was underfilled — judges notice that.'
    ]
  };

  var results = types.map(function(type) {
    var score = 45;
    if (Game.inventory.tools && Game.inventory.tools.settlingTank) score += _randInt(8, 20);
    if (Game.inventory.tools && Game.inventory.tools.refractometer) score += _randInt(5, 15);
    score += Math.floor((Game.reputation || 0) / 12);
    score += _randInt(-12, 18);
    if (type === 'heather' || type === 'lime') score += 8;
    score = Math.min(100, Math.max(10, score));

    var award = score >= 80 ? 'First' : score >= 65 ? 'Second' : score >= 50 ? 'Third' : score >= 38 ? 'Commended' : null;
    var tier  = score >= 65 ? 'high' : score >= 45 ? 'mid' : 'low';
    var comment = judgeComments[tier][_randInt(0, judgeComments[tier].length - 1)];

    if (award === 'First') {
      Game.reputation = Math.min(100, (Game.reputation || 0) + 8);
      if (typeof addXp === 'function') addXp(12);
    } else if (award === 'Second') {
      Game.reputation = Math.min(100, (Game.reputation || 0) + 4);
      if (typeof addXp === 'function') addXp(6);
    } else if (award) {
      if (typeof addXp === 'function') addXp(3);
    }

    /* Deduct 1 jar for entry */
    if (Game.inventory.jars[type] > 0) Game.inventory.jars[type]--;

    return { type: type, score: score, award: award, comment: comment };
  });

  /* Store ribbons */
  if (!Game.flags.honeyShowRibbons) Game.flags.honeyShowRibbons = [];
  var yr = (typeof gameYear === 'function') ? gameYear() : 1;
  results.forEach(function(r) {
    if (r.award) Game.flags.honeyShowRibbons.push({ year: yr, type: r.type, award: r.award });
  });
  if (!Game.stats) Game.stats = {};
  Game.stats.showWins = (Game.stats.showWins || 0) + results.filter(function(r) { return r.award === 'First'; }).length;
  Game.flags['showEntered_yr' + yr] = true;

  var honeyNames = { spring: 'Spring Blossom', summer: 'Summer Honey', heather: 'Heather', lime: 'Lime', oilseed: 'OSR', ivy: 'Ivy' };
  var bodyHtml = results.map(function(r) {
    var name = honeyNames[r.type] || r.type;
    var awardHtml = r.award ? '<strong>' + r.award + ' Prize</strong>' : 'No award';
    return '<p><em>' + name + '</em> — ' + awardHtml + '. ' + r.comment + '</p>';
  }).join('');

  if (!results.some(function(r) { return r.award; })) {
    bodyHtml += '<p>A hard day — but you know what to work on before next year.</p>';
  }

  logEvent('🏆', 'Honey show results in — ' + results.filter(function(r) { return r.award; }).length + ' award(s) from ' + types.length + ' entr' + (types.length === 1 ? 'y' : 'ies') + '.',
    results.some(function(r){ return r.award; }) ? 'good' : 'plain');

  if (typeof openModal === 'function') openModal({ title: 'Honey Show Results', body: bodyHtml });
  if (typeof saveGame === 'function') saveGame();
  if (typeof render === 'function') render();
}

/* Expose to window so UI callbacks can invoke from inline HTML */
if (typeof window !== 'undefined') {
  window.enterHoneyShow = enterHoneyShow;
  window.makeCandles    = makeCandles;
  window.sellCandles    = sellCandles;
}
