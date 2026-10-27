// Owns: Study-local passive terminal admission/cut attribution; excludes Model execution, identity truth, authority, scientific inference and authentication.
const kinds = ['activated-records-cumulative', 'active-guarantees-terminal', 'probation-records-terminal', 'issuer-contacts-cumulative'];
const operations = ['artifact', 'issue', 'withdraw', 'commit', 'admit', 'exit', 'hold', 'settle', 'refund', 'pool', 'review'];
const need = (ok, reason) => { if (!ok) throw new Error('prior7 attribution: ' + reason); };
const text = x => typeof x === 'string' && x.length > 0;
const uint = x => Number.isSafeInteger(x) && x >= 0;
const sorted = values => [...values].sort();
const same = (a, b) => { const right = sorted(b); return a.length === b.length && sorted(a).every((x, i) => x === right[i]); };
function ids(rows, key, label) {
  need(Array.isArray(rows), label + ' missing');
  const map = new Map();
  for (const row of rows) { need(row && text(row[key]) && !map.has(row[key]), label + ' duplicate/invalid identity'); map.set(row[key], row); }
  return map;
}
function add(a, b) { need(uint(a) && uint(b) && Number.isSafeInteger(a + b), 'unsafe sum'); return a + b; }

export function evaluateVouchAttribution(run, evaluation) {
  need(evaluation && typeof evaluation === 'object' && !Array.isArray(evaluation)
    && same(Object.keys(evaluation), ['operatorBySubject', 'genuineBySubject', 'coalitionOperators', 'denominatorKind']), 'explicit closed evaluation required');
  const { operatorBySubject: operators, genuineBySubject: genuine, coalitionOperators, denominatorKind } = evaluation;
  need(kinds.includes(denominatorKind), 'explicit denominatorKind required');
  need(operators && genuine && typeof operators === 'object' && typeof genuine === 'object' && !Array.isArray(operators) && !Array.isArray(genuine), 'explicit label maps required');
  need(Array.isArray(coalitionOperators) && coalitionOperators.length > 0 && coalitionOperators.every(text)
    && new Set(coalitionOperators).size === coalitionOperators.length, 'explicit distinct coalitionOperators required');
  const group = new Set(coalitionOperators), cfg = run?.config, out = run?.outcome, s = run?.state, p = run?.provenance;
  need(run?.schema === 'facety-native-vouch-run/v1' && run.classification === 'diagnostic' && cfg?.engine === 'native-vouch-tape/v1'
    && cfg.reference === 'native-funded-composition-reference/v1' && cfg.includeState === true, 'unsupported run identity or missing state');
  need(p?.implementation?.method === 'sha256-src-mjs-v1' && /^[a-f0-9]{64}$/.test(p.implementation.digest)
    && Number.isSafeInteger(p.implementation.files) && p.implementation.files > 0 && /^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(p.runtime?.node), 'invalid producer provenance');
  const H = out?.horizonHours, b = cfg.model?.vouching, c = cfg.model?.vouchAdmission?.c;
  need(uint(cfg.days) && cfg.days <= 3650 && H === cfg.days * 24 && out.horizonDays === cfg.days
    && out.censored === false && out.censorReason === null && out.endedAtHour === H && s?.now === H
    && out.success === null && out.successCriterion === 'unbound' && cfg.successCriterion === 'unbound', 'complete uncensored declared terminal horizon required');
  need(b && uint(b.K) && uint(b.B) && uint(b.T) && uint(b.T * 24) && b.T > 0 && uint(b.V) && uint(b.V * 24) && b.V > 0 && uint(c) && c > 0 && uint(c + 1)
    && b.reference?.exitSlot === 'retain-until-V' && b.reference?.clockOrigin === 'commitment'
    && b.reference?.funding === 'collector-liquid' && b.reference?.bondRelease === 'supplied-clearance'
    && b.reference?.eligibility === 'accepted-reference' && cfg.model.invitationLimit === null
    && cfg.model.policy?.xpFinality === 'maturity' && cfg.model.policy.cancellationAuthority === 'snapshot' && cfg.model.policy.guarantorEligibility === 'accepted'
    && cfg.model.policy.linkBreakXp === 'revoke' && cfg.model.policy.spendMaturityHours === 24 && cfg.model.policy.conversionMaturityHours === 24
    && cfg.model.policy.artifactReuse === 'registration-only' && cfg.model.vouchAdmission.reference === 'native-guarantees-commitment-reference', 'unsupported closed vouch profile');
  need(Array.isArray(run.history) && run.history.length === cfg.days
    && run.history.every((row, i) => row.stage === 'day-end' && row.atHour === (i + 1) * 24), 'complete daily endpoints required');
  need(Array.isArray(cfg.events) && Array.isArray(run.actions) && cfg.events.length === run.actions.length
    && uint(cfg.maxActions) && cfg.maxActions > 0 && run.actions.length <= cfg.maxActions, 'complete ordered action evidence required');
  const commits = new Map(), handles = new Map(), admits = new Map(), issues = new Map(), exits = new Map();
  let last = -1;
  cfg.events.forEach((q, i) => {
    const a = run.actions[i];
    const authority = ['hold', 'settle', 'refund', 'pool'].includes(q?.op) ? 'trusted-administration' : q?.op === 'review' ? 'custody-review' : 'subject-call';
    need(q && operations.includes(q.op) && q.authority === authority && uint(q.atHour) && q.atHour >= last && q.atHour < H && a?.atHour === q.atHour
      && a.op === q.op && a.authority === q.authority && typeof a.ok === 'boolean'
      && (a.ok ? a.reason === null : text(a.reason)), 'invalid/reordered action journal');
    last = q.atHour;
    if (!a.ok) return;
    const binding = { q, i };
    if (['commit', 'admit', 'issue'].includes(q.op)) {
      need(text(a.value), 'missing canonical created ID');
      const map = q.op === 'commit' ? commits : q.op === 'admit' ? admits : issues;
      need(!map.has(a.value), 'reused canonical created ID'); map.set(a.value, binding);
    }
    if (q.op === 'commit') { need(text(q.id) && !handles.has(q.id), 'reused logical bond'); handles.set(q.id, a.value); }
    if (q.op === 'exit') { need(handles.has(q.id) && !exits.has(handles.get(q.id)), 'unbound/reused exit'); exits.set(handles.get(q.id), binding); }
  });
  const members = ids(s.subjects, 'id', 'subjects'), vouches = ids(s.vouches, 'id', 'vouches');
  const admissions = ids(s.admissions, 'subject', 'admissions'), relations = ids(s.relations, 'id', 'relations'), sources = ids(s.selfIds, 'id', 'sources');
  need(Array.isArray(cfg.model.genesis) && cfg.model.genesis.every(text)
    && new Set(cfg.model.genesis).size === cfg.model.genesis.length, 'invalid genesis');
  need(uint(cfg.maxSubjects) && cfg.maxSubjects > 0 && cfg.maxSubjects >= members.size, 'population cap mismatch');
  const genesis = new Set(cfg.model.genesis), required = new Set([...genesis, ...members.keys(), ...[...vouches.values()].map(v => v.target)]);
  need(same(Object.keys(operators), [...required]) && same(Object.keys(genuine), [...required])
    && [...required].every(id => text(operators[id]) && typeof genuine[id] === 'boolean'), 'complete exact ownership/person maps required');
  need(same([...members.keys()], [...genesis, ...admissions.keys()]) && [...members.values()].every(m => m.genesis === genesis.has(m.id)
    && m.identityStatus === 'accepted' && uint(m.xp) && uint(m.liquidFacy) && m.debt === 0), 'subject/admission/genesis mismatch');
  need(vouches.size === commits.size && admissions.size === admits.size && sources.size === issues.size, 'created record/journal count mismatch');
  const money = new Map([...members.keys()].map(id => [id, 0n])), relationByVouch = new Map();
  for (const r of relations.values()) { need(vouches.has(r.vouch) && !relationByVouch.has(r.vouch), 'unbound/reused relation'); relationByVouch.set(r.vouch, r); }
  for (const source of sources.values()) {
    const item = issues.get(source.id);
    need(item && members.has(source.subject) && item.q.owner === source.subject && item.q.artifact === source.artifact
      && item.q.atHour === source.recordedAt && ['unspent', 'converted', 'cancelled'].includes(source.status), 'source/journal mismatch');
    if (source.status === 'converted') money.set(source.subject, money.get(source.subject) + 1n);
  }
  for (const v of vouches.values()) {
    const item = commits.get(v.id);
    need(item && item.q.owner === v.voucher && item.q.target === v.target && item.q.atHour === v.committedAt
      && members.has(v.voucher) && v.voucher !== v.target && text(v.target) && v.bond === b.B
      && v.expiresAt === v.committedAt + 24 * b.V && uint(v.expiresAt) && v.expiresAt > v.committedAt, 'vouch funding/time/journal mismatch');
    need([v.bondRemaining, v.refunded, v.slashed].every(uint) && BigInt(v.bondRemaining) + BigInt(v.refunded) + BigInt(v.slashed) === BigInt(v.bond), 'vouch principal mismatch');
    need(v.bondStatus === 'reserved' ? v.refunded === 0 && v.releasedAt === null : v.bondStatus === 'released'
      && v.bondRemaining === 0 && uint(v.releasedAt) && v.releasedAt >= v.expiresAt && v.releasedAt < H, 'vouch custody status mismatch');
    const exit = exits.get(v.id);
    need(v.exitedAt === null ? !exit : exit && v.exitedAt === exit.q.atHour && exit.i > item.i
      && (exit.q.owner === v.voucher || (relationByVouch.has(v.id) && exit.q.owner === v.target)), 'exit history mismatch');
    money.set(v.voucher, money.get(v.voucher) - BigInt(v.bond) + BigInt(v.refunded));
  }
  const used = new Set();
  for (const a of admissions.values()) {
    const action = admits.get(a.id);
    need(action && !genesis.has(a.subject) && action.q.target === a.subject && a.acceptedAt === action.q.atHour
      && Array.isArray(a.vouches) && a.vouches.length === c && new Set(a.vouches).size === c
      && Array.isArray(a.guarantors) && new Set(a.guarantors).size === c && a.guarantors.length === c
      && Array.isArray(a.relations) && new Set(a.relations).size === c && a.relations.length === c
      && Array.isArray(action.q.bonds) && same(a.vouches, action.q.bonds.map(id => handles.get(id))), 'admission/cardinality/journal mismatch');
    const issuers = [], rs = [];
    for (const id of a.vouches) {
      const v = vouches.get(id), r = relationByVouch.get(id), before = commits.get(id), exit = exits.get(id);
      need(v && r && before && !used.has(id) && before.i < action.i && v.target === a.subject
        && v.committedAt <= a.acceptedAt && a.acceptedAt < v.expiresAt && (!exit || exit.i > action.i)
        && (genesis.has(v.voucher) || admits.get(admissions.get(v.voucher)?.id)?.i < action.i)
        && r.guarantor === v.voucher && r.guaranteed === a.subject && r.proposedAt === v.committedAt
        && r.activatedAt === a.acceptedAt && r.endedAt === v.exitedAt
        && r.status === (r.endedAt === null ? 'active' : 'ended'), 'invalid/reused/late admission backing join');
      used.add(id); issuers.push(v.voucher); rs.push(r.id);
    }
    need(same(issuers, a.guarantors) && same(rs, a.relations), 'guarantor/relation set mismatch');
  }
  need(relations.size === used.size, 'unjoined relation');
  need(Array.isArray(s.cases), 'cases missing');
  const caseKeys = new Set(), debits = new Map(), burns = [];
  for (const record of s.cases) {
    need(record && typeof record === 'object', 'invalid case record');
    const key = JSON.stringify([record.vouch, record.caseId]);
    need(text(record.caseId) && !caseKeys.has(key), 'duplicate/invalid per-vouch case identity'); caseKeys.add(key);
    need(vouches.has(record.vouch) && uint(record.openedAt) && record.openedAt < H
      && uint(record.amount) && uint(record.burned) && Array.isArray(record.transfers), 'invalid case custody');
    let amount = record.burned;
    for (const t of record.transfers) { need(members.has(t.recipient) && uint(t.amount) && t.amount > 0, 'invalid case payout'); amount = add(amount, t.amount); money.set(t.recipient, money.get(t.recipient) + BigInt(t.amount)); }
    need(amount === record.amount && (record.status === 'pending' ? record.resolvedAt === null && amount === 0
      : record.status === 'resolved' && uint(record.resolvedAt) && record.resolvedAt >= record.openedAt && record.resolvedAt < H), 'case debit/time mismatch');
    debits.set(record.vouch, add(debits.get(record.vouch) ?? 0, amount)); burns.push(record.burned);
  }
  for (const v of vouches.values()) need(v.slashed === (debits.get(v.id) ?? 0), 'case/slash mismatch');
  for (const [id, value] of money) need(value >= 0n && value === BigInt(members.get(id).liquidFacy), 'source-based payer cash mismatch');
  const ledger = s.ledger, sum = (rows, fn) => rows.reduce((n, row) => add(n, fn(row)), 0);
  need(ledger && ['minted', 'burned', 'supply', 'emitterVault', 'collector', 'feeVault', 'stakeVault', 'debt', 'vouchVault'].every(k => uint(ledger[k])), 'invalid monetary ledger');
  need(ledger.minted === sources.size && ledger.burned === [...sources.values()].filter(a => a.status === 'cancelled').length + sum(burns, x => x)
    && ledger.emitterVault === [...sources.values()].filter(a => a.status === 'unspent').length && ledger.collector === sum([...members.values()], m => m.liquidFacy)
    && ledger.vouchVault === sum([...vouches.values()], v => v.bondRemaining) && ledger.feeVault === 0 && ledger.stakeVault === 0 && ledger.debt === 0
    && ledger.supply === ledger.minted - ledger.burned && BigInt(ledger.supply) === BigInt(ledger.collector) + BigInt(ledger.emitterVault) + BigInt(ledger.vouchVault), 'monetary stock/flow mismatch');
  const inside = id => group.has(operators[id]), boundary = [...vouches.values()].filter(v => !inside(v.voucher) && inside(v.target));
  const activated = boundary.filter(v => used.has(v.id)), unused = boundary.filter(v => !used.has(v.id));
  const raw = {
    activatedRecordIds: sorted(activated.map(v => v.id)),
    activeGuaranteeRecordIds: sorted(activated.filter(v => relationByVouch.get(v.id).status === 'active').map(v => v.id)),
    probationRecordIds: sorted(activated.filter(v => H < v.expiresAt).map(v => v.id)),
    issuerSubjectIds: sorted(new Set(activated.map(v => v.voucher))), issuerOperatorIds: sorted(new Set(activated.map(v => operators[v.voucher]))),
    zeroPrincipalActivatedRecordIds: sorted(activated.filter(v => v.bond === 0).map(v => v.id)), unusedReservationIds: sorted(unused.map(v => v.id)),
  };
  const falseNewSubjects = sorted([...admissions.keys()].filter(id => inside(id) && !genuine[id]));
  const genuineNewSubjects = sorted([...admissions.keys()].filter(id => inside(id) && genuine[id]));
  const initialGroupSubjects = sorted([...genesis].filter(inside)), initialFalseSubjects = initialGroupSubjects.filter(id => !genuine[id]);
  const selected = [raw.activatedRecordIds, raw.activeGuaranteeRecordIds, raw.probationRecordIds, raw.issuerSubjectIds][kinds.indexOf(denominatorKind)];
  const byPayer = new Map();
  for (const v of boundary) {
    if (!byPayer.has(v.voucher)) byPayer.set(v.voucher, { original: 0, remaining: 0, refunded: 0, slashed: 0 });
    const row = byPayer.get(v.voucher);
    for (const [key, field] of Object.entries({ original: 'bond', remaining: 'bondRemaining', refunded: 'refunded', slashed: 'slashed' })) row[key] = add(row[key], v[field]);
  }
  return {
    schema: 'facety-prior7-attribution/v1', classification: 'diagnostic', producerProvenance: structuredClone(p), horizonHours: H,
    coalitionOperators: sorted(group), denominator: { kind: denominatorKind, count: selected.length, items: [...selected] },
    numerator: { count: falseNewSubjects.length, falseNewSubjects, genuineNewSubjects },
    initialAccess: { groupSubjects: initialGroupSubjects, falseSubjects: initialFalseSubjects, genuineSubjects: initialGroupSubjects.filter(id => genuine[id]),
      openingProtocolResourcesPerSubject: { liquidFacy: 0, xp: 0, ownSources: 0 }, acquisitionCost: null,
      basis: 'Declared Native genesis supplies accepted membership with zero opening protocol cash/XP/acts; not verified prehistory or personhood.' },
    boundary: raw, collateralByPayer: Object.fromEntries(sorted(byPayer.keys()).map(id => [id, byPayer.get(id)])),
    collateralMeaning: 'Original/remaining/refunded/slashed nominal payer custody, not attacker cost, burn or recovered loss.',
    ratio: selected.length ? falseNewSubjects.length / selected.length : null,
    ratioReason: selected.length ? 'defined-scenario-false-admission-per-selected-access' : 'zero-selected-new-boundary; initial access/prehistory separate, not safe or unbounded',
  };
}
