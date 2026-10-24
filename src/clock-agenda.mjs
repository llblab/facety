// Owns: Deterministic experiment clock markers; excludes actions, economic state, event priority and randomness.

export function clockAgenda(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('clock agenda requires an options object');
  for (const key of Object.keys(options)) if (!['horizonHour', 'stepHours', 'deadlineHours'].includes(key)) throw new Error('unknown clock agenda field: ' + key);
  const { horizonHour, stepHours, deadlineHours = [] } = options;
  if (!Number.isSafeInteger(horizonHour) || horizonHour < 0) throw new RangeError('horizonHour must be a non-negative safe integer');
  if (![4, 6, 24].includes(stepHours)) throw new RangeError('stepHours must be 4, 6 or 24');
  if (!Array.isArray(deadlineHours)) throw new TypeError('deadlineHours must be an array');
  const supplied = [...deadlineHours];
  for (const hour of supplied) if (!Number.isSafeInteger(hour) || hour < 0 || hour > horizonHour) throw new RangeError('deadline hours must be safe integers within [0, horizonHour]');
  // Validate the snapshot we will iterate; coincident marks do not define event execution order.
  const deadlines = [...new Set(supplied)].sort((a, b) => a - b);
  return mergeAgenda(Math.max(0, horizonHour), stepHours, deadlines);
}

function* mergeAgenda(horizonHour, stepHours, deadlines) {
  let nextTick = 0;
  let deadlineIndex = 0;
  while (true) {
    const atHour = Math.min(nextTick, deadlines[deadlineIndex] ?? horizonHour);
    const decisionTick = atHour === nextTick && atHour < horizonHour;
    const deadline = deadlines[deadlineIndex] === atHour;
    const horizon = atHour === horizonHour;
    yield { atHour, decisionTick, deadline, horizon };
    if (horizon) return;
    if (deadline) deadlineIndex++;
    // Clamp before addition so safe horizons cannot overflow at the final tick.
    if (decisionTick) nextTick = horizonHour - atHour <= stepHours ? horizonHour : atHour + stepHours;
  }
}
