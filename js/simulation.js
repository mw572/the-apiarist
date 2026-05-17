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

/* ====================================================================
   generateWeather() -> string
   Pick a weather type for the current week, tilted by yearQuality and
   diff().weatherKindness.  Sets Game.weatherType and returns the key.
   ==================================================================== */
function generateWeather() {
  var season  = seasonOfWeek(Game.week);
  var base    = WEATHER_TABLE[season];
  var quality = Game.yearQuality;         // 0..1
  var kindness = diff().weatherKindness;  // 0..1 (higher = kinder)

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

  // Weighted random pick
  var total = 0;
  for (var k in weights) total += weights[k];
  var r = Math.random() * total;
  var chosen = 'mixed'; // fallback
  for (var k in weights) {
    r -= weights[k];
    if (r <= 0) { chosen = k; break; }
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

    // Heather moorland August bonus (weeks 31-36)
    if (site.heather && wkInYear >= 31 && wkInYear <= 36) {
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

  /* 7. Advisor -------------------------------------------------------- */
  buildAdvisor();

  /* 8. Return presentables ------------------------------------------ */
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
          kind: 'toast',
          text: colony.name + ' has died. Reason: ' + reason + '.',
          tone: 'bad',
        });
      }
      break;

    case 'swarm':
      Game.stats.swarmsLost++;
      logEvent('🐝', colony.name + ' has swarmed. A prime swarm has left the hive.', 'bad');

      if (!Game.flags.seenExplainers['swarm_first']) {
        out.push({
          kind  : 'explainer',
          id    : 'swarm_first',
          title : 'Your First Swarm',
          body  : '<p><strong>' + colony.name + '</strong> has swarmed. The old queen and roughly half the workers have left in a swarm, looking for a new home. It is natural, but it means you have lost a lot of bees and much of this year\'s honey crop from this hive.</p>' +
                  '<p>The colony left behind has queen cells. Leave the strongest one and destroy the rest, or use one for a split. ' +
                  'The virgin queen will emerge, fly to mate, and begin laying in around three weeks.</p>' +
                  '<p>To prevent swarming: inspect every seven to nine days during swarm season (April to June), add space before the colony feels cramped, and remove queen cells promptly if you do not want a swarm. ' +
                  'An artificial swarm is the most reliable control method once cells are found.</p>',
        });
      } else {
        out.push({
          kind: 'toast',
          text: colony.name + ' has swarmed.',
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

    case 'osrCrystal':
      logEvent('🍯', colony.name + ': your oilseed rape honey is crystallising in the comb. Extract immediately — another week and the frames will be ruined.', 'bad');
      out.push({
        kind: 'toast',
        text: colony.name + ': OSR honey setting in comb — harvest THIS WEEK.',
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

    case 'disease':
      var dis = DISEASES[ev.disease] || { name: ev.disease };
      logEvent('🦠', colony.name + ' has developed ' + dis.name + '.', 'bad');

      var explainerId = 'disease_first_' + ev.disease;
      if (!Game.flags.seenExplainers[explainerId]) {
        var disBody = '<p><strong>' + (dis.name || ev.disease) + '</strong> has been detected in ' + colony.name + '.</p>';
        if (dis.sign)  disBody += '<p><em>What to look for:</em> ' + dis.sign + '.</p>';
        if (dis.desc)  disBody += '<p>' + dis.desc + '</p>';
        if (dis.notifiable) disBody += '<p><strong>This is a notifiable disease.</strong> You must contact your local <strong>National Bee Unit</strong> bee inspector. Do not move this colony or its equipment until you have done so.</p>';
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
      items.push({
        tone: 'warn',
        icon: '🔴',
        text: col.name + ': varroa has not been monitored. Late summer is the critical window -- do a wash or drop count and treat if needed.',
      });
      warnCount++;
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
      if (wkInYear >= 33 && wkInYear <= 38) items.push({ tone: 'info', icon: '🍯',
        text: 'Varroa treatment window: get a treatment on as soon as the supers are off — late summer is the critical time.' });
      if (wkInYear >= 36 && wkInYear <= 44) items.push({ tone: 'info', icon: '🧂',
        text: 'Start feeding 2:1 syrup to top up winter stores, until each hive feels heavy when hefted from behind.' });
      if (wkInYear >= 40) items.push({ tone: 'info', icon: '🐭',
        text: 'Check mouse guards are fitted before the weather turns cold.' });
    }
    if ((season === 'winter' && wkInYear >= 49) || wkInYear <= 4) {
      items.push({ tone: 'info', icon: '💊',
        text: 'Midwinter, while the colony is broodless, is the best time to treat with oxalic acid.' });
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
