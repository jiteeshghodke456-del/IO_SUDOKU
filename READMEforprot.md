# Prototypes: testing the allocation idea before building the product

This folder holds two small throwaway programs. We wrote them on 10 October 2026, before any product code existed, to find out one thing. Can IO Signal Sudoku be solved by simple rules that place cables one after another, and can a separate program prove the result is correct?

The answer from these tests is yes, on generated data. This is not the product. The product is built later, milestone by milestone, from `BUILD.md`. Nothing here touches the organisers' MDB or template, and all the data in these tests is made up by the scripts themselves.

## What is in the folder

| Folder | What it is |
|---|---|
| `01-first-fit-spike/` | One script that places cables, one script that checks the result a second way, and a small test of an OR-Tools optimiser. |
| `02-built-from-spec-only/` | An engine, a checker and a data generator that another agent wrote from our written spec alone. It never saw the first script. |
| `02-built-from-spec-only/first-pass-literal/` | The first version of that same experiment, written when the spec still had gaps. We keep it because the failures in it are the useful part. |
| `*/results/` | The real output of each run, saved as text. |

## How to run them

You need Python 3.12. Nothing else is needed except for `opt.py`, which needs `pip install ortools`.

```
cd 01-first-fit-spike
python3 spike.py                      # about 20 seconds

cd ../02-built-from-spec-only
python3 run_trials.py                 # 320 base cases and 120 revision cases, about 45 seconds
python3 run_trials.py 20 10 1         # a small quick run: base cases, revision cases, seed
python3 examples.py                   # a few small hand-made cases
```

## What the first-fit spike does

A cable is a block of 2, 6, 12 or 24 pairs that must never be split. The spike takes the cables in order and drops each one into the first baseplate that has room and that the rules allow. A rule here is only a yes or no question. May this cable enter this baseplate, this CIOC or this cabinet? There is no solver in the main path.

A second function, written separately, then reads only the output rows and checks them. It checks that no slot is used twice, that every cable sits side by side in pair order, that A and B never share a CIOC, that groups stay together, and that spare room is kept.

### What it measured (generated data, run again on 16 October)

| Case | Cabinets used | Lowest possible | Engine time | Violations |
|---|---|---|---|---|
| 10,007 signals in 12 groups | 33 | 33 | 0.12 s | 0 |
| 10,012 signals in 60 groups, one CIOC per group and side | 59 | 33 | 0.04 s | 0 |
| The same file if groups may share a CIOC | 43 | 33 | 0.05 s | 0 |
| The same file if any signals may share a CIOC | 37 | 33 | 0.05 s | 0 |
| 50,009 signals in 40 groups | 162 | 161 | 3.4 s | 0 |

"Lowest possible" is the number of slots the cables need divided by the slots in a cabinet, rounded up. No placement can beat it.

The revision test used 10,000 signals. We changed some signals, grew three cables, changed the side of four cables, deleted five cables and added twelve new ones.
- 9,860 tags existed in both revisions. 9,846 of them kept the same address.
- The 14 that moved were all on cables that were themselves edited.
- Two cables found no room even when revisions were allowed to use spare room, so they would become TQs. In an earlier run that did not allow it, 11 cables found no room. We did not repeat that run today.
- A fresh run from scratch would have moved 8,559 of those 9,860 signals.

We also tried OR-Tools to choose which groups share a cabinet (`opt.py`). When we ran it on 10 October it brought the 59 cabinets down to 56 and the 43 down to 38. We did not run it again on 16 October. It helps a little and is not needed for correctness.

## What the spec-only build did

We wrote a specification of the allocation rules in plain words. Then a separate agent, which had not seen the spike, built an engine, a checker and a generator from that text only. This tests the spec, not the idea. If the agent could not follow the text, or got wrong answers by following it, the text was wrong.

### First pass, with the spec as it was first written

When the agent followed the text word for word, the checker found real violations in 320 generated cases.
- A and B shared a CIOC in 41 cases.
- A CIOC held signals from two different groups, which the sharing rule forbids, in 42 cases.
- Spare room was not kept in 13 cases.

When the agent filled the gaps with sensible guesses instead, there were no violations. So the spec had holes, and the holes were exactly in the rules we most care about. We rewrote the text. See `results/first_pass_results.txt`.

### Second pass, with the rewritten spec

| What was tested | Result |
|---|---|
| 320 generated MDBs, random rule sets, up to 9,985 signals | 0 violations of any base invariant |
| The same MDB with its rows shuffled, 40 cases | the output was identical every time |
| 150 revisions from Rev A to Rev B | 0 violations, except one case described below |
| 50 chains from Rev A to B to C | 0 violations, except one case described below |
| Two full runs with the same seed | the same output hash |
| Default rules on 10,000 signals | 41 cabinets against a lower bound of 40, and 60 cabinets for the 60-group file (the one-CIOC-per-group effect again) |

The two exceptions were both the same fault. With the setting that forbids a group from using more than one cabinet, a revision could put a group's new cable into the next cabinet. The checker caught it. We changed the spec. We have not re-run the second pass since that change.

The checker also disagreed with the engine in 8 cases about cables whose signals carry two different group labels. That was a wording problem in the spec, and it is fixed.

Some cables are not placed in these runs. That is expected. The generator deliberately injects conflicting labels, cables too big for one cabinet under a "never span" setting, and other faults. Each of these must come back as a TQ with a reason. The check is that nothing is dropped without a reason, and nothing is.

## What we learned

1. **First-fit with rules is enough.** The brief's own example fills cables in order, and its Definition of Done asks for zero violations, not the fewest cabinets. The simple method reached the lowest possible cabinet count in the 12-group case, and it was within one cabinet at 50,000 signals.
2. **The three-level solver plan was the wrong plan.** Keeping spare room and packing CIOCs full fight each other inside one model. Real groups are bigger than one cabinet, so "a group never spans cabinets" would turn most of a real file into TQs. The simple engine is also fast enough to re-run many times, which we need to explain TQs.
3. **How CIOCs may be shared matters more than any algorithm.** On the same 60-group file the three readings gave 59, 43 and 37 cabinets. We need the organisers to tell us which reading they mean, or their sample file will.
4. **Spare costs real cabinets.** In the 12-group case, keeping 10% spare took us from 29 cabinets to 33. Setting K to 6 CIOCs and P to 7 baseplates changed the count a lot too. These must stay settings.
5. **A revision should put cables back, not re-solve.** Putting every unchanged cable back at its old address moved 14 signals. Starting again would have moved 8,559. This is the strongest part of the story for Feature 5.
6. **A separate checker finds what the author misses.** It caught every spec fault above. It must stay independent of the engine, and it must read the written output.
7. **A spec that reads clearly can still be wrong.** The first pass proves it. Every rule needs a test that breaks it on purpose.

## What path this opens

- We can start `M04` (the real placement engine) with confidence that the design works. The prototype engine is about 470 lines and the checker about 280, so the real versions are a realistic size for the time we have.
- The real engine should be tested against these numbers. If the real engine disagrees by a lot on the same kind of data, one of the two is wrong and we look at why.
- The generator in `gen.py` is a good starting point for `M02`, and the checker is a good reference for the one Jiteesh writes in `M03`.
- The first question to send the organisers is how CIOC sharing works. It changed the cabinet count by about 60% in our test (59 against 37).
- The optimiser stays an optional extra (`M17`). It is the first thing to cut.

## What this does not prove

- No real MDB and no real template was used. Our generator is our guess at what the data looks like.
- The prototype works on rows in memory. It does not read or write Excel files, map column headers, choose CHARMs or terminal blocks, make names, or have a user interface.
- The checker and the engine were both written from our own reading of the brief. If we misread the brief, both can be wrong together. Only the organisers' files and the hidden test can settle that.
- Speed was measured on generated data. The slowest case, 50,000 signals, took about 3 seconds.
- Do not put any number from this folder in a slide or in the product README. The real engine must print the number in the product repo first.
