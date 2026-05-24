# The Apiarist — Universe Vision

*Planning document for the long arc. None of this is built yet. The current single-player game is the foundation; this doc describes what we are building toward and what choices in the present should keep doors open for the future.*

---

## What this becomes

A persistent beekeeping universe. Real beekeepers play in their real countries, in real climates, with the real bee strains and pests of where they actually live. Their apiaries sit on a shared map next to each other. Their swarms are each other's swarms. Their honey is sampled and graded. Their journals are private but their trades and ads are public.

Single-player today. The simulation is built so that the same systems support a multiplayer mode where time advances on a real-world clock and other players are players, not NPCs.

This document captures the shape of the universe so every choice we make in the single-player build keeps the multiplayer door open.

---

## The North Star, restated

*"Make the player feel what real beekeeping feels like: a patient, seasonal craft where consequences unfold slowly and wisdom accumulates over years."*

The universe must amplify this, not dilute it. Every addition is weighed against: does this make the craft feel deeper, or does it turn the game into a management dashboard? Bee strains by country = deeper. Buying a nuc from your neighbour = deeper. A daily login streak with rewards = no.

---

## The big architectural shifts

### 1. Location is a first-class concept

Every player picks a location at game start. The current `siteType` (rural, urban, etc.) sits *under* a country and region. The country determines:

- **Native bee strains available at market** (UK: Buckfast, Carniolan, Italian, AMM; US: Italian, Carniolan, Russian, Saskatraz; Japan: Apis cerana japonica + Apis mellifera; Australia: limited imports, Italian dominant; etc.)
- **Climate envelope** — temperature ranges, weather variance, length of nectar season, severity of winter
- **Forage calendar** — what flowers in what week (oilseed rape in UK April, sourwood in US-South June, manuka in NZ summer, etc.)
- **Pest pressure** — Asian hornet (Vespa velutina) in France, giant hornet (Vespa mandarinia) in Japan, small hive beetle in US south, mites everywhere but at different baselines
- **Regulatory friction** — registration requirements (BeeBase in UK), notifiable diseases, hive specs (Langstroth dominant in US, National in UK, Dadant in France, top-bar in parts of Africa)
- **Equipment vendors** — National vs Langstroth vs Dadant frame sizes; brood box dimensions differ
- **Honey market norms** — gate vs farmers market vs jar size conventions; price per kg varies wildly

This is not 50 separate games. It's one game with parameter sheets per country plus the relevant pests and strains. Add countries incrementally — UK first (already there implicitly), then US-Northeast, US-South, France, Japan, NZ.

### 2. Bee strains as a real mechanic

Not flavour. Each strain has a genetic profile:

| Trait | Italian | Carniolan | Buckfast | AMM | Apis cerana |
|---|---|---|---|---|---|
| Spring buildup | Fast | Explosive | Steady | Slow | Steady |
| Honey production | High | High | High | Modest | Modest |
| Temperament | Calm | Calm | Calm | Defensive | Defensive |
| Winter cluster | Weak | Strong | Strong | Very strong | N/A |
| Disease resistance | Low | Moderate | Moderate | Moderate-high | High (varroa) |
| Swarming tendency | Low | Very high | Low | Moderate | High |
| Foraging range | Wide | Wide | Wide | Wide | Short |

When the player buys a nuc, the strain is named. When they catch a swarm from the wild (or from a neighbour), the strain is *unknown until they get the queen examined or send a bee sample for ID* — a real mechanic.

When two strains crossbreed (player has Italian, neighbour's drones from Carniolan colonies mate with player's virgin queens during mating flights), offspring are *hybrid* with mixed traits. Hybrid vigor exists in the F1 generation but the F2 generation often shows aggression and unpredictability — this is real and well-documented. The game can teach it.

### 3. Neighbours (single-player today, real players later)

Even in single-player mode, the map shows other apiaries within a foraging-radius (~3-5 km). They are NPCs running simplified versions of the same simulation. They:

- Have their own colony strains (set at the regional bee-strain distribution)
- Have their own swarm events (which can be caught by the player's bait hives)
- Provide drone influence on the player's virgin queens during mating flights
- Post ads occasionally on the in-game marketplace
- Trade equipment, nucs, and sometimes honey with the player

NPC behaviour is deterministic enough to feel real (Sarah down the road always raises Buckfast; Tom in the orchard always overwinters too many). When multiplayer arrives, NPCs are replaced (or sit alongside) real players at the same coordinates.

### 4. The marketplace (Nextdoor-meets-eBay for bees)

A standalone view in the game. The player can:

- **Post an ad**: "Two used National brood boxes, £20 each, collection from Sheffield"
- **Browse ads** from neighbours and the wider regional market
- **Reply to ads** — opens a thread-style negotiation, settles to a transaction
- **List a nuc for sale** in spring — generates income when other players (or NPCs in single-player) need bees
- **Auction off equipment** at end of season

Marketplace rules:
- Listing fee small (~£1) to prevent spam
- Reputation tracked (good sellers get faster sales, scammers get blocked)
- Transactions affect both parties' inventory and cash
- Distance matters — local pickup vs courier shipping cost

This is the social/relational layer (the Octalysis "Relatedness" drive, currently 0/3 in single-player) without requiring leaderboards.

### 5. Sampling and identification

Two services beekeepers can pay for:

**Honey composition sample.** Send a sample to a lab → wait 4 weeks → receive a breakdown: dominant pollen types, percentage moisture, predicted floral source. Cost ~£25. Used to verify single-source claims (heather, manuka), to detect adulteration in honey you bought, to settle disputes in the marketplace.

**Bee identification.** Send 10 worker bees → wait 2 weeks → receive a probabilistic strain assessment. Cost ~£15. Used after catching an unknown swarm or after buying from an ad where the seller's strain claim is unverified.

These services make the craft *richer* (knowing what your honey actually is, what your bees actually are) and give players something to spend money on that isn't more equipment.

### 6. Multiplayer transition

Single-player today. The same data model and simulation supports multiplayer with two changes:

**Time.** Single-player: player controls advancement (one-week-per-click). Multiplayer: real-world clock, 1 week = 1 day (so a multiplayer year = 52 days). Players who don't log in for a week miss decisions; their bees keep doing what bees do (slowly starving or thriving) without intervention. The "skip to next event" button vanishes in multiplayer.

**Other players.** NPCs become avatars for real players at their coordinates. A swarm event that an NPC neighbour produced becomes a real swarm event one of their colonies produced. The marketplace becomes real money potentially (PayPal-backed transactions for premium tiers), or in-game currency only (free tier).

Push notifications: "Inspection due on Rose — last opened 9 days ago, swarm cells likely." A real beekeeper's anxiety, mechanized.

---

## What the present-day build should already accommodate

These choices in the current single-player game preserve the universe doors:

### Schema decisions

- **Colony has a `strain` field.** Currently implicit. Add `strain: 'national-mixed'` as default; expose in colony details. When strains are added properly, this becomes the join key.
- **Colony has a `bornIn` field.** Currently `apiaryId` is enough. Add `originCountry: 'UK'` per save — future cross-region trades need it.
- **Save has a `worldVersion` field.** So we can migrate old saves into the universe schema.
- **Queen has a `geneticLineage` field.** Currently has `temperamentGene`, `hygieneGene` — add `parentStrains: ['italian', 'carniolan']` to support hybrid lineage tracking.

### UI decisions

- **A "Map" view exists.** Currently shows your apiary sites in the region. Future: shows neighbours' apiaries (NPC or real) within foraging distance.
- **A "Records" view exists.** Future: a "Trades" tab joins Finances and Journal.
- **The Handbook is encyclopaedic.** Future: handbook articles can be country-aware ("In the UK, oilseed rape is the dominant spring nectar source. In the US Northeast, it's dandelion and maple.").

### Behaviour decisions

- **Don't bake in UK-specific assumptions.** The current sim has UK seasonality hardcoded. Refactor toward a `region` object that exposes the calendar, the pests, the regulations. UK becomes the first region; the second region's plumbing is what proves the abstraction.
- **Don't add features that break in multiplayer.** Save-scumming, mid-game difficulty changes, anything that lets a player rewind. Single-player can afford it but multiplayer cannot. Stop adding them now.

---

## Sequencing (rough)

1. **Now (this session and the next few):** Single-player polish. The mobile UX cleanup, the Winter Letter, the gamification fixes from the four-agent critique. Goal: a single-player game that is genuinely good.
2. **Phase 1 (1-3 months):** Schema refactor toward `region` and `strain` as first-class concepts. UK remains the only region but the abstraction is real. Begin showing NPC neighbours on the Map.
3. **Phase 2 (3-6 months):** Bee strain mechanics — different starting strains, observable trait differences, the F1/F2 hybrid problem. Plus sampling and identification services.
4. **Phase 3 (6-12 months):** Marketplace MVP (NPC-only). Ads, transactions, basic reputation.
5. **Phase 4 (12+ months):** Second region (US-Northeast or France). The plumbing built in Phase 1 gets exercised.
6. **Phase 5 (when ready):** Multiplayer alpha. Real-time clock, real players replacing NPCs at coordinates, push notifications, premium tier.

---

## What this isn't

- It isn't Farmville. No timers that gate gameplay behind real money. No daily bonus chests. No streaks that punish missed days.
- It isn't Hay Day. The economy is meant to be a real beekeeper's economy — hard to break even in year 1, profitable in year 3+ with discipline.
- It isn't Eve Online for bees. Multiplayer interactions are local and craft-driven, not strategic warfare. Your neighbour cannot raid your apiary.
- It isn't a social network. There are no profiles, no follows, no comments under photos. The social layer is *the marketplace and the shared map*, nothing more.

The North Star rules. Every feature in this vision must pass: does it make the player feel more like a beekeeper, or less? If less, it doesn't ship.

---

## Open questions

1. How much localisation effort do we want to invest per region? UK probably bilingual-ready (English only is fine), but France needs French copy. This is a real cost.
2. Real money in the marketplace — Stripe/PayPal complexity is high, fraud risk is real, but it's the obvious revenue path. Or stick with in-game currency only and charge subscription?
3. NPC quality — how smart do single-player neighbours need to be to feel real? Cheap (random) is bad. Expensive (mini-simulation per NPC) is good but costly.
4. Save sync — local-only saves today. Multiplayer needs server-side state. Do we move saves to server in Phase 1 to prove the migration?
5. Mobile vs web vs native app — current build is web-only, plays well on mobile via PWA. Native apps unlock push notifications natively but add app-store friction. PWA push works on Android but not iOS reliably.

These are decisions for later, but worth being explicit about now so the current build doesn't accidentally close any of these doors.
