// Owns: Conditional terminal-payoff analysis of retained incentive forks; excludes market calibration, adaptive agents and network-effect claims.
import { readIncentiveComparisons, INCENTIVE_STRATEGIES } from './incentives.mjs';

const PREFERENCE_KEYS = ['facyValue', 'xpValue', 'workUnitCost', 'admissionBenefit', 'guaranteeBenefit', 'expectedLosses'];
const ALTERNATIVES = INCENTIVE_STRATEGIES.slice(1);

function record(value, keys, label, required = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object');
  if (Object.keys(value).some(key => !keys.includes(key)) || (required && keys.some(key => !Object.hasOwn(value, key)))) throw new Error(label + ' requires its declared fields without unknown keys');
}
function finite(value) {
  if (!Number.isFinite(value)) throw new RangeError('payoff arithmetic overflow');
  return value === 0 ? 0 : value;
}
function valuation(value, label, nonnegative = false) {
  if (value === null) return null;
  if (!Number.isFinite(value) || (nonnegative && value < 0)) throw new RangeError(label + ' must be finite or explicitly null, with its declared sign constraint');
  return finite(value);
}
function preferencesFrom(source) {
  record(source, PREFERENCE_KEYS, 'preferences');
  record(source.expectedLosses, ALTERNATIVES, 'expectedLosses');
  return {
    facyValue: valuation(source.facyValue, 'facyValue', true),
    xpValue: valuation(source.xpValue, 'xpValue'),
    workUnitCost: valuation(source.workUnitCost, 'workUnitCost', true),
    admissionBenefit: valuation(source.admissionBenefit, 'admissionBenefit'),
    guaranteeBenefit: valuation(source.guaranteeBenefit, 'guaranteeBenefit'),
    expectedLosses: Object.fromEntries(ALTERNATIVES.map(strategy => [strategy, valuation(source.expectedLosses[strategy], 'expectedLosses.' + strategy)])),
  };
}
function product(coefficient, value) {
  if (coefficient === 0) return 0;
  return value === null ? null : finite(coefficient * value);
}
function sum(values) {
  if (values.some(value => value === null)) return null;
  return finite(values.reduce((total, value) => finite(total + value), 0));
}
function xpThreshold(delta, otherComponents) {
  if (delta === 0) return { status: 'not-sensitive', value: null, preferredWhen: null };
  const subtotal = sum(otherComponents);
  if (subtotal === null) return { status: 'unknown-other-inputs', value: null, preferredWhen: null };
  return { status: 'threshold', value: finite(-subtotal / delta), preferredWhen: delta > 0 ? 'xpValue > value' : 'xpValue < value' };
}

export function evaluateIncentivePayoffs(artifact, suppliedPreferences, options = {}) {
  const facts = readIncentiveComparisons(artifact);
  const preferences = preferencesFrom(suppliedPreferences);
  record(options, ['comparisonTolerance'], 'payoff options', false);
  const comparisonTolerance = Object.hasOwn(options, 'comparisonTolerance') ? options.comparisonTolerance : 0;
  if (!Number.isFinite(comparisonTolerance) || comparisonTolerance < 0) throw new RangeError('comparisonTolerance must be finite and non-negative');
  const comparisons = facts.map(comparison => {
    const delta = comparison.sponsor;
    const components = {
      liquidFacy: product(delta.liquidFacy, preferences.facyValue),
      terminalXp: product(delta.xp, preferences.xpValue),
      work: product(-delta.effort, preferences.workUnitCost),
      admissionBenefit: preferences.admissionBenefit,
      guaranteeBenefit: comparison.treatment === 'invite-and-guarantee' ? preferences.guaranteeBenefit : 0,
      expectedLossAdjustment: product(-1, preferences.expectedLosses[comparison.treatment]),
    };
    const conditionalTerminalDifference = sum(Object.values(components));
    const relation = conditionalTerminalDifference === null ? 'unknown' : conditionalTerminalDifference === 0 ? 'indifferent'
      : Math.abs(conditionalTerminalDifference) <= comparisonTolerance ? 'within-tolerance'
      : conditionalTerminalDifference > 0 ? 'preferred' : 'disfavored';
    return {
      ...comparison, components, conditionalTerminalDifference, relation,
      missingComponents: Object.keys(components).filter(key => components[key] === null),
      xpBreakEven: xpThreshold(delta.xp, Object.entries(components).filter(([key]) => key !== 'terminalXp').map(([, value]) => value)),
    };
  });
  const scores = [{ strategy: 'wait-collector', value: 0 }, ...comparisons.map(row => ({ strategy: row.treatment, value: row.conditionalTerminalDifference }))];
  const known = scores.filter(row => row.value !== null);
  const bestKnownDifference = Math.max(...known.map(row => row.value));
  const knownMaximizers = known.filter(row => row.value === bestKnownDifference).map(row => row.strategy);
  const complete = known.length === scores.length;
  return {
    schema: 'facety-incentive-payoffs/v1', model: 'terminal-linear-risk-adjusted-v1',
    source: structuredClone({
      schema: artifact.schema, fixture: artifact.fixture, policy: artifact.policy, schedule: artifact.schedule,
      workUnit: artifact.branches[0].work.unit, weights: artifact.branches[0].work.weights,
      ...(artifact.schema === 'facety-incentive-forks/v2' ? { provenance: artifact.provenance } : {}),
    }),
    utilityUnit: 'caller-declared common utility units; not calibrated money or welfare',
    preferences, numericPolicy: { comparisonTolerance: finite(comparisonTolerance), arithmetic: 'finite IEEE-754 numbers' },
    comparisons,
    choiceSummary: {
      status: complete ? 'complete' : 'partial', bestKnownDifference, knownMaximizers,
      exactNumericalMaximizers: complete ? knownMaximizers : null,
      candidateBestResponses: scores.filter(row => row.value === null || row.value >= bestKnownDifference - comparisonTolerance).map(row => row.strategy),
      method: 'Keep every unknown score and every known score inside the declared band of the best known score; no interval reasoning over unknown inputs.',
    },
    fullDynamicUtility: null, networkExternality: null,
    assumptions: [
      'Only the sponsor and the three recorded scripts are compared; the baseline difference is zero by identity, not an estimated absolute utility.',
      'Every valuation, private benefit and expected loss is supplied explicitly in common utility units. Null is unknown, not zero.',
      'Zero factual exposure gives a zero contribution even when its valuation is unknown. This does not impute that valuation.',
      'FACY value and work-unit cost are non-negative. XP value, private benefits and incremental expected losses may be signed.',
      'Expected losses are exogenous differences relative to waiting, not observed debt or a calibrated adjudication model. Do not double-count effects already priced in recorded balances or work.',
      'Earlier authority, cash-flow timing, rank discontinuities and strategic responses are outside this terminal linear illustration.',
      'A nonzero comparison tolerance is an analysis band, not proof of exact indifference or a confidence interval. Raw numerical differences remain unchanged.',
      'Conditional maximizers in this finite menu are not predicted choices, a global best response, an equilibrium or proof of a network effect.',
      'Source validation checks comparable checkpoints, used accounting and recorded work, not source authenticity or every protocol transition.',
    ],
  };
}
