# The Apiarist — Design Vision

*First-principles redesign brief. Where MECHANICS-REVAMP.md asks "what's wrong with the simulation", this document asks "what should this feel like to play, and why?" Every UI decision, every new mechanic, every piece of on-screen text should be measured against this.*

---

## The Single Design Goal

**Make the player feel what real beekeeping feels like: a patient, seasonal craft where consequences unfold slowly and wisdom accumulates over years.**

Not a management game where you optimise production. Not a puzzle game with correct answers. Not a tutorial disguised as a game. A simulation of a craft — where you learn by doing, suffer real losses, and gradually develop the instincts of a beekeeper.

If a player finishes Year 2 and says "I didn't realise you had to check every week in May" — we've failed. They should have felt the urgency in their hands.

---

## What a Player Does Each Week: The 5 Core Decisions

Every week reduces to five possible decision categories. Not all five are live every week — in winter, only one or two apply. In peak swarm season, all five may be urgent at once. This is intentional.

**1. Inspect or leave it?**

The central judgment call of beekeeping. Weather tells you if you *can* inspect. The season tells you if you *must*. A colony you haven't opened in 9 days during June is a colony that may have already swarmed. A colony you open in April cold kills brood.

The game should never make this decision for you. But it should make the consequences of getting it wrong visible and painful.

**2. Respond to what you found?**

Inspection produces information. Information requires a response. Queen cells: what method? Low stores: how much feed, now? High varroa: treat or wait for the crop to come off? Disease sign: report it or watch another week?

These responses are the craft. The game teaches them not through tutorial text but through showing what happens when you delay.

**3. Add or remove equipment?**

Super on or off. Feed or stop feeding. Mouse guard in. Clearer board before harvest. These are the practical mechanical acts of beekeeping — small decisions with timing consequences. Miss the window for a clearer board and you're brushing bees off frames all afternoon.

**4. Plan a sale?**

Honey sits in inventory and does nothing. Selling it requires logistics (jars, a market pitch, an established channel) that take time to build. A player who harvests 30kg in August and hasn't thought about sales is holding a depreciating asset in September.

**5. Winter/between-season preparation?**

The things you do once and can't undo easily: autumn feeding weight, varroa treatment timing, equipment maintenance, ordering next year's queens. The beekeeping year is not evenly distributed. These decisions cluster at the season boundaries.

---

## The Core Loop

```
Week starts
 ↓
Weather + forage: read the context
 ↓
Colonies: heft / observe from outside / inspect if appropriate
 ↓
Decide and act (the craft)
 ↓
Time advances: bees respond to your decisions
 ↓
Next week
```

The key design principle embedded in this loop: **the player observes before acting, and consequences appear weeks later.** This is exactly how beekeeping works. The game should never short-circuit it by giving immediate feedback ("Good inspection! +5 XP!"). The feedback is the colony's condition in three weeks.

---

## Information Hierarchy: What You See at a Glance, What Requires a Click

This is the most important design constraint. Information architecture should mirror how a beekeeper actually relates to their hives.

### At a glance (the yard view)

A beekeeper walking into their apiary can assess their colonies in 90 seconds without opening anything. They read:

- **Bee activity at the entrance** — foragers coming in loaded with pollen? Colony is alive, queen is laying, forage is on. Very few bees? Could be the cold, or could be something worse.
- **The weight** — is the hive heavy or light? A light hive in October is an emergency. This is the heft.
- **The structure** — supers on? How many? Has anything moved or blown over?
- **Anything unusual** — dead bees outside in a pile (chilled brood ejected, or varroa die-off), fighting at the entrance (robbing), a cluster hanging outside in a swarm.

The yard view should show exactly this. Not a dashboard. An apiary.

**What the hive card communicates without clicking:**
- Entrance activity (animated bees, calibrated to weather and population)
- Stack height (supers visible as physical boxes)
- One status signal — either clear/healthy, or a single priority alert
- Name and a one-line status

**What it does NOT show without clicking:**
- Stores weight
- Brood condition
- Varroa level
- Precise population
- Honey type in supers

A player who doesn't inspect doesn't get to know these things. This is the design. Fog of war is the mechanic.

### One level down (the heft / quick check)

Without opening the hive, a beekeeper can lift the back of the hive to judge weight. They can listen for the reassuring hum of a large cluster. They can see pollen going in and judge whether the queen is laying.

In the game, this maps to: **a quick check action** that costs no weather and reveals only three things:
- Hive weight (stores band: heavy / adequate / light / alarmingly light)
- Entrance activity (pollen in = queen active)
- Any obvious external problem (bees fighting = robbing)

This should be always available. It represents the responsible beekeeper who doesn't open hives unnecessarily in bad weather but still stays connected to their colonies.

### Full inspection (the opened hive)

Requires: a warm enough day (13°C+ min), no rain, player has suit + smoker.

Reveals: everything. Population estimate, brood pattern, queen seen or eggs present, stores on frames, queen cells present, disease signs, varroa wash estimate if requested.

The frame-by-frame view should be genuinely readable — not a data table but a visual representation of the comb. A player who learns to read the rainbow pattern isn't reading a tooltip. They're learning what a healthy brood frame looks like.

**Teaching mechanism:** the inspection modal asks questions rather than presenting facts. "Can you see eggs?" forces the player to look at the right frame (frame 6, the warm centre). The answer determines whether the queen was laying in the last 3 days. This is the real inspection protocol. The game teaches it by making you do it.

### Deep analysis (the handbook / data view)

Everything else — historical mite counts, honey production graph, last year's winter weight — lives behind a tab that a new player probably won't open for weeks. This is fine. A beginner beekeeper doesn't track everything. They learn to track things after they lose a colony to something they weren't watching.

---

## How the Game Teaches Without Telling

The design anti-pattern is: event fires → modal pops up → text explains the concept → player reads (or skips) → moves on.

The design we want: consequence appears → player notices the colony is wrong → they investigate → they work out what happened → they know it in their gut.

### Example: teaching varroa

**Wrong way:** Tutorial pop-up: "Varroa is a mite that damages bees. Treat in August after removing supers." Player treats in August. Nothing bad happens. They've learned nothing except that August is the treatment month.

**Right way:** Player gets through Year 1, doesn't treat (they didn't know they had to, or they delayed). By October, the winter bees are damaged. The colony goes into winter looking reasonable — maybe 18,000 bees, stores look fine. In January/February, it collapses. The log says: "The colony dwindled. The last bees were crawling outside in the cold." A post-mortem advisor message (not a pop-up, a note in the event log) says: "Autumn varroa levels were high going into winter. Winter bees reared under heavy mite pressure are short-lived. This colony probably ran out of healthy bees before it ran out of food."

The player now understands varroa in a way no tutorial could deliver. The treatment calendar in the handbook has context it didn't have before.

### Example: teaching swarm control

**Wrong way:** Day 14 of May, advisor says "Queen cells present! Do artificial swarm." Player clicks "artificial swarm." Pop-up explains what it is. Colony splits. Player learned nothing except which button to press.

**Right way:** Player inspects Rose on a Tuesday. Sees queen cells — 7 of them. They're cells, not capped yet. Advisor says "You have at most one week before that swarm leaves." Player decides to check back in a few days. Life happens. They come back a week later. Log says: "Rose swarmed. About 60% of the bees left with the old queen. The remaining colony is queenless with a virgin that hasn't mated yet." Player: "Oh. *One* week meant one week."

They look up artificial swarm in the handbook now. They read it with a specific problem in mind. They remember it.

---

## The Year Arc: How Learning Compounds

### Year 1: The Novice (1 colony, April start)

**Goal:** Get through to spring. Learn the rhythm.

**What should feel hard:**
- Not knowing when to open the hive (weather/season judgment)
- Not knowing what to look for when you do
- The OSR honey crystallising in the comb if you don't harvest quickly enough
- Autumn feeding — not knowing how much is enough until the weight is right
- The first winter: just leaving it alone is hard when you're anxious about them

**What should feel rewarding:**
- The first frame you lift that looks like the textbook rainbow
- The first harvest — even if it's only 8kg from one colony, it's yours
- The colony coming through winter and building up in March
- The moment you heft an autumn hive and feel the weight of enough stores

**Year 1 knowledge unlocked through play:**
- Inspection protocol and weather judgment
- Forage calendar (you notice the June gap when the supers stop filling)
- Varroa — hopefully through a close call rather than a loss
- Basic winter prep

**What Year 1 should NOT include:**
- Swarm control decisions (the game should engineer the first swarm season to just narrowly fail to swarm — high pressure, player barely responds in time, but no swarm)
- Multiple colonies
- Disease decisions (Year 1 should stay clean — the player is already at capacity)

### Year 2: The Improver (1-2 colonies, swarming is now real)

**Goal:** Get through swarm season without losing the swarm. Make a split.

**What changes:** Swarm season is now real. The colony that came through winter is strong and wants to swarm. The player now knows the rhythm but faces the timing challenge for the first time.

**Key learning events:**
- First swarm cells found — one week to act, real pressure
- Making a split (artificial swarm or walk-away split) — the first time you have two colonies and both need attention
- Requeening if the split fails and the virgin doesn't mate (weather window too short)
- Deciding whether to unite a weak late-season colony or try to winter it separately

**Skill signal:** At the end of Year 2, the player should be able to make a correct inspection decision without consulting the handbook. They should know: eggs = queenright. Swarm cells on bottom bar = act now. Light to heft in September = feed.

### Year 3: The Competent Beekeeper (3-5 colonies)

**Goal:** Manage multiple sites. Treat varroa correctly. Start thinking about honey as a business.

**What changes:** Scale introduces new complexity. You can't inspect every colony every week. You have to prioritise. A colony you haven't visited for 10 days during May is a real concern, but you have three others to deal with first.

**New decisions:**
- When to add a second apiary (different forage character, different timing)
- Selling honey through multiple channels
- Building enough queens to replace aging queens proactively rather than reactively
- Whether a colony is worth wintering or better to unite (experienced judgment call)

**The psychological shift:** Year 3 is where the game stops feeling like a tutorial and starts feeling like a craft. The player should be making the same decisions as a real beekeeper — not because the game told them to, but because they've internalised the rhythm.

---

## Specific Design Principles for Every Decision Going Forward

### 1. Fog of war is sacred

The player knows only what they've observed. A hive they haven't opened in 10 days is a mystery. The game state knows the truth; the player does not. `colony.known` vs `colony` — this distinction must be maintained and expanded, never shortcut.

**Corollary:** The mentor/advisor can only advise based on what the player has observed. If the player hasn't inspected Rose in two weeks, the mentor says "Rose needs inspection" — not "Rose has 4 queen cells." The mentor is experienced but not psychic.

### 2. One week is a real constraint

In swarm season, the game calendar should feel like a real weekly deadline. "One week" must mean one week. Swarm cells cap at age 1 (7 days), not age 2. The player who skips a week in May is genuinely taking a risk. This tension — inspect every 7-9 days or face consequences — is the central mechanical experience of spring beekeeping.

### 3. Decisions cost time, not just money

An inspection costs weather. Making a split costs a spare hive. Applying treatment costs a week's worth of activity. The resource being managed isn't primarily money — it's the beekeeper's available time and attention. A player with 5 colonies in May has the same hours as a player with 1 colony, but 5x the inspection load.

This should feel increasingly tense as the player expands. Scaling up is not inherently a good thing. It requires genuine capacity.

### 4. Equipment has physical presence

A super is not a stat increase. It's a physical box you add to the hive when the colony is filling up. You need a spare one. It costs money. It has drawn or undrawn frames. When you add one, it sits on top of the brood box and takes time for the bees to start working. This physicality matters because it teaches the real activity of beekeeping.

The "spare hive" visible in the yard view — the empty hive waiting for bees — is a good precedent. Expand it. Equipment you own should be visible somewhere, not just a number in inventory.

### 5. Consequences should feel inevitable in retrospect

When a colony dies, the player should be able to trace exactly why. The event log should tell the story. Not "colony collapsed" but a trail: high mite count in September → winter bees damaged → cluster shrank faster than normal → colony too small to maintain warmth → February die-off.

This is how experienced beekeepers actually do post-mortems on losses. The game should model that habit.

### 6. The handbook earns its place

Every topic in the handbook should be something the player encountered in play before they looked it up. "Artificial swarm" shouldn't be something a new player reads in week 3 to prepare. It should be something they frantically search after they find queen cells for the first time.

The handbook is the reference manual, not the curriculum. The curriculum is the apiary.

### 7. Seasonal rhythm should feel embodied

The game has an excellent forage calendar and weather system. These should be felt, not just read. The June gap — when nectar drops sharply after the spring flow — should be a moment the player notices: "The supers have stopped filling. Why?" Then they check the forage note and see "the June gap — clover and bramble only just starting." Understanding arrives through observation.

Similarly, the moment in autumn when the days get shorter and colonies stop expanding — the player should feel this as a shift in pace. Inspections become less urgent. The year is wrapping up. Winter preparation takes over.

### 8. No numbers where intuition should live

A beekeeper doesn't look at a hive and see "varroa infestation rate: 2.8%." They see deformed wing virus signs on some young bees. They do a sugar roll and count mites. They know from experience that what they're seeing is serious.

The game should use language and visual signals, not raw numbers, for most feedback. A varroa level that shows as "low / moderate / high / critical" with a description of observable signs teaches the right thing. Showing "varroa: 47 mites" teaches nothing about real beekeeping.

This is the clearest line between "beekeeping simulator" and "beekeeping teacher." The teacher translates numbers into what a beekeeper would actually observe.

### 9. Years should accumulate meaning

The game's title progression — Apprentice, Beekeeper, Improver, Sideliner — should feel earned, not ticked. By Year 3, the player should be making faster decisions, not because the game is faster, but because they don't need to look things up anymore. Their skill level should reflect something real about what they've internalised.

One concrete mechanism: experienced beekeepers get fewer words from the mentor. By Year 3 at skill level 5, the mentor is a check rather than a guide. The player who depended on mentor warnings to catch swarm season is now checking their own colonies on schedule. That shift is the learning outcome.

### 10. Failure should be educational, never arbitrary

A colony lost to starvation because the player didn't feed in autumn should produce a clear, traceable post-mortem. A colony lost to disease should trigger the right response system — notifiable disease requires a call to the regional inspector. Losing your first colony to something avoidable hurts. It should. But it should also leave the player knowing exactly what they would do differently, not feeling like the game cheated them.

Arbitrary bad luck (a storm destroys a hive, a rogue spray event kills a colony) should be rare, telegraphed in advance where possible, and never the primary cause of failure. The game is teaching craft. Craft failures are instructive. Dice failures are not.

---

## The Feeling We're Going For

A player who puts down the game after an evening session should feel:

- Something like the satisfaction of having made real decisions that mattered
- A mild anxiety about the thing they didn't quite get around to (Rose's inspection was overdue at end of session)
- Curiosity about what they'll find next time
- Occasionally: "I need to look that up" — and going to a real beekeeping resource rather than the handbook

That last one is the highest ambition: a player who finishes Year 2 and joins their local beekeeping association because the game made them want to know more. Not because the game told them to, but because it gave them enough real experience that they're curious.

---

*Document version: 2026-05-17. Companion to MECHANICS-REVAMP.md.*
