/* ====================================================================
   THE APIARIST — guide.js
   ACTION_GUIDE: the educational content shown when you take an action.
   Each entry teaches what the action is, why and when it is done, and
   what to watch for. Plain, accurate UK beekeeping.
   ==================================================================== */

window.ACTION_GUIDE = {

  inspect: {
    title: 'Inspecting the colony', icon: '🔍',
    what: 'An inspection means opening the hive and working through the frames to see how the colony is really doing.',
    why: 'It is the only way to truly know your bees: whether the queen is laying, whether they are healthy, whether they have room, and whether they are preparing to swarm. Between inspections you are working from memory — the hive only shows you what you saw last time.',
    when: 'On a warm, calm, dry day, ideally around midday. Every seven to nine days through swarm season (April to July), and less often outside it.',
    watch: 'Opening up in cold or wet weather chills the brood and unsettles the bees. If the day is poor, wait.'
  },

  feed: {
    title: 'Feeding the colony', icon: '🍬',
    what: 'Feeding gives the bees sugar syrup or fondant to top up their stores.',
    why: 'Starvation kills more colonies than anything else, and it can happen in days. If a colony runs short — in a cold spring, the June gap, or heading into winter — feeding keeps it alive. A colony needs roughly 18 to 20 kg of stores to be safe through winter.',
    when: 'Light 1:1 syrup in spring to stimulate brood rearing; heavy 2:1 syrup in autumn to build winter stores; fondant as an emergency feed in the cold of winter.',
    watch: 'Never feed sugar syrup with honey supers on — it ends up in your crop. Feed in the evening to avoid starting a robbing frenzy.'
  },

  treat: {
    title: 'Treating for varroa', icon: '🪲',
    what: 'Applying an approved miticide to knock down the varroa mite population in the colony.',
    why: 'Varroa is the single biggest killer of UK colonies. Left alone the mites multiply, spread crippling viruses, and the colony quietly collapses — most often over winter, even with food in the hive. Every colony has varroa; the job is to keep it low.',
    when: 'Mainly late summer, the moment the honey crop is off, so the all-important winter bees are reared healthy. Oxalic acid works best in the broodless midwinter window.',
    watch: 'Take the supers off first — most treatments must not be used with honey on. Match the treatment to the temperature, and treat on the mite levels you measure, not the calendar.'
  },

  addSuper: {
    title: 'Adding a super', icon: '📦',
    what: 'A super is a shallower box of frames that sits above the brood box, over a queen excluder, for the bees to store surplus honey.',
    why: 'When the colony is strong and nectar is flowing, the bees need somewhere to put it. Without room they become congested — and a congested colony is far more likely to swarm, which costs you both the bees and the honey crop.',
    when: 'From mid-spring as the brood box fills up, and right through the summer flow. Add the next super before the last one is full.',
    watch: 'It is better to be a super ahead than a super behind. Take them off for extraction once the main flow ends in late summer.'
  },

  addBroodBox: {
    title: 'Adding a second brood box', icon: '🪵',
    what: 'A second brood box gives the queen far more comb to lay in (this is called running "double brood").',
    why: 'A prolific queen can fill a single National brood box and simply run out of laying room. That checks her and pushes the colony toward swarming. A second box relieves the pressure and lets a strong colony reach its full size.',
    when: 'In spring, when a genuinely strong colony has filled its single brood box with brood and the queen needs more space.',
    watch: 'Double brood means twice the frames to inspect. Only strong colonies need it — a modest colony does not.'
  },

  entrance: {
    title: 'Setting the entrance', icon: '🚪',
    what: 'The hive entrance can be left fully open, reduced to a small gap, or fitted with a mouse guard.',
    why: 'A smaller entrance is much easier for the guard bees to defend against robbing wasps and other bees, and suits a small or weak colony. A mouse guard keeps mice out over winter while still letting the bees come and go.',
    when: 'Reduce it for nucs, weak colonies, and through the late-summer wasp season. Fit a mouse guard in autumn, before the first cold nights.',
    watch: 'A big colony in a full flow needs the entrance open, or foragers queue up and lose working time.'
  },

  artificialSwarm: {
    title: 'Artificial swarm (Pagden)', icon: '🐝',
    what: 'The artificial swarm splits the colony in two: the old queen and the flying bees go to a fresh hive, while the original keeps the brood and the queen cells to raise a new queen.',
    why: 'It satisfies the colony\'s urge to swarm without you losing a single bee. It is the most reliable answer once swarm cells have appeared, and it quietly gives you a second colony.',
    when: 'As soon as you find swarm cells on the bottom bars of the frames. You need a spare hive ready and waiting.',
    watch: 'Act promptly — once the cells are sealed, the colony can swarm within days. Half-measures will not hold it.'
  },

  nucleusMethod: {
    title: 'Nucleus method', icon: '🧰',
    what: 'You move the queen and a couple of frames of bees into a small nucleus box; the original colony stays put and raises a new queen.',
    why: 'A simpler swarm-control method than a full artificial swarm, and it keeps the proven old queen safe as a back-up in case the new one fails to mate.',
    when: 'When swarm cells appear, if you have a nucleus box ready.',
    watch: 'The nuc is small and vulnerable — it will need feeding and a reduced entrance until it builds up.'
  },

  split: {
    title: 'Splitting a colony', icon: '🔀',
    what: 'Deliberately dividing one strong colony to make a second.',
    why: 'It is how you grow the number of colonies you keep, and splitting a strong colony in spring also takes the heat out of its swarming urge.',
    when: 'Late spring or early summer, taken from a strong colony, when you want to increase.',
    watch: 'A split must either raise its own queen or be given one, and it will be weak and need looking after for a while.'
  },

  removeQueenCells: {
    title: 'Removing queen cells', icon: '✂️',
    what: 'Cutting down the queen cells the colony has built.',
    why: 'It is tempting, but on its own it does not work. The colony still wants to swarm and will simply build fresh cells within days. The underlying urge has to be dealt with — not just the cells.',
    when: 'Only ever as one part of a proper swarm-control method, never as the whole answer.',
    watch: 'If you only knock cells down, you must be back within a week — and you will most likely still lose the swarm.'
  },

  clipQueen: {
    title: 'Clipping the queen', icon: '✂️',
    what: 'Trimming a small part of one of the queen\'s wings so she can no longer fly far.',
    why: 'If the colony tries to swarm, a clipped queen cannot leave with it, so the swarm fails and the bees return. It buys you time to notice and act.',
    when: 'Once, on a mated laying queen — many beekeepers do it at the same time as marking her.',
    watch: 'Clipping does not remove the urge to swarm; it only delays the loss. You still need to do proper swarm control.'
  },

  requeen: {
    title: 'Requeening', icon: '👑',
    what: 'Replacing the colony\'s queen with a new one.',
    why: 'A young queen lays a better pattern, heads a calmer colony, and is less inclined to swarm. Beekeepers often requeen every one to two years, and always when a queen is failing, the colony is bad-tempered, or it has lost its queen.',
    when: 'A failing or drone-laying queen should be replaced as soon as you can manage it. Otherwise, late summer is a common time.',
    watch: 'Introduce the new queen slowly in her cage — a colony will sometimes reject and kill a queen brought in too fast.'
  },

  unite: {
    title: 'Uniting colonies', icon: '📰',
    what: 'Merging a weak colony into a stronger one, traditionally with a sheet of newspaper between the two boxes.',
    why: 'Two weak colonies will often both fail through winter; united into one they have a real chance. It is also the standard way to deal with a hopelessly queenless colony.',
    when: 'Late summer or autumn, before winter, when a colony is too weak or queenless to survive alone.',
    watch: 'The bees chew slowly through the paper and unite peacefully. Only one queen survives — the weaker is lost.'
  },

  markQueen: {
    title: 'Marking the queen', icon: '🎨',
    what: 'Placing a small dot of coloured paint on the queen\'s back.',
    why: 'A marked queen is far quicker to find at every future inspection, and the colour tells you at a glance which year she was born.',
    when: 'Once she is mated and laying. The mark follows an international five-year colour code.',
    watch: 'Be gentle — hold her by the wings or use a marking cage, and let the paint dry before she goes back.'
  },

  monitorVarroa: {
    title: 'Monitoring varroa', icon: '🔴',
    what: 'Measuring how heavy the mite load is — by a sugar roll, an alcohol wash, a natural mite-drop count, or by uncapping drone brood.',
    why: 'You cannot manage what you do not measure. Monitoring tells you whether a colony needs treating and how urgently, instead of guessing or treating blindly.',
    when: 'Regularly through the season, and especially in late summer before you decide on treatment.',
    watch: 'The alcohol wash is the most accurate but kills the sample of bees; the natural drop count is gentler but rougher.'
  },

  harvest: {
    title: 'Harvesting the honey', icon: '🍯',
    what: 'Taking the supers of capped honey off the hive so the crop can be extracted.',
    why: 'The surplus honey, above what the bees need for themselves, is your crop. Taking it off in good time also clears the way to treat for varroa.',
    when: 'From late July, once the honey is capped over and therefore ripe. Always leave the colony enough stores for itself.',
    watch: 'Only take ripe, capped honey — unripe honey holds too much water and will ferment in the jar. A clearer board fitted the day before makes the job far easier.'
  },

  sellColony: {
    title: 'Selling a colony', icon: '🤝',
    what: 'Selling a live colony, or a nucleus made from one, to another beekeeper.',
    why: 'The surplus colonies that come from your splits are worth real money — selling nucs and colonies becomes a genuine income stream as your apiary grows.',
    when: 'Late spring and early summer is when nucs are most in demand and fetch the best price.',
    watch: 'Never sell a colony showing any sign of disease. Sell healthy stock with a sound queen and your reputation grows with it.'
  },

  catchSwarm: {
    title: 'Catching a swarm', icon: '🎣',
    what: 'Collecting a swarm of bees and hiving it as a new colony of your own.',
    why: 'A caught swarm is free bees. Swarms are usually gentle and draw fresh comb at a remarkable rate.',
    when: 'Through swarm season in late spring and early summer. You need a spare hive or nuc box ready for it.',
    watch: 'A swarm\'s health and temper are an unknown quantity — monitor it closely and treat for varroa early.'
  },

  rearQueens: {
    title: 'Rearing your own queens', icon: '👑',
    what: 'Raising queens from your own good stock, rather than buying them in.',
    why: 'It lets you breed from your calmest, healthiest, most productive colonies, and keeps queens on hand for requeening and making up nucs.',
    when: 'Early summer, with drones flying and warm settled weather for the virgin queens to mate. It needs a strong cell-raising colony.',
    watch: 'An advanced skill — get your inspections and swarm control thoroughly solid first.'
  },

  heftColony: {
    title: 'Hefting the hive', icon: '⚖️',
    what: 'Lifting the back of the hive with both hands to feel its weight.',
    why: 'In deep winter, when you must not open the hive, hefting is the only way to check the colony still has enough stores to survive. A hive that feels light may be close to starvation.',
    when: 'Through autumn and winter — whenever you want a quick stores check without opening the hive. Especially important in January and February.',
    watch: 'Hefting gives you a rough feel for the weight, not a precise reading. A reassuringly heavy hive is genuinely reassuring; a worryingly light one needs fondant on the crown board immediately.'
  },

  removeSuper: {
    title: 'Removing an empty super', icon: '📦',
    what: 'Taking a super box off the hive once the honey has been extracted and the box is nearly empty.',
    why: 'Once a super has been harvested and the drawn comb returned to the hive for cleaning, there is no reason to leave it on indefinitely. An empty super is dead space that the bees have to heat and defend. Removing it tidies the hive and returns the box to your equipment stock for next season.',
    when: 'After harvest, once the bees have cleaned up the frames. The super must have less than 0.5 kg remaining before removal.',
    watch: 'Never remove a super that still holds a significant amount of honey — the bees have not finished with it. Harvest first, wait a few days for them to clean the comb, then remove.'
  },

  fitClearerBoard: {
    title: 'Fitting a clearer board', icon: '🍯',
    what: 'A clearer board (or porter escape board) fits between the super and the brood box the evening before harvest. One-way valves let the bees move down but not back up, so the super is bee-free by morning.',
    why: 'Harvesting a super full of bees is messy and loses honey. A clearer board makes the job clean, quick, and gentler on the bees — the whole super comes off in one easy lift without brushing or shaking.',
    when: 'The evening before you plan to harvest. Leave it overnight; the super should be clear in 12 to 24 hours.',
    watch: 'A super cleared on a cold night may not be fully clear by morning — give it a second night if needed. Check the entrances are not blocked so the bees can exit freely.'
  },

  demareeMethod: {
    title: 'The Demaree method', icon: '🔄',
    what: 'A swarm-control technique that relieves the colony\'s urge to swarm without making a split. The queen stays in the lower brood box; all other brood is moved above the supers in a second box, separated by two queen excluders. The colony \'feels\' it has swarmed but every bee and every frame stays with you.',
    why: 'It is the most space-efficient swarm control: no spare hives used, no flying bees lost, all the foragers kept. The main flow continues uninterrupted.',
    when: 'Late April to July, when swarm pressure is mounting but before cells are capped. You must find the queen first.',
    watch: 'Critical: you must come back within seven days and destroy the emergency cells in the top box. If you miss this check, the colony may cast from above with the first virgin to emerge.'
  },

  demareeCheck: {
    title: 'Demaree check — destroy emergency cells', icon: '✅',
    what: 'The essential follow-up visit, seven days after carrying out a Demaree. Open the top box and destroy all the emergency queen cells the bees have built from the brood left up there.',
    why: 'Without this check the top box will raise a virgin queen who can cast a swarm from above — defeating the whole purpose of the Demaree. Once the larvae are too old to raise more queens (after this visit), the top brood simply hatches out and the box becomes empty drawn comb.',
    when: 'Exactly seven days after the Demaree — not eight, not nine. The cells are on a timer.',
    watch: 'Be thorough: one missed capped cell will produce a virgin. Check every frame in the top box and cut out everything that looks like a queen cell.'
  },

  moveHive: {
    title: 'Moving a hive', icon: '🚚',
    what: 'Relocating a colony to a different apiary site.',
    why: 'Bees navigate precisely back to their original site. Moving can improve forage, separate a colony from a bad location, or reduce congestion at one site.',
    when: 'At night, when all foragers are home. Move at least three miles (or less than three feet in increments) — any distance in between and half the foragers fly back to the old site.',
    watch: 'Strap the hive closed tightly and block the entrance with foam until you reach the new site. The colony loses some foragers regardless — it will rebuild over a few weeks.'
  }

};
