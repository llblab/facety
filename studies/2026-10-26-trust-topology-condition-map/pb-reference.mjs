// Owns: Import-free P/b daily-capacity inventory recurrence; excludes Native calls, population/payback and statistical inference.
export function pbCapacityReference(plan) {
  const keys = ['P', 'b', 'days', 'emissionEveryDays', 'maxActions'];
  if (!plan || Object.keys(plan).sort().join() !== keys.sort().join()) throw new TypeError('reference requires P,b,days,emissionEveryDays,maxActions');
  const { P, b, days, emissionEveryDays: q, maxActions } = plan;
  const bounded = (v, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
  if ((P !== null && !bounded(P, 1, Math.floor(Number.MAX_SAFE_INTEGER / 24))) || !bounded(b, 0)
    || !bounded(days, 0, 3650) || !bounded(q, 1, 3650) || !bounded(maxActions, 1)) throw new RangeError('reference plan outside closed domain');
  const commands = [];
  if (days > 0) commands.push({ day: 0, op: 'propose-support' }, { day: 0, op: 'confirm-support' });
  for (let day = 0; day < days; day++) {
    if (day % q === 0) commands.push({ day, op: 'artifact' }, { day, op: 'issue' });
    commands.push({ day, op: 'offer' });
  }
  const sources = [], invitations = [], actions = [], history = [];
  let now = 0, endpoint = 1, relation = null, artifacts = 0, offered = 0, cooldownDenied = 0, fundingDenied = 0, last = null;
  function snapshot() {
    const matured = sources.filter(s => s.atHour + 24 <= now).length;
    const burned = sources.filter(s => s.consumedAt !== null).length;
    const matureUnspent = sources.filter(s => s.consumedAt === null && s.atHour + 24 <= now).length;
    return { now, relation, artifacts, sources: sources.map(s => ({ ...s, xpCredited: s.atHour + 24 <= now })),
      invitations: invitations.map(i => ({ ...i, sources: [...i.sources] })),
      pb: { created: invitations.length, offered, cooldownDenied, fundingDenied, minted: sources.length, burned,
        emitterVault: sources.length - burned, matureUnspent, immatureUnspent: sources.length - burned - matureUnspent, xpTotal: 2 * matured } };
  }
  function sample() { now = endpoint * 24; history.push({ stage: 'day-end', atHour: now, pb: snapshot().pb }); endpoint++; }
  for (const cmd of commands.slice(0, maxActions)) {
    while (endpoint <= cmd.day) sample();
    now = cmd.day * 24;
    let reason = null;
    if (cmd.op === 'propose-support') relation = 'proposed';
    else if (cmd.op === 'confirm-support') relation = 'active';
    else if (cmd.op === 'artifact') artifacts++;
    else if (cmd.op === 'issue') sources.push({ atHour: now, consumedAt: null });
    else {
      offered++;
      const available = sources.map((s, index) => ({ s, index })).filter(({ s }) => s.consumedAt === null && s.atHour + 24 <= now);
      if (P !== null && last !== null && cmd.day - last < P) { reason = 'cooldown'; cooldownDenied++; }
      else if (available.length < b) { reason = 'funding'; fundingDenied++; }
      else {
        const used = available.slice(0, b).map(({ index }) => index);
        for (const index of used) sources[index].consumedAt = now;
        invitations.push({ atHour: now, target: 'target:' + cmd.day, sources: used }); last = cmd.day;
      }
    }
    actions.push({ atHour: now, op: cmd.op, ok: reason === null, reason });
  }
  const censored = commands.length > maxActions;
  if (!censored) while (endpoint <= days) sample();
  return { actions, history, censored, final: snapshot(), plannedActions: commands.length };
}
