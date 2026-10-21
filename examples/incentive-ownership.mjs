import { runIncentiveForks } from '../src/incentives.mjs';
import { compareIncentiveOwnership } from '../src/incentive-ownership.mjs';

const retained = JSON.parse(JSON.stringify(runIncentiveForks()));
const analysis = compareIncentiveOwnership(retained);
const illustrations = [1, 10].map(facyValue => ({
  preferences: {
    facyValue, workUnitCost: 1, xpValueForEverySubject: 0, privateBenefits: 0,
    relativeExpectedLossesForAllAlternatives: 0, extraTimingAndRankValue: 0,
  },
  worlds: analysis.worlds.map(world => ({
    world: world.id,
    comparisons: world.comparisons.map(row => ({
      strategy: row.treatment,
      conditionalTerminalDifference: facyValue * row.sponsorOperator.liquidFacy - row.sponsorOperator.effort,
    })),
  })),
}));
console.log(JSON.stringify({
  interpretation: 'Declared cash/work-only terminal illustrations, with other private contributions explicitly zero for this illustration, not inferred to be zero in reality. No predicted choices, feasible attack or useful network effect is established.',
  analysis, illustrations,
}, null, 2));
