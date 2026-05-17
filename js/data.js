/* ====================================================================
   THE APIARIST — data.js
   All static game data and tuning constants. UK beekeeping.
   Loaded first; everything else reads from these globals.
   ==================================================================== */

/* --- Calendar -------------------------------------------------------- */
/* The game runs on weekly ticks. Week 1 = first week of January.
   A new game begins in early April (week 14), when you get your bees. */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const SEASONS = { winter:'Winter', spring:'Spring', summer:'Summer', autumn:'Autumn' };

function monthOfWeek(w){ w=((w-1)%52+52)%52; return Math.min(11, Math.floor(w/52*12)); }
function seasonOfWeek(w){
  const m = monthOfWeek(w);
  if (m===11||m<=1) return 'winter';
  if (m<=4) return 'spring';
  if (m<=7) return 'summer';
  return 'autumn';
}
function weekOfMonth(w){
  w=((w-1)%52+52)%52;
  const m=monthOfWeek(w+1);
  let first=0; for(let i=1;i<=52;i++){ if(monthOfWeek(i)===m){first=i;break;} }
  return (w+1)-first+1;
}
function dateLabel(w){
  const wk = ((w-1)%52)+1;
  const part = ['early','early','mid','mid','late','late'][Math.min(5,weekOfMonth(wk)-1)] || 'late';
  return part+' '+MONTHS[monthOfWeek(wk)];
}

/* --- Difficulty ------------------------------------------------------ */

const DIFFICULTY = {
  apprentice: {
    label:'Apprentice', icon:'🌱', startCash:1700,
    blurb:'Forgiving. The mentor warns you before trouble. Gentle weather, slow mites, kind winters. Best for learning.',
    varroaGrowth:1.075, weatherKindness:0.72, winterHarshness:0.65,
    starvationGrace:1, mentorWarnings:true, swarmWarning:true,
    waspAggression:0.6, diseaseChance:0.45, robustQueens:0.9, yieldBonus:1.15,
  },
  beekeeper: {
    label:'Beekeeper', icon:'🐝', startCash:1250,
    blurb:'True to life. Realistic timings and consequences. The mentor advises but will not rescue you.',
    varroaGrowth:1.11, weatherKindness:0.5, winterHarshness:1.0,
    starvationGrace:0, mentorWarnings:true, swarmWarning:false,
    waspAggression:1.0, diseaseChance:1.0, robustQueens:0.65, yieldBonus:1.0,
  },
  master: {
    label:'Master', icon:'🔥', startCash:880,
    blurb:'Harsh. Aggressive mites, narrow weather windows, brutal winters, relentless robbing. No hand-holding.',
    varroaGrowth:1.15, weatherKindness:0.33, winterHarshness:1.4,
    starvationGrace:0, mentorWarnings:false, swarmWarning:false,
    waspAggression:1.45, diseaseChance:1.55, robustQueens:0.5, yieldBonus:0.92,
  },
};

/* --- Core simulation constants (tunable) ----------------------------- */

const SIM = {
  startWeek: 14,                // new game begins early April
  framesPerBrood: 11,
  peakLayPerWeek: 13000,        // a good queen at full tilt
  workerLifeSummer: 6,          // weeks
  honeyPerSuper: 18,            // kg extractable from a full National super (11 drawn frames ~20-25 kg capped, ~18 kg extracted)
  broodBoxStoreCap: 22,         // kg the brood box can physically hold
  broodNestComfort: 7,          // kg of stores the colony likes to keep by the nest
  winterStoresNeed: 18,         // kg needed to be safe through winter
  nucPopulation: 9000,
  fullColonyPop: 21000,
  caughtSwarmPop: 12000,
  nectarRate: 0.00046,          // kg honey per forager-unit per flyable week
  pollenRate: 0.00012,
  upkeepPerBee: 0.0000125,      // kg honey per bee per week, maintenance
  broodCostHoney: 0.00010,      // kg honey per brood cell reared
  broodCostPollen: 0.00008,
  varroaStart: 45,              // mites in a bought nuc
  varroaCrisis: 0.045,          // infestation rate that wrecks winter bees
};

/* contextual one-off costs (£) */
const COSTS = {
  superAdd: 44, broodBoxAdd: 52, queenExcluder: 9,
  sugarPerKg: 1.25, fondantPerKg: 3.20,
  jar: 0.55, marketStall: 18, extractorHire: 15,
  newApiary: 95, beeBaseReg: 0, foodHygieneReg: 0,
  movehive: 12,
};

/* --- Equipment & livestock catalogue (the Market) -------------------- */

const CATALOG = {
  bees: [
    { id:'nuc', name:'Nucleus colony (nuc)', icon:'📦', price:215,
      desc:'Five frames of bees, brood and a laying queen. The recommended way to start.' },
    { id:'colony', name:'Full colony', icon:'🏠', price:300,
      desc:'An established colony on a full brood box. More bees sooner, more to go wrong.' },
    { id:'matedqueen', name:'Mated queen', icon:'👑', price:42,
      desc:'A laying queen of known stock, for requeening or making up a colony.' },
  ],
  hives: [
    { id:'hive', name:'Complete National hive', icon:'🪵', price:165,
      desc:'Floor, brood box, queen excluder, a super, crown board, roof and frames. Empty — needs bees.' },
    { id:'nucbox', name:'Poly nucleus box', icon:'🧰', price:30,
      desc:'A small hive for splits, mating nuclei and housing caught swarms.' },
    { id:'baithive', name:'Bait hive', icon:'🎣', price:24,
      desc:'Set up to lure a passing swarm. Free bees, if you are lucky.' },
  ],
  tools: [
    { id:'suit', name:'Bee suit & veil', icon:'🥋', price:75, desc:'Full suit. You really do want one.' },
    { id:'smoker', name:'Smoker', icon:'💨', price:28, desc:'Calms the bees during inspections.' },
    { id:'hiveTool', name:'Hive tool', icon:'🔧', price:8, desc:'Prises boxes apart and scrapes off propolis.' },
    { id:'gloves', name:'Gloves', icon:'🧤', price:10, desc:'Optional. Some prefer bare hands for dexterity.' },
    { id:'clearerBoard', name:'Clearer board', icon:'🚪', price:14, desc:'A one-way bee escape for clearing supers before harvest.' },
    { id:'extractor', name:'Honey extractor', icon:'🛢️', price:190, desc:'Spins honey out of the comb. Or hire the association one per harvest.' },
    { id:'settlingTank', name:'Settling tank', icon:'🫙', price:45, desc:'Lets air bubbles and wax rise before bottling. Cleaner jars.' },
    { id:'refractometer', name:'Refractometer', icon:'🔬', price:22, desc:'Measures honey moisture. Above ~20% it can ferment.' },
    { id:'uncappingKit', name:'Uncapping kit', icon:'🍴', price:28, desc:'Fork, knife and tray for opening cells before extraction.' },
  ],
};

/* --- Apiary site types ---------------------------------------------- */

const SITE_TYPES = {
  rural:    { label:'Mixed countryside', icon:'🌳', nectar:0.97, pollen:1.05,
              spray:0.03, shelter:1.05, blurb:'Hedgerows, woodland and meadow. Steady and reliable all season.' },
  farmland: { label:'Arable farmland', icon:'🌾', nectar:1.0, pollen:1.0, springCrop:'oilseed',
              spray:0.13, shelter:0.85, blurb:'A huge oilseed rape flow in spring, then a sharp June gap. Spray risk.' },
  urban:    { label:'Town gardens', icon:'🏘️', nectar:0.83, pollen:1.12, warmth:1.0,
              spray:0.01, shelter:1.15, blurb:'Gardens give a long, varied, gentle season and milder weather.' },
  orchard:  { label:'Orchard', icon:'🍎', nectar:0.92, pollen:1.22, springCrop:'spring', pollination:true,
              spray:0.05, shelter:1.0, blurb:'Glorious spring blossom and pollination demand; quieter later on.' },
  moorland: { label:'Moor edge', icon:'⛰️', nectar:0.72, pollen:0.72, heather:true,
              spray:0.0, shelter:0.7, blurb:'Sparse most of the year, but the August heather flow is something special.' },
};

/* --- Forage calendar (52 weeks, index 0 = week 1) -------------------- */
/* Baseline UK nectar and pollen availability, 0..1. Site type scales it. */

const FORAGE = {
  nectar: [
    0,0,0,0,0,0.02,0.04,0.06,0.10,            // wk 1-9   Jan-early Mar
    0.16,0.24,0.34,0.45,                      // wk 10-13 mid Mar-early Apr
    0.62,0.74,0.83,0.85,0.80,0.66,0.50,       // wk 14-20 Apr-mid May (OSR/spring peak)
    0.22,0.14,0.16,0.24,                      // wk 21-24 June gap — clover barely started
    0.50,0.68,0.82,0.88,0.85,0.78,0.66,0.54,  // wk 25-32 summer flow (lime/clover/bramble)
    0.46,0.40,0.36,0.34,0.30,                 // wk 33-37 late summer declining; ivy not yet open
    0.36,0.40,0.38,0.22,0.12,                 // wk 38-42 ivy peak wk 39 (Sep), sharp Oct fade
    0.04,0.02,0,0,0,0,0,0,0,0,                // wk 43-52 Nov-Dec
  ],
  pollen: [
    0,0,0,0,0.05,0.10,0.16,0.22,0.30,          // wk 1-9  (wk4 = 0: nothing flowers late Jan)
    0.42,0.55,0.66,0.74,                      // wk 10-13
    0.82,0.88,0.90,0.88,0.84,0.78,0.72,       // wk 14-20
    0.62,0.56,0.58,0.62,                      // wk 21-24
    0.68,0.70,0.70,0.68,0.64,0.58,0.52,0.46,  // wk 25-32
    0.42,0.38,0.34,0.30,0.26,                 // wk 33-37
    0.30,0.34,0.30,0.20,0.12,                 // wk 38-42
    0.06,0.03,0.01,0,0,0,0,0,0,0,             // wk 43-52
  ],
  sources: [
    'next to nothing — perhaps a stray snowdrop',          // Jan
    'snowdrops, winter aconite and hazel catkins',          // Feb
    'willow, crocus, blackthorn and gorse',                 // Mar
    'dandelion, fruit blossom and the first oilseed rape',  // Apr
    'oilseed rape, hawthorn, sycamore and horse chestnut',  // May
    'the June gap — clover and bramble only just starting', // Jun
    'bramble, white clover, lime and field beans',          // Jul
    'rosebay willowherb, heather and himalayan balsam',      // Aug
    'himalayan balsam and the first ivy',                   // Sep
    'ivy — the last real forage of the year',               // Oct
    'ivy fading fast, very little else about',              // Nov
    'nothing to speak of',                                  // Dec
  ],
};

function forageNectar(week){ return FORAGE.nectar[((week-1)%52+52)%52] || 0; }
function foragePollen(week){ return FORAGE.pollen[((week-1)%52+52)%52] || 0; }

/* what kind of honey a flow in this week, at this site, becomes */
function honeyTypeForWeek(week, siteType){
  const wk = ((week-1)%52)+1;
  const site = SITE_TYPES[siteType] || {};
  if (wk>=14 && wk<=19){
    if (site.springCrop==='oilseed') return 'oilseed';
    return 'spring';
  }
  if (wk>=20 && wk<=25) return 'spring';
  if (wk>=26 && wk<=30){
    if (site.heather) return 'summer';
    return Math.random()<0.3 ? 'lime' : 'summer';
  }
  if (wk>=31 && wk<=35){
    if (site.heather) return 'heather';
    return 'summer';
  }
  if (wk>=36 && wk<=39) return 'summer';  // late summer/ivy transition — not heather
  return 'ivy';
}

/* --- Honey types ----------------------------------------------------- */

const HONEY_TYPES = {
  spring:  { name:'Spring blossom honey', value:7.2, note:'Light and floral, from the spring flow.' },
  oilseed: { name:'Oilseed rape honey', value:6.0, setsFast:true,
             note:'Sets rock hard within weeks — extract it promptly or it sets in the comb.' },
  summer:  { name:'Summer wildflower honey', value:7.8, note:'The classic main-crop honey.' },
  lime:    { name:'Lime honey', value:9.0, note:'Prized, with a fresh minty edge.' },
  borage:  { name:'Borage honey', value:8.4, note:'Water-white and very mild.' },
  heather: { name:'Heather honey', value:13.5, thixotropic:true,
             note:'A jelly-like honey that must be pressed, not spun. The premium crop.' },
  ivy:     { name:'Ivy honey', value:5.5, setsFast:true,
             note:'Strong, sets very hard and fast. Best left for the bees as winter stores.' },
};

/* --- Varroa treatments ---------------------------------------------- */

const TREATMENTS = {
  apiguard:   { name:'Apiguard (thymol)', price:14, weeks:4, efficacy:0.84,
                tempMin:15, tempMax:32, harvestSafe:false,
                note:'Thymol gel. Needs warmth (15°C+). The standard late-summer treatment once the crop is off.' },
  formic:     { name:'Formic acid strips', price:23, weeks:2, efficacy:0.82,
                tempMin:10, tempMax:29, harvestSafe:true, throughCappings:true, queenRisk:0.10,
                note:'Acts through the cappings, so it hits mites in sealed brood. The only UK-approved treatment that can be used with honey supers on. Can harm the queen in hot weather.' },
  apivar:     { name:'Apivar (amitraz strips)', price:18, weeks:8, efficacy:0.95,
                tempMin:6, tempMax:36, harvestSafe:false,
                note:'Amitraz strips left in for 6–10 weeks. Very effective. Rotate it to limit resistance.' },
  oxalicVap:  { name:'Oxalic acid — vaporised', price:9, weeks:1, efficacy:0.94, broodlessOnly:true,
                tempMin:-5, tempMax:40, harvestSafe:false,
                note:'Midwinter knock-down. Only works well when the colony is broodless — useless against mites in sealed brood.' },
  oxalicTrickle:{ name:'Oxalic acid — trickled', price:7, weeks:1, efficacy:0.90, broodlessOnly:true,
                tempMin:-5, tempMax:40, harvestSafe:false,
                note:'Trickled over the bees in syrup, once, in the broodless midwinter period.' },
};

/* --- Diseases -------------------------------------------------------- */

const DISEASES = {
  afb:        { name:'American Foul Brood', short:'AFB', notifiable:true, kind:'brood', curable:false,
                sign:'sunken, greasy, perforated cappings; larvae rot to a brown ropy thread; a foul smell',
                desc:'A spore-forming bacterial disease. There is no cure: the colony must be destroyed and the hive burnt. Notifiable.' },
  efb:        { name:'European Foul Brood', short:'EFB', notifiable:true, kind:'brood', curable:true,
                sign:'larvae twisted in their cells, melted-looking and discoloured, dying before capping',
                desc:'A bacterial disease. Can be dealt with by a shook swarm under official supervision. Notifiable.' },
  chalkbrood: { name:'Chalkbrood', short:'Chalk', notifiable:false, kind:'brood', curable:true,
                sign:'hard white and grey mummified larvae, some rattling in the cells or on the floor',
                desc:'A fungal disease. Rarely fatal. A strong colony and a fresh queen usually clear it.' },
  sacbrood:   { name:'Sacbrood', short:'Sac', notifiable:false, kind:'brood', curable:true,
                sign:'a few larvae failed to pupate, lying like little fluid-filled sacs, heads dark and raised',
                desc:'A virus. Usually minor and clears on its own as the colony grows.' },
  nosema:     { name:'Nosema', short:'Nosema', notifiable:false, kind:'adult', curable:true,
                sign:'streaks of dysentery on the comb and front of the hive; the colony slow to build in spring',
                desc:'A gut parasite of adult bees. A comb change and requeening help; good apiary hygiene prevents it.' },
};

/* --- Pests (reference for explainers) -------------------------------- */

const PESTS = {
  varroa:  { name:'Varroa mite', icon:'🔴' },
  wasps:   { name:'Wasps', icon:'🐝', desc:'Rob weak colonies in late summer and autumn. Reduce the entrance so guards can defend it.' },
  mice:    { name:'Mice', icon:'🐭', desc:'Move into hives over winter and wreck comb. A mouse guard keeps them out.' },
  waxmoth: { name:'Wax moth', icon:'🦋', desc:'Larvae tunnel through and ruin comb, especially in weak colonies and stored supers.' },
  hornet:  { name:'Asian hornet', icon:'🟡', desc:'An invasive predator that hawks bees at the entrance. Reportable in the UK.' },
  woodpecker:{ name:'Woodpecker', icon:'🪶', desc:'Hammers through hive walls in hard winters to reach the bees.' },
};

/* --- Weather --------------------------------------------------------- */
/* tempC: representative mid-week temperature in Celsius for this weather
   type in a typical UK week.  Used by treatment temperature checks
   (tempMin / tempMax in TREATMENTS) and shown to the player.
   warmth remains the continuous 0..1 biology / forage scale used inside
   colony.js and actions.js. */

const WEATHER = {
  fine:     { label:'Fine and warm', icon:'☀️', fly:1.0,  inspect:true,  warmth:1.0,  tempC:19 },
  mixed:    { label:'Sun and cloud', icon:'⛅', fly:0.85, inspect:true,  warmth:0.7,  tempC:15 },
  cool:     { label:'Cool and grey', icon:'☁️', fly:0.55, inspect:false, warmth:0.4,  tempC:11 },
  wet:      { label:'Wet',           icon:'🌧️', fly:0.26, inspect:false, warmth:0.35, tempC:10 },
  cold:     { label:'Cold',          icon:'❄️', fly:0.04, inspect:false, warmth:0.1,  tempC:4  },
  storm:    { label:'Stormy',        icon:'🌬️', fly:0.0,  inspect:false, warmth:0.3,  tempC:9,  hazard:'storm' },
  heatwave: { label:'Heatwave',      icon:'🔥', fly:0.7,  inspect:true,  warmth:1.3,  tempC:31, hazard:'heat'  },
};

/* base weighting of weather types per season; year quality tilts these.
   Winter weights push cold harder (fine/mixed trimmed vs old values) to
   keep inspect:true weeks rare but not impossible Nov-Feb.
   The June gap (wks 21-24) and spring cold snaps get an additional push
   inside generateWeather() in simulation.js; these base tables cover the
   broader seasonal shape only. */
const WEATHER_TABLE = {
  spring: { fine:3.0, mixed:4.0, cool:3.8, wet:3.0, cold:1.2, storm:0.5, heatwave:0.1 },
  summer: { fine:5.0, mixed:4.2, cool:1.8, wet:2.2, cold:0.1, storm:0.7, heatwave:1.1 },
  autumn: { fine:2.0, mixed:3.2, cool:4.2, wet:3.8, cold:1.4, storm:1.1, heatwave:0.1 },
  winter: { fine:0.5, mixed:1.0, cool:3.0, wet:2.8, cold:5.5, storm:1.3, heatwave:0.0 },
};

/* --- Sales channels -------------------------------------------------- */

const SALES = {
  gate:   { name:'At the gate', icon:'🪧', priceMul:1.0, capacity:7, repNeed:0, perVisitCost:0,
            desc:'A sign at the gate and an honesty box. Low volume, full price, no effort.' },
  market: { name:"Farmers' market", icon:'⛺', priceMul:1.18, capacity:26, repNeed:12, perVisitCost:18,
            desc:'A stall most weekends. Good price and volume, but it costs a pitch fee and a day.' },
  shop:   { name:'Local farm shop', icon:'🏪', priceMul:0.6, capacity:75, repNeed:28, perVisitCost:0,
            desc:'Wholesale to a shop. They take a big margin, but the volume clears stock fast.' },
  online: { name:'Online orders', icon:'📮', priceMul:1.12, capacity:18, repNeed:45, perVisitCost:0, postage:0.9,
            desc:'Sell direct online. Decent price, but postage eats into each jar.' },
};

/* --- Beekeeper progression ------------------------------------------ */

const TITLES = [
  { hives:0,  name:'Apprentice' },
  { hives:2,  name:'Beekeeper' },
  { hives:6,  name:'Improver' },
  { hives:12, name:'Sideliner' },
  { hives:30, name:'Bee Farmer' },
  { hives:70, name:'Commercial Beekeeper' },
  { hives:140,name:'Master of the Apiary' },
];
function titleFor(hiveCount){
  let t = TITLES[0].name;
  for (const x of TITLES){ if (hiveCount>=x.hives) t=x.name; }
  return t;
}

/* skill levels 1..10; XP needed to reach each level */
const SKILL_XP = [0,40,100,190,320,500,740,1060,1480,2050];
function skillLevel(xp){ let l=1; for(let i=0;i<SKILL_XP.length;i++){ if(xp>=SKILL_XP[i]) l=i+1; } return l; }
const SKILL_UNLOCKS = {
  1:'Inspections, feeding and the basics of husbandry.',
  3:'You read brood patterns and spot disease more reliably.',
  4:'Artificial swarm and other swarm-control methods come naturally.',
  5:'Queen rearing — graft your own queens.',
  6:'You find and mark queens quickly, and judge stores by hefting.',
  8:'Heather honey and comb honey production.',
};

/* --- Seasonal checklist (the beekeeping calendar) -------------------- */

const CALENDAR_TIPS = {
  0:['Leave the hive shut — just heft it to judge stores.','Treat with oxalic acid in the broodless spell.','Order kit and plan the year.'],
  1:['Still hands-off. Heft for weight on a cold day.','Keep entrances clear of dead bees and snow.','Watch for the first pollen coming in.'],
  2:['First inspection on a warm, calm day (14°C+).','Check the colony is queenright and has stores.','Feed only if a heft says it is light.'],
  3:['Inspect regularly now — build-up is fast.','Add a super as the colony fills the brood box.','Swarm season is starting: watch for queen cells.'],
  4:['Inspect every 7–9 days for queen cells.','Keep supering ahead of the flow.','Have a plan and spare kit ready for swarm control.'],
  5:['Peak swarm season — do not miss an inspection.','Mind the June gap: a strong colony can go hungry.','Make increase with splits if you want more colonies.'],
  6:['The main flow — keep the supers coming.','Begin taking capped honey off.','Keep watching for late queen cells.'],
  7:['Take the main crop off.','Treat for varroa as soon as the honey is removed.','Start feeding for winter; reduce entrances against wasps.'],
  8:['Feed heavy 2:1 syrup until the colony is heavy.','Finish the varroa treatment.','Unite weak colonies rather than risk losing them.'],
  9:['Last look before winter. Heft for weight.','Fit mouse guards.','Make sure roofs are weighted and hives are sound.'],
  10:['Hives shut for winter now.','Heft on dry days; feed fondant if alarmingly light.','Clear leaves and check hives after gales.'],
  11:['Leave them be.','Plan next year; service and order equipment.','Oxalic acid when you are confident they are broodless.'],
};

const QUEEN_COLOURS = ['white','yellow','red','green','blue'];
const QUEEN_COLOUR_HEX = { white:'#f4f1e6', yellow:'#f2c537', red:'#c0392b', green:'#4f8a3d', blue:'#3b6fb0' };
/* year-of-marking colour: years ending 1/6 white, 2/7 yellow, 3/8 red, 4/9 green, 5/0 blue */
function queenColourForYear(gameYear){ return QUEEN_COLOURS[(gameYear-1)%5]; }

/* names for new colonies, drawn in order then randomised */
const HIVE_NAMES = ['Rose','Ivy','Thorn','Willow','Hazel','Bramble','Clover','Heather',
  'Linden','Foxglove','Sorrel','Comfrey','Borage','Teasel','Mallow','Vetch','Aster',
  'Marigold','Lavender','Thistle','Primrose','Campion','Yarrow','Meadowsweet'];
const APIARY_NAMES = ['Home Apiary','Meadow Apiary','Orchard Apiary','Hilltop Apiary',
  'Riverside Apiary','Church Field','Long Acre','Beacon Apiary'];

/* --- Consumables catalogue (the Market — Supplies tab) --------------- */

CATALOG.supplies = [
  { id:'sugarbag', name:'Sugar — 5 kg bag', icon:'🛍️',
    price: Math.round(5 * COSTS.sugarPerKg * 100) / 100, kg: 5,
    desc:'Sugar for making up feeding syrup or fondant. Five kilograms.' },
  { id:'jarpack', name:'Jars — pack of 24', icon:'🪧',
    price: Math.round(24 * COSTS.jar * 100) / 100, count: 24,
    desc:'Empty jars with lids and labels, ready for bottling your honey crop.' },
  { id:'super', name:'Super (honey box)', icon:'📦', price: 44,
    desc:'A shallower box of frames that sits above the queen excluder for the bees to store surplus honey. Buy one before adding it to a hive.' },
  { id:'queenExcluder', name:'Queen excluder', icon:'🔲', price: 9,
    desc:'A zinc grid that prevents the queen from moving up into the honey supers. Fit it between the brood box and the lowest super.' },
  { id:'newspaper', name:'Newspaper (uniting)', icon:'📰', price: 1,
    desc:'A sheet of newspaper placed between two hive bodies when uniting colonies using the newspaper method. Bees chew through it over 24–48 hours, mixing gradually to prevent fighting.' },
];

/* expose to other scripts explicitly too */
window.DATA_LOADED = true;
