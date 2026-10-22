// Owns: Small causal walkthroughs on named actors; excludes sweeps, calibration and population claims.
// Each walkthrough drives the real FacetyModel (and the relay reference) with a fixed schedule and optional trace.
// A walkthrough shows that a pathway CAN occur; it is not evidence of reliability, equilibrium or real-world effect.
import { FacetyModel, ProtocolRejection } from './model.mjs';
import { RelayDesk, RELAY_ASSUMPTIONS } from './relay.mjs';
import { Trace, watchState, stateDeltas } from './trace.mjs';

const REJECTION_REASON = Object.freeze({
  'emission is spent or disputed': 'window-missed',
  'insufficient link-break fee': 'fee-unaffordable',
});

class Scene {
  constructor(model, trace) { this.model = model; this.trace = trace; this.last = null; }
  at(hour) { this.model.advanceTo(hour); return this; }
  // Executes one protocol transition and records what was observable, tried and changed. The trace is optional.
  do({ actor, action, target = null, mechanisms = [], observed = {}, basis, ids = [], causes = [], evaluator }, run) {
    const before = this.trace ? watchState(this.model, ids) : null;
    let result;
    let error = null;
    try { result = run(); } catch (caught) {
      if (!(caught instanceof ProtocolRejection)) throw caught;
      error = caught;
    }
    if (this.trace) {
      const base = { at: this.model.now, actor, action, target, mechanisms, observed, basis, causes, ...(evaluator === undefined ? {} : { evaluator }) };
      this.last = error
        ? this.trace.record({ ...base, outcome: 'rejected', reason: REJECTION_REASON[error.message] ?? 'not-eligible', preconditions: [{ name: 'protocol accepts the transition', met: false, detail: { message: error.message } }] })
        : this.trace.record({ ...base, outcome: 'applied', preconditions: [{ name: 'protocol accepts the transition', met: true }], deltas: stateDeltas(before, watchState(this.model, ids)) });
    }
    return { ok: !error, value: result, error: error?.message ?? null, trace: this.last };
  }
  // A decision the actor did not take because its own declared rule or resources stopped it (no protocol call).
  skip({ actor, action, target = null, mechanisms = [], observed = {}, preconditions, basis, reason, outcome = 'abstained', causes = [] }) {
    if (this.trace) this.last = this.trace.record({ at: this.model.now, actor, action, target, mechanisms, observed, preconditions, basis, outcome, reason, causes });
    return { ok: false, trace: this.last };
  }
}
const scripted = rule => ({ kind: 'scripted', rule });
const protocol = rule => ({ kind: 'protocol-rule', rule });
const declared = rule => ({ kind: 'declared-rule', rule });

function selfId(scene, subject, mechanisms = ['M1'], observed = {}) {
  const { model } = scene;
  return scene.do({ actor: subject, action: 'self-id', mechanisms, observed, basis: protocol('one rewarded Self-ID per rolling day'), ids: [subject] }, () => {
    const artifact = model.registerArtifact(subject);
    return model.createSelfId(subject, artifact, 0);
  });
}
function link(scene, guarantor, guaranteed, mechanisms = ['M1']) {
  const { model } = scene;
  return scene.do({ actor: guarantor, action: 'guarantee', target: guaranteed, mechanisms, observed: { relation: 'directed; confirmation by the guaranteed subject is consent, not a reverse guarantee' }, basis: scripted('declared acquaintance guarantee'), ids: [guarantor, guaranteed] }, () => {
    const relation = model.proposeGuarantee(guarantor, guaranteed);
    model.confirmGuarantee(guaranteed, relation);
    return relation;
  });
}
function finish(id, question, scene, parts) {
  const trace = scene.trace;
  return {
    id, question, ...parts,
    mechanisms: parts.mechanisms,
    ledger: scene.model.audit(),
    ...(trace ? { trace: trace.entries(), traceTruncated: trace.truncated } : {}),
  };
}

// W1 — Who earns influence, and who can withdraw its support?
export function walkthroughInfluence({ trace = null, policy = {}, alternative = true } = {}) {
  const model = new FacetyModel({ genesis: ['ana', 'ben', 'cy'], policy });
  const scene = new Scene(model, trace);
  const names = ['ana', 'ben', 'cy'];
  const snapshot = () => watchState(model, names);
  const initial = snapshot();
  const a = selfId(scene.at(0), 'ana');
  const guarantee = link(scene, 'ana', 'ben');
  link(scene, 'cy', 'ben');
  const b1 = selfId(scene.at(1), 'ben', ['M1'], { guarantorsAtRecording: model.eligibleGuarantors('ben') });
  scene.at(25);
  scene.do({ actor: 'ana', action: 'convert', target: a.value, mechanisms: ['M1'], basis: protocol('terminal XP when an emission is consumed or converted'), ids: names }, () => model.convertToCollector('ana', a.value));
  const credit = scene.do({ actor: 'ben', action: 'convert', target: b1.value, mechanisms: ['M1'], observed: { xpRecipients: model.selfId(b1.value).xpRecipients }, basis: protocol('terminal XP to the subject and each guarantor eligible at recording'), ids: names, causes: [b1.trace] }, () => model.convertToCollector('ben', b1.value));
  const earned = snapshot();
  const b2 = selfId(scene.at(26), 'ben');
  scene.at(30);
  const cancelled = scene.do({ actor: 'ana', action: 'cancel-self-id', target: b2.value, mechanisms: ['M2'], observed: { actStatus: model.selfId(b2.value).status }, basis: protocol('free preventive cancellation by an authorized guarantor'), ids: names, causes: [b2.trace] }, () => model.cancelSelfId('ana', b2.value));
  scene.at(40);
  const blocked = scene.skip({ actor: 'cy', action: 'end-guarantee', target: 'ben', mechanisms: ['M3'], observed: { liquidFacy: model.subject('cy').liquidFacy, linkBreakFee: 1 }, preconditions: [{ name: 'actor can pay the 1 FACY link-break fee', met: model.subject('cy').liquidFacy >= 1 }], basis: protocol('ending a guarantee costs one liquid FACY'), reason: 'fee-unaffordable', outcome: 'blocked' });
  const exit = scene.do({ actor: 'ana', action: 'end-guarantee', target: 'ben', mechanisms: ['M3'], observed: { xpFromRelation: 'credits earned from ben\'s acts' }, basis: scripted('ana withdraws support at hour 40'), ids: names, causes: [credit.trace] }, () => model.endGuarantee('ana', guarantee.value));
  return finish('W1', 'Who earns influence, and who can withdraw its support?', scene, {
    mechanisms: ['M1', 'M2', 'M3'], actors: names, before: { hour: 0, state: initial }, afterEarning: earned, after: snapshot(),
    pathway: 'guarantee → finalized identity act → terminal XP to subject and guarantor → either party can withdraw (1 FACY) → relation-derived XP revoked (policy linkBreakXp)',
    exercised: { cancelledEarnsNothing: cancelled.ok && model.selfId(b2.value).status === 'cancelled', unaffordableExitBlocked: blocked.ok === false, withdrawalApplied: exit.ok },
    openLinks: ['Withdrawal does not feed back into ana\'s later guarantee decisions: no behavioral return link is implemented (M3).', 'Whether the lost exposure or concealment follows is not modeled (M3, M8).'],
    alternative: 'Policy linkBreakXp "keep": ana retains the credit, so withdrawal removes liability but not earned influence.',
    alternativeOutcome: alternative ? { policy: { linkBreakXp: 'keep' }, anaAfterWithdrawal: walkthroughInfluence({ policy: { linkBreakXp: 'keep' }, alternative: false }).after.ana } : undefined,
    assumptions: ['cy never becomes active, so she earns nothing and cannot afford exit; all three are trusted genesis subjects.', 'The 1 FACY exit price is a selected-direction value (protocol §19.3), not calibrated.'],
  });
}

// W2 — How does an error get corrected early, and what remains when the window is missed?
export function walkthroughCorrection({ trace = null, attentive = true, alternative = true } = {}) {
  const counterpart = () => alternative ? (({ variant, exercised, after }) => ({ variant, exercised, after }))(walkthroughCorrection({ attentive: !attentive, alternative: false })) : undefined;
  const model = new FacetyModel({ genesis: ['ana', 'ben'] });
  const scene = new Scene(model, trace);
  const names = ['ana', 'ben'];
  selfId(scene.at(0), 'ana');
  link(scene, 'ana', 'ben', ['M2']);
  const bad = selfId(scene.at(1), 'ben', ['M2'], { publicSignal: 'collision flag unseen; guarantor suspects a fabricated act (declared input)' });
  let correction;
  if (attentive) {
    scene.at(10);
    correction = scene.do({ actor: 'ana', action: 'cancel-self-id', target: bad.value, mechanisms: ['M2'], observed: { actStatus: model.selfId(bad.value).status, hoursSinceRecording: 9 }, basis: scripted('ana inspects within the window and cancels'), ids: names, causes: [bad.trace] }, () => model.cancelSelfId('ana', bad.value));
    return finish('W2', 'How does an error get corrected early?', scene, {
      mechanisms: ['M2'], actors: names, variant: 'attentive', before: { hour: 1 }, after: watchState(model, names),
      pathway: 'act recorded → guarantor inspects inside the 24 h window → free cancellation → no terminal XP, no FACY, no sanction required',
      exercised: { corrected: correction.ok, residualFacy: model.subject('ben').liquidFacy, sanctionNeeded: false },
      openLinks: ['Cancelling does not feed back into ana\'s later willingness to guarantee (M2); guarantor attention is a declared input, not an incentive result.'],
      alternative: 'attentive: false — the guarantor\'s attention budget is exhausted until the window closes.', alternativeOutcome: counterpart(), assumptions: ['The suspicion signal is a declared input; no inspection noise is drawn here.'],
    });
  }
  scene.at(10);
  scene.skip({ actor: 'ana', action: 'inspect', target: bad.value, mechanisms: ['M2'], observed: { attentionBudget: 0 }, preconditions: [{ name: 'guarantor has attention budget', met: false }], basis: declared('a guarantor reviews only while attention remains'), reason: 'budget-exhausted', causes: [bad.trace] });
  scene.at(25);
  const converted = scene.do({ actor: 'ben', action: 'convert', target: bad.value, mechanisms: ['M1', 'M2'], basis: protocol('terminal XP and liquid FACY on conversion'), ids: names, causes: [bad.trace] }, () => model.convertToCollector('ben', bad.value));
  scene.at(26);
  const late = scene.do({ actor: 'ana', action: 'cancel-self-id', target: bad.value, mechanisms: ['M2'], observed: { actStatus: model.selfId(bad.value).status }, basis: protocol('cancellation ends once an emission is consumed or converted'), ids: names, causes: [converted.trace] }, () => model.cancelSelfId('ana', bad.value));
  const sanction = scene.do({ actor: 'council', action: 'void-chain-and-fine', target: 'ben', mechanisms: ['M2', 'M1'], basis: { kind: 'declared-input', rule: 'adjudicated sanction supplied by the caller' }, ids: names, causes: [late.trace] }, () => {
    const voided = model.voidSelfIdChain('ben', { fromAct: bad.value });
    return { voided, penalty: model.penalize('ben', { fine: 2, halveXp: true }) };
  });
  return finish('W2', 'What remains when the correction window is missed?', scene, {
    mechanisms: ['M2', 'M1'], actors: names, variant: 'neglect', before: { hour: 1 }, after: watchState(model, names),
    pathway: 'act recorded → no inspection → conversion ends the veto → only an adjudicated sanction remains; the converted coin cannot be un-minted',
    exercised: { lateCancellationRejected: !late.ok, residualFacyCollected: sanction.value?.penalty.collected ?? null, debtAdded: sanction.value?.penalty.debtAdded ?? null },
    openLinks: ['No self-report/leniency path exists (protocol OPEN): the late actor cannot trade an admission for reduced liability (M2).'],
    alternative: 'attentive: true — the same act is cancelled at hour 10 with no residue.', alternativeOutcome: counterpart(), assumptions: ['The sanction is a declared adjudication input; its fairness is not evaluated.'],
  });
}

// W3 — How can an outsider's evidence reach authority? Includes refusal, rerouting, duplicate, forgery and a matched false allegation.
export function walkthroughOutsider({ trace = null, relayPolicy = {}, qualifiedSponsor = true, alternative = true } = {}) {
  const model = new FacetyModel({ genesis: ['x', 'y', 'g', 's1', 's2', 'h'] });
  const scene = new Scene(model, trace);
  const members = ['x', 'y', 'g', 's1', 's2', 'h'];
  const desk = new RelayDesk(model, { policy: relayPolicy, trace });
  for (const id of ['s1', 's2']) selfId(scene.at(0), id, ['M4']);
  link(scene, 'x', 's1', ['M4']);
  scene.at(1);
  // x and y claim the same face: the public collision flag marks both acts, without assigning guilt.
  const shared = model.registerArtifact('x');
  const xAct = scene.do({ actor: 'x', action: 'self-id', mechanisms: ['M4'], observed: { note: 'x and y later claim one face' }, basis: protocol('shared face claims flag every affected act'), ids: ['x'] }, () => model.createSelfId('x', shared, 0));
  scene.do({ actor: 'y', action: 'self-id', mechanisms: ['M4'], basis: protocol('shared face claims flag every affected act'), ids: ['y'] }, () => model.createSelfId('y', shared, 0));
  const honestAct = selfId(scene.at(2), 'h', ['M4']);
  scene.at(25);
  for (const id of ['s1', 's2']) model.convertToCollector(id, model.selfIds().find(act => act.subject === id).id);
  desk.registerObserver('out1', { budget: 4 }); desk.registerObserver('out2', { budget: 2 }); desk.registerObserver('out3', { budget: 2 });
  desk.registerObserver('s1', { budget: 2 });
  if (qualifiedSponsor) desk.registerObserver('s2', { budget: 1 });
  scene.at(26);
  // x's flagged act is still unspent (never converted), so it can be frozen. The truth label is evaluator-only.
  const flagged = xAct.value;
  const found = desk.discover('out1', { selfId: flagged, kind: 'collision', evaluator: { truth: 'x claimed a face that is not x\'s (hidden from actors)' } });
  const duplicate = desk.discover('out2', { selfId: flagged, kind: 'collision' });
  const forged = desk.discover('out3', { selfId: honestAct.value, kind: 'collision', strength: 3 });
  const refused = desk.route(found.package, 's1');
  const accepted = desk.route(found.package, 's2');
  const opened = accepted.status === 'applied' ? desk.open(found.package) : null;
  scene.at(model.now + desk.policy.hearingHours);
  const early = opened ? desk.resolve(opened.case, 'violation') : { verdict: null };
  // Matched false allegation: a weak media claim against an honest member reaches the same sponsor and loses.
  const weak = desk.discover('out1', { selfId: honestAct.value, kind: 'media', strength: 2, evaluator: { truth: 'honest act; allegation false' } });
  // s2 spent its only review unit on the first package: attention, not rules, blocks the second case until it is restored.
  const starved = desk.route(weak.package, 's2');
  if (qualifiedSponsor) desk.setBudget('s2', 1);
  const weakRoute = desk.route(weak.package, 's2');
  const weakOpen = weakRoute.status === 'applied' ? desk.open(weak.package) : null;
  scene.at(model.now + desk.policy.hearingHours);
  const weakResolved = weakOpen ? desk.resolve(weakOpen.case, 'no-violation') : { verdict: null };
  return finish('W3', 'How can an outsider\'s evidence reach authority?', scene, {
    mechanisms: ['M4', 'M12', 'M9'], actors: members.concat(['out1', 'out2', 'out3']), before: { hour: 25 }, after: watchState(model, ['x', 'y', 's2', 'h']),
    pathway: 'nonmember discovers a public flag → package → conflicted sponsor refuses → qualified sponsor accepts → stake and freeze → verdict input → sanction through FacetyModel; a matched weak claim costs its sponsor the stake',
    exercised: { externalHasNoProtocolRights: !members.includes('out1') && model.ledger().minted === model.selfIds().length, conflictedSponsorRefused: refused.reason, rerouted: accepted.status, duplicateRejected: duplicate.reason, forgedRejected: forged.reason, caseResolved: early.verdict, starvedSponsorBlocked: starved.reason, falseAllegation: { routed: weakRoute.status, verdict: weakResolved.verdict }, work: desk.work() },
    packages: desk.packages(), cases: desk.cases(),
    openLinks: ['Observer compensation: out1 earns nothing in the protocol, so effort feedback is an open link (M4).', 'Sponsor competition and sponsor reputation are not implemented (M4, M9).'],
    alternative: 'Remove the qualified sponsor (no route): the package stays "packaged" and the violation remains uncorrected, which is the members-only counterpart.',
    alternativeOutcome: alternative ? (({ exercised, after }) => ({ qualifiedSponsor: false, caseResolved: exercised.caseResolved, accusedAfter: after.x }))(walkthroughOutsider({ qualifiedSponsor: false, alternative: false })) : undefined,
    assumptions: [...RELAY_ASSUMPTIONS], desk,
  });
}

// W4 — When does a small accounting change alter governance, and is that an actual collective decision?
export function walkthroughGovernance({ trace = null, councilSize = 3, sybil = true, alternative = true } = {}) {
  const model = new FacetyModel({ genesis: ['a1', 'a2', 'a3', 'z1', 'z2'], policy: { councilSize } });
  const scene = new Scene(model, trace);
  const names = ['a1', 'a2', 'a3', 'z1', 'z2'];
  const act = {};
  for (const [hour, id] of [[0, 'a1'], [0, 'a2'], [0, 'a3'], [0, 'z1']]) act[id + ':0'] = selfId(scene.at(hour), id, ['M7']);
  scene.at(25);
  for (const id of ['a1', 'a2', 'a3', 'z1']) model.convertToCollector(id, act[id + ':0'].value);
  for (const id of ['a1', 'a2']) { const second = selfId(scene.at(26), id, ['M7']); act[id + ':1'] = second; }
  scene.at(50);
  for (const id of ['a1', 'a2']) model.convertToCollector(id, act[id + ':1'].value);
  const councilBefore = model.council().map(member => member.id);
  const stateBefore = watchState(model, names);
  // Contamination: z1 vouches for a sybil z2; z2's one conversion credits z1 as an eligible guarantor.
  if (sybil) {
    link(scene, 'z1', 'z2', ['M7']);
    const z2 = selfId(scene.at(51), 'z2', ['M7']);
    scene.at(76);
    scene.do({ actor: 'z2', action: 'convert', target: z2.value, mechanisms: ['M7', 'M1'], observed: { guarantorsAtRecording: ['z1'] }, basis: protocol('terminal XP to eligible guarantors'), ids: names, causes: [z2.trace] }, () => model.convertToCollector('z2', z2.value));
  } else scene.at(76);
  const councilAfter = model.council().map(member => member.id);
  // Procedural assumption (OPEN): participating-member majority; ties fail; non-members' ballots do not count.
  const tally = (votes, seatIds) => {
    let yes = 0, no = 0;
    for (const [id, vote] of Object.entries(votes)) if (seatIds.includes(id)) { if (vote === 'yes') yes++; else if (vote === 'no') no++; }
    return { yes, no, result: yes + no === 0 ? 'no-quorum' : yes > no ? 'passes' : 'fails' };
  };
  const vote = (label, votes, seatIds) => {
    const result = tally(votes, seatIds);
    scene.trace?.record({ at: model.now, actor: 'council', action: 'vote', target: label, mechanisms: ['M7'], observed: { members: seatIds, tally: result }, basis: scripted('ballots are scripted by role; no merits rule is selected'), preconditions: [{ name: 'merits rules selected', met: false }], outcome: 'applied', causes: [scene.last].filter(Boolean) });
    return result;
  };
  const pivotalBallots = { a1: 'yes', a2: 'no', a3: 'yes', z1: 'no' };
  const nonPivotalBallots = { a1: 'yes', a2: 'yes', a3: 'yes', z1: 'no' };
  const decisionBefore = vote('motion: obstruct challenge, role ballots (before)', pivotalBallots, councilBefore);
  const pivotalAfter = vote('motion: obstruct challenge, entrant pivotal (after)', pivotalBallots, councilAfter);
  const nonPivotalAfter = vote('motion: obstruct challenge, entrant not pivotal (after)', nonPivotalBallots, councilAfter);
  const nonPivotalBefore = tally(nonPivotalBallots, councilBefore);
  // Recomputation alone: with no new acts and every member still active, advancing time leaves membership unchanged.
  const stable = model.council().map(member => member.id);
  scene.at(model.now + 10 * 24);
  const recomputed = model.council().map(member => member.id);
  return finish('W4', 'When does a small accounting change alter governance?', scene, {
    mechanisms: ['M7', 'M1'], actors: names, before: { council: councilBefore, state: stateBefore }, after: { council: councilAfter, state: watchState(model, names) },
    pathway: '+1 illegitimate guarantor XP → equal-XP tie broken by ID → seat crosses the threshold → the motion\'s result changes only if the entrant is pivotal',
    exercised: { seatCrossed: !councilBefore.includes('z1') && councilAfter.includes('z1'), displaced: councilBefore.filter(id => !councilAfter.includes(id)), decisionBefore, pivotalAfter, nonPivotalBefore, nonPivotalAfter, recomputationAloneChangedMembership: stable.join() !== recomputed.join() },
    openLinks: ['Reasoned merits, recusal, quorum and abstention are OPEN; a seat change is not evidence of an obstructive decision (M7).', 'No feedback from decisions to later XP or authority is implemented (M7).'],
    alternative: 'Remove the sybil guarantee (or withhold guarantor XP as a labeled ablation): z1 stays at one XP and the Council does not change.',
    alternativeOutcome: alternative ? (({ exercised, after }) => ({ sybil: false, council: after.council, pivotalAfter: exercised.pivotalAfter }))(walkthroughGovernance({ sybil: false, alternative: false })) : undefined,
    assumptions: ['councilSize 3 is a small-network research setting, not the selected 101.', 'Ballots are role scripts; the majority rule is an unselected procedural assumption.'],
  });
}

// W5 — Can correction resume after neglect? Attention is restored without resetting history; costs and damage stay visible.
export function walkthroughRecovery({ trace = null, neglectDays = [2, 3, 4], days = 8, alternative = true } = {}) {
  const model = new FacetyModel({ genesis: ['s1', 's2', 'v1', 'v2', 'v3', 'p1', 'p2', 'p3'] });
  const scene = new Scene(model, trace);
  // Stake 0 isolates attention from collateral capacity (M12); W3 exercises the stake bottleneck.
  const desk = new RelayDesk(model, { trace, policy: { stake: 0 } });
  for (const id of ['s1', 's2']) selfId(scene.at(0), id, ['M10']);
  scene.at(25);
  for (const id of ['s1', 's2']) model.convertToCollector(id, model.selfIds().find(act => act.subject === id).id);
  desk.registerObserver('o1', { budget: 20 });
  for (const id of ['s1', 's2']) desk.registerObserver(id, { budget: 6 });
  const accused = ['v1', 'v2', 'v3'];
  const partner = { v1: 'p1', v2: 'p2', v3: 'p3' };
  const acts = {};
  const backlog = [];
  const cashed = [];
  const processed = [];
  const queue = [];
  for (let day = 2; day < days; day++) {
    const neglect = neglectDays.includes(day);
    scene.at(day * 24);
    for (const id of ['s1', 's2']) desk.setBudget(id, neglect ? 0 : 6);
    const subject = accused[day - 2];
    if (subject) {
      const artifact = model.registerArtifact(subject);
      acts[subject] = model.createSelfId(subject, artifact, 0);
      model.createSelfId(partner[subject], artifact, 0);
      const found = desk.discover('o1', { selfId: acts[subject], kind: 'collision' });
      if (found.package) queue.push({ package: found.package, subject, foundAt: model.now });
    }
    // Scripted accused behavior: cash out an unfrozen act as soon as it matures.
    for (const [who, id] of Object.entries(acts)) {
      const act = model.selfId(id);
      if (act.status === 'unspent' && act.disputeLock === null && model.now - act.recordedAt >= 24 && !cashed.includes(who)) { model.convertToCollector(who, id); cashed.push(who); }
    }
    for (const item of [...queue]) {
      const sponsor = ['s1', 's2'][queue.indexOf(item) % 2];
      if (desk.packages().find(pkg => pkg.id === item.package).status === 'packaged') {
        const routed = desk.route(item.package, sponsor);
        if (routed.status !== 'applied') continue;
      }
      // A sponsored package waits for its sponsor's reserved stake: capacity is a second bottleneck (M12).
      const opened = desk.open(item.package);
      if (opened.status === 'applied') { queue.splice(queue.indexOf(item), 1); processed.push({ ...item, caseId: opened.case, openedAt: model.now, frozen: opened.frozen }); }
    }
    for (const item of processed) {
      const record = desk.cases().find(entry => entry.id === item.caseId);
      if (record.status === 'open' && model.now >= record.dueAt) desk.resolve(record.id, 'violation');
    }
    backlog.push({ day, pendingPackages: queue.length });
  }
  scene.at(days * 24 + 48);
  for (const item of processed) {
    const record = desk.cases().find(entry => entry.id === item.caseId);
    if (record.status === 'open' && model.now >= record.dueAt) desk.resolve(record.id, 'violation');
  }
  const cases = desk.cases();
  const packages = desk.packages();
  const delays = packages.map(pkg => ({ package: pkg.id, accused: pkg.accused, discoveredAt: pkg.stages.discovery, sponsorAt: pkg.stages.sponsor, verdictAt: pkg.stages.verdict, status: pkg.status, hoursToSponsor: pkg.stages.sponsor === null ? null : pkg.stages.sponsor - pkg.stages.discovery }));
  return finish('W5', 'Can correction resume after neglect?', scene, {
    mechanisms: ['M10', 'M5', 'M9'], actors: [...accused, 's1', 's2', 'o1'], before: { neglectDays }, after: { pendingPackages: queue.length, cases: cases.length },
    pathway: 'sponsor attention drops to zero → packages wait unrouted → attention is restored without resetting accumulated state → backlog drains in arrival order → acts that matured while waiting stay converted',
    exercised: { backlogByDay: backlog, delays, casesOpened: cases.length, resolved: cases.filter(entry => entry.status === 'resolved').length, frozenBeforeConversion: cases.filter(entry => entry.frozen).length, convertedBeforeFreeze: cashed, unresolvedAtHorizon: queue.length + cases.filter(entry => entry.status === 'open').length, work: desk.work() },
    openLinks: ['Whether neglect worsens later investigative effort or exit is not modeled (M5, M9, M10).', 'Restoration is a scripted budget change, not an endogenous response; irreversible damage is counted, not valued.'],
    alternative: 'neglectDays: [] — the same schedule without the attention loss freezes each act before it matures; compare convertedBeforeFreeze and hoursToSponsor.',
    alternativeOutcome: alternative ? (({ exercised }) => ({ neglectDays: [], hoursToSponsor: exercised.delays.map(delay => delay.hoursToSponsor), convertedBeforeFreeze: exercised.convertedBeforeFreeze, frozenBeforeConversion: exercised.frozenBeforeConversion, unresolvedAtHorizon: exercised.unresolvedAtHorizon }))(walkthroughRecovery({ neglectDays: [], alternative: false })) : undefined,
    assumptions: ['Accused cash out unfrozen mature acts (a scripted attacker policy, not an optimized strategy).', 'Challenge stake is 0 here so that attention, not collateral, is the only varied bottleneck.', 'Sponsor attention is a declared per-day budget; verdicts are scripted violation inputs for these cases.', ...RELAY_ASSUMPTIONS.slice(0, 2)],
  });
}

export const WALKTHROUGHS = Object.freeze({ W1: walkthroughInfluence, W2: walkthroughCorrection, W3: walkthroughOutsider, W4: walkthroughGovernance, W5: walkthroughRecovery });

export function runWalkthrough(id, options = {}) {
  if (!Object.hasOwn(WALKTHROUGHS, id)) throw new Error('unknown walkthrough: ' + id);
  const result = WALKTHROUGHS[id]({ trace: new Trace(), ...options });
  const { desk, ...rest } = result;
  return rest;
}
