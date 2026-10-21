// Owns: Evaluator-only custody and work counterfactuals for retained incentive forks; excludes live Sybil execution, pooled XP authority and calibrated utility.
import { readIncentiveComparisons, INCENTIVE_STRATEGIES } from './incentives.mjs';
import { effortWeights } from './effort.mjs';

const PRECISION = 1_000_000;
const WORLDS = [
  { id: 'independent-newcomer', newcomerOperator: 'newcomer', genuineNewcomer: true, preparation: 'recruitHuman' },
  { id: 'sponsor-controlled-newcomer', newcomerOperator: 'sponsor', genuineNewcomer: false, preparation: 'fabricateIdentity' },
];

function workSummary(actions) {
  let effortMicroUnits = 0;
  for (const action of actions) {
    const cost = Math.round(action.effort * PRECISION);
    if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(effortMicroUnits + cost)) throw new RangeError('ownership effort accounting overflow');
    effortMicroUnits += cost;
  }
  return { effort: effortMicroUnits / PRECISION, effortMicroUnits, acceptedActions: actions.length };
}
function checkPreparation(branch, atHour) {
  const records = branch.actions.filter(action => ['recruitHuman', 'fabricateIdentity'].includes(action.action));
  const admitted = branch.strategy !== 'wait-collector';
  if (records.length !== (admitted ? 1 : 0) || (admitted && (records[0].action !== 'recruitHuman'
    || records[0].actor !== 'sponsor' || records[0].atHour !== atHour || records[0].phase !== 'maintenance'))) {
    throw new Error('ownership comparison requires the recorded sponsor recruitment step');
  }
}
function evaluateWorld(definition, branches, weights) {
  const operatorBySubject = { sponsor: 'sponsor', peer: 'peer', newcomer: definition.newcomerOperator };
  const genuineBySubject = { sponsor: true, peer: true, newcomer: definition.genuineNewcomer };
  const outcomes = branches.map(branch => {
    const subjects = branch.timeline.at(-1).subjects;
    const workActions = branch.actions.map(({ actor, ...recorded }) => {
      const action = recorded.action === 'recruitHuman' ? definition.preparation : recorded.action;
      return {
        ...recorded, subject: actor, operator: operatorBySubject[actor],
        recordedAction: recorded.action, recordedEffort: recorded.effort,
        action, effort: action === recorded.action ? recorded.effort : weights[action],
      };
    });
    const operators = [...new Set(subjects.map(subject => operatorBySubject[subject.id]))].map(id => {
      const held = subjects.filter(subject => operatorBySubject[subject.id] === id);
      return {
        id, subjectIds: held.map(subject => subject.id).sort(),
        liquidFacy: held.reduce((sum, subject) => sum + subject.liquidFacy, 0),
        observedDebt: held.reduce((sum, subject) => sum + subject.debt, 0),
        xpBySubject: Object.fromEntries(held.map(subject => [subject.id, subject.xp])),
        work: workSummary(workActions.filter(action => action.operator === id)),
      };
    });
    return {
      strategy: branch.strategy,
      population: {
        subjects: subjects.length, assumedOperators: operators.length,
        assumedGenuinePeople: subjects.filter(subject => genuineBySubject[subject.id]).length,
      },
      operators, workActions,
    };
  });
  const baseline = outcomes[0];
  const sponsor = outcome => outcome.operators.find(operator => operator.id === 'sponsor');
  const before = sponsor(baseline);
  const comparisons = outcomes.slice(1).map(outcome => {
    const after = sponsor(outcome);
    const effortMicroUnits = after.work.effortMicroUnits - before.work.effortMicroUnits;
    return {
      baseline: baseline.strategy, treatment: outcome.strategy,
      sponsorOperator: {
        liquidFacy: after.liquidFacy - before.liquidFacy,
        observedDebt: after.observedDebt - before.observedDebt,
        effort: effortMicroUnits / PRECISION, effortMicroUnits,
        acceptedActions: after.work.acceptedActions - before.work.acceptedActions,
        xpBySubject: { before: { ...before.xpBySubject }, after: { ...after.xpBySubject } },
      },
      populationDelta: Object.fromEntries(Object.keys(baseline.population).map(key => [key, outcome.population[key] - baseline.population[key]])),
      privateUtility: null, expectedLiability: null, networkExternality: null,
    };
  });
  return {
    id: definition.id, evaluator: { operatorBySubject, genuineBySubject, preparationAction: definition.preparation },
    branches: outcomes, comparisons,
  };
}

export function compareIncentiveOwnership(artifact) {
  readIncentiveComparisons(artifact);
  const branches = INCENTIVE_STRATEGIES.map(strategy => artifact.branches.find(branch => branch.strategy === strategy));
  for (const branch of branches) checkPreparation(branch, branch.timeline.find(point => point.stage === 'decision').atHour);
  return {
    schema: 'facety-incentive-ownership/v1', fixture: 'marginal-admission-ownership-v1',
    source: structuredClone({
      schema: artifact.schema, fixture: artifact.fixture, policy: artifact.policy, schedule: artifact.schedule,
      workUnit: branches[0].work.unit, weights: branches[0].work.weights,
    }),
    protocolBranches: branches.map(branch => structuredClone({ strategy: branch.strategy, timeline: branch.timeline, events: branch.events ?? null })),
    worlds: WORLDS.map(definition => evaluateWorld(definition, branches, effortWeights(branches[0].work.weights))),
    fullDynamicUtility: null, networkExternality: null,
    assumptions: [
      'This is an offline counterfactual overlay on one retained protocol trace per strategy, not a second live execution or a feasible Sybil strategy.',
      'The independent world retains distinct genuine people. The controlled world explicitly replaces that assumption: the sponsor operates the newcomer as a false additional identity. Neither world is established by the trace; common wallet control alone does not prove false personhood.',
      'Both accepted genesis subjects remain distinct genuine people and independent operators. Ownership and genuine-person labels are evaluator-only and never supplied to protocol transitions or defense.',
      'The controlled world replaces the recorded sponsor recruitHuman preparation charge with one fabricateIdentity charge at the declared source weight. Recorded and counterfactual work remain distinct; fabrication is not claimed to have actually happened.',
      'All other actions, actors, protocol checkpoints and events are retained. This assumes the same abstract acceptance, Self-ID and conversion script can complete; biometric feasibility, detection, adjudication and adaptive responses are not modeled here.',
      'Operator-held FACY pools custody, not new minting or an executed transfer to a sponsor wallet. Procedural XP stays per subject and never becomes one identity\'s summed authority.',
      'Work sums follow subject actors and their assumed operators, including newcomer work. These post-hoc totals do not establish feasibility under a shared operator budget or calibrated human effort.',
      'Preparation and action weights are illustrative declared assumptions, not empirical recruitment or fabrication costs. Integer micro-units are authoritative for work sums; displayed effort uses IEEE-754 numbers.',
      'Zero observed debt does not estimate expected liability. Private utility, full dynamic effects and useful network externalities remain unknown.',
      'Retained-data checks are not authentication or verification of every intermediate protocol transition. Preserve the original artifact and implementation revision.',
    ],
  };
}
