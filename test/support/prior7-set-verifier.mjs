// Owns: Independent test-only literal set oracle; excludes tested calculator imports, Native execution and financial/authentication claims.
export function prior7Sets(run, evaluation) {
  const group = id => evaluation.coalitionOperators.includes(evaluation.operatorBySubject[id]);
  const used = run.state.admissions.flatMap(a => a.vouches).map(id => run.state.vouches.find(v => v.id === id));
  const cross = used.filter(v => !group(v.voucher) && group(v.target));
  const records = cross.map(v => v.id).sort();
  const active = cross.filter(v => run.state.relations.find(r => r.vouch === v.id).endedAt === null).map(v => v.id).sort();
  const probation = cross.filter(v => v.expiresAt > run.state.now).map(v => v.id).sort();
  const contacts = [...new Set(cross.map(v => v.voucher))].sort();
  return {
    sets: { 'activated-records-cumulative': records, 'active-guarantees-terminal': active, 'probation-records-terminal': probation, 'issuer-contacts-cumulative': contacts },
    falseNew: run.state.admissions.map(a => a.subject).filter(id => group(id) && evaluation.genuineBySubject[id] === false).sort(),
    falseInitial: run.config.model.genesis.filter(id => group(id) && evaluation.genuineBySubject[id] === false).sort(),
    unused: run.state.vouches.filter(v => !used.includes(v) && !group(v.voucher) && group(v.target)).map(v => v.id).sort(),
  };
}
