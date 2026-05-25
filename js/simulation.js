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

  /* Engagement update — pending swarm expiry (player missed the window) */
  if (Game.flags.pendingSwarm && week > Game.flags.pendingSwarm.week + 1) {
    var _lostAp = Game.apiaries ? Game.apiaries.find(function(a) { return a.id === Game.flags.pendingSwarm.apiaryId; }) : null;
    logEvent('🐝', 'The swarm ' + (_lostAp ? 'at ' + _lostAp.name : '') + ' has moved on — they found somewhere else.', 'bad');
    if (!Game.stats) Game.stats = {};
    Game.stats.swarmsLost = (Game.stats.swarmsLost || 0) + 1;
    Game.flags.pendingSwarm = null;
  }

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

    /* Engagement update — year-end summary modal (only after year 1 has elapsed) */
    if (_sim_yearsPlayed >= 1 && Game.yearStats) {
      var _ys = Game.yearStats;
      var _aliveNow = aliveColonies().length;
      var _coloniesLostYr = _ys.coloniesLost || 0;
      var _honeyKg = _ys.honeyKg || 0;
      var _income = _ys.income || 0;

      var _wentWell = '';
      var _toWatch = '';
      if (_aliveNow > 0 && _coloniesLostYr === 0) {
        _wentWell = 'No colony losses this year — that is a real achievement.';
      } else if (_honeyKg >= 30) {
        _wentWell = 'A strong harvest of ' + _honeyKg.toFixed(1) + ' kg.';
      } else if (_aliveNow > 0) {
        _wentWell = 'You still have ' + _aliveNow + ' colon' + (_aliveNow === 1 ? 'y' : 'ies') + ' going into the new year.';
      } else {
        _wentWell = 'You learned what does not work.';
      }
      if (_coloniesLostYr >= 2) {
        _toWatch = 'Multiple colony losses — review your varroa treatment timing and autumn feeding.';
      } else if (_honeyKg < 10 && _aliveNow > 0) {
        _toWatch = 'Honey yield was modest — strong colonies and the right supering matter most.';
      } else {
        _toWatch = 'Keep ahead of the swarm season and the autumn varroa window.';
      }

      var _yrNum = (typeof gameYear === 'function') ? gameYear() : 1;
      presentables.push({
        kind: 'modal',
        title: 'Year ' + _yrNum + ' in Review',
        body: '<p><strong>' + _coloniesLostYr + '</strong> coloni' + (_coloniesLostYr === 1 ? 'y' : 'es') + ' lost this year. ' +
              '<strong>' + _aliveNow + '</strong> going into the new year.</p>' +
              '<p>Honey harvested: <strong>' + _honeyKg.toFixed(1) + ' kg</strong>. ' +
              'Income: <strong>' + fmtMoney(_income) + '</strong>.</p>' +
              '<p><em>What went well:</em> ' + _wentWell + '</p>' +
              '<p><em>What to watch:</em> ' + _toWatch + '</p>'
      });

      /* First century — 45kg (one hundredweight, near enough one hundred
         pounds in old money) is the classic British target for a good
         year from a single hive. Fires once, the first year the keeper
         clears that line. */
      if (_honeyKg >= 45 && !Game.flags.seenExplainers['first_century']) {
        Game.flags.seenExplainers['first_century'] = true;
        presentables.push({
          kind: 'modal',
          title: 'A Hundredweight Year',
          body: '<p>' + _honeyKg.toFixed(1) + ' kg of honey from the year — your first hundredweight crop. In the old measure that is roughly a hundred pounds, the line beekeepers used to draw between an idle year and a real one.</p>' +
                '<p>The number is not a ceiling. Patient sites with two flows can give two hundredweight from a strong hive in a good year. But the first time you cross it is the year you stop wondering if the work is worth it.</p>' +
                '<p>Label these jars by source: spring rape and summer bramble taste nothing alike, and customers who buy supermarket honey have never tasted either of them properly. The story sells the jar.</p>'
        });
      }

      /* Reset year stats */
      Game.yearStats = { honeyKg: 0, income: 0, coloniesStarted: _aliveNow, coloniesLost: 0 };
      /* Reset yearly honey income tracker so a new annual figure starts fresh */
      if (Game.flags) Game.flags._yrHoneyIncome = { yr: _yrNum + 1, val: 0 };
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

    /* Tick down an active pollination contract by one week. When
       the contract ends, fold up the spray overlay and log the
       completion so the player sees the work close out.
       Each contract has its own weekly flavour line so the player
       feels the contract running, not just a tickbox at the start. */
    if (apiary.activeContract && apiary.activeContract.weeksLeft > 0) {
      var _wkInContract = (apiary.activeContract.weeks || apiary.activeContract.weeksLeft) - apiary.activeContract.weeksLeft + 1;
      var _ccid = apiary.activeContract.clientId;
      var _flavourLines = {
        'hatfield-orchard': [
          'Hatfield blossom is fully open — the bees are coming back with bright cream pollen on their legs.',
          'A steady week at Hatfield. The orchard manager nodded at the hives this morning, which from him is a glowing review.',
          'The Bramley blossom is starting to fade and the Cox is opening behind it. Two weeks of overlap is the whole point of a traditional orchard.',
        ],
        'sweet-acre-pears': [
          'Pear blossom — paler, faintly scented, and over before you notice it. The bees are working it hard while it lasts.',
          'A wet morning at Sweet Acre. Pear bloom does not forgive bad weather and there is grumbling at the orchard gate.',
        ],
        'manning-berry': [
          'Manning Berry tunnels are at full bloom — your bees are working under polythene, which they tolerate but do not love.',
          'The grower walked the rows with a sprayer this morning. The fungicide is approved for hives on the crop, but the foragers will still feel it.',
          'Last week of strawberry bloom. The crop is set; the contract is nearly done.',
        ],
        'bramley-estate': [
          'Bramley Estate — the orchard is forty acres of single-variety dessert apple, and the bees are at it from first light.',
          'The estate keeper checked your hives himself this afternoon. A quiet compliment about how the colonies look.',
          'Apple fall has begun on the south-facing rows. The estate harvest is coming together.',
          'The blossom is over. The contract is a week off completion and the apples have set well.',
        ],
      };
      var _lines = _flavourLines[_ccid];
      if (_lines && _lines.length) {
        var _flavourLine = _lines[(_wkInContract - 1) % _lines.length];
        logEvent('🍎', _flavourLine, 'plain');
      }
      apiary.activeContract.weeksLeft -= 1;
      if (apiary.activeContract.weeksLeft <= 0) {
        logEvent('✓', apiary.activeContract.name + ' contract complete at ' + apiary.name + '. The blossom is finished.', 'good');
        apiary.activeContract = null;
      }
    }

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
    // An active pollination contract lifts the weekly spray chance
    // for the contract duration — strawberry farms in particular run
    // a tight fungicide rotation through the bloom.
    if ((siteType === 'farmland' || siteType === 'orchard') &&
        wkInYear >= 13 && wkInYear <= 30) {
      var _sprayBase = (site.spray || 0);
      if (apiary.activeContract && apiary.activeContract.weeksLeft > 0) {
        _sprayBase += (apiary.activeContract.sprayBoost || 0);
      }
      var sprayChance = _sprayBase / 52 * 4; // weekly chance
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
    // Engagement update: a swarm moving in triggers a naming moment (pendingSwarm),
    // not an immediate colony creation. Player has one week to hive them.
    if (Game.inventory.baitHives > 0 && wkInYear >= 15 && wkInYear <= 32 && !Game.flags.pendingSwarm) {
      var catchChance = Math.min(0.75, 0.04 * Game.inventory.baitHives);
      if (Math.random() < catchChance) {
        var targetApiary = apiary;
        var swarmCols = coloniesIn(targetApiary.id);
        if (swarmCols.length < 8) { // don't overcrowd
          Game.flags.pendingSwarm = {
            apiaryId: targetApiary.id,
            name: _sim_uniqueHiveName(),
            pop: SIM.caughtSwarmPop || Math.round((SIM.fullColonyPop || 21000) * 0.35),
            week: Game.week
          };
          Game.inventory.baitHives = Math.max(0, Game.inventory.baitHives - 1);
          logEvent('🐝', 'A swarm has moved into your bait hive at ' + targetApiary.name + '! You have one week to hive them before they move on.', 'good');
          presentables.push({
            kind: 'toast',
            text: 'Swarm in your bait hive at ' + targetApiary.name + '! Hive them this week before they leave.',
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

  /* 6c. Seasonal mood beats ----------------------------------------
     The persona-review trial noted the year going quiet between
     June and the autumn warning. A handful of small, weather-and-
     forage flavour lines through the year keep the world breathing
     between the structural events (swarm, harvest, winter prep).
     Each fires once per game-year using a flag, so a multi-year
     keeper hears each beat freshly each spring. */
  var _moodWk = ((Game.week - 1) % 52) + 1;
  var _moodYr = Math.floor((Game.week - 1) / 52) + 1;
  var _moodFlag = '_moodBeat_' + _moodYr + '_';
  if (!Game.flags) Game.flags = {};
  function _moodBeat(id, text) {
    if (!Game.flags[_moodFlag + id]) {
      Game.flags[_moodFlag + id] = true;
      if (aliveColonies().length > 0) {
        logEvent('📖', text, 'plain');
      }
    }
  }
  if (_moodWk === 16) _moodBeat('blackthorn',
    'Blackthorn out along the hedges — the first proper white-and-thorn flowering of the year. The bees are working it from first light.');
  if (_moodWk === 22) _moodBeat('elder',
    'Hawthorn fading, elder coming through. The colony has reached the size where the entrance buzzes audibly on a warm afternoon.');
  if (_moodWk === 26) _moodBeat('lime',
    'The lime trees are open. On a still warm evening the air around them is almost sticky with scent and the bees are home late.');
  if (_moodWk === 29) _moodBeat('thunder',
    'A short summer thunderstorm in the night. By morning the hive entrance is back to normal, but the wax has the slight clean smell that follows hard rain.');
  if (_moodWk === 33) _moodBeat('blackberry',
    'Bramble in flower in the hedgerow. A late, quiet flow that turns up in the supers if you have one on.');
  if (_moodWk === 39) _moodBeat('ivy',
    'The first ivy flowers — small, pale green-yellow clusters, easy to walk past. The bees know they are there. This is the last real nectar the colony will see this year.');
  if (_moodWk === 43) _moodBeat('frost',
    'First frost on the grass this morning. The colony is quiet at the entrance now; the colder mornings have stopped the foragers leaving until late.');
  if (_moodWk === 48) _moodBeat('shortest',
    'The shortest weeks. A clear cold day might bring a cleansing flight, but for the most part the colony is a cluster and you are a beekeeper who waits.');

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

  /* Engagement update — Spring arrival event (once per year, weeks 8-11) */
  var _wkInYrSp = ((Game.week - 1) % 52) + 1;
  var _gYear = (typeof gameYear === 'function') ? gameYear() : 1;
  if (_wkInYrSp >= 8 && _wkInYrSp <= 11 && !Game.flags['springArrival_yr' + _gYear] && aliveColonies().length > 0) {
    Game.flags['springArrival_yr' + _gYear] = true;
    presentables.push({
      kind: 'modal',
      title: 'Spring is coming',
      body: '<p>The days are lengthening. Your bees are flying in numbers you have not seen since autumn — short cleansing flights at first, then real foraging trips as the temperature climbs.</p>' +
            '<p>Now is the time to check winter stores, assess brood quality, and get ready for the spring build-up. Swarm season follows close behind.</p>'
    });
    logEvent('☀️', 'Spring build-up underway — inspect colonies and check stores.', 'good');
  }

  /* Engagement update — county honey show (week 34 each year) */
  if (_wkInYrSp === HONEY_SHOW_WEEK && !Game.flags['showEntered_yr' + _gYear]) {
    var _hasJars = Game.inventory.jars && Object.keys(Game.inventory.jars).some(function(t) {
      return (Game.inventory.jars[t] || 0) >= 1;
    });
    if (_hasJars) {
      presentables.push({
        kind: 'modal',
        title: 'County Honey Show',
        body: '<p>The county agricultural show is this week. Beekeepers from across the area are entering their best honey.</p>' +
              '<p>You have honey that could be entered. Classes: light honey, dark honey, single-variety, cut comb (if applicable).</p>' +
              '<p><button class="btn btn-primary" onclick="openHoneyShowEntry()">Enter the show</button> ' +
              '<button class="btn" onclick="closeModal()">Skip this year</button></p>'
      });
    }
  }

  /* Engagement update — goal completion check */
  if (Array.isArray(GOALS)) {
    GOALS.forEach(function(goal) {
      if ((Game.flags.completedGoals || []).indexOf(goal.id) === -1) {
        var met = false;
        try { met = goal.check(Game); } catch(e) { met = false; }
        if (met) {
          Game.flags.completedGoals.push(goal.id);
          if (typeof addXp === 'function') addXp(goal.xp);
          presentables.push({
            kind: 'modal',
            title: '🎯 Goal complete: ' + goal.title,
            body: '<p>' + goal.desc + '</p><p>+' + goal.xp + ' XP earned.</p>'
          });
          logEvent('🎯', 'Goal unlocked: ' + goal.title, 'good');
        }
      }
    });
  }

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
      if (Game.yearStats) Game.yearStats.coloniesLost = (Game.yearStats.coloniesLost || 0) + 1;
      var reason = ev.reason || 'unknown cause';

      /* Engagement update — death retrospective */
      var _retro = [];
      if (colony.known && colony.known.varroaCount) {
        _retro.push('Last varroa count: ' + colony.known.varroaCount + ' mites per 100 bees.');
      } else if (colony.known && colony.known.varroaSign && colony.known.varroaSign !== 'unchecked' && colony.known.varroaSign !== 'none') {
        _retro.push('Last varroa reading: ' + colony.known.varroaSign + '.');
      }
      if (colony.lastTreatmentWeek) {
        var _wkAgo = Game.week - colony.lastTreatmentWeek;
        _retro.push('Last treatment: ' + _wkAgo + ' week' + (_wkAgo !== 1 ? 's' : '') + ' ago.');
      }
      if (colony.population < (SIM.fullColonyPop || 21000) * 0.2) {
        _retro.push('Population had collapsed to below 20% of a healthy colony.');
      }
      var _highVarroa = (colony.known && (colony.known.varroaCount > 3 || colony.known.varroaSign === 'high' || colony.known.varroaSign === 'severe')) ||
                       (colony.varroa && (typeof varroaInfestation === 'function') && varroaInfestation(colony) > 0.05);
      if (_highVarroa) {
        _retro.push('High varroa load is the most likely cause — treatment earlier in autumn would have given the winter bees a better chance.');
      }
      colony._deathRetrospective = _retro;

      /* Cause-attribution weights, asked for by the Systems Optimiser
         persona — replaces an opaque verb ("dwindled") with a
         numeric breakdown so a player can debug the run.
         Each contributor gets a raw score from the colony's terminal
         state; the scores are normalised to sum to 100%. */
      var _cw = { varroa: 0, nosema: 0, starvation: 0, queen: 0, disease: 0, environment: 0 };
      var _infest = (typeof varroaInfestation === 'function') ? varroaInfestation(colony) : 0;
      _cw.varroa = Math.max(_infest * 1200, 0)           // mites/bee × 1200
                 + Math.max((1 - (colony.winterBeeHealth || 1)) * 60, 0)  // damaged winter bees
                 + Math.max((colony.dwv || 0) * 50, 0);  // DWV viral load

      _cw.nosema = Math.max(((colony.disease && colony.disease.nosema) || 0) * 80, 0);

      var _storesEmpty = ((colony.honey || 0) <= 0.5) && ((colony.superHoney || 0) <= 0.5);
      if (_storesEmpty) _cw.starvation = 60;
      else if ((colony.honey || 0) < 4) _cw.starvation = 30;
      else if ((colony.honey || 0) < 10 && week > 40) _cw.starvation = 15;

      if (!colony.queen || !colony.queen.present) _cw.queen = 40;
      else if (colony.queen.state === 'failed' || colony.queen.state === 'absent') _cw.queen = 40;
      else if (colony.queen.virgin && (week - (colony.queen.bornWeek || week)) > 6) _cw.queen = 25;

      var _hasFoulbrood = colony.disease && (colony.disease.afb || colony.disease.efb);
      if (_hasFoulbrood) _cw.disease = 80;
      else _cw.disease = Math.max(((colony.disease && colony.disease.chalkbrood) || 0) * 20, 0);

      var _wkInYr = ((week - 1) % 52) + 1;
      if (_wkInYr >= 44 || _wkInYr <= 8) {
        if (colony.population > 0 && colony.population < 3000) _cw.environment += 20;
      }

      var _cwTotal = _cw.varroa + _cw.nosema + _cw.starvation + _cw.queen + _cw.disease + _cw.environment;
      if (_cwTotal < 1) {
        /* Genuinely unknown — usually a residual edge case. Mark as
           dwindling/environment so the modal doesn't show all zeros. */
        _cw.environment = 100; _cwTotal = 100;
      }
      var _causePct = {};
      Object.keys(_cw).forEach(function(k) {
        _causePct[k] = Math.round((_cw[k] / _cwTotal) * 100);
      });
      colony._causeWeights = _causePct;

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
        var _retroHtml = '';
        if (colony._deathRetrospective && colony._deathRetrospective.length) {
          _retroHtml = '<p><strong>What happened:</strong></p><ul>' +
            colony._deathRetrospective.map(function(r) { return '<li>' + r + '</li>'; }).join('') +
            '</ul>';
        }
        /* Cause-weighting breakdown — surfaces the simulation's own
           attribution rather than the single-word "reason" label. */
        var _cwHtml = '';
        if (colony._causeWeights) {
          var _labels = { varroa: 'Varroa and viruses', nosema: 'Nosema',
            starvation: 'Starvation', queen: 'Queen failure',
            disease: 'Brood disease', environment: 'Cold / dwindling' };
          var _rows = Object.keys(colony._causeWeights)
            .filter(function(k) { return colony._causeWeights[k] > 0; })
            .sort(function(a, b) { return colony._causeWeights[b] - colony._causeWeights[a]; })
            .map(function(k) {
              var pct = colony._causeWeights[k];
              return '<li><span class="death-cause-pct">' + pct + '%</span> ' + _labels[k] + '</li>';
            });
          if (_rows.length > 0) {
            _cwHtml = '<p><strong>Contribution to the loss:</strong></p>' +
              '<ul class="death-causes">' + _rows.join('') + '</ul>';
          }
        }
        out.push({
          kind : 'modal',
          title: colony.name + ' has died',
          text : colony.name + ' has died — ' + reason + '.',
          body : '<p><strong>' + colony.name + '</strong> has been lost.</p>' +
                 '<p><strong>Final reading:</strong> ' + reason + '.</p>' +
                 _cwHtml +
                 _retroHtml +
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
          text: colony.name + ' has swarmed.' + (_noBaitHive ? ' No bait hive set — swarm is gone. Set one out before swarm season to give yourself a chance of catching one.' : ' Check your bait hive.'),
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
        text: colony.name + ': a secondary swarm has left, led by a virgin queen. Colony is now significantly weaker — inspect soon.',
        tone: 'bad',
      });
      break;

    case 'demareeUnchecked':
      logEvent('⚠️', colony.name + ': you missed the Demaree 7-day check. The top box has raised emergency queen cells — deal with these now or the colony may cast.', 'warn');
      out.push({
        kind: 'toast',
        text: colony.name + ': Demaree check overdue — open the top brood box and cut out all queen cells. If a virgin emerges before you act, she can cast a secondary swarm.',
        tone: 'warn',
      });
      break;

    case 'clearerOverdue':
      logEvent('📦', colony.name + ': clearer board has been in place for 2 weeks — harvest the super or remove the board. Bees above the clearer cannot access stores below.', 'warn');
      out.push({ kind: 'toast', text: colony.name + ': clearer board still fitted after 2 weeks. Harvest or remove it — bees above cannot reach their food.', tone: 'warn' });
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
          body  : '<p>A colony through the winter is the real first achievement in beekeeping. Most winter losses come from starvation or varroa-damaged bees — both avoidable with autumn feeding and timely mite treatment. Your colony has passed that test.</p>' +
                  '<p>Give them a first inspection on the next calm, mild day (14 degrees Celsius or above): check the queen is laying and there are still stores to last until the first proper flow in April. The colony will build fast from here — swarm season follows within weeks.</p>',
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

  /* ---- No colonies -------------------------------------------------
     Don't repeat the mentor's job here. When there are no colonies, the
     mentor bubble is already telling the player exactly what to do (with
     better voice). Pushing a parallel "buy a nuc" item into the action
     list creates two surfaces saying the same thing — and a "1" pip on
     the navbar that isn't really a task. Leave the action list quiet
     so the mentor's instruction is the single signal. */
  if (aliveCols.length === 0) {
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

    /* Too long without inspection during swarm season.
       The Atmospheric persona flagged "37 days since last open" as
       breaking the world — counting in numerals reads like an HR
       audit. Rewrite in the same register as the rest of the
       writing: gesture at the season and what's happening outside
       the hive rather than counting weeks. */
    var weeksSince = week - k.week;
    var swarmSeason = wkInYear >= 14 && wkInYear <= 30;
    var _lastWkInYear = ((k.week - 1) % 52) + 1;
    function _seasonalAnchor(w) {
      if (w <= 5)  return 'midwinter';
      if (w <= 9)  return 'late winter';
      if (w <= 13) return 'the first warmth of spring';
      if (w <= 17) return 'the spring blossom';
      if (w <= 20) return 'the oilseed and apple bloom';
      if (w <= 24) return 'the June gap';
      if (w <= 28) return 'high summer';
      if (w <= 33) return 'the tail of the summer flow';
      if (w <= 37) return 'late summer';
      if (w <= 42) return 'the ivy coming in';
      if (w <= 47) return 'the first cold mornings';
      return 'before the year turned';
    }
    if (swarmSeason && weeksSince >= 10) {
      items.push({
        tone: 'bad',
        icon: '📅',
        text: col.name + ' has not been opened since ' + _seasonalAnchor(_lastWkInYear) + '. In swarm season the colony can throw cells in days — open it on the next calm afternoon or you will likely lose a swarm.',
      });
      badCount++;
    } else if (swarmSeason && weeksSince >= 7) {
      items.push({
        tone: 'warn',
        icon: '📅',
        text: col.name + ' has been closed since ' + _seasonalAnchor(_lastWkInYear) + '. The girls will be expecting a look — swarm cells can develop in the time it takes the kettle to boil at this time of year.',
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

    /* Known varroa status.
       Master mode is meant to be "no hand-holding" — the mite count is
       still visible in the hive detail, so the player can read it
       themselves, but the advisor doesn't flag it. That makes the
       autumn varroa decision a true skill check: did you look at the
       data, or were you waiting for the game to tell you? Apprentice
       and Beekeeper keep the flags because the difficulty contract on
       both is "the mentor warns / advises". */
    var _suppressVarroaFlag = (Game.difficulty === 'master');
    if (!_suppressVarroaFlag && (k.varroaSign === 'high' || k.varroaSign === 'severe')) {
      items.push({
        tone: 'bad',
        icon: '🔴',
        text: col.name + ': varroa infestation is ' + k.varroaSign + '. Treat before winter bees are damaged. Consider Apiguard, Apivar or oxalic acid.',
      });
      badCount++;
    } else if (!_suppressVarroaFlag && k.varroaSign === 'unchecked' && (wkInYear >= 28 && wkInYear <= 44)) {
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
        text: col.name + ': OSR honey has set solid in the supers. Use the Harvest action to salvage what you can by pressing — expect to recover roughly half the normal yield. Act soon: set honey in the brood box blocks cells the queen needs for laying.',
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

  /* ---- Pre-swarm bait hive nudge ----------------------------------
     The persona-review trial revealed that every persona archetype
     lost a swarm because they had no bait hive in inventory when
     spring opened. The post-swarm modal teaches the lesson AFTER
     the loss, which is too late. This nudge fires once in early
     spring (weeks 12-15, late March to mid April, before queen
     cells start appearing in week 16+) IF the player already has
     a colony, no bait hive in stock, and has either survived a
     swarm before OR has at least one strong colony heading into
     swarm season. */
  if (wkInYear >= 12 && wkInYear <= 15 &&
      aliveCols.length > 0 &&
      (Game.inventory.baitHives || 0) === 0) {
    var _swarmedBefore = (Game.stats && Game.stats.swarmsLost > 0);
    var _strongHive    = aliveCols.some(function(c) { return c.population > 8000; });
    if (_swarmedBefore || _strongHive) {
      items.push({
        tone: 'warn', icon: '🎣',
        text: _swarmedBefore
          ? 'No bait hive in stock — and you lost a swarm last year. Set one out before week 18 or you will lose another. They are £24 at the Market (Hives tab).'
          : 'Swarm season opens in a few weeks. A bait hive at £24 catches the swarm if a colony goes — your only realistic chance of free bees. Without one, a lost swarm is gone for good.',
      });
    }
  }

  /* ---- Pre-flow super reminder ------------------------------------
     The other persona-review blocker: three of four personas finished
     year one with zero honey because the colony hoarded everything
     in the brood box and they never fitted a super. Fire this when
     a colony has built strong (12,000+ bees), the nectar flow is
     about to start (weeks 14-17, peak forage), no super is fitted,
     and they have one in inventory. If they have no super in stock,
     point them at the Market. */
  for (var _sci = 0; _sci < aliveCols.length; _sci++) {
    var _sc = aliveCols[_sci];
    var _scWkInYear = wkInYear;
    if (_scWkInYear >= 14 && _scWkInYear <= 22 &&
        _sc.population >= 12000 &&
        (_sc.supers || 0) === 0) {
      var _hasSuperKit = (Game.inventory.supers || 0) > 0;
      items.push({
        tone: 'warn', icon: '📦',
        text: _hasSuperKit
          ? _sc.name + ' is strong (' + Math.round(_sc.population / 1000) + 'k bees) and the flow is starting. Fit a super on this colony — without one, every drop of nectar coming in just gets stored in the brood box and you harvest nothing this year.'
          : _sc.name + ' is strong (' + Math.round(_sc.population / 1000) + 'k bees) and the flow is starting, but you have no super in stock. Buy one from the Market (£' + (typeof COSTS !== 'undefined' ? COSTS.superAdd : 24) + ', Supplies tab) and fit it this week or you will harvest nothing.',
      });
      break; /* one warning is enough — they will see it on each colony in turn. */
    }
  }

  /* ---- Available pollination contracts ---------------------------- */
  /* A spring-only nudge. If the player has orchard or farmland
     apiaries with eligible clients open right now (window + rep +
     not-yet-taken), surface the count so they don't miss the
     window. This is high-value income that vanishes if the player
     advances past the blossom unaware. */
  if (typeof listPollinationContracts === 'function') {
    var _polTotal = 0;
    var _polApiaries = [];
    for (var _pi = 0; _pi < (Game.apiaries || []).length; _pi++) {
      var _pa = Game.apiaries[_pi];
      if (!SITE_TYPES[_pa.siteType]) continue;
      if (_pa.siteType !== 'orchard' && _pa.siteType !== 'farmland') continue;
      var _polHere = listPollinationContracts(_pa.id);
      if (_polHere.length > 0) {
        _polTotal += _polHere.length;
        _polApiaries.push(_pa.name);
      }
    }
    if (_polTotal > 0) {
      items.push({
        tone: 'info', icon: '🍎',
        text: _polTotal + ' pollination contract' + (_polTotal === 1 ? '' : 's') +
          ' open now at ' + _polApiaries.join(' / ') +
          '. Open the apiary and use the pollination action to take one — the windows close within weeks.',
      });
    }
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
