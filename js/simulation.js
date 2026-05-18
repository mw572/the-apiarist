/* ====================================================================
   THE APIARIST — simulation.js
   World engine: time, weather, world events, the advisor.
   Loaded after colony.js, before economy.js.
   ==================================================================== */

/* ---- Private state -------------------------------------------------- */

// Tracks which apiaries currently have Asian hornet pressure, and for
// how many weeks it will persist.  { apiaryId -> weeksRemaining }
var _sim_hornetApiaries = {};

// Count of absolute game-years elapsed (used to detect year boundaries).
var _sim_yearsPlayed = 0;

// Consecutive weeks of wet or storm weather within the same season.
// Used to detect a prolonged summer wet spell (4+ weeks wks 24-34)
// and fire the summer dearth explainer.
var _sim_wetStreak = 0;

/* ====================================================================
   generateWeather() -> string
   Pick a weather type for the current week, tilted by yearQuality and
   diff().weatherKindness.  Sets Game.weatherType and returns the key.

   Week-specific modifiers applied on top of the seasonal base table:
   - Weeks 21-24 (June gap): wet and cool boosted; fine/mixed/heatwave cut.
     The OSR flow is over and clover/bramble haven't opened — UK June is
     frequently cool and unsettled.
   - Weeks 9-13 (late-winter/early-spring): cold weight boosted.
     A UK spring has cold snaps; bees can fly one week and be confined the
     next, producing the variability real beekeepers know.
   - Weeks 44-52 and 1-8 (Nov-Feb / deep winter): inspectable types
     (fine, mixed) further reduced so inspect:true weeks are rare but
     still possible in a genuine mild spell.
   ==================================================================== */
function generateWeather() {
  var season   = seasonOfWeek(Game.week);
  var wkInYear = ((Game.week - 1) % 52) + 1;   // 1..52
  var base     = WEATHER_TABLE[season];
  var quality  = Game.yearQuality;         // 0..1
  var kindness = diff().weatherKindness;   // 0..1 (higher = kinder)

  // Combined "niceness" factor 0..1
  var nice = quality * 0.6 + kindness * 0.4;

  // Build tilted weights.  Fine/mixed gain weight in a good/kind year;
  // wet/cold/storm gain weight in a bad/harsh year.
  var weights = {};
  for (var key in base) {
    var w = base[key];
    if (key === 'fine' || key === 'mixed') {
      w = w * (0.7 + nice * 0.9);          // up to +90 % boost
    } else if (key === 'wet' || key === 'cold' || key === 'storm') {
      w = w * (1.5 - nice * 1.0);          // shrinks as year is kinder
    } else if (key === 'heatwave') {
      // heatwaves are slightly rarer in a bad year but still possible
      w = w * (0.6 + nice * 0.8);
    }
    weights[key] = Math.max(0, w);
  }

  // ---- Week-specific modifiers ----------------------------------------

  // June gap (wks 21-24): cool and unsettled; the OSR flow is over and
  // the summer flow has not yet opened.  Boost wet/cool; cut fine/heatwave.
  if (wkInYear >= 21 && wkInYear <= 24) {
    weights.wet      = (weights.wet      || 0) * 1.55;
    weights.cool     = (weights.cool     || 0) * 1.40;
    weights.storm    = (weights.storm    || 0) * 1.25;
    weights.fine     = (weights.fine     || 0) * 0.55;
    weights.mixed    = (weights.mixed    || 0) * 0.70;
    weights.heatwave = (weights.heatwave || 0) * 0.30;
  }

  // Late winter / early spring (wks 9-13): cold snap risk.
  // UK spring regularly has frost into May.
  if (wkInYear >= 9 && wkInYear <= 13) {
    weights.cold  = (weights.cold  || 0) * 1.45;
    weights.cool  = (weights.cool  || 0) * 1.20;
    weights.fine  = (weights.fine  || 0) * 0.80;
  }

  // Deep winter (wks 44-52 and 1-8): further reduce inspectable types.
  // fine and mixed can still occur in a mild spell but should be uncommon.
  if (wkInYear >= 44 || wkInYear <= 8) {
    weights.fine  = (weights.fine  || 0) * 0.60;
    weights.mixed = (weights.mixed || 0) * 0.65;
    weights.cold  = (weights.cold  || 0) * 1.20;
  }

  // Clamp all weights
  for (var key in weights) weights[key] = Math.max(0, weights[key]);

  // Weighted random pick
  var total = 0;
  for (var k in weights) total += weights[k];
  var r = Math.random() * total;
  var chosen = 'mixed'; // fallback
  for (var k in weights) {
    r -= weights[k];
    if (r <= 0) { chosen = k; break; }
  }

  // ---- Wet-streak tracker for summer dearth detection -----------------
  // Count consecutive wet/storm weeks.  The summer wet-spell event is
  // surfaced in runWeek() when _sim_wetStreak reaches 4 in wks 24-34.
  if (chosen === 'wet' || chosen === 'storm') {
    _sim_wetStreak++;
  } else {
    _sim_wetStreak = 0;
  }

  Game.weatherType = chosen;
  return chosen;
}

/* ====================================================================
   runWeek() -> [presentable]
   Advances game by one week, drives all simulation, returns presentables
   for game.js to display.
   ==================================================================== */
function runWeek() {
  var presentables = [];

  /* 1. Advance week --------------------------------------------------- */
  Game.week++;
  var week = Game.week;

  /* 2. Year boundary -------------------------------------------------- */
  // (Game.week-1) % 52 === 0 means we have just entered a new game-year
  // (week 53 is year 2 start, etc.)
  if ((week - 1) % 52 === 0) {
    // Roll fresh year quality: biased beta-like distribution so we get
    // some genuinely good and some genuinely bad years, not just middle.
    var r1 = Math.random(), r2 = Math.random();
    // Average of three randoms then push toward extremes
    var base = (r1 + r2 + Math.random()) / 3;
    // Skew away from dead-centre to ensure variety
    if (base > 0.4 && base < 0.6) {
      base = base < 0.5 ? 0.4 - Math.random() * 0.25 : 0.6 + Math.random() * 0.25;
    }
    Game.yearQuality = Math.max(0, Math.min(1, base));

    // Reset per-year colony fields
    for (var i = 0; i < Game.colonies.length; i++) {
      var c = Game.colonies[i];
      if (c.alive) {
        c.swarmedThisYear    = false;
        c.productionThisYear = 0;
      }
    }

    _sim_yearsPlayed++;
  }

  /* 3. Weather -------------------------------------------------------- */
  var weatherKey = generateWeather();
  var weatherBase = WEATHER[weatherKey];
  var weatherCtx  = {
    type    : weatherKey,
    label   : weatherBase.label,
    icon    : weatherBase.icon,
    fly     : weatherBase.fly,
    inspect : weatherBase.inspect,
    warmth  : weatherBase.warmth,
    tempC   : weatherBase.tempC,    // actual °C for treatment temperature checks
  };
  if (weatherBase.hazard) weatherCtx.hazard = weatherBase.hazard;

  /* 4 & 5. Colony updates + event resolution -------------------------- */

  // Build a flat list of alive colonies with their apiary for world events
  var alive = [];
  for (var ai = 0; ai < Game.apiaries.length; ai++) {
    var apiary    = Game.apiaries[ai];
    var site      = SITE_TYPES[apiary.siteType] || SITE_TYPES['rural'];
    var siteType  = apiary.siteType;
    var season    = seasonOfWeek(week);
    var year      = gameYear();
    var d         = diff();
    var wkInYear  = ((week - 1) % 52) + 1;  // 1..52

    // Forage for this apiary
    var nectarBase  = forageNectar(week);
    var pollenBase  = foragePollen(week);

    // Site-specific forage boosts
    var nectarSite = nectarBase * site.nectar;
    var pollenSite = pollenBase * site.pollen;

    // Spring crop bonus (farmland oilseed weeks 14-19; orchard blossom weeks 14-18)
    if (site.springCrop === 'oilseed' && wkInYear >= 14 && wkInYear <= 19) {
      nectarSite *= 1.55;
    } else if (site.springCrop === 'spring' && wkInYear >= 14 && wkInYear <= 18) {
      nectarSite *= 1.35;
      pollenSite *= 1.25;
    }

    // Heather moorland August bonus (weeks 31-35 — UK heather peak is late Jul to mid-Aug)
    if (site.heather && wkInYear >= 31 && wkInYear <= 35) {
      nectarSite *= 1.9;
    }

    // Hornet pressure: tick down existing runs, chance of new one
    var apiaryHornetPressure = 0;
    if (_sim_hornetApiaries[apiary.id] && _sim_hornetApiaries[apiary.id] > 0) {
      apiaryHornetPressure = 0.65;
      _sim_hornetApiaries[apiary.id]--;
    } else {
      delete _sim_hornetApiaries[apiary.id];
      // Small chance of new hornet incursion in late summer (weeks 28-42)
      var hornetChance = (wkInYear >= 28 && wkInYear <= 42)
        ? 0.008 * d.waspAggression
        : 0.001;
      if (Math.random() < hornetChance) {
        _sim_hornetApiaries[apiary.id] = 3 + Math.floor(Math.random() * 5); // 3-7 weeks
        apiaryHornetPressure = 0.65;
        // First-occurrence explainer
        if (!Game.flags.seenExplainers['hornet_first']) {
          presentables.push({
            kind  : 'explainer',
            id    : 'hornet_first',
            title : 'Asian Hornet Spotted Nearby',
            body  : '<p>An Asian hornet (<em>Vespa velutina</em>) has been seen near one of your apiaries. This invasive species hawks individual bees at the hive entrance, intercepting returning foragers. Colonies under sustained pressure lose foragers faster than they can replace them.</p><p>You should report sightings to the <strong>Non-native Species Secretariat</strong> (alert.nonnativespecies.org) or use the Asian Hornet Watch app. In the meantime, reducing the hive entrance to a small opening gives your guard bees a fighting chance. Keep a close eye on colonies in affected apiaries over the coming weeks.</p>',
          });
        }
      }
    }

    // Collect colonies for this apiary
    var apiaryColonies = coloniesIn(apiary.id);

    for (var ci = 0; ci < apiaryColonies.length; ci++) {
      var colony = apiaryColonies[ci];
      if (!colony.alive) continue;

      /* ---- Wasp pressure (seasonal curve) --------------------------- */
      // Peaks weeks 32-44, scaled by waspAggression, higher against weak colonies.
      var waspCurve = 0;
      if (wkInYear >= 28 && wkInYear <= 48) {
        // Bell curve peaking around week 38
        var waspPeak = 38;
        var waspDist = Math.abs(wkInYear - waspPeak);
        waspCurve = Math.max(0, 1 - (waspDist / 12));
        waspCurve = Math.pow(waspCurve, 0.7); // flatten slightly
      }
      // Weaker colonies attract more attention
      var weaknessFactor = 1.0;
      if (colony.population < 5000)  weaknessFactor = 1.45;
      else if (colony.population < 10000) weaknessFactor = 1.2;
      // Good year = fewer wasps
      var yearFactor = 0.65 + (1 - Game.yearQuality) * 0.7;

      colony.waspPressure = Math.min(1, waspCurve * d.waspAggression * weaknessFactor * yearFactor);

      /* ---- Asian hornet -------------------------------------------- */
      colony.hornet = apiaryHornetPressure;

      /* ---- Build ctx and update colony ------------------------------ */
      var ctx = {
        week    : week,
        year    : year,
        season  : season,
        weather : weatherCtx,
        nectar  : nectarSite,
        pollen  : pollenSite,
        site    : site,
        siteType: siteType,
        diff    : d,
      };

      var events = colonyWeeklyUpdate(colony, ctx);

      /* ---- Sync visual frame layout with new colony state ----------- */
      colonyWeeklyLayoutSync(colony);

      /* ---- Resolve events ------------------------------------------ */
      for (var ei = 0; ei < events.length; ei++) {
        var ev = events[ei];
        presentables = presentables.concat(
          _sim_resolveEvent(ev, week)
        );
      }

      /* ---- Track production ---------------------------------------- */
      // colonyWeeklyUpdate may have added to productionThisYear; nothing
      // extra to do here as colony.js owns that field.

      alive.push({ colony: colony, apiary: apiary, site: site, siteType: siteType });
    }
  }

  /* 6. World events (after all colony updates) ----------------------- */

  // Group alive colonies by apiary for inter-colony events
  var byApiary = {};
  for (var i = 0; i < alive.length; i++) {
    var rec = alive[i];
    var aid = rec.apiary.id;
    if (!byApiary[aid]) byApiary[aid] = { apiary: rec.apiary, site: rec.site, siteType: rec.siteType, colonies: [] };
    byApiary[aid].colonies.push(rec.colony);
  }

  for (var aid in byApiary) {
    var group     = byApiary[aid];
    var apiary    = group.apiary;
    var site      = group.site;
    var siteType  = group.siteType;
    var cols      = group.colonies;
    var season    = seasonOfWeek(week);
    var wkInYear  = ((week - 1) % 52) + 1;
    var d         = diff();
    var nectarBase = forageNectar(week);

    /* ---- Pesticide spray ------------------------------------------ */
    // Farmland and orchard sites, spring-summer (weeks 13-30)
    if ((siteType === 'farmland' || siteType === 'orchard') &&
        wkInYear >= 13 && wkInYear <= 30) {
      var sprayChance = (site.spray || 0) / 52 * 4; // weekly chance
      if (Math.random() < sprayChance) {
        // A spray hit kills a chunk of foragers in each colony
        for (var ci = 0; ci < cols.length; ci++) {
          var col = cols[ci];
          var lost = Math.floor(col.population * (0.12 + Math.random() * 0.18));
          col.population = Math.max(0, col.population - lost);
          logEvent('🚜', 'A pesticide spray near ' + apiary.name + ' killed around ' + lost +
            ' foragers from ' + col.name + '.', 'bad');
          presentables.push({
            kind: 'toast',
            text: 'Spray drift at ' + apiary.name + ' hit ' + col.name + '.',
            tone: 'bad',
          });
        }
      }
    }

    /* ---- Robbing (nectar dearth) ---------------------------------- */
    // In a dearth a strong colony may rob a very weak one in the same apiary.
    var isDearth = nectarBase < 0.22 && (wkInYear < 14 || wkInYear > 42 ||
                   (wkInYear >= 21 && wkInYear <= 24));
    if (isDearth && cols.length >= 2) {
      // Sort: strongest first, weakest last
      var sortedCols = cols.slice().sort(function(a, b) { return b.population - a.population; });
      var strong = sortedCols[0];
      var weak   = sortedCols[sortedCols.length - 1];
      if (strong !== weak &&
          strong.population > 15000 &&
          weak.population   < 6000 &&
          Math.random() < 0.18) {
        // Move stores from weak to strong
        var stolen = Math.min(weak.honey, 0.4 + Math.random() * 0.8);
        weak.honey   = Math.max(0, weak.honey - stolen);
        strong.honey = Math.min(SIM.broodBoxStoreCap, strong.honey + stolen * 0.7);

        logEvent('⚠️', strong.name + ' is robbing ' + weak.name +
          '. The weaker colony has lost some of its stores.', 'bad');
        presentables.push({
          kind: 'toast',
          text: strong.name + ' is robbing ' + weak.name + '. Reduce the entrance.',
          tone: 'bad',
        });

        /* Disease spread via robbing */
        var diseaseKeys = Object.keys(weak.diseases);
        for (var di = 0; di < diseaseKeys.length; di++) {
          var dk = diseaseKeys[di];
          if (weak.diseases[dk] > 0.25 && Math.random() < 0.30) {
            strong.diseases[dk] = Math.min(1, strong.diseases[dk] + 0.08);
          }
        }
      }
    }

    /* ---- Disease spread in an apiary ------------------------------ */
    // AFB/EFB can drift between colonies via drift/robbing.
    for (var ci = 0; ci < cols.length; ci++) {
      var source = cols[ci];
      if (source.diseases.afb > 0.3 || source.diseases.efb > 0.3) {
        for (var cj = 0; cj < cols.length; cj++) {
          if (ci === cj) continue;
          var target = cols[cj];
          var spreadChance = 0.025 * d.diseaseChance; // low but real
          if (Math.random() < spreadChance) {
            if (source.diseases.afb > 0.3)
              target.diseases.afb = Math.min(1, target.diseases.afb + 0.04);
            if (source.diseases.efb > 0.3)
              target.diseases.efb = Math.min(1, target.diseases.efb + 0.04);
          }
        }
      }
    }

    /* ---- Bait hive swarm catch ------------------------------------ */
    // Swarm season weeks 15-32; requires bait hives in inventory.
    if (Game.inventory.baitHives > 0 && wkInYear >= 15 && wkInYear <= 32) {
      // Base catch chance per bait hive per week: ~4 %
      var catchChance = 0.04 * Game.inventory.baitHives;
      // Higher chance if there are colonies swarming nearby
      if (Math.random() < catchChance) {
        // Find an apiary with space (or use the first one)
        var targetApiary = apiary;
        var swarmCols = coloniesIn(targetApiary.id);
        if (swarmCols.length < 8) { // don't overcrowd
          var newColony = makeColony({
            name     : _sim_uniqueHiveName(),
            apiaryId : targetApiary.id,
            source   : 'caught',
            population: SIM.caughtSwarmPop,
            year     : gameYear(),
          });
          Game.colonies.push(newColony);
          Game.inventory.baitHives = Math.max(0, Game.inventory.baitHives - 1);
          Game.stats.swarmsCaught++;
          logEvent('🎣', 'A swarm moved into one of your bait hives at ' + targetApiary.name +
            ' and is now hived as ' + newColony.name + '.', 'good');
          presentables.push({
            kind: 'toast',
            text: 'A swarm has taken to your bait hive at ' + targetApiary.name +
              '. Meet ' + newColony.name + '.',
            tone: 'good',
          });
        }
      }
    }
  }

  /* 6b. Prolonged summer wet spell ----------------------------------- */
  // A run of 4+ consecutive wet/storm weeks during the summer flow
  // (wks 24-34) is a real UK hazard.  Colonies burn their stores while
  // foragers cannot leave, exactly as they do during a June gap or a
  // cold snap.  Fire a one-time explainer on the 4th consecutive wet week
  // so the player knows to check stores.
  var _wetWk = ((Game.week - 1) % 52) + 1;
  if (_sim_wetStreak === 4 &&
      _wetWk >= 24 && _wetWk <= 34 &&
      aliveColonies().length > 0) {
    logEvent('🌧️', 'Four weeks of wet weather. Bees have been confined and stores are being consumed with no new nectar coming in. Check every colony\'s stores — a prolonged wet spell in midsummer can empty a brood box faster than winter.', 'warn');
    if (!Game.flags.seenExplainers['summer_wet_spell']) {
      presentables.push({
        kind  : 'explainer',
        id    : 'summer_wet_spell',
        title : 'Prolonged Summer Wet Spell',
        body  : '<p>Four weeks of wet weather and your bees have barely left the hive. This is one of the less obvious hazards of UK beekeeping: a prolonged June or July wet spell can empty a brood box as quickly as a hard winter.</p>' +
                '<p>Foragers confined to the hive still feed the colony. The queen may still be laying at full rate. Without incoming nectar, those stores get eaten faster than most beekeepers expect — particularly in a large colony.</p>' +
                '<p><strong>What to do:</strong> Check your stores the moment there is a dry day. If any hive feels light when hefted, feed 1:1 syrup straight away — thin syrup in summer, not the thick 2:1 winter feed. If the weather breaks and a flow starts, take the feeder off before foragers start storing syrup in the supers.</p>' +
                '<p>This is one reason experienced beekeepers check stores not just in autumn but after any extended unsettled spell between May and August.</p>',
      });
    } else {
      presentables.push({
        kind: 'toast',
        text: 'Four weeks of wet weather — check stores in every hive before the colony runs short.',
        tone: 'warn',
      });
    }
  }

  /* 7. Advisor -------------------------------------------------------- */
  buildAdvisor();

  /* 8. Week honey summary — brief toast when there is a meaningful flow */
  (function() {
    var totalSuper = 0;
    var aliveCount = 0;
    var cols = Game.colonies || [];
    for (var ci = 0; ci < cols.length; ci++) {
      if (cols[ci].alive) {
        totalSuper += cols[ci].superHoney || 0;
        aliveCount++;
      }
    }
    var weekHoneyGained = totalSuper - (Game._lastWeekSuperHoney || 0);
    Game._lastWeekSuperHoney = totalSuper;
    // Only notify during active flow periods (spring through autumn)
    var wkInYear = ((week - 1) % 52) + 1;
    var inFlow = wkInYear >= 14 && wkInYear <= 38;
    if (inFlow && weekHoneyGained >= 0.5 && aliveCount > 0) {
      var kgStr = weekHoneyGained.toFixed(1);
      presentables.unshift({
        kind: 'toast',
        text: '🍯 ' + kgStr + ' kg gained this week (' + totalSuper.toFixed(1) + ' kg total in supers)',
        tone: 'good',
      });
    }
  })();

  /* 9. Return presentables ------------------------------------------ */
  return presentables;
}

/* ====================================================================
   _sim_resolveEvent(ev, week) -> [presentable]
   Maps a colony event to log entries and presentable objects.
   ==================================================================== */
function _sim_resolveEvent(ev, week) {
  var out = [];
  var colony = ev.colony;

  switch (ev.type) {

    case 'died':
      Game.stats.coloniesLost++;
      var reason = ev.reason || 'unknown cause';
      logEvent('💀', colony.name + ' has died (' + reason + ').', 'bad');
      /* Push a persistent advisor item so the nav pip fires and the player notices */
      Game.advisor = Game.advisor || [];
      Game.advisor.push({ text: colony.name + ' has died — ' + reason + '.', tone: 'bad' });

      /* XP: real beekeepers say you learn more from a dead colony than a live one.
         5 "lesson learned" XP — small, but it acknowledges that failure teaches.
         The explainer below reinforces this by prompting a post-mortem inspection. */
      addXp(5);

      if (!Game.flags.seenExplainers['colony_death_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'colony_death_first',
          title : 'A Colony Has Been Lost',
          body  : '<p><strong>' + colony.name + '</strong> has died. Losing a colony is part of beekeeping, but it is worth understanding why so you can prevent it happening again.</p>' +
                  '<p>Common causes: starvation (too little honey in the brood box over winter or through the June gap), varroa and the viruses it spreads, a failed or missing queen, or a disease that went undetected. ' +
                  'Regular inspections and a simple hefting routine in autumn give you the best chance of catching problems while you can still do something.</p>' +
                  '<p>Leave the hive sealed for a week, then inspect carefully. If disease is suspected, do not reuse the comb without advice from your local bee inspector.</p>',
        });
      } else {
        out.push({
          kind : 'modal',
          title: colony.name + ' has died',
          body : '<p><strong>' + colony.name + '</strong> has been lost.</p>' +
                 '<p><strong>Cause:</strong> ' + reason + '.</p>' +
                 '<p>Inspect the hive in the next week or two before clearing it out — ' +
                 'understanding the cause helps you prevent it next time.</p>',
        });
      }
      break;

    case 'swarm':
      Game.stats.swarmsLost++;
      var _noBaitHive = (Game.inventory.baitHives === 0);
      var _swarmLogMsg = colony.name + ' has swarmed. A prime swarm has left the hive.';
      if (_noBaitHive) {
        _swarmLogMsg += ' You had no bait hive set out — the swarm is gone for good.';
      }
      logEvent('🐝', _swarmLogMsg, 'bad');

      if (!Game.flags.seenExplainers['swarm_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'swarm_first',
          title : 'Your First Swarm',
          body  : '<p><strong>' + colony.name + '</strong> has swarmed. The old queen and roughly half the workers have left in a swarm, looking for a new home. It is natural, but it means you have lost a lot of bees and much of this year\'s honey crop from this hive.</p>' +
                  '<p>The colony left behind has queen cells. Leave the strongest one and destroy the rest, or use one for a split. ' +
                  'The virgin queen will emerge, fly to mate, and begin laying in around three weeks.</p>' +
                  '<p>To prevent swarming: inspect every seven to nine days during swarm season (April to June), add space before the colony feels cramped, and remove queen cells promptly if you do not want a swarm. ' +
                  'An artificial swarm is the most reliable control method once cells are found.</p>' +
                  (_noBaitHive ? '<p><strong>Tip:</strong> A bait hive — an empty box with an old frame or two of dark comb, placed a few metres away — gives a swarm somewhere to land and gives you a chance to re-hive it. Without one, a swarm is simply lost.</p>' : ''),
        });
      } else if (_noBaitHive && !Game.flags.seenExplainers['swarm_lost_no_bait']) {
        // One-time educational message: this swarm was lost because there was no bait hive
        out.push({
          kind  : 'explainer',
          id    : 'swarm_lost_no_bait',
          title : 'Swarm Lost — No Bait Hive',
          body  : '<p>The swarm from <strong>' + colony.name + '</strong> has gone. Without a bait hive nearby it had nowhere obvious to land and has moved on — probably into a tree cavity somewhere in the neighbourhood.</p>' +
                  '<p>A bait hive is a cheap insurance policy. An old brood box with one or two frames of dark drawn comb, a handful of lemongrass oil or Nasonov pheromone on a cotton pad, and an entrance reduced to about 10 cm is all it takes. Set it out from late April and check it every couple of weeks. A caught swarm is free bees — though always treat them as an unknown varroa risk until you have run a wash.</p>' +
                  '<p>You can buy bait hives from the market, or use a spare hive from your equipment.</p>',
        });
      } else {
        out.push({
          kind: 'toast',
          text: colony.name + ' has swarmed.' + (_noBaitHive ? ' No bait hive — swarm is lost.' : ''),
          tone: 'bad',
        });
      }
      break;

    case 'swarmAborted':
      logEvent('✂️', colony.name + ': the queen tried to leave but her clipped wing stopped her. The swarm milled outside and returned. Queen cells are still capped — the first virgin will emerge next week and CAN fly. You have one week to act.', 'warn');
      out.push({
        kind: 'toast',
        text: colony.name + ': swarm aborted by clipping — but cells are still live. Virgin emerges next week. Act now.',
        tone: 'warn',
      });
      break;

    case 'castSwarm':
      Game.stats.swarmsLost = (Game.stats.swarmsLost || 0) + 1;
      logEvent('🐝', colony.name + ': a cast swarm has left — a virgin queen led a secondary swarm from the cells. The colony is now significantly weaker.', 'bad');
      out.push({
        kind: 'toast',
        text: colony.name + ': cast swarm issued. Colony has lost further bees.',
        tone: 'bad',
      });
      break;

    case 'demareeUnchecked':
      logEvent('⚠️', colony.name + ': you missed the Demaree 7-day check. The top box has raised emergency queen cells — deal with these now or the colony may cast.', 'warn');
      out.push({
        kind: 'toast',
        text: colony.name + ': Demaree check overdue — emergency cells in top box.',
        tone: 'warn',
      });
      break;

    case 'demareeComplete':
      logEvent('✅', colony.name + ': Demaree complete — top brood has all emerged. The colony is fully intact and the extra box is now stores.', 'good');
      out.push({ kind: 'toast', text: colony.name + ': Demaree complete. Top box ready to remove.', tone: 'good' });
      break;

    // FIX (Issue E): added osrWarning event — fires one week post-flow while
    // honey is still extractable. osrCrystal fires a week later when it has set.
    case 'osrWarning':
      logEvent('🍯', colony.name + ': the OSR flow has ended and the honey is at risk of crystallising in the comb. OSR honey sets rock-hard within 10-14 days of the flow ending. Harvest within the next week before it is ruined.', 'warn');
      out.push({
        kind: 'toast',
        text: colony.name + ': OSR flow ended — harvest within 1 week before honey sets in the comb.',
        tone: 'warn',
      });
      break;

    case 'osrCrystal':
      logEvent('🍯', colony.name + ': your oilseed rape honey is crystallising in the comb. OSR honey sets like concrete — it cannot be extracted by centrifuge once set. Extract immediately or most of this crop will be lost.', 'bad');
      out.push({
        kind: 'toast',
        text: colony.name + ': OSR honey setting in comb — extract NOW or most is lost.',
        tone: 'bad',
      });
      // First-time explainer teaching the OSR crystallisation mechanic
      if (!Game.flags.seenExplainers['osr_crystal_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'osr_crystal_first',
          title : 'Oilseed Rape Honey — A Race Against Time',
          body  : '<p><strong>Oilseed rape honey crystallises faster than any other common UK honey.</strong> Its high glucose content (~30%) means it begins to set in the comb within 10-14 days of the flow ending.</p>' +
                  '<p>Once crystallised in the comb it sets like concrete. Bees cannot uncap or move it. In supers it cannot be extracted by centrifuge — it must be cut out or the frames warmed. In the brood box it blocks cells the queen needs for laying.</p>' +
                  '<p><strong>The rule with OSR:</strong> as soon as you see the flow is ending (late May on farmland sites), inspect the supers immediately and harvest any capped OSR honey within the next 7-10 days. Do not wait for the super to be fully capped.</p>' +
                  '<p>You can tell OSR honey in the comb: it looks white or very pale cream rather than golden, and the frames feel unusually heavy for their state of cappings.</p>',
        });
      }
      break;

    case 'osrBroodCrystal':
      // Issue D: OSR honey has crystallised in the brood box
      logEvent('🍯', colony.name + ': oilseed rape honey has crystallised inside the brood box. The queen cannot lay in those cells until the frames are cleared. This will restrict brood space and increase swarm pressure. Warm the frames gently or remove and cut out the set comb.', 'bad');
      out.push({
        kind: 'toast',
        text: colony.name + ': OSR set in brood box — queen space blocked.',
        tone: 'bad',
      });
      break;

    case 'starved':
      logEvent('⚠️', colony.name + ' is dangerously short of stores and showing signs of starvation.', 'bad');
      out.push({
        kind: 'toast',
        text: colony.name + ' is starving. Feed immediately.',
        tone: 'bad',
      });
      break;

    case 'low_winter_stores':
      // Autumn stores below winter safe minimum — fired during feeding window (Sep-Oct)
      var _storesKg = ev.honey != null ? ev.honey.toFixed(1) : '?';
      logEvent('🍯', colony.name + ' has only ' + _storesKg + ' kg in the brood box — below the 18 kg safe minimum for winter. Feed 2:1 syrup now.', 'bad');
      if (!Game.flags.seenExplainers['low_winter_stores_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'low_winter_stores_first',
          title : 'Winter Stores Warning',
          body  : '<p><strong>' + colony.name + '</strong> has fewer than 18 kg of stores going into winter — the standard UK minimum a colony needs to survive until spring forage starts in March.</p>' +
                  '<p>Feed <strong>2:1 sugar syrup</strong> (2 kg sugar to 1 litre water) now, while the weather is still warm enough for the bees to take it down and convert it to stores. Stop when the hive feels reassuringly heavy when hefted from behind, or when night temperatures consistently drop below about 10°C — cold bees cannot process syrup.</p>' +
                  '<p>If you miss the syrup window, <strong>fondant</strong> placed directly on the top bars in January or February can save a starving colony — bees can reach it even in a tight cluster without breaking formation.</p>',
        });
      } else {
        out.push({
          kind: 'toast',
          text: colony.name + ': stores below winter safe minimum (' + _storesKg + ' kg). Feed 2:1 syrup to build to 18 kg.',
          tone: 'bad',
        });
      }
      break;

    case 'disease':
      var dis = DISEASES[ev.disease] || { name: ev.disease };
      logEvent('🦠', colony.name + ' has developed ' + dis.name + '.', 'bad');

      var explainerId = 'disease_first_' + ev.disease;
      if (!Game.flags.seenExplainers[explainerId]) {
        var disBody = '<p><strong>' + (dis.name || ev.disease) + '</strong> has been detected in ' + colony.name + '.</p>';
        if (dis.sign)  disBody += '<p><em>What to look for:</em> ' + dis.sign + '.</p>';
        if (dis.desc)  disBody += '<p>' + dis.desc + '</p>';
        if (dis.notifiable) {
          disBody += '<p><strong>This is a notifiable disease.</strong> You must contact your local <strong>National Bee Unit</strong> bee inspector immediately. Do not move this colony or its equipment until you have done so. Moving a colony with a notifiable disease is illegal under the Bee Diseases and Pests Control (England) Order 2006.</p>';
          // Mark colony as awaiting inspector notification (blocks moveHive)
          colony._notifiableDiseasePending = ev.disease;
        }
        out.push({
          kind  : 'explainer',
          id    : explainerId,
          title : dis.name + ' Detected',
          body  : disBody,
        });
      } else {
        out.push({
          kind: 'toast',
          text: colony.name + ': ' + (dis.name || ev.disease) + ' detected.',
          tone: 'bad',
        });
      }
      break;

    case 'afbDestroy':
      // AFB colony destroyed — all equipment must be burned, no refund
      var _afbSupers     = ev.supers     || 0;
      var _afbBroodBoxes = ev.broodBoxes || 1;
      var equipDesc = 'all equipment in ' + colony.name + ' (' + _afbBroodBoxes + ' brood box' +
        (_afbBroodBoxes !== 1 ? 'es' : '') +
        (_afbSupers > 0 ? ', ' + _afbSupers + ' super' + (_afbSupers !== 1 ? 's' : '') : '') +
        ')';
      logEvent('🔥', 'AFB confirmed in ' + colony.name + '. By law, ' + equipDesc +
        ' must be destroyed by burning. No equipment has been returned to your stock — it is condemned.', 'bad');
      // Equipment is NOT returned to spare pool — it must be burned
      if (!Game.flags.seenExplainers['afb_destroy_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'afb_destroy_first',
          title : 'American Foul Brood — Colony and Equipment Destroyed',
          body  : '<p><strong>American Foul Brood (AFB)</strong> has killed ' + colony.name + '. This is the most serious bee disease in the UK.</p>' +
                  '<p><strong>There is no treatment.</strong> Under the Bee Diseases and Pests Control (England) Order 2006, the colony must be destroyed and all combs, frames, and wooden equipment must be burned on site. The hive body can sometimes be scorched and reused, but comb, frames, and any equipment contaminated with brood must be incinerated.</p>' +
                  '<p>AFB spores remain viable in wood and wax for <em>decades</em>. Never give away, sell, or reuse equipment from an AFB colony without official clearance from your bee inspector.</p>' +
                  '<p>You should have notified your local <strong>National Bee Unit</strong> inspector as soon as you suspected AFB. Contact them now if you have not done so.</p>' +
                  '<p>All equipment has been removed from your inventory. No refund is possible — this is the consequence of AFB going undetected and unreported.</p>',
        });
      } else {
        out.push({
          kind: 'toast',
          text: 'AFB destroyed ' + colony.name + '. All equipment condemned and burned. Contact your bee inspector.',
          tone: 'bad',
        });
      }
      break;

    case 'queencells':
      logEvent('👑', 'Queen cells have appeared in ' + colony.name + '. Swarm preparations are under way.', 'plain');
      if (diff().swarmWarning) {
        out.push({
          kind: 'toast',
          text: colony.name + ' has queen cells. Inspect and act before they swarm.',
          tone: 'bad',
        });
      }
      break;

    case 'supersede':
      logEvent('👑', colony.name + ' has quietly replaced its queen (supersedure).', 'plain');
      out.push({
        kind: 'toast',
        text: colony.name + ' superseded its queen.',
        tone: 'plain',
      });
      break;

    case 'queenfail':
      logEvent('⚠️', colony.name + ': the queen has failed or become a drone-layer.', 'bad');
      out.push({
        kind: 'toast',
        text: colony.name + ': queen failure detected. Requeen soon.',
        tone: 'bad',
      });
      break;

    case 'emerged':
      logEvent('🌟', 'A virgin queen has emerged and mated successfully in ' + colony.name + '.', 'good');
      out.push({
        kind: 'toast',
        text: colony.name + ': new queen mated and laying.',
        tone: 'good',
      });
      break;

    case 'winter_survived':
      // Not a standard event type from colony.js but guard in case
      Game.stats.wintersSurvived++;
      if (!Game.flags.seenExplainers['winter_survived_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'winter_survived_first',
          title : 'Through the Winter',
          body  : '<p>Your colony has come through winter -- well done. A cluster of bees keeps the centre of the hive at around 35 degrees Celsius regardless of the temperature outside, slowly working their way through their winter stores. ' +
                  'Give them a first inspection on the next calm, mild day (14 degrees or above) to check the queen is present and there are still enough stores to see them through to the spring flow.</p>',
        });
      } else {
        logEvent('🌷', colony.name + ' has survived the winter.', 'good');
      }
      break;

    default:
      // Unknown event -- log plainly and move on
      logEvent('📋', colony.name + ': ' + ev.type + '.', 'plain');
      break;
  }

  return out;
}

/* ====================================================================
   buildAdvisor() -> void
   Rebuild Game.advisor from current visible (known) colony state plus
   the season.  Never peeks behind the fog-of-war (never reads colony
   fields that aren't in colony.known).
   ==================================================================== */
function buildAdvisor() {
  var items = [];
  var week  = Game.week;
  var wkInYear = ((week - 1) % 52) + 1;
  var month = monthOfWeek(wkInYear);
  var season = seasonOfWeek(week);
  var d = diff();

  var aliveCols = aliveColonies();

  /* ---- No colonies ------------------------------------------------- */
  if (aliveCols.length === 0) {
    if (Game.inventory.spareHives > 0) {
      items.push({
        tone: 'info',
        icon: '📦',
        text: 'You have an empty hive ready. Visit the market to buy a nucleus colony and get started.',
      });
    } else {
      items.push({
        tone: 'info',
        icon: '🛒',
        text: 'No bees yet. Head to the market, buy a complete hive and a nucleus colony, and choose an apiary site.',
      });
    }
    Game.advisor = items;
    return;
  }

  /* ---- Per-colony checks (fog-of-war respecting) ------------------- */
  var badCount  = 0;
  var warnCount = 0;
  var okCount   = 0;

  for (var i = 0; i < aliveCols.length; i++) {
    var col = aliveCols[i];
    var k   = col.known; // may be null

    /* Never inspected */
    if (!k) {
      items.push({
        tone: 'warn',
        icon: '🔍',
        text: col.name + ' has never been inspected. An inspection will tell you if the colony is queenright and healthy.',
      });
      warnCount++;
      continue;
    }

    /* Too long without inspection during swarm season */
    var weeksSince = week - k.week;
    var swarmSeason = wkInYear >= 14 && wkInYear <= 30;
    if (swarmSeason && weeksSince >= 10) {
      items.push({
        tone: 'bad',
        icon: '📅',
        text: col.name + ' has not been inspected for ' + weeksSince + ' weeks. During swarm season, inspect every seven to nine days or you risk losing a swarm.',
      });
      badCount++;
    } else if (swarmSeason && weeksSince >= 7) {
      items.push({
        tone: 'warn',
        icon: '📅',
        text: col.name + ' is due for inspection (last seen ' + weeksSince + ' weeks ago). Swarm cells can develop quickly at this time of year.',
      });
      warnCount++;
    }

    /* Known queen cells -- urgent */
    if (k.queenCells === 'swarm') {
      items.push({
        tone: 'bad',
        icon: '🐝',
        text: col.name + ': swarm cells seen at last inspection. Take swarm-control action now, or the colony will leave.',
      });
      badCount++;
    } else if (k.queenCells === 'emergency') {
      items.push({
        tone: 'warn',
        icon: '👑',
        text: col.name + ' has emergency queen cells -- the colony may be queenless. Inspect soon to confirm.',
      });
      warnCount++;
    }

    /* Known queen failure — queenless, drone-layer or laying workers */
    if (k.queenStatus === 'queenless') {
      items.push({
        tone: 'bad',
        icon: '👑',
        text: col.name + ' appears queenless -- no queen and no eggs were seen. It needs a new queen, or uniting with a strong colony, before laying workers set in.',
      });
      badCount++;
    } else if (k.queenStatus === 'drone-layer') {
      items.push({
        tone: 'bad',
        icon: '👑',
        text: col.name + ' has a drone-laying queen -- she can no longer raise workers and must be replaced.',
      });
      badCount++;
    } else if (k.queenStatus === 'laying-workers') {
      items.push({
        tone: 'bad',
        icon: '👑',
        text: col.name + ' has laying workers -- only a frame of open brood from another colony, or uniting, will settle it.',
      });
      badCount++;
    }

    /* Known critical/low stores */
    if (k.stores === 'critical') {
      items.push({
        tone: 'bad',
        icon: '🍯',
        text: col.name + ' has critically low stores. Feed immediately -- a colony can starve within days.',
      });
      badCount++;
    } else if (k.stores === 'low') {
      var storesMsg = 'is running low on stores';
      if (season === 'winter' || season === 'autumn') {
        storesMsg += ' going into the cold months -- feed 2:1 syrup or fondant now';
      }
      items.push({
        tone: 'warn',
        icon: '🍯',
        text: col.name + ' ' + storesMsg + '.',
      });
      warnCount++;
    }

    /* Known disease — notifiable foulbrood is a crisis; the milder,
       curable diseases are a watch-and-manage item, not a red alert. */
    if (k.disease) {
      var dis = DISEASES[k.disease] || { name: k.disease, notifiable: false };
      var diseaseText = col.name + ': ' + dis.name + ' observed at last inspection.';
      if (dis.notifiable) diseaseText += ' This is notifiable -- contact your bee inspector.';
      else diseaseText += ' Keep the apiary clean and the colony strong; a comb change or requeening clears it.';
      items.push({
        tone: dis.notifiable ? 'bad' : 'warn',
        icon: '🦠',
        text: diseaseText,
      });
      if (dis.notifiable) badCount++; else warnCount++;
    }

    /* Known varroa status */
    if (k.varroaSign === 'high' || k.varroaSign === 'severe') {
      items.push({
        tone: 'bad',
        icon: '🔴',
        text: col.name + ': varroa infestation is ' + k.varroaSign + '. Treat before winter bees are damaged. Consider Apiguard, Apivar or oxalic acid.',
      });
      badCount++;
    } else if (k.varroaSign === 'unchecked' && (wkInYear >= 28 && wkInYear <= 44)) {
      /* After week 36 the winter bee cohort is already being raised — untreated
         varroa now causes silent colony death in January. Escalate to 'bad'. */
      var _varroaTone = wkInYear >= 36 ? 'bad' : 'warn';
      items.push({
        tone: _varroaTone,
        icon: '🔴',
        text: col.name + ': varroa has not been monitored. '
          + (wkInYear >= 36
            ? 'URGENT — winter bees are being reared now. Treating late means they will be mite-damaged and the colony may die in January without warning.'
            : 'Late summer is the critical window — do a wash or drop count and treat if needed.'),
      });
      if (_varroaTone === 'bad') badCount++; else warnCount++;
    }

    /* Known pests — wasps rob in late summer and autumn; they are gone
       by winter, so a stale sighting must not nag through the cold months. */
    if (k.pests && k.pests.indexOf('wasps') !== -1 &&
        (season === 'summer' || season === 'autumn')) {
      items.push({
        tone: 'warn',
        icon: '🐝',
        text: col.name + ' is under wasp pressure. Reduce the entrance so the guard bees can defend it.',
      });
      warnCount++;
    }
    if (k.pests && k.pests.indexOf('mouse') !== -1 && (season === 'autumn' || season === 'winter')) {
      items.push({
        tone: 'bad',
        icon: '🐭',
        text: col.name + ': a mouse has been seen. Fit a mouse guard immediately to protect the winter cluster.',
      });
      badCount++;
    }

    /* OSR crystallisation warnings — read directly from colony state, not
       col.known, because crystallisation is a physical fact visible without
       a formal inspection (the beekeeper can see the super is on the hive).
       FIX (Issue E): these are the persistent mentor-panel warnings that
       complement the one-shot toast events from colony.js. */
    if (col.osrBroodCrystallised) {
      items.push({
        tone: 'bad',
        icon: '🍯',
        text: col.name + ': OSR honey has crystallised inside the brood box, blocking cells the queen needs. Remove or warm the affected frames to restore brood space.',
      });
      badCount++;
    }

    if (col.osrCrystallised && col.superHoney > 0) {
      items.push({
        tone: 'bad',
        icon: '🍯',
        text: col.name + ': the OSR honey in your supers has crystallised in the comb. It cannot be extracted by centrifuge. Harvest immediately — you will lose most of this crop but the frames must be cleared before they are permanently ruined.',
      });
      badCount++;
    } else if ((col.osrRisk || 0) >= 1 && col.superHoney > 0 && !col.osrCrystallised) {
      items.push({
        tone: 'warn',
        icon: '🍯',
        text: col.name + ': OSR honey is at risk of crystallising in the comb. The flow has ended and it will set within 7-10 days. Harvest this super immediately — do not wait for full capping.',
      });
      warnCount++;
    }

    if (k.status === 'ok') okCount++;
  }

  /* ---- Routine seasonal guidance ----------------------------------- */
  /* Only added when nothing is urgent, so the advice never contradicts
     itself — no "add a super" sitting next to a starving, queenless colony. */
  if (badCount === 0) {
    var tips = CALENDAR_TIPS[month] || [];
    for (var ti = 0; ti < Math.min(2, tips.length); ti++) {
      items.push({ tone: 'info', icon: '📅', text: tips[ti] });
    }
    if (season === 'autumn') {
      if (wkInYear >= 33 && wkInYear <= 38) {
        /* Check whether any treatment is already in stock */
        var _hasStock = Game.inventory.treatStock &&
          (Object.keys(Game.inventory.treatStock).some(function(k){ return (Game.inventory.treatStock[k] || 0) > 0; }));
        if (_hasStock) {
          items.push({ tone: 'info', icon: '💊',
            text: 'Varroa treatment window: get a treatment on as soon as the supers are off — late summer is the critical time.' });
        } else {
          items.push({ tone: 'warn', icon: '💊',
            text: 'Varroa treatment window is open. You have no treatment in stock — visit the Market (Supplies tab) and buy Apiguard or Apivar, then apply it as soon as the supers are off.' });
        }
      }
      if (wkInYear >= 36 && wkInYear <= 44) {
        var _hasSugar = (Game.inventory.sugar || 0) >= 5;
        if (_hasSugar) {
          items.push({ tone: 'info', icon: '🧂',
            text: 'Start feeding 2:1 syrup (2 kg sugar to 1 litre water) to top up winter stores, until each hive feels heavy when hefted from behind.' });
        } else {
          items.push({ tone: 'warn', icon: '🧂',
            text: 'Time to feed for winter. You need sugar in stock — buy sugar bags from the Market (Supplies tab), then feed 2:1 syrup until the hive feels heavy when hefted.' });
        }
      }
      if (wkInYear >= 40) items.push({ tone: 'info', icon: '🐭',
        text: 'Fit mouse guards now — use the Entrance action on each hive and set it to "Mouse guard". Mice move into hives in autumn and wreck the comb.' });

      /* Supers-still-on warning after week 35 — delays varroa treatment and risks wet honey */
      if (wkInYear >= 36) {
        var aliveCols2 = aliveColonies();
        for (var _si = 0; _si < aliveCols2.length; _si++) {
          if ((aliveCols2[_si].supers || 0) > 0) {
            items.push({ tone: 'warn', icon: '📦',
              text: aliveCols2[_si].name + ' still has supers on. After week 35 any honey risks being too wet to store safely, and you cannot apply most varroa treatments until the supers are off.' });
            warnCount++;
            break;
          }
        }
      }
    }
    if ((season === 'winter' && wkInYear >= 49) || wkInYear <= 4) {
      items.push({ tone: 'info', icon: '💊',
        text: 'Midwinter, while the colony is broodless, is the best time to treat with oxalic acid.' });
    }

    /* Deep-winter isolation starvation risk: small cluster + low brood-box honey.
       Reads actual colony.honey (not fog-of-war). Bees cannot move to distant frames
       when in cluster — fondant on the top bars can save them.
       Threshold scales with cluster size: a cluster under 3,000 bees cannot bridge
       to stores more than a few frames away, so even 10 kg may be unreachable. */
    var _deepWinter = (wkInYear <= 8 || wkInYear >= 44);
    if (_deepWinter) {
      var aliveCols4 = aliveColonies();
      for (var _ii = 0; _ii < aliveCols4.length; _ii++) {
        var _ic = aliveCols4[_ii];
        var _isolAdvThreshold = (_ic.population < 3000) ? 10 : 5;
        if (_ic.honey > 0 && _ic.honey < _isolAdvThreshold && _ic.population < 5000) {
          items.push({ tone: 'bad', icon: '🍯',
            text: _ic.name + ' is a small cluster (' + Math.round(_ic.population / 1000) + 'k bees) with only ' + _ic.honey.toFixed(1) + ' kg in the brood box. Risk of isolation starvation — the cluster may not be able to reach stores on distant frames. Place fondant directly on the top bars now.' });
          badCount++;
        }
      }
    }

    /* Pre-winter stores check — proactive warning in Oct (wk 40-43) even without inspection.
       A colony needs at least 18 kg in the brood box to be safe through a UK winter.
       This reads the real colony honey value (not fog-of-war) to flag low stores BEFORE winter. */
    if (wkInYear >= 40 && wkInYear <= 43) {
      var aliveCols3 = aliveColonies();
      for (var _wi = 0; _wi < aliveCols3.length; _wi++) {
        var _wc = aliveCols3[_wi];
        if (_wc.honey < SIM.winterStoresNeed) {
          var _deficit = (SIM.winterStoresNeed - _wc.honey).toFixed(1);
          items.push({ tone: 'warn', icon: '🍯',
            text: _wc.name + ' has around ' + _wc.honey.toFixed(1) + ' kg in the brood box — ' + _deficit + ' kg short of the safe winter minimum (18 kg). Feed 2:1 syrup now; stop when it is too cold for bees to take it down (below about 10°C).' });
          warnCount++;
        }
      }
    }
    /* Moorland frost return warning — colonies left on the moor past week 39
       risk being caught by the first autumn frosts. They should be moved back
       to a sheltered lowland apiary before mid-October (wk 41-42). */
    if (wkInYear >= 39 && wkInYear <= 42) {
      var _moorColonies = [];
      for (var _mai = 0; _mai < Game.apiaries.length; _mai++) {
        var _mAp = Game.apiaries[_mai];
        var _mSite = SITE_TYPES[_mAp.siteType] || {};
        if (_mSite.heather) {
          var _mCols = coloniesIn(_mAp.id);
          for (var _mci = 0; _mci < _mCols.length; _mci++) {
            if (_mCols[_mci].alive) _moorColonies.push({ colony: _mCols[_mci], apiary: _mAp });
          }
        }
      }
      if (_moorColonies.length > 0) {
        var _moorNames = _moorColonies.map(function(r){ return r.colony.name; }).join(', ');
        var _moorApiaryName = _moorColonies[0].apiary.name;
        items.push({ tone: 'warn', icon: '⛰️',
          text: 'The heather harvest is over and ' + _moorNames + ' ' +
            (_moorColonies.length === 1 ? 'is' : 'are') + ' still on the moor at ' +
            _moorApiaryName + '. Move ' + (_moorColonies.length === 1 ? 'this colony' : 'these colonies') +
            ' to a sheltered lowland apiary before the first frosts (around week 42). Exposed moorland in October is cold and forage-free — colonies can starve or be killed by cold snaps.' });
        warnCount++;
      }
    }

    if (season === 'spring' && wkInYear >= 16 && wkInYear <= 22) {
      items.push({ tone: 'info', icon: '📦',
        text: 'Colonies build fast now. Check whether any need an extra super — a cramped colony is more likely to swarm.' });
    }
    if (wkInYear >= 15 && wkInYear <= 30 && Game.inventory.baitHives === 0 &&
        Game.inventory.spareHives > 0) {
      items.push({ tone: 'info', icon: '🎣',
        text: 'Swarm season is here. Setting out a bait hive gives you a chance to catch a free swarm.' });
    }
  }

  /* ---- Positive feedback when all is well -------------------------- */
  if (badCount === 0 && warnCount === 0 && okCount > 0) {
    items.push({ tone: 'ok', icon: '✅',
      text: 'Things are looking well kept. All recently inspected colonies are in good order.' });
  } else if (badCount === 0 && warnCount > 0) {
    items.push({ tone: 'ok', icon: '✅',
      text: 'No urgent problems right now, but keep an eye on the items above.' });
  }

  /* ---- Order by urgency, so the mentor and the notes lead with what matters */
  var _rank = { bad: 0, warn: 1, info: 2, ok: 3 };
  items.sort(function(a, b) {
    return (_rank[a.tone] == null ? 2 : _rank[a.tone]) - (_rank[b.tone] == null ? 2 : _rank[b.tone]);
  });
  if (items.length > 8) items.length = 8;

  Game.advisor = items;
}

/* ====================================================================
   _sim_uniqueHiveName() -> string
   Returns a colony name not already in use, drawn from HIVE_NAMES.
   ==================================================================== */
function _sim_uniqueHiveName() {
  var used = {};
  for (var i = 0; i < Game.colonies.length; i++) {
    used[Game.colonies[i].name] = true;
  }
  // Try in order first
  for (var j = 0; j < HIVE_NAMES.length; j++) {
    if (!used[HIVE_NAMES[j]]) return HIVE_NAMES[j];
  }
  // Fallback with a number suffix
  var n = Game.colonies.length + 1;
  return 'Hive ' + n;
}
