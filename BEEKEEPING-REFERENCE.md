# The Apiarist — UK Beekeeping Mechanics Reference

Structured reference notes for game-system design. Numbers are UK-specific (National hive, temperate climate, *Apis mellifera mellifera* / Buckfast / Carniolan crosses typical). Where ranges exist, the realistic spread is given. All dates assume southern England; shift 2-4 weeks later for Scotland/north.

---

## 1. COLONY POPULATION DYNAMICS

### 1.1 Brood development timings (exact days, from egg lay)

| Stage | Worker | Drone | Queen |
|---|---|---|---|
| Egg (stands day 1-2, lies flat day 3) | Days 1-3 | Days 1-3 | Days 1-3 |
| Larva (uncapped, fed) | Days 4-9 (6 days) | Days 4-10 (~6.5 days) | Days 4-8 (5 days) |
| Cell capped on | Day 9 | Day 10 | Day 8 (approx; queen cells sealed day 8-9) |
| Pupa (capped) | Days 10-21 (12 days) | Days 11-24 (~14-15 days) | Days 9-16 (~7-8 days) |
| **Emergence** | **Day 21** | **Day 24** | **Day 16** |

Key sub-facts for simulation:
- Egg stands upright on cell base day 1, tilts day 2, lies flat day 3, hatches start of day 4. A standing egg = laid in last 24h (use this for "recently present queen" inference).
- All larvae get royal jelly days 4-6. Worker/drone larvae switch to "bee bread" (pollen + nectar + honey) day 6-9. Queen larvae get royal jelly the whole time — this is the only difference; any fertilised egg <3 days as larva can still become a queen.
- "Larva curled in C-shape filling the cell" = day 8-9, about to be capped. Useful visual state.
- Worker emergence is the load-bearing number: **a queen cell started today produces an emerged virgin in ~16 days; she needs another ~1 week to mature + mate + start laying; her first workers emerge 21 days after that.** So a queenless colony making an emergency queen has roughly a **3.5-4 week** brood gap.

### 1.2 Population curve through the year (UK, healthy National colony)

| Period | Adult population | Notes |
|---|---|---|
| Dec-Jan (winter minimum) | 10,000-15,000 | Cluster. Little/no brood. "Winter bees" — physiologically distinct, fat-bodied, live 4-6 months. |
| Late Jan-Feb | 12,000-18,000 | Queen restarts laying (small patch, often on a single frame) around winter solstice / first warm spell. |
| March | 15,000-25,000 | First spring bees emerging; old winter bees dying off. Population can briefly dip ("spring turnover"). |
| April | 25,000-40,000 | Rapid buildup. Birth rate >> death rate. |
| May (swarm season) | 40,000-55,000 | Congestion peaks. Swarm impulse strongest mid-May to mid-June. |
| June (peak) | 50,000-70,000 | Absolute maximum, typically ~60,000. |
| July | 45,000-60,000 | Slow decline begins after summer solstice. |
| Aug-Sept | 30,000-45,000 | Queen laying drops sharply. Winter bee rearing begins. |
| Oct-Nov | 15,000-25,000 | Drones expelled. Brood ceases. Cluster forms. |

- Summer worker lifespan: **~6 weeks** (15-38 days). They literally work themselves to death; foraging phase is the last ~3 weeks of life.
- Winter worker lifespan: **4-6 months**.
- A colony loses ~1,000-1,500 bees/day in summer purely to attrition — the queen must replace this.

### 1.3 Queen laying rate by season

| Season | Eggs/day |
|---|---|
| Mid-winter (broodless or near) | 0 |
| Late winter restart | 100-300 |
| Early spring | 500-1,000 |
| Peak (May-June) | 1,500-2,000 (a top queen ~2,000, exceptional ~2,500) |
| Mid-summer | 1,000-1,500 |
| Late summer / autumn | 500 declining to 0 |

Laying rate is gated by: available drawn comb, nurse-bee numbers (each larva needs ~1,300 feeding visits), incoming pollen, and temperature. A queen can't lay faster than the colony can warm and feed the brood.

### 1.4 Drone seasonality

- First drones reared late March-April; drone brood appears as colonies approach swarm readiness.
- Drone population peaks May-July, typically **5-15% of colony** (a few hundred to ~2,000 drones).
- Drones are reared in larger cells (~6.5mm vs 5.3mm worker) on comb edges/bottom corners and in dedicated drone comb.
- **Drone expulsion**: late summer-autumn (Aug-Oct, triggered by nectar flow ending). Workers stop feeding drones, drag them to the entrance, evict them; they die outside. A colony still carrying drones in late autumn is a queenlessness warning sign.

---

## 2. THE BROOD NEST — FRAME LAYOUT

### 2.1 The "rainbow" / arc pattern on a single brood frame

Looking at one face of a brood frame, the contents form concentric arcs (the colony works outward from a centre of gravity, with the warmest core used for youngest brood):

```
   [ capped honey arc — top corners ]
  [ pollen band (the "rainbow band") ]
 [ open larvae ]   [ EGGS — centre ]   [ open larvae ]
  [ capped brood — large central mass ]
   [ pollen / honey — bottom + side margins ]
```

- **Centre**: eggs (warmest spot, ~35°C maintained).
- **Ring around eggs**: young open larvae, then older open larvae.
- **Outer ring**: capped brood (the bulk by area).
- **Pollen band**: a distinct arc of pollen sits *between* the brood and the honey — this is the colourful "rainbow" (pollen ranges yellow/orange/red/grey). Pollen is stored adjacent to brood because nurse bees need it close.
- **Top corners + outer edge**: capped honey arc, the colony's working larder.

The youngest brood is always central; the nest is a 3D ellipsoid spanning multiple frames, so the centre frames hold the most brood and outer frames grade into stores.

### 2.2 Frames covered by season (National brood box = 11 DN frames)

| Season | Frames of brood | Frames of bees |
|---|---|---|
| Mid-winter | 0-2 | 4-6 (cluster) |
| Early spring | 2-4 | 5-7 |
| Mid-spring | 5-7 | 8-10 |
| Swarm season / peak | 8-11 (often spilling into a super or needing double brood) | 11 + supers |
| Late summer | 5-7 | 8-10 |
| Autumn | 2-4 | 5-7 |

A standard National brood box is widely considered **too small** for prolific modern queens — they fill it by May and the congestion itself drives swarming. Common fixes: double brood box, brood-and-a-half (brood box + super below QX), or 14x12 deep frames.

### 2.3 Good vs bad brood pattern

- **Good ("solid" or "wall-to-wall")**: capped brood is a near-continuous slab, ≥90% of cells in the central area occupied, all roughly the same age (same colour cappings, flat tan cappings). Indicates a young, well-mated, healthy queen.
- **Patchy / "pepperpot" / "shotgun"**: scattered empty cells through the capped brood. Causes — failing/old queen, inbreeding (poor queen mating → diploid drones removed by workers), disease (EFB, sacbrood), or varroa.
- **Sunken, perforated, greasy, or off-colour cappings**: brood disease (see §9.4).
- **Drone brood scattered in worker cells / "bullet" domed cappings across the frame** = drone-laying queen or laying workers (terminal — colony failing).

### 2.4 Nest expansion / contraction

- Expands upward and outward from the cluster centre as population grows; queen moves to fresh comb as cells are emptied and cleaned.
- Contracts in autumn — brood nest shrinks, bees backfill emptied brood cells with honey ("the nest closes down").
- Bees prefer to expand into **drawn comb**; foundation must be drawn first (energy cost — see §3.3).

---

## 3. SUPER MANAGEMENT

### 3.1 When to add the first super

Triggers (any one is a reason; two together = act now):
- Brood box ~7-8 of 11 frames covered with bees.
- Bees "wall-to-wall" on a mild day, comb edges being whitened (fresh wax = nectar coming in).
- Arrival of first major flow (OSR — see §7).
- Rule of thumb: super on when the colony is **~75-80% of the way to full**, not when full — comb-drawing needs spare bees, and a congested colony is already preparing to swarm.

Add the next super when the one below is ~70-80% full / being drawn out.

### 3.2 How bees fill a super

- Bees store honey **above and around the brood nest** and move upward. In a super they generally start in the **centre frames directly over the brood cluster** and work outward to the side frames.
- Within a frame they fill **top-down and from the centre out**; the last cells filled and capped are the bottom outer corners.
- "Nadiring" (supering below) is occasionally used but the default is **adding on top**.
- Multiple supers, two common schools:
  - **Top-supering**: new empty super goes on top. Simple; bees fill lower supers first.
  - **Bottom-supering ("under-supering")**: new empty super goes directly above the queen excluder, under partly-filled ones. Encourages bees up and keeps them working; said to reduce swarming. Bees still tend to finish/cap the upper (older) frames.
- General truth for the sim: bees **cap from the centre/top outward**, and a super is rarely uniformly full — expect a gradient.

### 3.3 Drawn comb vs foundation

- **Foundation** = flat embossed wax (or plastic) sheet. Bees must *draw* it into cells before use. Drawing comb costs energy: roughly **6-8 kg of honey consumed per 1 kg of wax** produced. Bees draw comb readily only during a flow and when populous and warm.
- **Drawn comb** = already-built cells. Hugely valuable — a colony given drawn supers can store honey immediately; given foundation it must build first, often losing a chunk of a short flow (critical for OSR).
- Bees may ignore foundation if there's no flow, or store nectar in the brood nest instead, worsening congestion.
- Plastic foundation: durable, but bees accept it less readily than wax unless heavily wax-coated.

### 3.4 Capping sequence

- A cell is capped only when its honey is ripe (~18-20% water). Cappings progress from the **fullest, oldest cells outward** — typically centre-top of the frame first, bottom outer corners last.
- Cappings can be **white/dry** (air gap under cap — air left between cap and honey) or **wet/dark** (cap touching honey). Cosmetic for cut-comb but doesn't affect bulk honey.

### 3.5 The clearer board

- A board placed **between the supers and the brood box** with one-way bee escapes. Bees leave the super to rejoin the cluster/brood below and can't get back up. Used to empty supers of bees before removal.
- **Porter bee escape**: small spring-gate device, one or two per board. Cheap, slow, can clog with drones or jam; needs 24-48h, sometimes longer.
- **Canadian / cone / "rhombus" clearer**: maze or cone design, much faster — clears in **8-24h**, less prone to jamming. Preferred.
- Fit it in the **evening**; leave **24-48h**; remove supers next day. Don't leave longer than ~2 days — if a super still has unripe nectar the bees keep coming up to tend it, or robbing/wax moth risk rises. Doesn't work well in cold weather (bees won't move down) or if brood box is honey-bound (nowhere to go).

### 3.6 When a super is "ready to harvest"

- **≥80-90% of cells capped** across the frame is the standard visual rule.
- **Moisture content ≤18-20%** measured with a refractometer (target 17-18%; UK sale legal limit 20%, OSR/heather have exceptions). Above 20% it will ferment.
- **Shake test**: hold an uncapped frame horizontal and jerk it — if nectar sprays out, it's unripe; leave it.
- Baume: ripe honey ~41-42° Baume (Baume scale is more a continental/commercial measure; UK beekeepers use the % water refractometer).
- Capped ≠ automatically dry — in a humid season capped honey can still read >18%; verify with the refractometer.

### 3.7 Wet supers after extraction

- Extracted frames retain a film of honey ("wet supers"). Returned to colonies for the bees to **clean and dry out**.
- Put them back on hives (above the crown board, or directly) for **2-4 days**; bees lick them dry and move the residue down. Then store the now-dry drawn comb for next year. Returning wet supers late in the season can trigger robbing — do it at dusk.

### 3.8 Cut-comb super vs extracted-honey super

- **Extracted super**: standard frames + wax foundation (or drawn comb), wired or with a thicker brood-grade foundation; honey is spun out in an extractor and comb is reused. Comb survives many seasons.
- **Cut-comb super**: thin **unwired** "cut-comb" foundation; the whole comb is eaten, so it's cut into squares and sold in the comb. Comb destroyed each harvest. Best from a fast flow so combs are evenly drawn and capped white. No extractor needed.

---

## 4. SWARM MANAGEMENT

### 4.1 Natural swarm process — sequence and timing

1. **Congestion / age structure**: colony populous (often 40,000+), brood nest full, surplus of young nurse bees with no larvae to feed, queen pheromone diluted across too many bees. Strong drone presence. Peak window mid-April to mid-June, sharpest mid-May.
2. **Queen cups**: bees build small acorn-shaped cups along frame **bottom edges** and faces. Empty cups are normal year-round and not a decision.
3. **Charged ("occupied") queen cells**: queen lays an egg in cups; bees extend them into long peanut-shaped cells hanging down. **The colony has now decided to swarm.** Typically **5-20 queen cells** (anywhere from a few to 20+), located predominantly along **frame bottoms and edges**.
4. **Primary swarm leaves**: usually **on/around the day the first queen cell is capped** (~day 8-9 after that egg was laid; egg→capped cell). The old queen is slimmed down by workers (stops being fed, runs around) in the days before so she can fly.
5. **Departure conditions**: a **warm, calm, sunny day, usually 10:00-15:00** (peak ~mid-morning to early afternoon). Swarms rarely issue in rain or cold. Roughly **50-70% of the workforce** plus the old queen leave; they cluster nearby (a few minutes to a few hours) then scouts find a home.
6. **After the primary swarm**: the parent colony retains all the queen cells and the remaining ~half of bees + brood.
7. **Virgin emergence**: the first virgin emerges ~**7-9 days after the swarm left** (when the first cell finishes; cells were ~capped at swarm time, +7-8 days pupa).
8. **Casts / afterswarms**: if the colony is still strong, the first virgin (or workers protecting cells) may leave with a portion of bees as a **cast (secondary swarm)**, ~2-3 days after she emerges. Further **tertiary casts** possible. Each cast is smaller. A colony can cast itself down to near-collapse.
9. **Virgin queen fights**: once casting stops, virgins fight to the death and/or sting rivals through their cell walls; workers may tear down remaining cells. One queen survives, matures, mates, begins laying ~**3-4 weeks after the original swarm left** — long brood gap.

### 4.2 Swarm prevention / control methods

#### Clipping the queen's wing
- One wing trimmed ~⅓-½. Doesn't stop the swarm *impulse*.
- When the swarm fires: the queen leaves with the bees but **can't fly** — she falls to the ground in front of the hive. The swarm mills, fails to form a proper cluster, and **returns to the hive** (or clusters very low around the grounded queen). Buys the beekeeper time.
- But: the colony swarms again ~a week later with the **first virgin** (who can fly). Clipping is a **delaying tactic / safety net**, not a solution — must be combined with cell removal or a proper manipulation.

#### Demaree method (swarm prevention, keeps colony as one unit, maximises honey)
Purpose: separate the queen from the bulk of the brood within one tall hive so the colony "feels" un-congested, without losing a flying workforce.

Procedure (do when 8+ frames brood, drones present, cups being charged, on a flow):
1. Find the queen.
2. New brood box on the **original floor**. Put the queen on **one frame of open brood** (check it for queen cells — destroy any) into the **centre** of this new box; fill the rest with drawn comb/foundation. One frame of stores at the end.
3. **Queen excluder** on top of that box.
4. **Supers** on top of the excluder.
5. The **original brood box** (all the other brood, no queen) goes **on top of the supers**, with a second queen excluder under it (or a crown board with the original box above — variations exist; the principle: brood up top, separated from queen by QX + supers).
6. Destroy all queen cells in the top box now.
7. **Critical check at day 5-7**: the top box's young brood will have tried to raise emergency queen cells — **destroy every one**. After this no larvae are young enough to make a queen.
8. By **~day 21-25** all brood in the top box has emerged; that box is now full of honey/empty comb — remove it or recombine.
- Effectiveness: very effective **if the day-7 check is done**. If you skip the check, the top box raises a queen, may swarm, or you end up with two queens. Needs a good flow afterwards so foundation gets drawn.

#### Artificial swarm — Pagden method (splits colony, mimics natural swarm)
Purpose: satisfy the swarm impulse by physically doing what the swarm would do — separate queen + flying bees from brood + nurse bees.

Procedure (do as soon as charged queen cells are found):
1. Move the **original hive ~1m+ to the side**.
2. Put a **new floor + new brood box on the exact original site, entrance same way.**
3. Find the queen. Place her on **one frame of brood** (preferably with no/destroyed queen cells, some open brood) into the **new box** on the old site. Fill the new box with comb/foundation. Add the **queen excluder + supers** on the new box.
4. The **old hive (moved aside)** keeps all the remaining brood, nurse bees, and queen cells.
5. **Flying bees** orient to the old site — they return to the **new box with the queen**. This box now has the queen + the entire foraging force but almost no brood = it "thinks" it has swarmed; impulse satisfied. It draws comb and stores honey.
6. The **old box** is left with brood + nurse bees + queen cells but loses its foragers. Reduce its queen cells to **one good open cell** (or two) — destroy the rest — so it raises one queen cleanly without casting.
7. **Day-7 manoeuvre**: move the **old box to the *other* side** of the new box. Newly-flown foragers from the old box, now orienting, drift back toward the old site and again join the new (queen) box — further weakening the old box's ability to cast and boosting the honey-producing half.
8. The old box's virgin emerges, mates, lays ~3-4 weeks later. You can recombine the two later (kill one queen) or keep as two colonies.

#### Nucleus method / Snelgrove
- **Simple nucleus method**: take the queen + 1-2 frames of brood + stores + adhering bees into a **nuc box**, move it away. The parent colony, now queenless, raises a new queen from its cells. The nuc is small so it won't swarm; the parent's reduced congestion + queenlessness curbs its impulse. Quick, reliable swarm control, costs you some honey-gathering strength.
- **Snelgrove board method**: a specialised double-screen board with a set of upper/lower entrances/doors. The colony is split vertically (queen + brood below or above, the other part the other side of the board). The beekeeper **opens and closes specific door pairs on a schedule** (e.g. open one upper door, close the lower equivalent, on a roughly weekly cycle) to bleed flying bees from one half to the other — manipulating populations to suppress swarming while keeping everything on one stand and recombining for the flow. Powerful but fiddly; demands disciplined timed visits.

#### Simple split
- Move ~half the brood frames (mix of capped + open + eggs) + adhering bees + stores into a second box. One half keeps the queen; the queenless half raises an emergency queen, **or** you give it a cell/mature queen. Minimum kit: a spare floor, brood box, crown board, roof. Less precise than Pagden but fast and good for increase.

#### Comparative effectiveness (sim balance guide)

| Method | Swarm control | Honey crop impact | Skill / time | Increase? |
|---|---|---|---|---|
| Clipping alone | Weak (delay only) | None | Low | No |
| Demaree | High (with day-7 check) | Best — keeps colony whole + foragers | Medium-high, must revisit | No (stays one colony) |
| Pagden artificial swarm | High | Moderate loss (split workforce) | Medium | Yes (+1 colony) |
| Nucleus method | High | Moderate-high loss (removes bees) | Low-medium | Yes (+1 nuc) |
| Snelgrove | High | Good (recombinable for flow) | High, scheduled visits | Optional |
| Simple split | Medium-high | High loss | Low | Yes |
| Doing nothing | None — colony swarms, ~½ crop + bees lost | Severe | — | — (lose bees) |

---

## 5. QUEEN DYNAMICS

- **Virgin queen maturation**: emerges, spends ~**5-6 days** hardening and orienting before mating flights.
- **Mating flights**: takes **orientation flights** then **mating flights** on warm afternoons (~midday-15:00, ≥18-20°C, low wind, dry). Mating happens **in flight at a Drone Congregation Area** ~10-40m up, often 0.5-3 km from the hive. She mates with **~10-20 drones** (range 7-25) over **one to several flights across 1-3 days**, storing ~5-6 million sperm for life.
- **Mating window**: she should mate within **~2 weeks of emergence**; if poor weather prevents flights beyond ~3-4 weeks she becomes a non-viable **drone-layer** (lays only unfertilised eggs).
- **Signs of success**: she begins laying ~**2-4 days after the final mating flight** (so ~10-14 days post-emergence in good weather). Eggs laid singly, centred, one per cell, in a tight pattern. Workers stop balling/superseding.
- **Signs of failure**: extended absence of eggs, then scattered eggs / multiple eggs per cell / eggs on cell walls (laying workers if truly queenless), or solid **drone brood in worker cells** (drone-layer queen).
- **Drones die after mating** (endophallus torn out).

### 5.1 Queen cell types — distinguishing on the frame

| Type | Trigger | Location | Number | Beekeeper action |
|---|---|---|---|---|
| **Swarm cells** | Congestion / reproductive | Frame **bottom edges**, hanging down | Many (5-20+) | Swarm control (§4) — colony intends to swarm |
| **Supersedure cells** | Failing/old/injured queen — colony replacing her quietly | Frame **face, mid-comb** | Few (1-3, often 2) | Usually leave alone — colony self-correcting; old + new queen may co-exist briefly |
| **Emergency cells** | Sudden queen loss | Wherever a young worker larva sits — **on the comb face**, cells re-modelled from worker cells (look "pulled out" from the face) | Several (3-10+) | Often leave 1-2 best; or requeen — colony is queenless NOW |

Location is the fastest tell: **bottom edge = swarm; face = supersedure/emergency.**

### 5.2 Queen introduction

- **Direct**: queen released straight onto the comb. Fast but high rejection risk unless the colony has been queenless only briefly and conditions are perfect. Often fails — workers "ball" and kill her.
- **Indirect (cage)**: queen in an **introduction cage** with a candy plug. Workers eat through the candy over **2-4 days**, getting used to her pheromone before release. Standard, much safer.
- **Timing**: introduce ~**24h+ after the colony is confirmed queenless and all queen cells removed**. A colony with its own queen cells will reject an introduced queen.
- **Rejection risk** rises with: long queenlessness (laying workers develop after ~3 weeks → near-impossible to requeen), a flow being off, rough handling, mismatched pheromone. Watch the cage — calm bees feeding her through the mesh = acceptance; clinging, biting, "balling" = rejection.

### 5.3 Marking the queen

- Purpose: find her fast, and confirm she hasn't been superseded/swarmed (an unmarked queen where you expect a marked one = something happened).
- A dot of paint on the thorax. **International year colour code** (year ending in):

| Year ends in | Colour | Mnemonic |
|---|---|---|
| 1 or 6 | White | "Will" |
| 2 or 7 | Yellow | "You" |
| 3 or 8 | Red | "Raise" |
| 4 or 9 | Green | "Good" |
| 5 or 0 | Blue | "Bees" |

(2026 → ends in 6 → **white**.) Queens may also be **clipped** (§4.2) at the same time.

---

## 6. VARROA MANAGEMENT

### 6.1 Mite lifecycle

- *Varroa destructor* — external parasite. Two phases: **phoretic** (riding on adult bees) and **reproductive** (inside capped brood).
- A foundress mite enters a brood cell **just before capping** (drawn in by larval pheromone; **prefers drone brood ~8-12× over worker** because the longer drone cycle gives more offspring).
- After capping she lays ~1 egg every 30h: first a male, then females. Offspring feed on the pupa.
- A worker cell yields ~**1-2 viable new mated female mites**; a drone cell ~**2-3**. Mites mate inside the cell; mature females emerge with the bee.
- Population **doubles roughly every month** in the brood-rearing season → exponential late-summer rise just as winter bees are being reared (worst possible timing).

### 6.2 Counting methods

| Method | How | Notes |
|---|---|---|
| **Sugar roll** | ~300 bees (½ cup) in a jar with icing sugar, shake, tip out sugar, count mites | Non-lethal; ~70-80% recovery |
| **Alcohol/wash** | ~300 bees in alcohol/washing-up liquid, agitate, count | Lethal but most accurate |
| **Drone brood uncapping** | Uncap ~100 drone pupae with a fork, count mites | Targets the mites' preferred site |
| **Natural mite drop** | Open mesh floor + sticky insert, count mites/day over a week | Easy but crude; affected by brood amount |

### 6.3 Action thresholds

- Expressed as **mites per 100 bees** (= % infestation), or **natural drop per day**.
- Common UK guidance: treat if **≥3 mites per 100 bees** (3%) in mid-season; some use 2%. **>5%** = urgent.
- Natural drop: **>6 mites/day in spring** or **>10/day mid-summer** indicates a problem worth treating; in some references >0.5-1/day in spring is already a concern.
- Spring infestation builds through summer; the goal is to enter winter **<1%**.

### 6.4 Treatments

| Treatment | Type | Supers on? | Temp / conditions | Efficacy | Notes |
|---|---|---|---|---|---|
| **Oxalic acid — vaporisation (sublimation)** | Organic acid, vapour | **No** | Any temp; best **broodless** | ~95-99% broodless, much less with sealed brood (only kills phoretic mites) | Midwinter broodless treatment is the classic high-kill window. Repeat dosing (~3× at 5-day intervals) needed if brood present. PPE essential. |
| **Oxalic acid — trickle/dribble** | Organic acid in sugar syrup, dribbled over seams | No | Cool weather, **broodless** | ~90-95% broodless | One-shot midwinter. Mild brood toxicity — don't repeat. |
| **Apivar (amitraz)** | Plastic contact strips | No | Wide temp range (works cool) | ~93-99% | 6-10 weeks in hive. Works with brood present. Late-summer mainstay. |
| **Apiguard (thymol gel)** | Thymol, evaporative | **No** | **15-30°C** (needs warmth to evaporate; poor <15°C) | ~74-93% | Two trays, 2 weeks apart, ~4-6 weeks total. Queens may stop laying briefly. Late summer. |
| **ApiLifeVar (thymol + oils)** | Thymol/eucalyptus/menthol/camphor on a wafer | No | ~15-30°C | ~75-95% | 3 applications, ~7-10 days apart. Similar profile to Apiguard. |
| **MAQS (formic acid strips)** | Formic acid | **YES — only one usable with supers on** | **10-30°C** (≤~29.5°C; risky in heat) | ~72-93% | 7-day single application. Penetrates cappings — kills mites in brood. Can cause queen loss / brood damage if hot. The "treat without pulling the crop" option. |

Rules for the sim:
- **Other than MAQS, all treatments require supers OFF** (contamination of honey).
- **Thymol products (Apiguard/ApiLifeVar) need warmth** — ineffective in a cold snap.
- **Oxalic** is the high-efficacy tool but only when **broodless** (midwinter, or an artificially created broodless gap).
- Standard UK calendar: **late-summer treatment finished by mid-September** (Apivar / Apiguard / MAQS) so winter bees are reared mite-low, **plus a midwinter oxalic** broodless clean-up.

### 6.5 Varroa bomb / colony collapse

- Mites vector viruses — chiefly **Deformed Wing Virus (DWV)** and **Acute Bee Paralysis Virus**. The damage is the *viral load*, not the mite bite alone.
- A heavily infested colony shows: **deformed/stubby wings** on emerging bees, "K-wing", crawling bees unable to fly at the entrance, **patchy/perforated brood ("parasitic mite syndrome")**, dwindling population despite a laying queen, greasy/discoloured larvae.
- **Varroa bomb**: a collapsing colony's surviving bees abscond/drift, and **robbers from healthy colonies raid the failing one**, carrying its mites home — so a neighbouring strong colony can suddenly spike from <1% to lethal levels in autumn. A colony can look fine in August and be dead by November ("autumn-winter collapse") because winter bees were reared with crippling viral loads. Classic failure mode: untreated or late-treated colony **dies between October and February** even with ample stores.

---

## 7. HONEY FLOW & FORAGING

### 7.1 UK seasonal flows (southern England; shift later northward)

| Source | Timing | Properties |
|---|---|---|
| **Spring blossom** (willow, blackthorn, fruit trees, sycamore, dandelion) | Mar-Apr | Builds the colony; rarely a surplus crop |
| **Oilseed rape (OSR)** | Late Apr-May (~3-4 wk bloom) | Huge fast flow; see below |
| **Hawthorn ("May")** | May | Heavy in good years, unreliable; light-coloured |
| **Horse chestnut / sycamore** | May | |
| **June Gap** | ~7-14 days, often early-mid June | Nectar **dearth** between spring and summer flows — colonies can go backwards / need feeding despite being huge |
| **White clover** | June-July | Classic mild table honey |
| **Lime (linden)** | Late June-July (~2-3 wk) | Big flow in towns; can granulate; sometimes a green tinge |
| **Blackberry / bramble, willowherb** | June-Aug | Steady summer background |
| **Heather (ling)** | Aug-Sept (moorland) | Thixotropic (jelly-like), high protein; needs special pressing or loosening, won't spin normally; slow to crystallise; premium |

### 7.2 OSR specifics (game-critical)

- Very high **glucose** → crystallises **fast — often within ~10 days, sometimes in the comb**.
- If left, it **sets rock-hard inside the cells** and becomes impossible to extract — the frames are ruined for spinning.
- Therefore: **extract OSR honey immediately, as soon as the field finishes flowering / before the comb sets** — don't wait for full capping if the moisture is low enough (shake test). Often warm/soft-set or seeded into "soft set" honey for sale.
- A colony on OSR with foundation (not drawn comb) can miss much of the flow drawing comb — drawn supers are a big advantage here.

### 7.3 Nectar → honey

- Foragers collect nectar (typically **20-70% water**, OSR-ish nectar quite dilute) into the honey stomach; **invertase enzyme** is added in transit, splitting sucrose into glucose + fructose.
- House bees receive it, add more enzyme, deposit thin films in cells and **fan to evaporate water** down to **~17-20%**.
- When ripe (≤~18-20% water) the cell is **capped with wax** — a moisture/oxygen seal.
- **Glucose oxidase** added by bees produces gluconic acid + trace hydrogen peroxide → low pH + antibacterial, part of why honey doesn't spoil.

### 7.4 Foraging range & yields

- **Effective foraging radius ~3 km** (typical productive range), **maximum ~5-8 km** (uneconomic at the edge). Effective foraging *area* therefore ~28 km² at 3 km.
- Nectar-to-honey: roughly **3-4 kg of raw nectar → ~1 kg of honey** (varies with nectar sugar concentration; dilute OSR nectar needs more).
- A bee carries ~**40 mg nectar** per trip; **~1,500 forager-trips ≈ 1 jar (340g)** — gives a sense of scale.
- **Hive scales**: a good strong flow shows a **net gain of ~1-3 kg/day**, exceptional days **4-5 kg+**. A colony can put on **10-25 kg over a 2-3 week main flow**. Weight *drops* overnight (consumption + evaporation) and on rainy days — daily net gain is the signal. A UK colony's annual surplus is commonly **20-40 kg**, good year/forage 50 kg+, poor year near zero.

---

## 8. WINTER PREPARATION

### 8.1 Sequence (late summer → autumn, in order)

1. **Late-summer harvest** — remove surplus supers (after the main/heather flow, typically late Aug-Sept).
2. **Assess & requeen if needed** — a young queen overwinters better; failing queens replaced now.
3. **Varroa treatment** — apply main treatment (Apivar/Apiguard/MAQS) **immediately after the supers come off, finishing by ~mid-September** so winter bees are reared mite-low.
4. **Feed for stores** — feed **strong sugar syrup (2:1 sugar:water)** in September while it's still warm enough for bees to process and cap it; the colony stores it as winter food. Stop once heavy / once it's too cold to ripen syrup, then switch to **fondant** if topping up later.
5. **Reduce the colony footprint** — remove empty boxes; a colony should be on comb it can cover.
6. **Mouse guard** on the entrance (autumn, before nights cold ~Oct) — metal strip with ~9-10mm holes; bees pass, mice can't.
7. **Entrance reducer** — narrow the entrance to reduce robbing, wasps, heat loss, and ease defence.
8. **Ventilation & weatherproofing** — ensure top ventilation/no condensation drip; weight the roof against wind; ensure the hive is level/tilted slightly forward so water runs out.
9. **Midwinter oxalic** — apply oxalic acid during the **broodless period** (~Dec-Jan) for a high-efficacy clean-up.
10. **Leave them alone** — minimal disturbance Nov-Feb.

### 8.2 Stores requirement

- A National colony needs roughly **18-25 kg of stores** to get through a UK winter (commonly cited "~40 lb"). Northern/longer winters → upper end.
- Going *into* winter the colony should feel heavy; **fondant** (slab on top of the crown board) is the rescue feed Jan-March if light — bees can't process syrup in cold.

### 8.3 Hefting

- **Hefting** = lifting the back of the hive a few cm by hand to judge weight. Heavy = stores OK; alarmingly light = feed now. Done periodically through winter without opening the hive. **Hive scales** give a precise version. The danger months are **Feb-March** — stores low *and* brood-rearing restarted (consumption spikes) before any forage is available.

### 8.4 What kills a colony in winter

- **Starvation** — ran out of stores, or stores present but cold (see isolation). The single most common avoidable killer; classic in Feb-March.
- **Isolation starvation** — cluster, unwilling to break in cold, exhausts the honey it's touching and **can't cross a gap of empty comb to reach honey just inches away.** Dead cluster with full frames flanking it = isolation starvation.
- **Varroa / virus collapse** — winter bees reared with high DWV load die early; cluster dwindles below viable size (see §6.5). Often the *real* cause behind a "starved" diagnosis.
- **Nosema** (gut pathogen) — dysentery, dwindling, dead bees, soiled comb.
- **Damp / poor ventilation** — chronic condensation chills the cluster and promotes disease (bees tolerate cold far better than damp).
- **Queen failure** — queen dies/fails in autumn, no brood, colony dwindles out.
- **Too small a cluster** — a colony going into winter under ~10,000 bees often can't generate enough heat. Wasps/robbing in autumn or a small late swarm causes this.

---

## 9. THE INSPECTION PROCESS

### 9.1 Frequency

| Season | Interval |
|---|---|
| Winter (Nov-Feb) | None — heft only; quick fondant check |
| Early spring (Mar) | First proper inspection on a warm (~14-16°C+), calm day; then ~3-weekly |
| Swarm season (late Apr-Jul) | **Every 7-9 days** — must catch queen cells before the first is capped (~day 8) |
| Late summer (Aug-Sep) | ~2-3 weekly; harvest + treatment visits |
| Autumn (Oct) | Final checks, then close down |

The **7-day swarm-season interval** is non-negotiable in-game: skip to 10+ days and you can miss a capped cell and lose a swarm.

### 9.2 Inspection sequence

1. **Light the smoker**; a few puffs at the entrance, wait ~30s-1min. Smoke masks alarm pheromone and triggers a (mild) feeding response.
2. **Remove roof, crown board** (puff of smoke under it).
3. **Remove/lift off supers**, set aside on an upturned roof.
4. **Lift out the first frame** (often the second frame in — first is usually stores and gives room); inspect both faces, return it or lean it outside the hive to make working space.
5. **Work through frame by frame**, gently. On each frame check, in order of priority:
   - **Eggs present?** (proof of a queen laying within 3 days — the single most important check; means you often *don't* need to find the queen)
   - **Brood pattern** — solid vs patchy; all stages present (eggs, larvae, capped) = healthy progression
   - **Queen cells** — check **bottom edges and faces** of every brood frame (lift each frame and look under it)
   - **Brood health** — any disease signs (§9.4)
   - **Stores** — enough honey + pollen?
   - **Space** — is the box getting full? (supering decision)
   - **Temperament** (note runny/aggressive bees)
6. **Find the queen** only when needed — requeening, swarm control (must cage/place her), or when eggs are absent and you must confirm queenright. In routine inspections, **eggs are the proxy**; chasing the queen every visit wastes time and risks injuring her.
7. **Reassemble**: brood box, queen excluder, supers, crown board, roof.
8. **Record notes** immediately.

### 9.3 Notes to record (per colony, per visit)

Date · queenright (eggs seen Y/N) · queen seen/marked · frames of brood · brood pattern · queen cells (number/type/action) · stores (frames of honey/pollen) · temperament · space/supers · disease observations · varroa indication · actions taken · follow-up due date.

A routine inspection of one colony takes **~10-20 minutes** (longer for a manipulation like Pagden/Demaree, or a big multi-box colony).

### 9.4 Disease signs (brood diseases)

| Disease | Cause | Visual signs |
|---|---|---|
| **AFB — American Foulbrood** | *Paenibacillus larvae* (bacterial spore) | **Sunken, greasy, perforated cappings**; dark coffee-brown semi-liquid dead larvae that **"rope" out 2-3cm** on a matchstick (ropiness test); foul smell; scale stuck hard to lower cell wall. **Notifiable — colony destroyed by law in UK.** |
| **EFB — European Foulbrood** | *Melissococcus plutonius* (bacterial) | Larvae die **uncapped**, twisted/melted in the cell, **yellow-brown**, displaced from normal C-curl; patchy brood; sour smell. **Notifiable** in UK; treatment via Bee Inspector (shook swarm / antibiotics). |
| **Sacbrood** | Virus | Capped larva fails to pupate; **dark, fluid-filled "sac"** — lift it out intact like a tiny water bag; head darkened, often "Chinese-slipper" upturned shape. Usually self-limiting. |
| **Chalkbrood** | Fungus (*Ascosphaera apis*) | Larvae turn into **hard white/grey chalky "mummies"**; rattle when frame shaken; mummies found on the floor / at entrance. Stress-related, rarely fatal. |
| **Parasitic Mite Syndrome / DWV** | Varroa + viruses | Patchy perforated brood, deformed-wing adults — see §6.5 |

Adult-bee issues: **Nosema** (dysentery streaks, K-wing, dwindling), **chronic/acute paralysis virus** (shiny hairless trembling bees).

---

## 10. HIVE EQUIPMENT

### 10.1 Hive types (UK context)

| Hive | Brood frame size (approx, w × d) | Frames/box | Notes |
|---|---|---|---|
| **National** | 14" × 8½" (~355 × 216 mm) | 11 brood / 10-11 super | The UK standard. Square box ~18⅛" external, brood depth ~8⅞". Brood box widely seen as **too small** for prolific queens → double brood, brood-and-a-half, or 14×12. |
| **National 14×12** | 14" × 12" (deep) | 11 | Same footprint as National, deeper brood box → more brood room, no need for double brood. |
| **WBC** | Same frames as National | 10-11 | Double-walled, "picture-book" hive with outer lifts; pretty, fiddly, extra insulation. |
| **Langstroth** | ~17⅝" × 9⅛" (~448 × 232 mm) | 8 or 10 | World commercial standard; bigger frame, more brood room than National. |
| **Dadant** | ~17⅝" × 11¼" (deep) | 11 | Large brood frame; favoured for prolific bees / serious honey production. Box ext ~20" × 18½", brood depth ~11¾". |
| **Smith / Commercial** | Various — Commercial uses a 16" × 10" frame in a National-footprint box | 11 | Regional UK alternatives. |

Frames are **not interchangeable** between systems — a National frame is too long for a Langstroth box; a Langstroth frame falls through a National box.

### 10.2 Frame types & spacing (National)

| Code | Use | Spacing |
|---|---|---|
| **DN1** | Deep National brood — straight (parallel) side bars | Needs **metal/plastic ends** or castellations to space |
| **DN2** | Brood — straight side bars, wider top bar | Spacer needed |
| **DN4** | Deep National brood — **Hoffman** (self-spacing wide upper side bars) | **Self-spacing**, the modern default |
| **DN5** | Brood — Hoffman with the widest top bar | Self-spacing |
| **SN1 / SN2** | Shallow National **super** — straight side bars | Spacer / castellations / wide ends needed |
| **SN4** | Shallow super — Hoffman self-spacing | Self-spacing |

- **Brood spacing**: frames at ~**35mm** centres (close — keeps brood warm).
- **Super spacing**: often **widened to ~38-50mm** (9 or even 8 frames in an 11-frame box) so bees draw **fatter combs of honey** that are easier to uncap; fewer frames per super.
- **14×12** brood frames carry the code with a "12" depth (e.g. DN4 14×12).

### 10.3 Foundation

- **Wax foundation**: embossed beeswax sheet, **wired** for brood frames (vertical wires, sometimes a horizontal pin). Bees accept it readily.
- **Unwired thin "cut-comb" foundation**: for cut-comb supers — comb is eaten so no wire.
- **Plastic foundation**: durable, won't sag, but bees draw it less willingly unless heavily wax-coated; reusable as a core after extraction.
- **Drawn comb**: foundation already built into cells. High value — saves the colony ~6-8 kg honey per kg wax and lets it store immediately during a flow. Sim should treat drawn comb as a meaningful, slowly-accumulated asset; protect it from wax moth in storage.

### 10.4 Queen excluder

- A grid (gaps **~4.2-4.4mm**) above the brood box that **workers pass through but the larger queen and drones cannot** — keeps brood out of the honey supers.
- **Types**: framed **wire** excluder (best — generous bee space, low resistance), unframed **slotted zinc/metal** sheet (cheap, lies flat but sharp-edged and more restrictive), **plastic** moulded.
- **"Zinc excluder = honey excluder"**: a flat zinc sheet with no bee space sits hard against the frames; bees are reluctant to crawl through the restrictive slots, so they store honey in the brood box instead and the supers stay empty. A **framed wire excluder** with proper bee space above and below largely fixes this.
- Drones get **trapped above** an excluder (can't return down) — a known nuisance; drone-trap floors or removal needed.
- Some beekeepers run **excluder-less** ("brood-and-a-half" no QX) accepting some brood in the bottom super.

### 10.5 Clearer boards

- **Porter bee escape**: sprung two-prong gate; 1-2 fitted into a board. Cheap, slow (24-48h+), jams with propolis or drones.
- **Canadian / cone / rhombus / "8-way" clearer**: maze or cone routes; clears in **8-24h**, far less jam-prone — the preferred modern board.

### 10.6 Other equipment

- **Hive tool**: flat steel lever/scraper — prises apart propolised boxes, scrapes wax/propolis. The single most-used tool. "J-tool" variant has a hooked end for lifting frames.
- **Smoker**: bellows-fed firebox. **Fuel**: dry hessian/burlap, wood shavings/pellets, dried grass, rotten/punky wood, cardboard, pine needles, dried cow dung — anything that produces **cool, dense smoke** (not flame or hot/acrid smoke). Needs to stay lit through the whole inspection.
- **Other kit**: bee suit/veil, gloves (or bare hands), frame grip, queen cage + marking pen, uncapping fork/knife, extractor (radial/tangential), settling tank, refractometer, mouse guards, entrance blocks, feeders (rapid/contact/frame/Ashforth/Miller).

---

## QUICK SIM-TUNING NUMBERS (cheat sheet)

- Worker 21d / drone 24d / queen 16d egg→emergence. Cell capped: worker d9, drone d10, queen d8.
- Queen cell → swarm leaves ≈ when first cell capped (~d8-9). Virgin emerges ~7-9d after swarm. New queen laying ~3-4 weeks after swarm.
- Population: winter ~12k, peak June ~60k. Queen peak laying ~1,500-2,000/d. Summer bee lifespan ~6 wk; winter bee ~4-6 months.
- Brood frames: winter 0-2, peak 8-11 of 11.
- Super on at ~75-80% brood-box occupancy. Harvest at ≥80-90% capped AND ≤18-20% moisture.
- Inspect every 7-9 days in swarm season; 7-day max or you miss cells.
- Varroa treat threshold ~3 per 100 bees; finish autumn treatment by mid-Sept; oxalic midwinter broodless ~95-99%.
- Winter stores needed ~18-25 kg. Foraging radius ~3 km effective. ~3-4 kg nectar → 1 kg honey. Good flow ~1-3 kg/day on the scales.
- OSR crystallises in comb in ~10 days — must extract immediately.

---

## SOURCES

- [Honey bee life cycle / development timings — Best Beekeeping Gear](https://bestbeekeepinggear.com/honey-bee-life-cycle-timeline/)
- [Honey bee life cycle — Wikipedia](https://en.wikipedia.org/wiki/Honey_bee_life_cycle)
- [Timing is everything — The Apiarist (theapiarist.org)](https://theapiarist.org/timing-is-everything/)
- [Demaree method — Beginner Beekeeping UK](https://beginner-beekeeping.co.uk/demaree-method/)
- [Demaree method — Sevenoaks Beekeepers (PDF)](https://www.sevenoaksbeekeepers.org.uk/wp-content/uploads/2018/07/Demaree-Method-of-Swarm-Control.pdf)
- [Pagden's artificial swarm — The Apiarist](https://theapiarist.org/pagdens-artificial-swarm/)
- [Pagden method — Barnsley Beekeepers](https://barnsleybeekeepers.org.uk/pagden-method/)
- [Artificial swarming — Dave Cushman](http://www.dave-cushman.net/bee/artswarm.html)
- [Honey moisture / harvest readiness — Netties Bees](https://www.nettiesbees.com/post/moisture-in-honey-the-critical-role-of-water-content)
- [Refractometer / harvest — Dadant](https://www.dadant.com/learn/discover-the-magic-of-the-refractometer-your-guide-to-harvesting-honey/)
- [When to treat (varroa) — The Apiarist](https://theapiarist.org/when-to-treat/)
- [Varroa treatment options compared — Varroa Vault](https://varroavault.com/guides/varroa-treatment-options-comparison)
- [UK honey flows / OSR crystallisation — Blooming Good Honey](https://bloomingoodhoney.co.uk/what-is-rapeseed-honey-and-how-is-soft-set-honey-made/)
- [Crystallization of honey — Khalil Hamdan (PDF)](https://bvbeeks.org/wp-content/uploads/2015/11/Honey_Crystallization.pdf)
- [Colony buildup and decline — Scientific Beekeeping](https://scientificbeekeeping.com/understanding-colony-buildup-and-decline-part-13b/)
- [Seasonality of brood and adult populations — Bee Health Extension](https://bee-health.extension.org/seasonality-of-brood-and-adult-populations-basic-bee-biology-for-beekeepers/)
- [Hive sizes — Dorchester & Weymouth BKA](https://dorchesterandweymouthbka.com/hive-sizes/)
- [Hive dimensions & plans — Devon Beekeepers](https://devonbeekeepers.org.uk/hive-dimensions/)
- [Popular hives in the UK — M. Alsop (PDF)](https://www.biobees.com/library/hive_other/popular_hives_UK.pdf)
