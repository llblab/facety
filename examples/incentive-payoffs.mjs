import { runIncentiveForks } from '../src/incentives.mjs';
import { evaluateIncentivePayoffs } from '../src/incentive-payoffs.mjs';

const retained = JSON.parse(JSON.stringify(runIncentiveForks()));
const base = {
  facyValue: 1, xpValue: 0, workUnitCost: 1, admissionBenefit: 0, guaranteeBenefit: 0,
  expectedLosses: { 'invite-only': 0, 'invite-and-guarantee': 0 },
};
const scenarios = [
  ['no-incentive-control', { ...base, facyValue: 0, workUnitCost: 0 }],
  ['liquidity-preference', base],
  ['authority-break-even', { ...base, xpValue: 3 }],
  ['authority-above-break-even', { ...base, xpValue: 4 }],
  ['unknown-authority-value', { ...base, xpValue: null }],
];
console.log(JSON.stringify({
  interpretation: 'Illustrative supplied preferences, not calibrated prices, actual human choices or network-effect evidence.',
  evaluations: scenarios.map(([label, preferences]) => ({ label, analysis: evaluateIncentivePayoffs(retained, preferences) })),
}, null, 2));
