import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FacetyModel } from '../src/model.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { CausalJournal, EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { provenance } from '../src/provenance.mjs';

export const WALKTHROUGH_DESIGN = Object.freeze({ path: 'examples/causal-walkthroughs.mjs', sha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') });
export const WALKTHROUGHS = Object.freeze(['support-finalized', 'support-vetoed', 'early-veto', 'missed-veto',
  'outsider-confirmed', 'outsider-refused', 'false-allegation-rejected', 'false-allegation-upheld', 'authority-boundary', 'neglect-restored']);

function guarantee(model, from, to) {
  const relation = model.proposeGuarantee(from, to);
  model.confirmGuarantee(to, relation);
  return relation;
}
function identify(model, subject) { return model.createSelfId(subject, model.registerArtifact(subject)); }

// A common funded prefix, not a claim that a false identity could pass real media checks.
export function causalWorld() {
  const model = new FacetyModel({ genesis: ['Aster', 'Bela', 'Cato'] });
  guarantee(model, 'Bela', 'Aster');
  guarantee(model, 'Cato', 'Aster');
  guarantee(model, 'Bela', 'Cato');
  const first = Object.fromEntries(['Bela', 'Cato', 'Aster'].map(id => [id, identify(model, id)]));
  model.advanceTo(24);
  model.convertToCollector('Bela', first.Bela);
  model.convertToCollector('Cato', first.Cato);
  const invitation = model.createInvitation('Aster', first.Aster, 'Mira');
  model.advanceTo(48);
  model.acceptInvitation(invitation, 'Mira');
  const miraAster = guarantee(model, 'Mira', 'Aster');
  guarantee(model, 'Mira', 'Cato');
  guarantee(model, 'Bela', 'Mira');
  guarantee(model, 'Aster', 'Mira');
  const acts = Object.fromEntries(['Mira', 'Aster', 'Cato', 'Bela'].map(id => [id, identify(model, id)]));
  model.advanceTo(72);
  for (const id of ['Mira', 'Aster', 'Cato', 'Bela']) model.convertToCollector(id, acts[id]);
  return { model, acts, miraAster };
}
function step(model, journal, actor, action, target, operation, mechanisms, visible = {}) {
  return journal.step(model, { actor, action, target, visible, mechanisms,
    basis: 'scripted native-transition walkthrough; no preference or expected-utility claim' }, () => ({ ok: true, value: operation() }));
}
function actors(capacity = 1, externalBudget = 12) {
  return [
    { id: 'Outside', subject: null, budget: externalBudget, reviewCapacity: 0 },
    { id: 'Aster', subject: 'Aster', budget: 8, reviewCapacity: capacity },
    { id: 'Bela', subject: 'Bela', budget: 8, reviewCapacity: capacity },
  ];
}
function packageFor(relay, act, sourceGroup = 'public-media') {
  const observation = relay.observe('Outside', act, { suspicious: true, sourceGroup });
  if (!observation.ok) return observation;
  return relay.package('Outside', [observation.value]);
}

export function runWalkthrough(name, { traceLimit = 200 } = {}) {
  if (!WALKTHROUGHS.includes(name)) throw new Error('unknown walkthrough');
  const journal = new CausalJournal(traceLimit);
  let world = causalWorld();
  let { model } = world;
  let before = accountabilitySnapshot(model);
  let relay = null;
  let returnLink = 'Open: no outcome-driven participation, loyalty, utility or belief updating is implemented.';
  let disabledLink = null;
  const violation = ['early-veto', 'missed-veto', 'outsider-confirmed', 'outsider-refused', 'neglect-restored'].includes(name);
  const assumptions = [
    'Named schedules and observations are exogenous diagnostics, not endogenous investigation or an equilibrium.',
    'The common prefix uses funded admission and native two-sided directed guarantees; genesis acquisition and protocol setup work are unpriced.',
    'Relay actions each cost one illustrative work unit; budgets are exogenous capacity, not money. No compensation or external FACY transfer is assumed.',
    'Signals, availability, disclosed conflicts and one-step adjudication inputs are supplied separately; neither source motive nor evaluator identity is a defender input.',
    'One-step merits and staged hearing delay are OPEN procedural references. No voluntary-report immunity, apex referral or reinstatement is invented.',
  ];
  if (name.startsWith('support-') || name.endsWith('veto')) {
    const prevention = name === 'early-veto' || name === 'missed-veto';
    const target = prevention ? 'Mira' : 'Aster';
    const guardian = prevention ? 'Bela' : 'Mira';
    const act = step(model, journal, target, 'fresh-self-id', target, () => identify(model, target), ['M01', 'M02']).value;
    if (name === 'support-vetoed' || name === 'early-veto') {
      model.advanceTo(95);
      step(model, journal, guardian, 'guarantor-veto', target, () => model.cancelSelfId(guardian, act), ['M01', 'M02'], { selfId: act, suppliedSuspicion: true });
    } else {
      model.advanceTo(96);
      step(model, journal, target, 'collector-conversion', target, () => model.convertToCollector(target, act), ['M01', 'M02'], { selfId: act });
      if (name === 'missed-veto') {
        step(model, journal, guardian, 'guarantor-veto', target, () => model.cancelSelfId(guardian, act), ['M02'], { selfId: act, suppliedSuspicion: true });
        const rules = experimentConfig({ disputes: { enabled: true, stakeBacking: 'reserved' } }).disputes;
        relay = new EvidenceRelay(model, { actors: actors(), rules, journal });
        const packageId = packageFor(relay, act).value;
        relay.route('Outside', packageId, 'Bela');
        relay.review('Bela', packageId, { suspicious: true, sourceGroup: 'Bela-independent-review' });
        const challenge = relay.sponsor('Bela', packageId);
        if (!challenge.ok) throw new Error('late-correction sponsor must qualify under the declared prefix');
        model.advanceTo(97);
        relay.resolve(challenge.value, true);
      } else step(model, journal, 'Aster', 'end-directed-guarantee', 'Mira', () => model.endGuarantee('Aster', world.miraAster), ['M03'], { relation: world.miraAster, endingParty: 'guaranteed subject' });
    }
    disabledLink = name === 'support-vetoed' || name === 'early-veto' ? 'Terminal credit absent because the act was cancelled, not an XP-rule ablation.' : 'Timely veto absent; conversion irreversibly ended the free cancellation right.';
  } else if (name === 'authority-boundary') {
    model = new FacetyModel({ genesis: ['Aster', 'Bela'], policy: { councilSize: 1 } });
    assumptions.push('Council size 1 is an explicitly labeled rank-boundary reference; selected target remains 101 equal-vote active members. No Council ballot is executed.');
    for (const id of ['Aster', 'Bela']) {
      const act = identify(model, id);
      model.advanceTo(model.now + 24);
      model.convertToCollector(id, act);
    }
    before = accountabilitySnapshot(model);
    const act = step(model, journal, 'Bela', 'fresh-self-id', 'Bela', () => identify(model, 'Bela'), ['M01', 'M07']).value;
    model.advanceTo(model.now + 24);
    step(model, journal, 'Bela', 'collector-conversion', 'Bela', () => model.convertToCollector('Bela', act), ['M01', 'M07'], { selfId: act });
    disabledLink = 'Without this terminal disposition the extra XP and seat crossing do not occur; no claim about a vote follows.';
  } else {
    const rules = experimentConfig({ disputes: { enabled: true, procedure: 'one-step', stakeBacking: 'reserved' } }).disputes;
    relay = new EvidenceRelay(model, { actors: actors(), rules, journal });
    const packaged = packageFor(relay, world.acts.Mira);
    const packageId = packaged.value;
    relay.route('Outside', packageId, 'Aster');
    if (name === 'outsider-refused') {
      relay.review('Aster', packageId, { suspicious: false, sourceGroup: 'Aster-independent-review' });
      disabledLink = 'No alternative route was supplied: evidence remains open after sponsor refusal.';
    } else {
      relay.review('Aster', packageId, { suspicious: true, sourceGroup: 'Aster-independent-review' });
      relay.sponsor('Aster', packageId); // Equal XP is not enough: this is an actual evaluated gate failure.
      relay.route('Outside', packageId, 'Bela');
      if (name === 'neglect-restored') {
        relay.review('Bela', packageId, { suspicious: true, sourceGroup: 'Bela-independent-review' }, { available: false });
        model.advanceTo(96);
      }
      relay.review('Bela', packageId, { suspicious: true, sourceGroup: 'Bela-independent-review' });
      const challenge = relay.sponsor('Bela', packageId);
      if (!challenge.ok) throw new Error('declared walkthrough prefix must fund and qualify Bela');
      model.advanceTo(model.now + 1);
      const upheld = name !== 'false-allegation-rejected';
      relay.resolve(challenge.value, upheld);
      if (name === 'false-allegation-rejected') {
        model.advanceTo(96);
        const nextAct = step(model, journal, 'Mira', 'fresh-self-id', 'Mira', () => identify(model, 'Mira'), ['M01', 'M09']).value;
        const nextPackage = packageFor(relay, nextAct, 'later-media').value;
        relay.route('Outside', nextPackage, 'Bela');
        relay.review('Bela', nextPackage, { suspicious: true, sourceGroup: 'Bela-later-review' });
        relay.sponsor('Bela', nextPackage);
        returnLink = 'Exercised balancing constraint: a rejected challenge halves Bela XP from 7 to 3; a later reviewed case against 3-XP Mira fails the strict gate. This is encoded authority feedback, not learned caution.';
      }
      if (name === 'neglect-restored') returnLink = 'Exogenous availability restoration resumes the queued pathway without resetting the 24-hour delay, balances, XP or history. No endogenous learning/restoration policy is claimed.';
    }
  }
  const after = accountabilitySnapshot(model);
  const relayState = relay?.snapshot() ?? null;
  const truth = Object.fromEntries(model.subjects().map(subject => [subject.id, { genuine: subject.id !== 'Mira' || !violation }]));
  const genuine = model.subjects().filter(subject => truth[subject.id].genuine);
  const wrongful = genuine.filter(subject => subject.identityStatus !== 'accepted').length;
  const cases = relayState?.cases ?? [];
  const firstObservation = relayState?.observations[0];
  const resolved = cases.filter(record => record.resolvedAt !== null);
  return {
    schema: 'facety-causal-walkthrough/v1', name, provenance: provenance(), design: WALKTHROUGH_DESIGN, randomness: { generator: null, decisions: 'supplied-inputs-v1' },
    assumptions, before, after, relay: relayState, trace: journal.snapshot(), returnLink, disabledLink,
    headlines: { window: { startHour: before.atHour, endHour: after.atHour },
      genuineRetained: { accepted: genuine.length - wrongful, denominator: genuine.length },
      cases: { opened: cases.length, resolved: resolved.length, unresolved: cases.length - resolved.length,
        trueViolationCorrected: Number(violation && after.subjects.some(subject => subject.id === 'Mira' && subject.identityStatus !== 'accepted')),
        wrongfulInvalidations: wrongful },
      discoveryToResolutionHours: resolved[0] && firstObservation ? resolved[0].resolvedAt - firstObservation.atHour : null,
      relayWork: relayState ? relayState.actors.map(({ id, budget, spent, denied }) => ({ id, budget, spent, denied })) : null,
      monetaryChanges: Object.fromEntries(['burned', 'feeVault', 'stakeVault', 'debt'].map(key => [key, after.ledger[key] - before.ledger[key]])),
      xp: after.subjects.map(subject => ({ id: subject.id, before: before.subjects.find(old => old.id === subject.id)?.xp ?? null, after: subject.xp })),
      unresolvedPackages: relayState?.packages.filter(item => item.status !== 'resolved').length ?? 0,
      councilBefore: before.council, councilAfter: after.council, actualCouncilVotes: null },
    evaluation: { truth, note: 'Evaluator assumptions only; not supplied to EvidenceRelay, sponsor review, protocol state or the causal journal.' },
  };
}

export function renderWalkthrough(run) {
  const h = run.headlines;
  const lines = [`## ${run.name}`, `Window ${h.window.startHour}–${h.window.endHour} h; genuine retained ${h.genuineRetained.accepted}/${h.genuineRetained.denominator} (evaluator-only).`,
    `Cases ${h.cases.resolved}/${h.cases.opened} resolved, ${h.cases.unresolved} unresolved; wrongful invalidations ${h.cases.wrongfulInvalidations}; discovery→resolution ${h.discoveryToResolutionHours ?? 'pending/not applicable'} h.`,
    `Money Δ: burned ${h.monetaryChanges.burned}, fee custody ${h.monetaryChanges.feeVault}, stake custody ${h.monetaryChanges.stakeVault}, debt ${h.monetaryChanges.debt}. Debt is not burn.`,
    `Relay work: ${h.relayWork ? h.relayWork.map(row => `${row.id} ${row.spent}/${row.budget}, denied ${row.denied}`).join('; ') : 'not measured for native setup/actions'}; unresolved evidence packages ${h.unresolvedPackages}.`,
    `XP: ${h.xp.map(row => `${row.id} ${row.before}→${row.after}`).join('; ')}. Council votes: not exercised.`,
    `Council seats/rank: ${h.councilBefore.map(row => row.id).join(', ')} → ${h.councilAfter.map(row => row.id).join(', ')} (recalculation is not independent judgment).`,
    '```text', ...run.trace.records.map(row => `${row.id} @${row.atHour}h ${row.actor} ${row.action} → ${row.outcome.ok ? 'accepted' : row.outcome.reason} [${row.mechanisms.join(',')}]`), '```',
    run.returnLink, run.disabledLink ?? '', `Detailed deltas, public event ancestry and separate evaluator assumptions: --json ${run.name}.`, ''];
  return lines.filter(line => line !== '').join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv.find(value => WALKTHROUGHS.includes(value));
  if (process.argv.includes('--json')) {
    if (!name) throw new Error('--json requires one named walkthrough (bounded artifact)');
    console.log(JSON.stringify(runWalkthrough(name), null, 2));
  } else {
    const register = JSON.parse(await readFile(new URL('../docs/mechanisms.json', import.meta.url), 'utf8'));
    console.log('# Facety causal walkthroughs\n\n[R] protocol transition; [A] declared reference/behavior; [O] measurement; [?] missing return. Signs are conditional, not health verdicts.\n');
    console.log('```text\n' + register.mechanisms.map(record => record.diagram).join('\n') + '\n```\n');
    for (const id of name ? [name] : WALKTHROUGHS) console.log(renderWalkthrough(runWalkthrough(id)));
  }
}
