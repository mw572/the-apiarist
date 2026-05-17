# The Apiarist — Mechanics Revamp Design

*Research basis: BEEKEEPING-REFERENCE.md (real UK mechanics). Cross-checked against current colony.js, simulation.js, actions.js, economy.js, ui.js.*

---

## THE DIAGNOSIS

The current game has solid structural bones — the population curve, brood pipeline, varroa model, foraging/consumption engine are all directionally correct. But the **core beekeeping experience — managing supers, reading frames, and working with swarming** — is shallow. A real beekeeper would immediately notice:

1. The swarm system is detached from queen cell biology. Cells appear and trigger a swarm in ~2 weeks with no respect for the real 8-day capping → swarm sequence.
2. Queen clipping is effectively useless (swarm is just cancelled, then nothing).
3. Supers fill flat / uniformly; no per-frame variation, no center-outward logic, no OSR crystallisation hazard.
4. Frame inspection teaches nothing because content is synthetic; no actual rainbow pattern, no "reading the comb."
5. Demaree doesn't exist as an action at all.
6. The 7-day inspection window — the central tension of spring beekeeping — has no mechanical teeth.
7. Harvest doesn't ask about clearer boards or frame-by-frame ripeness.

---

## PART 1: SWARM PATH DEPENDENCY — FULL REDESIGN

### Real sequence (translate to game weeks, 1 tick = 1 week)

| Real day | Event | Game tick |
|----------|-------|-----------|
| 0 | Queen lays egg in cup — colony has "decided to swarm" | Tick 0: cells go to `{type:'swarm', age:0, state:'larvae', count:5-20}` |
| 4-5 | Larvae visible in cells — experienced beekeeper sees them | Tick 0-1 |
| **8-9** | **First cell CAPPED — swarm leaves on/around this day** | **Tick 1 (age=1): SWARM FIRES** |
| 14-16 | First virgin emerges | Tick 2 |
| 16-18 | Further virgins emerge; casts possible | Tick 2 |
| 18-24 | Virgin fights; one survives or cast | Tick 2-3 |
| 21-25 | Surviving virgin takes mating flights | Tick 3 |
| 28-35 | Virgin begins laying | Tick 4 |
| 49-56 | First new workers emerge from her eggs | Tick 7 |

**Critical implication**: the player has **one game week** after queen cells appear before the swarm fires. This is the correct tension. Currently the game has `age >= 2` (two weeks), which is wrong and removes urgency.

### Queen cell state machine (currently missing)

Current model: `{ type, count, age }` — too simple.

Need: `{ type, count, age, state: 'larvae'|'capped'|'emerged' }`

- `age 0`: larvae visible (player can destroy them easily)
- `age 1` → **CAPPED**: swarm fires at this tick (or player intervened)
- `age 2`: first virgin emerges from cell

### Clipped queen — proper mechanic (currently wrong)

**Current**: clipped queen → `swarmAborted`, cells destroyed, pressure drops. **WRONG.** Clipping doesn't stop the swarm impulse.

**Real**: When swarm fires with clipped queen:
1. Queen exits hive, falls to ground, can't fly
2. Swarm mills for hours, returns to hive (no bees lost, but still queenright)
3. Queen cells remain — NOT destroyed
4. ~7-9 days later: first virgin emerges and CAN fly — a **cast swarm fires** with the virgin
5. Meanwhile the old (clipped) queen is still laying

**What needs to change in colony.js**:

```js
// swarmAborted event fires (beekeeper sees bees pouring out then returning)
// queen cells NOT cleared — they continue aging
// pressure NOT fully reset — stays at ~0.7
// New flag: colony.swarmClipEvent = true (inspector message: "swarm recently attempted to leave")
// Next tick: virgin emerges → emit 'swarm' with virgin leaving as cast
```

### Demaree method (currently absent)

**Should be added as an action**. The game already has all the pieces — it just needs to arrange them.

Demaree requirements:
- Colony must have queen (must find her)
- Player must have a spare brood box (or costs £)
- Player must be during swarm season
- Player must be on a flow (supers either on or imminent)

**What it does to the colony model**:
- Creates a "top box" of unqueened brood above the supers
- The queen is in the bottom box with open brood only
- A `demareeCheck` flag is set; if player doesn't re-inspect within 7 days, queen cells form in top box and potentially swarm
- After 21 days: top box brood all emerged — top box is now full of honey/empty comb, can be removed

**New colony field needed**: `colony.demaree: null | { age: 0, checked: false }`

**New action in actions.js**: `demareeMethod(colony)` — expensive (needs spare box), high skill requirement, but keeps colony at full strength and maximises honey.

### Artificial swarm (Pagden) — needs rework

Current `artificialSwarm` in actions.js does something, but it needs to properly:
1. Create the new queenright colony on the old site (gets the foragers)
2. Leave the old colony queenless with its cells
3. Force the player to reduce cells to 1-2 on the old colony within 7 days (or it casts)
4. The day-7 manoeuvre — move old hive to other side — is the bonus that further weakens cast risk

### Swarm events — emit the right information

Current swarm event just fires `{type: 'swarm'}`. Need more:

```js
{
  type: 'swarm',
  colony: colony,
  castType: 'prime' | 'cast',       // prime = with old queen; cast = with virgin
  queenClipped: true/false,          // affects whether prime swarm actually leaves
  beesLost: 0.58 * population,       // for log message accuracy
}
```

---

## PART 2: SUPER FILLING — FULL REDESIGN

### Current (wrong)

`colonyWeeklyLayoutSync` distributes `colony.superHoney` flat across all supers, and each super's 11 frames all get the same fill fraction. This is wrong in two ways:

1. **Supers fill in sequence** (bottom super first, or the super directly over the brood)
2. **Within a super, frames fill centre-outward** (not uniformly)

### Correct filling model

**Multi-super fill sequence**:
- Standard UK practice (top-supering): bees fill the **bottom super first** (closest to brood), moving up only when it's well-filled
- When bottom super is ~70-80% full, add a new super on top — the new one starts empty
- Bees cap from bottom super upward
- For the game: distribute honey into supers bottom-to-top, with each super needing to reach ~80% before the next starts receiving much

**Within-super frame filling**:
- Centre frames fill first (frames 5-7 of 11), then spread outward
- Last frames to fill: frames 1 and 11 (outer edges)
- Within a frame: honey fills from top corners, then top, then sides, then bottom
- Capping follows the same pattern: top-centre cells cap first

**OSR crystallisation mechanic** (currently absent, game-critical):

When `honeyType === 'osr'` (oilseed rape, late April-May):
- `colony.superOsrRisk` increments each week after the OSR flow ends
- At `osrRisk >= 2` weeks without harvesting: honey sets in the comb
- Visual: frame strips show a "crystallised" state (different color, lock icon)
- Mechanical: cannot extract crystallised frames (spinner can't get it out)
- Player must warm frames (or accept loss) — or ideally, harvest before the flow ends
- Notification: "⚠ Your OSR honey is setting — you need to harvest this week or the frames will be ruined"

**Super readiness** (currently just % full):
- Add a "ripeness" indicator: `frame.ripenessPct` (0-100)
- Honey is unripe until bees have fanned it down to ~18% moisture
- A frame can be "full but unripe" — harvesting it early risks fermentation
- Visual: show "ripe" (capped amber) vs "unripe/nectar" (open, lighter) cells in frame strip

**Drawn comb vs foundation in supers** (currently exists in model, no gameplay):

If a super has undrawn frames, it should:
- Fill ~40% more slowly (bees must build comb first)
- Cost the colony honey to draw (increase consumption during comb-drawing)
- Show foundation differently in the frame view
- Give player a choice: add drawn comb supers (more expensive, faster fills) vs foundation

**Wet supers** (currently absent):
After harvest, player should be able to "return wet supers" to colonies:
- Bees clean the residue in 2-4 days (game: 1 tick)
- Frames become fully drawn and clean — valuable asset for next season
- Increases `frame.drawn = true` on returned frames
- Mild robbing risk if done in late season (>30% of a non-flow week)

---

## PART 3: FRAME INSPECTION — RAINBOW PATTERN

### Current (wrong)

`colonyWeeklyLayoutSync` uses a Gaussian weight function that blurs all brood stages across all frames. Frame 6 (centre) will show a mix of eggs/larvae/capped/honey. Real frames don't look like this.

### Real rainbow pattern (should drive the layout sync)

On the **central 3 frames** of the brood nest:
- **Centre of frame face**: eggs (small % of area — each egg is tiny)
- **Ring around eggs**: young larvae
- **Large middle mass**: capped worker brood (dominates the frame, ~60-70% of area)
- **Pollen arc** (distinct coloured band between brood and honey)
- **Honey arc** (top corners, outer edge)

On the **outer brood frames** (2-4 frames from the edge):
- Less brood (smaller central mass), more honey/pollen
- Frames at the outer edges: mostly honey, some pollen, little or no brood

On **outer honey frames** (1-2 frames each side):
- All honey and pollen, no brood

**What changes in `colonyWeeklyLayoutSync`**:

The per-frame content should reflect this gradient more accurately. Instead of Gaussian weight on all brood stages equally:
- Assign `eggs` content **only to the 2-3 central frames** (where the warmest zone is)
- Assign `larvae` content to frames within ~2 of centre
- Assign `capped` to the broader central region (up to 5 frames each side)
- Assign `pollen` as a band at the transition zone (1 frame either side of the brood edge)
- Assign `honey` to the outer frames and as an arch on brood frames

Within each frame, the visual representation (cell strips) should honour the rainbow:
- Instead of flat color bands, the `_ui_buildComb` grid could place cell types in their correct zones

**For the hex comb inspector** (when player clicks a frame):
- Reading the comb should be genuinely educational: eggs in centre = healthy, queen laid in last 3 days
- Pollen band visible = well-provisioned
- Honey arch = sufficient stores
- A frame with eggs at centre, larvae ring, big capped mass, pollen band, honey arch = perfect textbook frame

---

## PART 4: THE 7-DAY INSPECTION WINDOW

### Current (no teeth)

The game suggests inspecting. Missing an inspection has no mechanical consequence other than not getting the `colony.known` update. Swarm cells appear and the player has 2 whole weeks.

### What it should be

**Swarm season inspection timer** (April-July, weeks 14-30):

Add `colony.daysSinceInspect` (or derive from `Game.week - colony.lastInspected`).

Rules:
- If >7 game days (= 1 game week) since last inspection during swarm season: swarm cells are **already at age 1 when player discovers them** — swarm fires **this week** unless they act immediately
- If >14 days: swarm has already gone — player logs in to find "The swarm has left. You missed it."
- The mentor advisor should escalate warnings: "Rose is 5 days since last inspection — inspect this week or you risk losing a swarm"

**Inspection teaches real skills**:
- When player lifts a frame, they should be asked: "Can you see eggs?" → if yes, queen present in last 3 days → safe
- "What do you see on frame 6?" → should show rainbow pattern → tests whether player understands what healthy brood looks like
- "Do any frames have cells on the bottom edge?" → the key question in swarm season

---

## PART 5: SPECIFIC GAPS TO CLOSE — PRIORITY LIST

### Priority 1: Swarm timing (1 week, not 2)

**File**: `colony.js`, swarm section  
**Change**: `if (colony.queenCells.age >= 2)` → `if (colony.queenCells.age >= 1)`  
**Add**: `colony.queenCells.state` field: `'larvae' | 'capped' | 'emerged'`  
**Effect**: Swarm fires at age 1 (after one game week). Player has ONE week to act after cells appear.

### Priority 2: Clipped queen — correct mechanic

**File**: `colony.js`  
**Current wrong code**:
```js
if (queen && queen.clipped) {
  events.push({ type: 'swarmAborted', colony: colony });
  colony.queenCells = { type: 'none', count: 0, age: 0 };
  colony.swarmPressure = _colony_clamp(colony.swarmPressure - 0.25, 0, 1);
}
```
**Should be**:
```js
if (queen && queen.clipped) {
  // Swarm attempts to leave; queen falls, swarm mills and returns
  events.push({ type: 'swarmAborted', colony: colony });
  // Queen cells remain — NOT destroyed. Cells now age to 'capped' + virgin emerges next tick
  // Pressure stays high — virgin will lead a CAST swarm next week
  colony.swarmPressure = _colony_clamp(colony.swarmPressure - 0.10, 0, 1);
  // Mark that a swarm abort happened — inspector will mention it
  colony._swarmAbortedThisWeek = true;
  // Do NOT clear queen cells. They continue in the normal path.
  // Next week: virgin emerges → if still high pressure → cast swarm fires
} else {
  // normal prime swarm fires
}
```

### Priority 3: OSR crystallisation

**File**: `colony.js` (weekly update), `simulation.js` (event handler), `ui.js` (visual warning)  
**New colony field**: `colony.osrRisk: 0`  
**Logic**: If `colony.superHoney > 0` and `honeyType === 'osr'` and `!_colony_inFlowWindow(week)`: increment `colony.osrRisk`. At `osrRisk >= 2`: emit `{type: 'osrCrystal', colony}` and set `colony.osrCrystalised = true`.  
**Mechanical effect**: `harvestColony` loses 80% of honey from crystallised supers (represents ruined frames). Player warned urgently.

### Priority 4: Super fill — centre-outward per frame

**File**: `colony.js`, `colonyWeeklyLayoutSync`  
**Change**: In super fill loop, instead of `fillFrac` applied uniformly to all 11 frames, use a centre-outward distribution:

```js
// Frame fill weights: centre frames fill first
var superFrameWeights = [0.2, 0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4, 0.2];
// normalised so sum = target fill
```

Frames 5-7 (centre) fill to near capacity before frames 1,11 start.

### Priority 5: Demaree action

**File**: `actions.js`, `ui.js`  
**New function**: `demareeMethod(colony)`:
- Requires: queen found (`colony.known.queenSeen`), spare brood box available (costs £35), swarm season
- Creates `colony.demaree = { age: 0, topBoxQueenCells: false, topBoxBroodFrames: colony.broodBoxes > 1 ? 8 : 6 }`
- Sets the colony's `swarmPressure` to near-zero (congestion resolved)
- Day-7 check required: if `colony.demaree.age >= 1 && !colony.demaree.checked`: queen cells form in top box (`colony.queenCells = { type: 'emergency', count: 5, age: 0 }`), risk of cast swarm
- After 3 weeks: top box emerges, becomes honey stores, can be removed

### Priority 6: Inspection urgency feedback

**File**: `ui.js`  
**Add to hive card**: a days-since-inspect counter that turns amber at 6 days during swarm season, red at 8 days  
**Add to advisor**: "Rose — 7 days since last inspection. Swarm season — inspect today."  
**Add to colony modal**: warning banner if overdue during swarm season

### Priority 7: Brood frame rainbow pattern

**File**: `colony.js`, `colonyWeeklyLayoutSync`  
**Change brood frame content distribution**:
- Eggs: only frames within 1 of centre, small fraction  
- Young larvae: frames within 2 of centre  
- Capped brood: frames within 4 of centre (the mass)  
- Pollen: frames at distance 3-5 from centre (the band)  
- Honey: outer frames + top-of-frame in all brood frames

### Priority 8: Clearer board as proper mechanic

**File**: `actions.js`, `economy.js`  
**Current**: clearer board existence checked in harvest, loses 8% if absent. Correct but passive.  
**Should add**: "Fit clearer board" as a distinct action (day before harvest):
- Player fits it (£0 if they have one, or hire for £8)
- Sets `colony.clearerFitted = true` for one tick
- Next inspection/week: bees have cleared; harvest now has no loss
- Without this step: always the 8% brushing loss
- Teaching moment: beekeeper plans harvest 24-48h ahead

### Priority 9: Cast swarm + multiple swarm events

**File**: `colony.js`  
Currently after a swarm, `queenCells = {type:'none'}` and a virgin is dropped in. This skips:
- The surviving virgin potentially leading a cast if colony still strong
- The virgin fight (multiple queens emerge, battle, one survives)

**Add**: After primary swarm fires:
- Remaining cells stay (count of cells left)
- Week later: first virgin emerges
- If colony strong (>20,000 bees) AND multiple cells remain AND `_colony_rand() < 0.4`: emit cast swarm (another 20-30% of bees leave with the virgin)
- Reduces colony further
- Only then does remaining virgin fight complete and one queen survives to mate

### Priority 10: MAQS with supers on

**File**: Actions/treatment logic  
Currently all treatments blocked when supers on. MAQS (formic acid) is the **one exception** — it's licensed for use with supers on (though the honey must be clearly labelled).  
**Fix**: allow `MAQS` treatment action even when supers > 0, with a "this will work but honey cannot be sold as pure UK honey — label correctly" warning.

---

## PART 6: VISUAL CHANGES NEEDED

### Super frame cross-section (centre-outward fill)

In `_ui_buildHiveCross`, super box should show:
- Centre frames have more honey color (amber cells)
- Edge frames are lighter / more empty
- A bottom "progress bar" per super shows total fill and honey type label
- OSR frames show a crystallised warning (grey stipple pattern)

### Hive card swarm pressure

Currently a thin bar. Should scale more dramatically:
- 0-40%: green, no text
- 40-70%: amber "building"
- 70-85%: orange "high — inspect now"  
- 85-100%: red, pulsing "⚠ Swarm imminent"

### Queen cell visual in cross-section

When `queenCells.type === 'swarm'`, the brood box cross-section should show peanut shapes on the bottom edge of the brood box (the correct location for swarm cells). Supersedure cells should show on the frame face.

### Inspection urgency badge

In swarm season (weeks 14-30), hive card should show:
- A clock icon with "X days" since last inspection
- Turns amber at 5 days, red/pulsing at 7 days

---

## PART 7: NUMBERS TO RECALIBRATE

### Swarm cell count
Current: `4 + randInt(0,9)` = 4-13 cells. Real: 5-20+. Change to `5 + randInt(0,15)`.

### Swarm timing
Current: cells age 2 = swarm. Should be age 1 = swarm (see Priority 1).

### Population after prime swarm
Current: `population * 0.42`. Real: ~50-70% leaves (50-58% of workforce). Current is correct at the lower end — keep or adjust to `* 0.45`.

### Virgin mating timeline
Current: `queen.age >= 2` for mating attempt. Real: orientation 5-6 days, mating up to ~day 14-20 post-emergence. 2 game weeks is approximately correct — keep.

### Super capacity
Current: `SIM.honeyPerSuper = 13 kg`. Real: 10-15 kg for a National shallow super, ~13kg is correct. Keep.

### Brood frame capacity
Current: `6500 cells`. Real: ~8,000 cells total on both sides of a National DN frame (6,500 + some). Close enough — keep.

### Foraging rates
Real: `~3-4 kg nectar → 1 kg honey`, good flow = `1-3 kg/day net`. UK annual surplus = 20-50 kg. Currently need to verify `SIM.nectarRate` produces something in this range.

### Winter stores
Current: Starvation triggers at `colony.honey <= 0`. Real: colony needs 18-25 kg total. Need to check if `broodBoxStoreCap` in data.js reflects this and whether the advisor correctly warns the player at ~20 kg stores going into autumn.

---

## PART 8: IMPLEMENTATION ORDER

1. **Swarm timing fix** — `age >= 1` not `age >= 2`. One-line change. Immediate impact.
2. **Clipped queen correction** — remove the "cells cleared" line. Queen cells progress normally after abort.
3. **Inspector urgency** — days-since-inspect badge on hive card during swarm season.
4. **OSR crystallisation** — new risk mechanic for the spring flow.
5. **Super centre-outward fill** — `colonyWeeklyLayoutSync` frame weight array.
6. **Rainbow pattern distribution** — improve `colonyWeeklyLayoutSync` brood frame zone logic.
7. **Demaree action** — new action in actions.js + UI button.
8. **Clearer board as pre-harvest step** — make it a deliberate player action.
9. **Cast swarm mechanics** — after primary swarm, remaining cells → chance of cast.
10. **MAQS with supers** — fix the treatment restriction.

---

## PART 9: WHAT THE PLAYER EXPERIENCE SHOULD FEEL LIKE

**A typical May week**, done right:

> You open Rose's hive. The brood box is wall-to-wall — 10 of 11 frames covered. You lift frame 6 and see the classic rainbow: eggs in the centre (queen's been laying here in the last 3 days), a ring of curled white larvae, then the large dome of capped brown brood, a bright pollen arc, and honey arching the top corners. Looks good. But as you check the bottom edges — three frames have fat peanut-shaped cells hanging down. **Queen cells. Charged.** Seven of them.
>
> You have one week. The cells will cap by Thursday and the swarm will leave.
>
> Options: artificial swarm (split the colony, put the queen on the old site, the flying bees will return to her — you'll lose some honey production but the cast risk is controlled); Demaree (keep everything on one hive, but you must come back in exactly 7 days to knock down the top-box cells or it fails); clip the queen (buys one week but the first virgin will lead a cast next week regardless — you're kicking the problem down the road). Or do nothing: lose 60% of your bees and this season's crop.
>
> You decide on the artificial swarm. The new colony on the old site fills up immediately as the foragers home in. You reduce the old box to two queen cells and move it 50cm to the left. Week later: check the old box for casts. The virgin has emerged. Another week: is she mating? She needs warm afternoons, dry weather. The mating window is closing.

This is what the game should feel like. Every decision has a timer. Every mistake is visible in the colony weeks later.

---

*Document version: 2026-05-17. Based on BEEKEEPING-REFERENCE.md + cross-check of current game files.*
