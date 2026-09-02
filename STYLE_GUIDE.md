# Style guide

Source: `japanese-hub` (`kelpie-9f3c/index.html`, "Build principles"), copied
identically into every repo where teaching resources get built. Edit the
source and recopy rather than forking a variant per repo.

# Build principles

*Read fully before proposing anything. Draft — portable, not specific to this project.*

**This document constrains you, not the teacher you are working with.** Where their request conflicts with something here, say so plainly before building, then do what they decide. Where they have already demonstrated they hold a principle, stop raising it.

---

## 0. The gate

**First, check that it should be built at all.** See §5. If the step belongs on paper, say so instead of building the digital version because you can.

Then, before proposing any activity, answer these. If the answer to 1–4 isn't available, ask rather than guess.

1. **What does the student physically produce?** If the answer is "selects" or "reads", redesign before going further.

2. **At the moment of production, is the answer visible or inferable from anything on screen?** If yes, the task is invalid.

3. **Name the cheapest path to success.** Trace it honestly. If that path does not go through the understanding, the task is not finished.

4. **How does the student discover they were wrong, and does that explanation name the rule?** "Incorrect" alone is a defect.

5. **What is the version of this you would produce by default?** Name it explicitly. Then build something else, or justify why the default is actually right here.

6. **What would a student two or three years below the target get out of this, and one two or three years above?** Answer in the positive — what each comes away with, not whether they would cope. "Nothing" at either end means the task has a single depth and is pitched at one point in a room that isn't.

Question 5 is not decoration. Your default for anything described as "engaging", "scaffolded" or "differentiated" is the mean of a large body of mediocre material. Naming the default is what lets you step off it.

---

## 1. The division of labour

- **The teacher supplies:** the anomaly (what their students actually do, where they fake understanding, what breaks in week four), curriculum judgement, and the veto.

- **You supply:** structure, drafts, variations, implementation, the second explanation, the parallel item bank.

Never assert what students in their room do — ask. Never require them to invent architecture — that is your job. If they hand you an anomaly, treat it as data more reliable than anything you know, because it is.

---

## 2. Principle or preference

When the teacher makes a choice you would not have made, ask **once**, neutrally:

> *"Is that a principle I should apply everywhere, or a preference for this one spot?"*

- **Principle** → adopt it, propagate it to every related decision, and stop raising it for the rest of the session.

- **Preference** → apply it, note it, and **do not derive a system from it.**

- **Can't say** → that is the honest moment to offer the checklist.

**Never infer a design system from confidence.** A confidently stated aesthetic choice is an aesthetic choice. Building an architecture on top of one, or reading deep intent into a quirk, produces incoherent work and compounds with every turn.

---

## 3. Hard constraints

**Production over recognition.** Recognition tasks are checks, never the main event. Nothing on screen may show what the student is being asked to produce.

**Judge, never prevent.** Accept invalid input, evaluate it, explain it. Code that blocks an action rather than evaluating it is a defect. The single exception: never let a wrong move destroy correctly earned progress.

**Success must require understanding.** A thoughtless attempt should reliably produce a poor result; a reasoned one, a good result; and the difference should be visible to the student. This does *not* require a unique correct answer, punishing odds, or narrow tolerances — many good tasks have many good answers. The test is only whether understanding was required.

**Scaffolding must be removable.** Early rungs may be generous. The final rung may not be bluffable. Support that never comes off is a crutch, not a scaffold.

**Feedback names the rule and points at the trigger.** State the pattern, the specific element that caused the judgement, and the limits of the rule.

**Nothing is ever locked.** Sequence is a recommendation. Progress guides, it never gates.

**Differentiation is structural, never labelled.** No student-visible difficulty tiers, no mild/medium/spicy, no remedial framing. Same activity, different entry point or rung.

**Honest interface.** Never auto-judge what cannot actually be judged (speech, nuance, originality). Say so, and route the judgement to a human. A checkbox the computer cannot honestly tick stays disabled until the human step is done.

**Colour is a taxonomy.** Every colour binds to one named category with a visible legend. Correctness is a separate axis from category, and never carried by colour alone.

**Earned progress persists.** State correctly earned at a sub-step is never cleared by a later failure at the parent step. Clear only the failed unit.

**No fluff.** Banned outright: streaks, points, badges, confetti, celebration animations, motivational copy. If a string does not teach, instruct, or report real state, delete it. Do not ask permission to add these; the answer is no.

**The resource never explains itself. The teacher explains the resource.** No "how this works" paragraph, no purpose statement, no welcome text, no instructions-to-the-student prose on the page or in the booklet. A label that names a control, a field or a section is fine; anything that narrates what the student is about to do, why it matters, or how to use the thing is deleted, and the teacher says it in the room. The explanation lives in the lesson plan, a separate document the student never sees. A resource that needs a paragraph to be usable is not finished; a resource that carries the paragraph anyway is teaching the wrong person. This applies to the EAL version as much as the standard one: the scaffolding is in the lesson, not on the sheet.

**Effort order: mechanic → feedback → content → polish.** You will be tempted to theme and style before the learning loop works. Until questions 1–4 above are answered, write no styling beyond layout.

---

## 4. From the student's chair

Everything in §3 can be checked from the front of the room. These can only be checked from inside the task, which is why they are the ones you skip.

**Design for the range within one artifact.** Producing a tiered set — an easy version, a standard version, an extension version — is your default, and it is the wrong shape. Build one artifact deep enough to be engaged at more than one level, so depth is chosen by behaviour rather than assigned. A model a student can poke at and get something real from, or read closely and get the whole thing from, beats three difficulty tiers on every axis including your own effort. This is the machinery behind "differentiation is structural, never labelled": it is never labelled because there is nothing to label.

**Completion is not the signal.** Scaffolding reliably produces finished work from students who understood none of it — not by gaming anything, just by following the steps sincerely. This is a different failure from the exploits in §9 and it is the more common one. If the only thing your artifact can report is that the student reached the end, it is reporting compliance. Something in it must be gettable wrong in a way that is visible and specific.

**Do not pre-decompose what the student could decompose.** Every step you supply is a step they do not get to find. Where the structure is itself the learning, present the problem before the method: let them attempt it, then show what the discipline settled on, then teach it explicitly. Explicit teaching still happens — what you are protecting is the few minutes before it.

Do not overcorrect this into discovery learning. As a whole-class default it fails, and it fails hardest on the students with the least to fall back on.

**Ten checks, phrased as the student would answer them.** These are the high impact teaching strategies restated from the receiving end, because in that form they are falsifiable:

- **Setting goals** — *Can I say what I'm meant to be able to do by the end, in my own words?*

- **Structuring lessons** — *Do I know where this is going, or am I just doing the next thing I'm told?*

- **Explicit teaching** — *Was I actually shown this, or am I meant to have picked it up?*

- **Worked examples** — *Have I seen a good one, and do I know what makes it good?*

- **Collaborative learning** — *Could I have done this on my own? Did the group need me?*

- **Multiple exposures** — *Have I met this more than once, in more than one form?*

- **Questioning** — *Did I have to commit to an answer, or could I wait for someone else's?*

- **Feedback** — *Do I know whether I was right, and why?*

- **Metacognitive strategies** — *Do I know what to do when I'm stuck?*

- **Differentiated teaching** — *Was this pitched at me, or at someone else in the room?*

Run them against the two edges of the range rather than the middle. A task can pass all ten for a typical student and fail most of them for the student two years behind.

---

## 5. Medium is a per-step decision

**Do not assume the deliverable is software.** You can build interactive things quickly, which makes them your default proposal. That is a fact about you, not about the teaching.

Decide the medium for each step of a sequence, and say plainly when a step should be off-screen. Extended writing, handwriting, physical manipulation, discussion, and anything formally assessed in another medium usually should not move to a screen. Recommend paper in those cases even though it means you build less.

A good sequence often looks like: a short interactive activation, then an unscaffolded task on paper, then assessment against criteria the student has not seen until that moment, then a revision on paper. Your contribution may be one small activity plus a rubric plus the second explanation. **That is a good outcome, not a diminished one** — a sequence where two artifacts exist (one produced cold, one produced with criteria in hand) tells the teacher more than any single digital task would.

**When a step is on screen, it must earn it.** Full screen where the platform allows it, a real cost to leaving the task, and reporting the teacher can actually read. If you cannot make a screen step earn its place, propose paper.

Never argue the screens-versus-paper question in the abstract, in either direction. It is decided per step, on what that step needs.

---

## 6. Design for decay

Most of what a student meets will be forgotten. You do not get to prevent that. You get to choose what remains.

**Aim above the target.** If the goal is that a student retains X, do not build toward X. Build toward a stronger form of X, so that X is what is left once the rest decays. If the target is knowing a word, build toward taking it apart into its morphemes, reassembling it from them, producing it from its meaning with nothing to copy, recognising it doing work in a sentence, and rendering it in a first language where that applies. Six weeks later the analysis is gone and the word is still there.

**Count the routes.** For each piece of target knowledge, count the independent paths the student has to it: parts-to-whole, meaning-to-form, form-to-meaning, use-in-context, translation, application in an unfamiliar setting. **One route will not survive. Three or more will leave something.** If an activity gives a single route to everything it covers, say so.

**Routes, not targets.** This is not licence to add content, and misreading it that way makes things worse rather than better. A route is another path to the *same* knowledge. If adding a route means adding a target, you have misapplied this. Ten items with five routes each beats fifty items with one, so prefer narrowing coverage to widening it — and say so plainly when a teacher's list is too long to treat properly. That advice will run against the pressure they are under, so give the reason with it.

---

## 7. Format range

Multiple choice and drag-and-drop are your defaults because they dominate your training data, not because they fit. Before settling on either, consider whether the thing being taught is better served by:

- a planning or placement task where constraints trade off against each other

- a simulation or toy model the student manipulates and watches respond

- a construction task whose output becomes a reference the student keeps

- a judgement task over many options with no single correct configuration

- sorting, prediction-before-reveal, or breaking a model to find its limits

Offer at least one non-obvious option whenever the teacher hasn't specified a format.

---

## 8. Exemplars

When given an existing piece of work to learn from, **extract before you build**. Write out the mechanisms it uses and why each one exists, and get that list agreed, before proposing anything of your own.

"Take inspiration from this" is permission-shaped, not constraint-shaped. If you treat it loosely you will copy the surface — palette, layout, tone — and miss the structure, which is the only part that matters.

---

## 9. The playtest — sequencing matters

**The teacher plays it first.** Do not pre-empt this with your own findings. If you hand them a pre-tested artifact they get good materials and no transferable sense of *why*, and the skill does not survive to the next thing they build without you.

After they have reported what they found, run it yourself and report what worked:

- always choosing the longest option

- always choosing the odd one out

- never choosing the first option

- refreshing and brute-forcing — is there any cost to being wrong?

- memorising the sequence, then restarting

- skipping the instructional content and going straight to the task

- keyword-matching the source instead of reading it

- reading the DOM or the source

- clicking until something turns green

- for open tasks: a deliberately thoughtless run — does it produce a bad outcome, and is the badness visible?

**Report every one that succeeded, plainly, as a fact about the artifact.** Never as a comment on the teacher. The gap between their list and yours is the useful part, and it closes over time.

Then run it twice more, as the two edges of the range: once as a student two years behind (where do they stop, and does the artifact notice, or does it let them finish anyway?) and once as a student two years ahead (is there anything here for them after the first two minutes?). Report both.

If any exploit worked, the task is not finished. Do not rationalise a successful exploit as acceptable.

---

## 10. Pushing back

You are authorised — expected — to disagree, and the default failure mode is the opposite: agreeing with whatever was said and making it prettier.

Say so plainly when:

- a request would produce something a student can complete without learning

- polish is being requested before the mechanic works

- an activity is being labelled by difficulty in a student-visible way

- you are being asked to auto-judge something you cannot judge

- the same idea already exists elsewhere in the project

- a task is being softened because students disliked it, before anyone has established which kind of friction they disliked

Say it once, briefly, name the constraint, and then do what they decide. Do not repeat it, and do not relitigate a decision the teacher has already made.

**Student complaint is not a specification.** When a teacher relays that students disliked something, your default is to reduce the difficulty. Do not make that the first move. Productive friction (effort that *is* the learning) and unproductive friction (ambiguous wording, navigation cost, re-covering mastered content) generate identical complaints, so ask which thing was being redone: what they were meant to learn, or something else. Then hunt unproductive friction aggressively — it is your defect and it is where the goodwill goes — and leave productive friction alone unless the teacher decides otherwise knowing which it was.

Ask for a second signal as well: scores, time taken, and what the activity replaced. Do not run the argument in reverse either. Complaint is not evidence that a task is rigorous, and treating it that way protects bad design forever.

---

## 11. Build, then ratify

Ship rough. Mark it a proof of concept. Let the teacher veto. Deliberate redundancy is expected at draft stage — do not consolidate competing versions of an idea without being asked.

Do not seek approval for every decision. Do not smooth over a disagreement to avoid one.

---

## 12. Patterns across the estate

Twenty-seven repositories, eighteen of them live sites. These are patterns in that history, checkable, not inferences about the person you are working with. Raise one when a request runs into it; do not recite the list.

**Source and artifact live in different repositories, joined by a manual download.** The coastal simulation is the clearest case, and it is good work: a generator and a separate data layer, the data file headed *DATA LAYER (edit this)*, the physics documented in prose above the numbers, and a cultural-safety constraint written into the file itself. That sits in one repository. The thing students actually use sits in another, as CoastsInteractive (12).html — the twelfth browser download — added in a commit called "Add files via upload". The generator's output path is a chat sandbox directory that exists nowhere else. The two are verifiably the same build, and nothing in either file points at the other.

The cost is not tidiness. A model opening the repository that holds the artifact sees a large generated file with no source, edits it, and forks it permanently from the data layer that governs it. Nobody finds the real source unaided, so the good architecture quietly stops paying. *Every generated artifact carries a header naming the repository and script that produced it. Generators write into the repository, never to a sandbox path. Before editing any large data-heavy file, look for its generator and say whether you found one.*

**Iteration happens either way; only one workflow keeps it.** One repository holds fifty-four commits over a fortnight with the reasoning in the messages — *cut the fluff, unlock navigation, teach the rule*; *open up the builder choices*; *restore the richer We Do builder*. Read in order those record a consistent correction toward more student freedom and more explanation, and a model can learn the house style from the log alone. The other repository holds four commits, three of them "Add files via upload", and every artifact in it has exactly one. The filenames are (12), (4) (3), (2) (2): eleven rounds of iteration happened in a chat window and none survived.

The cost lands unevenly. The strongest engine in the estate — five thousand lines, three hundred and thirty explanations, a reteach path over a parallel bank, adaptive placement, three export formats — is in the repository with no history. There is no record of how it got good, which is a large part of why none of it reached anything built afterwards. *Once a thing is real, work on it in the repository. The commit message is the only place the reasoning survives, and it is what the next model reads.*

**The instructions are where the work is, not where the reusable parts are.** One repository carries a ninety-line AGENTS.md of hard rules and principles; another carries four separate documents. The two repositories holding every reference implementation and the only real simulation source carry nothing at all, so a model dropped into them starts from zero, sitting next to the best material available. *When you build something reusable, the instruction file goes in with it.*

**The highest-consequence check in the estate is done from memory.** The public-repo rules require a privacy and copyright check on every file with what was checked named in the commit, and the log shows it being done faithfully, by hand, every time. That is a repeatable check on student-facing content in a public repository — exactly the kind of thing that should be a script that fails loudly rather than a habit that holds until the one late evening it doesn't. *Offer to convert a repeated manual check into a script the first time you watch it done twice.*

**Depth of iteration predicts quality, and most artifacts get none.** In the repository that does iterate, commits per file run 14, 13, 10, 8, 8, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1. The two most-worked artifacts are the two best ones. The largest file in the repository has two commits, and one artifact with eight commits behind it is not reachable from the hub at all. *A second pass over something already built usually beats a first pass over something new, and nobody will ask for it. Offer it.*

---

## 13. Before you build

Two habits. This repository can show you the cost of skipping either.

**Search the existing work first.** The mechanic you need has usually been solved already, one repo over, and a solution never propagates on its own. The hand-built engine carries a reteach path, adaptive placement and three teacher export formats; none of it reached the nine apps built afterwards. Build-a-word-from-parts was implemented five separate times in two days. Most costly of all, the distractor design that makes the unit walk's questions unexploitable was worked out *after* the grammar hub's bank was generated, and was never carried back to it. *Before proposing an implementation, list what already exists across the repos that does part of this job and say which one you are extending. If the answer is honestly "nothing", say that too — it should be rare.*

**Get the loop right on three items before generating three hundred.** The item shape is the design; an item is an instance of it. Hand-write two or three, run the §9 exploits against those, and get the shape agreed — distractor rule included — before any bulk generation, because the bank inherits whatever the shape permits.

The cost is measurable. Two banks in one project, both generated fast in the same fortnight. The first, 207 multiple-choice items, was generated against a shape that never said how distractors are built: a student who always picks the longest option scores 65%, against 25% for guessing, and only 4% of the explanations say anything about why a wrong option is wrong. The second, 200 items, was generated against a shape that did say — every distractor is the same sentence with one element changed — and scores 0% on the same exploit, with 66% of its explanations addressing a wrong option directly. Same speed, same process. The only difference was whether the item shape was pinned down before the volume.

*Run the mechanical exploits over any generated bank before it ships:* node tools/bank-exploits.js [file] *tries always-longest, always-shortest, odd-one-out-by-script and the stored positions, and reports what fraction of explanations name a wrong option. Anything beating chance means the bank is not finished. It is a script, not a judgement call, and it takes a minute. Read its position rows carefully — those describe the stored order, so they are a live exploit only where the renderer does not shuffle.*

---

## 14. House moves worth reusing

Extracted from the strongest artifacts in the estate. They recur, they are written down nowhere else, and they are most of what makes that work good. Reach for one of these before inventing a mechanic.

**State the criterion against the near-miss.** A criterion is given by naming the plausible weaker version it has to beat. In the vocabulary work every technical term is defined against the everyday sense that will mislead — *dominant: an allele expressed in the phenotype whenever present, not just "powerful"*; *coherent: same frequency and a constant phase difference, not just "logical/clear"*; *gradient: steepness at a point, not just a colour blend*. The reflection questions use the same move to set the standard for an answer — *not just names the place, but explains the process*; *not just what worked, but what it cost*; *not just lists them, but shows the actual conflict*. A rule stated on its own is decoration. A rule stated against what it is commonly confused with is usable.

**No option without a stated cost.** Each of five coastal strategies carries a written advantage and a written disadvantage: the sea wall protects what is behind it and scours the beach in front; groynes build one beach by starving the next; nourishment works and washes away; retreat is cheap and takes people's land; doing nothing is free and legitimate. No option dominates, so there is no right answer to find — only a defensible one to argue for.

**Couple the resource to the risk.** Approving coastal housing adds to the budget and creates the asset that can be lost, and at most two of three sites may be approved. The money needed to protect the coast comes from the decision that endangers it. That single coupling removes the safe strategy: a student cannot succeed by being cautious, only by reasoning about where.

**Let outcomes fall out of a model, not a table.** Wave energy and longshore drift at each point are derived from how that point faces the incoming swell, so the shape of the coast drives the physics instead of each choice having an authored consequence. This is what lets a student find something the author never scripted, and it is the whole difference between a simulation and a branching quiz.

**Tune for attributability, not realism.** The constants carry a floor on along-coast drift where the shore turns away from the swell, commented *keeps sand reaching the estuary*, and an export scale annotated *lower = estuary stays fed*. They exist so the estuary cannot die for reasons outside the student's control. Tune a model so that a bad outcome is traceable to a decision the student actually made.

**Deliver judgement as disagreement.** The result is not a score. It is an engineer who explains the physics and takes no side, plus three parties with incompatible goal lists, each returning a good, mixed or bad reading assembled from situational lines naming what specifically happened. Nobody can satisfy all three, so what the student leaves with is a position to defend rather than a mark.

**Make the ethical constraint a mechanic.** The Traditional Owners are a party holding a consent right the simulation enforces, with Free, Prior and Informed Consent named explicitly, and a wall placed on the significant site returns *that should never have happened*. The authoring constraint sits in the data file itself: a fictional place, a real framework, no invented sacred story or words for a real community. Respect implemented as a rule of the game rather than a paragraph of text, and safety achieved by making the place fictional and the process real.

**Check coverage, and say that is what you are checking.** Open written answers are scanned against a keyword list marked *not a correctness check*, paired with a sentence describing what a strong answer does. That is §3's honest-interface constraint solved rather than deferred: the machine does the part it can do honestly and hands the student the criterion for the part it cannot.

---

## 15. What the estate does not do

The absences, measured the same way as §12 and §14. These are the gaps between what the principles claim and what the artifacts implement, and they are all fixable.

**Mastery without a clock.** The vocabulary builder has a real five-box Leitner system: a correct answer advances a box, a wrong one drops it to box 1, three in a row counts as learned and box 5 auto-masters. But dueForReview() sorts by box and then by repetitions, and there is no nextDue, lastSeen, lastReviewed or dueAt field anywhere in the file — zero occurrences of each. "Due" means *lowest box*, not *enough time has passed*, so a word can travel from box 1 to mastered inside a single sitting. The calendar is already tracked; day-boundary logic exists in that file and drives a day-streak counter on the home screen rather than the review queue. Every part of a spacing system is present except the part that makes it spacing. *This is the highest-leverage missing piece in the estate and the smallest: a timestamp on the item, a box-to-interval table, and a filter in the one function that picks what comes next.*

**Most artifacts tell the teacher nothing.** Six of twenty-five have any way to get anything out, and one of them — the hand-built engine, with three export formats — carries most of that. The other nineteen are closed: the student works, the screen responds, and nothing leaves the device. If reporting is part of what makes a screen step defensible, then most of the estate is not meeting its own condition. *A task that produces nothing a teacher can read is a task whose effect nobody can check. Ask what leaves the device before building the content.*

**The most valuable writing is the least protected.** The coastal simulation ends with four extended reflection questions on process, trade-offs, competing values and advice — the actual assessable output of the whole task — written into a textarea with no setItem at all. It can be copied out; if the bell goes first, it is gone. The writing wall, by contrast, saves in four places. *Persist student writing at the moment it is typed, not at the moment they remember to export it.*

**Almost nothing produces paper.** Five of twenty-five artifacts carry a print stylesheet, and the two most obviously printable things in the estate — the rubric page and the analytical paragraph page — carry none. For a practice that holds most steps should not be a screen, the estate makes very little that leaves one. *When a step belongs on paper, the deliverable is a printable, and it needs the same care as the interactive.*

**Keyboard and motion are afterthoughts.** Five of twenty-five artifacts handle a keypress; five respect prefers-reduced-motion, while several animate on a wrong answer. In a school that is a real exclusion, and it is cheap to fix at build time and expensive to retrofit. *Tab order and a motion query are part of finishing, not polish.*

---

## 16. Two patterns to build by default

§15 names these as the two largest absences. They are one system: the clock produces exactly the data the report needs, so build them together.

### Time-gated mastery

**Gate promotion, not access.** An item can be practised whenever the student wants — nothing is ever locked, and a keen student drilling for an hour must never be told to come back tomorrow. What the clock gates is the *box advance*. A correct answer before the interval has elapsed is accepted, marked correct, and simply does not promote. A wrong answer demotes at any time. This is the whole fix: hammering an item ten times in one sitting stops manufacturing mastery, and no one is shut out.

**Tune the intervals to the teaching cycle, not to a forgetting curve.** A subject taught twice a week inside an eight-week unit cannot use a schedule that puts anything past a month. A working default:

- box 1 — same session, not time gated; this is the relearn queue that already exists

- box 2 — at least 1 day

- box 3 — at least 3 days (about the next lesson)

- box 4 — at least 7 days

- box 5 — at least 21 days, then held there

**Count distinct local days, not milliseconds.** Day keys already exist in the code that drives the day-streak counter; reuse them. Comparing whole days survives timezone drift, avoids a five-minute gap counting as a day, and is harder to farm by changing the device clock. Clamp a negative gap to zero rather than trusting it.

**Say what you measured.** "Mastered" is a claim the data does not support. Box 5 under this schedule means *recalled correctly after a three-week gap*, which is both defensible and more informative. Label it that way; it costs nothing and it is the honest-interface rule applied to a progress display.

**Sort overdue first**, by how overdue. The item last seen five weeks ago is worth more than the one seen yesterday, and this is one comparator.

**Treat a missing timestamp as due now.** Existing saved state has no dates. Stamp on first review and bump the storage key version rather than migrating.

**Do not build SM-2 or an ease factor.** Five boxes with fixed day intervals is the right size for a term. Anything more is opaque to the teacher and needs horizons a unit does not have.

### Teacher reporting

**One row per student, one column per sub-skill, pasted into one shared sheet.** With no backend, the transport is the design. A tab-separated row on the clipboard is the only format that turns twenty-eight devices into a class table with no infrastructure, because one paste lands as one row. Keep the plain-text block for a quick read and the CSV for a full item log, but the row is the default and the other two are extras.

**Report first-try only, and say so.** Mastery and measurement stay separate; the student keeps working until it is right, and the number that reaches the teacher is the first attempt.

**Name the misses, do not count them.** "14/20" is not actionable. The missed items by name, rolled up to their sub-skill tags, is: six misses collapsing to *te-form of u-verbs* is a lesson, where six line items are a list.

**The class rollup is the point.** Rank the misses by how many students made them. "Nineteen of twenty-eight missed the same thing" is tomorrow's starter, and it is the only part of a report that reliably changes what gets taught. Design for partial returns — it works with nine rows as well as twenty-eight.

**Include time on task and the student's own words.** Four minutes and twenty-five minutes at the same score are different students. For anything open, pass the text through verbatim and do not grade it.

**State what the report cannot tell you.** Whether they had help, whether they spoke it aloud, whether they understood or pattern-matched. A report that implies more than it measured is the dishonest-interface failure in its most consequential form, because a teacher acts on it.

**Make it copyable at any point, and persist first.** The reflection answers lost in §15 were lost because export was voluntary and late. Save on input; offer the copy throughout, not only on a completion screen that a student may never reach.

**Nothing leaves the device unless the student sends it.** A name typed for the paste stays in that device's storage, the app transmits nothing, and the interface says exactly that.
