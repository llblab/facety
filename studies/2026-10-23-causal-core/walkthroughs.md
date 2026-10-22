# Native causal walkthroughs

Diagnostic supplied-input pathways, not population or incentive findings.

## support-finalized
Window 72–96 h; genuine retained 4/4 (evaluator-only).
Cases 0/0 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution pending/not applicable h.
Money Δ: burned 0, fee custody 1, stake custody 0, debt 0. Debt is not burn.
Relay work: not measured for native setup/actions; unresolved evidence packages 0.
XP: Aster 3→4; Bela 7→8; Cato 4→5; Mira 3→2. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster, Mira (recalculation is not independent judgment).
```text
decision:0 @72h Aster fresh-self-id → accepted [M01,M02]
decision:1 @96h Aster collector-conversion → accepted [M01,M02]
decision:2 @96h Aster end-directed-guarantee → accepted [M03]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Timely veto absent; conversion irreversibly ended the free cancellation right.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json support-finalized.

## support-vetoed
Window 72–95 h; genuine retained 4/4 (evaluator-only).
Cases 0/0 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution pending/not applicable h.
Money Δ: burned 1, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: not measured for native setup/actions; unresolved evidence packages 0.
XP: Aster 3→3; Bela 7→7; Cato 4→4; Mira 3→3. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster, Mira (recalculation is not independent judgment).
```text
decision:0 @72h Aster fresh-self-id → accepted [M01,M02]
decision:1 @95h Mira guarantor-veto → accepted [M01,M02]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Terminal credit absent because the act was cancelled, not an XP-rule ablation.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json support-vetoed.

## early-veto
Window 72–95 h; genuine retained 3/3 (evaluator-only).
Cases 0/0 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution pending/not applicable h.
Money Δ: burned 1, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: not measured for native setup/actions; unresolved evidence packages 0.
XP: Aster 3→3; Bela 7→7; Cato 4→4; Mira 3→3. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster, Mira (recalculation is not independent judgment).
```text
decision:0 @72h Mira fresh-self-id → accepted [M01,M02]
decision:1 @95h Bela guarantor-veto → accepted [M01,M02]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Terminal credit absent because the act was cancelled, not an XP-rule ablation.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json early-veto.

## missed-veto
Window 72–97 h; genuine retained 3/3 (evaluator-only).
Cases 1/1 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution 1 h.
Money Δ: burned 5, fee custody 0, stake custody 0, debt 1. Debt is not burn.
Relay work: Outside 3/12, denied 0; Aster 0/8, denied 0; Bela 2/8, denied 0; unresolved evidence packages 0.
XP: Aster 3→1; Bela 7→3; Cato 4→2; Mira 3→1. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster (recalculation is not independent judgment).
```text
decision:0 @72h Mira fresh-self-id → accepted [M01,M02]
decision:1 @96h Mira collector-conversion → accepted [M01,M02]
decision:2 @96h Bela guarantor-veto → emission is spent or disputed [M02]
decision:3 @96h Outside observe → accepted [M04]
decision:4 @96h Outside package → accepted [M04]
decision:5 @96h Outside route → accepted [M04]
decision:6 @96h Bela review → accepted [M04,M09]
decision:7 @96h Bela formal-challenge → accepted [M04,M07,M09]
decision:8 @97h reference-adjudicator adjudicate-and-enforce → accepted [M04,M07,M09]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Timely veto absent; conversion irreversibly ended the free cancellation right.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json missed-veto.

## outsider-confirmed
Window 72–73 h; genuine retained 3/3 (evaluator-only).
Cases 1/1 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution 1 h.
Money Δ: burned 4, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: Outside 4/12, denied 0; Aster 2/8, denied 0; Bela 2/8, denied 0; unresolved evidence packages 0.
XP: Aster 3→1; Bela 7→3; Cato 4→2; Mira 3→1. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster (recalculation is not independent judgment).
```text
decision:0 @72h Outside observe → accepted [M04]
decision:1 @72h Outside package → accepted [M04]
decision:2 @72h Outside route → accepted [M04]
decision:3 @72h Aster review → accepted [M04,M09]
decision:4 @72h Aster formal-challenge → challenge XP gate [M04,M07,M09]
decision:5 @72h Outside route → accepted [M04]
decision:6 @72h Bela review → accepted [M04,M09]
decision:7 @72h Bela formal-challenge → accepted [M04,M07,M09]
decision:8 @73h reference-adjudicator adjudicate-and-enforce → accepted [M04,M07,M09]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json outsider-confirmed.

## outsider-refused
Window 72–72 h; genuine retained 3/3 (evaluator-only).
Cases 0/0 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution pending/not applicable h.
Money Δ: burned 0, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: Outside 3/12, denied 0; Aster 1/8, denied 0; Bela 0/8, denied 0; unresolved evidence packages 1.
XP: Aster 3→3; Bela 7→7; Cato 4→4; Mira 3→3. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster, Mira (recalculation is not independent judgment).
```text
decision:0 @72h Outside observe → accepted [M04]
decision:1 @72h Outside package → accepted [M04]
decision:2 @72h Outside route → accepted [M04]
decision:3 @72h Aster review → review-not-suspicious [M04,M09]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
No alternative route was supplied: evidence remains open after sponsor refusal.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json outsider-refused.

## false-allegation-rejected
Window 72–96 h; genuine retained 4/4 (evaluator-only).
Cases 1/1 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution 1 h.
Money Δ: burned 1, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: Outside 7/12, denied 0; Aster 2/8, denied 0; Bela 4/8, denied 0; unresolved evidence packages 1.
XP: Aster 3→3; Bela 7→3; Cato 4→4; Mira 3→3. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Cato, Aster, Bela, Mira (recalculation is not independent judgment).
```text
decision:0 @72h Outside observe → accepted [M04]
decision:1 @72h Outside package → accepted [M04]
decision:2 @72h Outside route → accepted [M04]
decision:3 @72h Aster review → accepted [M04,M09]
decision:4 @72h Aster formal-challenge → challenge XP gate [M04,M07,M09]
decision:5 @72h Outside route → accepted [M04]
decision:6 @72h Bela review → accepted [M04,M09]
decision:7 @72h Bela formal-challenge → accepted [M04,M07,M09]
decision:8 @73h reference-adjudicator adjudicate-and-enforce → accepted [M04,M07,M09]
decision:9 @96h Mira fresh-self-id → accepted [M01,M09]
decision:10 @96h Outside observe → accepted [M04]
decision:11 @96h Outside package → accepted [M04]
decision:12 @96h Outside route → accepted [M04]
decision:13 @96h Bela review → accepted [M04,M09]
decision:14 @96h Bela formal-challenge → challenge XP gate [M04,M07,M09]
```
Exercised balancing constraint: a rejected challenge halves Bela XP from 7 to 3; a later reviewed case against 3-XP Mira fails the strict gate. This is encoded authority feedback, not learned caution.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json false-allegation-rejected.

## false-allegation-upheld
Window 72–73 h; genuine retained 3/4 (evaluator-only).
Cases 1/1 resolved, 0 unresolved; wrongful invalidations 1; discovery→resolution 1 h.
Money Δ: burned 4, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: Outside 4/12, denied 0; Aster 2/8, denied 0; Bela 2/8, denied 0; unresolved evidence packages 0.
XP: Aster 3→1; Bela 7→3; Cato 4→2; Mira 3→1. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster (recalculation is not independent judgment).
```text
decision:0 @72h Outside observe → accepted [M04]
decision:1 @72h Outside package → accepted [M04]
decision:2 @72h Outside route → accepted [M04]
decision:3 @72h Aster review → accepted [M04,M09]
decision:4 @72h Aster formal-challenge → challenge XP gate [M04,M07,M09]
decision:5 @72h Outside route → accepted [M04]
decision:6 @72h Bela review → accepted [M04,M09]
decision:7 @72h Bela formal-challenge → accepted [M04,M07,M09]
decision:8 @73h reference-adjudicator adjudicate-and-enforce → accepted [M04,M07,M09]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json false-allegation-upheld.

## authority-boundary
Window 48–72 h; genuine retained 2/2 (evaluator-only).
Cases 0/0 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution pending/not applicable h.
Money Δ: burned 0, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: not measured for native setup/actions; unresolved evidence packages 0.
XP: Aster 1→1; Bela 1→2. Council votes: not exercised.
Council seats/rank: Aster → Bela (recalculation is not independent judgment).
```text
decision:0 @48h Bela fresh-self-id → accepted [M01,M07]
decision:1 @72h Bela collector-conversion → accepted [M01,M07]
```
Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.
Without this terminal disposition the extra XP and seat crossing do not occur; no claim about a vote follows.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json authority-boundary.

## neglect-restored
Window 72–97 h; genuine retained 3/3 (evaluator-only).
Cases 1/1 resolved, 0 unresolved; wrongful invalidations 0; discovery→resolution 25 h.
Money Δ: burned 4, fee custody 0, stake custody 0, debt 0. Debt is not burn.
Relay work: Outside 4/12, denied 0; Aster 2/8, denied 0; Bela 2/8, denied 0; unresolved evidence packages 0.
XP: Aster 3→1; Bela 7→3; Cato 4→2; Mira 3→1. Council votes: not exercised.
Council seats/rank: Bela, Cato, Aster, Mira → Bela, Cato, Aster (recalculation is not independent judgment).
```text
decision:0 @72h Outside observe → accepted [M04]
decision:1 @72h Outside package → accepted [M04]
decision:2 @72h Outside route → accepted [M04]
decision:3 @72h Aster review → accepted [M04,M09]
decision:4 @72h Aster formal-challenge → challenge XP gate [M04,M07,M09]
decision:5 @72h Outside route → accepted [M04]
decision:6 @72h Bela review → missed-notification-or-unavailable [M04,M09]
decision:7 @96h Bela review → accepted [M04,M09]
decision:8 @96h Bela formal-challenge → accepted [M04,M07,M09]
decision:9 @97h reference-adjudicator adjudicate-and-enforce → accepted [M04,M07,M09]
```
Exogenous availability restoration resumes the queued pathway without resetting the 24-hour delay, balances, XP or history. No endogenous learning/restoration policy is claimed.
Detailed deltas, public event ancestry and separate evaluator assumptions: --json neglect-restored.
