# WP1 prior2 — exact distinct-voucher lifetime maximum

**2026-10-28 · DIAGNOSTIC self-authored mathematical derivation, independent acceptance PENDING; NOT a selected lifetime rule, Native execution, funded admission, scientific confirmation or G1.** [Contract](wp1-prior2-distinctness-contract.md) committed5f82dc847c4aa97bbec65e1335874768ae538ca8 BEFORE this derivation under D80. Exact unit-quota family unchanged. No Model/reference/config/test/RNG/namespace/world/grid/solver/flow-library call or code/API change. BACKLOG alone owns next acceptance.

## Exact statement: new and total are different

There are s initially eligible seeds, each with K lifetime units. Each birth consumes one unit from EACH of c DISTINCT EXISTING positive-quota subjects BEFORE the newborn receives K. No other gate, renewal/transfer or early credit exists. Keep integers c≥2, s≥0, 0≤K<c.

If s<c OR K=0, no first birth is possible: n_max=0 and total N_max=s. Otherwise write d=c−K>0 and T_K=K(K+1)/2. Under the complete allowed-parent choice/consent assumptions of this contract, the exact mathematical maximum is

```text
n_max = floor((sK − T_K)/(c−K))                 NEW admissions
N_max = s + n_max = floor((sc − T_K)/(c−K))    TOTAL subjects
```

This is a maximum over all legal chronological parent assignments, not a claim that every greedy choice attains it. Products/division are exact integer mathematics, not floating-point evaluated values. Quotas are not FACY, refundable collateral, XP, standing or verified people.

## Necessary bound: the last K births retain a triangular quota stock

The historical inventory relation remains valid: after n births Q=sK−nd. The newest subject alone retains K, but that ignores the other recent subjects.

If n≥K, consider the LAST K newborns. The oldest of those has only K−1 later births to which it could contribute, and cannot contribute twice to one child. It therefore retains at least1unit. The next retains at least2, and so on; the youngest retains K. These are distinct subjects' residual units, not repeated counting of a shared pool. Consequently

```text
Q >= 1+2+...+K = T_K
n <= floor((sK−T_K)/d).
```

This argument uses pre-existing parents, per-child distinctness and quota grant AFTER admission. It would fail for two units from one parent or self/batch-early funding, which the contract forbids.

For the supported-start region s≥c and K≥1, sK−T_K−Kd=K(s−c)+K(K−1)/2≥0. Thus the displayed candidate n_max≥K. Any sequence shorter than K already satisfies the same upper bound; the last-K argument bounds all longer sequences. No assumption that a maximizer was already constructed is used.

## Attainment: a finite chronological matching certificate, not a solver run

Fix any finite proposed n. Create mathematical TARGET copies1,…,n and PARENT copies for all s seeds and the n newborns. A seed may parent every target. Newborn parent i may parent target j ONLY if i<j. Each parent has capacity K, each parent→target edge capacity1, and each target requires c units. This finite bipartite network is a proof device, NOT a protocol graph/membership mutation, physical route or Native engine.

An integral assignment filling all cn target units exists exactly when, for every subset J of t targets,

```text
ct <= sum_over_parents min(K, number of their allowed edges into J).   (H)
```

Here is the cut/integrality justification, not an unproved greedy rule. Put source→parent capacity K, allowed parent→target capacity1 and target→sink capacity c. For fixed sink-side target set J, minimizing each parent's side gives cut capacity c(n−t)+sum min(K,deg_J). Hence every cut has capacity at least cn exactly when(H)holds. Integer augmentations preserve integrality; if flow cannot reach cn, residual reachability supplies a cut equal to its smaller value, contradicting those inequalities. Thus(H)both characterizes feasibility and supplies an integral existence certificate. No algorithm/library is executed or runtime bound inferred.

It suffices to check the EARLIEST t targets. For any sorted J=(j1,…,jt), j_l≥l. Therefore every newborn parent i has at least as many later targets in J as in{1,…,t}; seeds always see all t. Since min(K,·)is monotone, earliest t minimizes the right side. Its exact capacity is

```text
F(t) = s min(K,t) + sum_(h=1..t−1) min(K,h)
     = st + t(t−1)/2                if 0<=t<=K
     = sK + Kt − T_K                if t>=K.
```

For t≤K, s≥c ensures F(t)≥ct. For t≥K, (H)is exactly td≤sK−T_K. Therefore EVERY t≤n satisfies(H)when n≤floor((sK−T_K)/d), proving attainment at n_max.

Finally translate that assignment into the ACTUAL chronological unit process: admit targets j=1,…,n in order. All its assigned parents are seeds or newborns i<j, hence already exist. Edge capacity1 gives c distinct parents. Each parent's total assigned outgoing count≤K; before a currently assigned use it has at least1unit remaining. Consume those c units first, then grant the child's K. The abstract source→newborn capacity was only a certificate; this chronological execution never grants that quota before birth or lets a child fund itself. Unassigned units remain unused. This completes upper bound AND legal attainment under the exact family.

## What is refined, not disproved

The master's loose inventory ceiling on TOTAL sc/(c−K) and the audit's stronger necessary NEW bound floor(K(s−1)/(c−K)) remain valid. Neither historical document claimed exact attainability. This result refines them: replacing the newest-only stock K by T_K subtracts K(K−1)/2 additional units from the numerator before division. For K1 the newest bound is already sharp in this family; for larger K the floor may hide or expose a strict gap. Do not call a loose necessary inequality false or a code bug.

One HAND-DERIVED witness, not a simulated cell/grid: c3/K2/s3. The newest-only bound allows n≤4; the exact maximum is3. Seeds a,b,c each start2. Admit x using a,b,c, then y using a,b,x, then z using c,x,y. After x quotas are a1,b1,c1,x2; after y they are a0,b0,c1,x1,y2; after z only y1,z2 remain positive. Three births are legal; a fourth would require three distinct positive parents, and also contradict the last-two residual lower bound T_2=3 because Q at n4 would be2. This is a counterexample to asserting the old necessary bound is ATTAINED, not to the inequality itself.

At n_max in the supported-start region, Q=T_K+((sK−T_K) mod d). Residual quota is not spendable if fewer than c different positive subjects remain; optimality rules out another legal birth. Do not infer that aggregate Q≥c alone permits continuation, or prescribe a particular terminal quota distribution beyond what was proved.

## Scope and implementation boundaries

The matching proof depends on allowing ANY older positive-quota subjects to form each c-parent set. Fixed topology/consent exclusions, nonuniform quotas, time, cash/funding, identity/evidence, refusals or corrected subjects can reduce attainable births and need their own contract. No greedy scheduler is claimed optimal. K≥c/c1 remain excluded; this result establishes no phase theorem, financed self-sustain, real-person growth/attack or safety boundary there.

All graphs/sequences here are finite mathematical certificates. Even when individual inputs are safe integers, sK/T_K/sc/cn and certificate size may exceed JavaScript/container/machine limits. Exact arithmetic and all intermediate counts/resources would need separate preflight before ANY computational realization; no source-counter/array/host overflow or performance guarantee is inferred. No enumeration/framework/new backend is necessary to state this proof, and no current Native mode implements this lifetime ledger.

Native K/T/V renewal and selected D75 active outgoing guarantees are still different. A lifetime limit would constrain genuine and assumed-false admitted subjects under the same quota assumptions; the theorem does not distinguish personhood/usefulness or select such a rule. Quota exhaustion is neither a monetary burn nor recovered debt. Actual funded lifetime behavior, chronological sources/XP/duties, selected CORE/Standing/court mechanisms and all scientific/master/G1 obligations remain unclosed.

## Binding and next acceptance

Contract blob1acf0be9d4c3108f76c2423f2c2550f54a2c5a91 at5f82dc847c4aa97bbec65e1335874768ae538ca8; reused historical audit blob4607eea5e6aa00d31f6b53b707e12c32199d1f66 unchanged. No external theorem implementation or registered experiment was invoked. Core39ea08655e0f4c4d92b7df5648850b7ebb12041c9dd77317d3cfcfd92d278448/55files/src9d3eb889ad256ceb72cf28abe979752b2e01cc70/test9c0640c84e7f11aa72a912d047320573972a7434/Nodev26.8.1 and separate study69cd10b557879ca490feaad37787e50645a16833c8a3c3455e5126653104ac63 unchanged. Existing778+21/37/DAG55x177 validation reused on exact equality, NOT rerun or promoted to mathematical/scientific proof. Fresh context/link/diff/contract-binding checks only.

Self-authored exact maximum supported by the argument above; independent NEW-result mathematical/chronological scrutiny remains missing. A cut/integrality/earliest-subset/chronological construction error refutes or narrows the result, never authorizes a rule/code change or numerical search dressed as proof. BACKLOG owns that next bounded acceptance, no new engine/data or stopped-work fallback. Checkpoint prior2SelfProof/exactTriangularResidual+chronologicalMatching/newVsTotal/noData-noG1; continuationWarrantedtrue.
