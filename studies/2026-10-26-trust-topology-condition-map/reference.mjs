// Owns: Non-authoritative mathematical oracle for the closed WP1 profile; excludes Native transitions, RNG, truth and research inference.
// No implementation dependencies: money is reconstructed from principal/source flows and XP from receipt-time predicates.
export class ReferenceRejection extends Error {}
const day = 24;
const order = rows => rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const requireThat = (condition, reason) => { if (!condition) throw new ReferenceRejection(reason); };
const uint = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const name = value => typeof value === 'string' && value.length > 0;
const unique = rows => new Set(rows).size === rows.length;
const number = n => { requireThat(n >= 0n && n <= BigInt(Number.MAX_SAFE_INTEGER), 'unsafe balance'); return Number(n); };

function cash(s, who) {
  return s.sources.filter(a => a.owner === who && a.status === 'converted').reduce(n => n + 1n, 0n)
    - s.bonds.filter(b => b.voucher === who).reduce((n, b) => n + BigInt(b.bond), 0n)
    + s.bonds.filter(b => b.voucher === who).reduce((n, b) => n + BigInt(b.refunded), 0n)
    + s.cases.flatMap(c => c.transfers).filter(p => p.recipient === who).reduce((n, p) => n + BigInt(p.amount), 0n);
}
function credit(s, a) {
  if (a.status === 'cancelled' || s.now < a.at + day) return null;
  const at = a.at + day;
  return { at, revokedAt: null, revocation: null, recipients: [a.owner, ...a.guarantors].sort().map(subject => {
    const ended = subject === a.owner ? null : s.bonds.find(b => b.voucher === subject && b.target === a.owner && b.attachedAt !== null)?.exitedAt ?? null;
    const revokedAt = ended !== null && ended >= at ? ended : null;
    return { subject, role: subject === a.owner ? 'subject' : 'guarantor', halvingsBefore: 0,
      revokedAt, revocation: revokedAt === null ? null : 'guarantee-ended' };
  }) };
}
function capacity(s, cfg, who) {
  const records = s.bonds.filter(b => b.voucher === who), last = records.at(-1);
  const used = records.filter(b => s.now < b.expiresAt).length;
  const wait = last ? BigInt(last.committedAt) + BigInt(cfg.T) * 24n - BigInt(s.now) : 0n;
  return { subject: who, limit: cfg.K, used, free: cfg.K - used,
    cooldownRemainingHours: number(wait > 0n ? wait : 0n) };
}
function balance(s) {
  const burned = s.sources.filter(a => a.status === 'cancelled').length + s.cases.reduce((n, c) => n + c.burned, 0);
  return { minted: s.sources.length, burned, supply: s.sources.length - burned,
    emitterVault: s.sources.filter(a => a.status === 'unspent').length,
    collector: number(s.members.reduce((n, m) => n + cash(s, m.id), 0n)), feeVault: 0, stakeVault: 0, debt: 0,
    vouchVault: s.bonds.reduce((n, b) => n + b.bondRemaining, 0) };
}

export class CompositionReference {
  #cfg;
  #c;
  #state;
  constructor(profile) {
    const p = profile.policy, b = profile.vouching;
    requireThat(profile.reference === 'native-funded-composition-reference/v1' && profile.invitationLimit === null
      && p.xpFinality === 'maturity' && p.cancellationAuthority === 'snapshot' && p.guarantorEligibility === 'accepted'
      && p.linkBreakXp === 'revoke' && p.spendMaturityHours === day && p.conversionMaturityHours === day && p.artifactReuse === 'registration-only'
      && profile.ablations.withholdGuarantorXp === false && profile.ablations.disableInvitationVeto === false
      && profile.ablations.fixedInvitationThreshold === null, 'unsupported reference profile');
    requireThat(b.reference.eligibility === 'accepted-reference' && b.reference.clockOrigin === 'commitment'
      && b.reference.funding === 'collector-liquid' && b.reference.exitSlot === 'retain-until-V'
      && b.reference.bondRelease === 'supplied-clearance' && uint(b.K) && uint(b.T, 1) && uint(b.V, 1) && uint(b.B)
      && uint(b.T * day) && uint(b.V * day) && uint(profile.vouchAdmission.c, 1) && uint(profile.vouchAdmission.c + 1)
      && profile.vouchAdmission.reference === 'native-guarantees-commitment-reference', 'unsupported funding profile');
    requireThat(Array.isArray(profile.genesis) && profile.genesis.length > 0 && profile.genesis.every(name) && unique(profile.genesis), 'invalid genesis');
    this.#cfg = structuredClone(b);
    this.#c = profile.vouchAdmission.c;
    this.#state = { now: 0, members: profile.genesis.map(id => ({ id, genesis: true })), artifacts: [], sources: [], bonds: [], cases: [], admissions: [], work: null, requests: [] };
  }
  apply(command) {
    const s = structuredClone(this.#state), cfg = this.#cfg;
    const member = who => requireThat(s.members.some(m => m.id === who), 'unknown member');
    const get = (rows, id) => { const row = rows.find(r => r.id === id); requireThat(row, 'unknown reference'); return row; };
    const fresh = (rows, id) => requireThat(name(id) && !rows.some(r => r.id === id), 'duplicate logical handle');
    const pending = id => s.cases.some(c => c.vouch === id && c.status === 'pending');
    const q = command;
    if (q.op === 'time') {
      requireThat(uint(q.hour) && q.hour >= s.now, 'time reversal'); s.now = q.hour;
    } else if (q.op === 'artifact') {
      member(q.owner); fresh(s.artifacts, q.id);
      s.artifacts.push({ id: q.id, publisher: q.owner, at: s.now });
    } else if (q.op === 'issue') {
      member(q.owner); fresh(s.sources, q.id);
      const artifact = get(s.artifacts, q.artifact), owned = s.sources.filter(a => a.owner === q.owner);
      requireThat(s.now - artifact.at <= day && (!owned.length || s.now - owned.at(-1).at >= day), 'artifact/reward window');
      const guarantors = s.bonds.filter(b => b.attachedAt !== null && b.target === q.owner && b.exitedAt === null).map(b => b.voucher).sort();
      s.sources.push({ id: q.id, owner: q.owner, artifact: q.artifact, at: s.now, index: owned.length + 1,
        previous: owned.at(-1)?.id ?? null, guarantors, status: 'unspent', disposition: null });
    } else if (q.op === 'withdraw') {
      member(q.owner); const a = get(s.sources, q.id);
      requireThat(a.owner === q.owner && a.status === 'unspent' && s.now >= a.at + day, 'no own spendable source');
      a.status = 'converted'; a.disposition = 'collector';
    } else if (q.op === 'commit') {
      member(q.owner); fresh(s.bonds, q.id);
      requireThat(name(q.target) && q.owner !== q.target, 'invalid target');
      const cap = capacity(s, cfg, q.owner);
      requireThat(cap.free > 0 && cap.cooldownRemainingHours === 0 && uint(s.now + cfg.V * day)
        && !s.bonds.some(b => b.voucher === q.owner && b.target === q.target && s.now < b.expiresAt)
        && cash(s, q.owner) >= BigInt(cfg.B), 'capacity/overlap/funding');
      s.bonds.push({ id: q.id, voucher: q.owner, target: q.target, committedAt: s.now, expiresAt: s.now + cfg.V * day,
        exitedAt: null, attachedAt: null, bond: cfg.B, bondRemaining: cfg.B, slashed: 0, refunded: 0,
        bondStatus: 'reserved', releasedAt: null, clearanceId: null });
    } else if (q.op === 'admit') {
      requireThat(name(q.target) && !s.members.some(m => m.id === q.target) && Array.isArray(q.bonds)
        && q.bonds.length === this.#c && unique(q.bonds), 'admission cardinality/target');
      const bonds = q.bonds.map(id => get(s.bonds, id));
      requireThat(unique(bonds.map(b => b.voucher)) && bonds.every(b => b.target === q.target && b.exitedAt === null
        && s.now < b.expiresAt && b.bondStatus === 'reserved' && b.bondRemaining === b.bond && b.attachedAt === null && !pending(b.id)), 'admission backing');
      for (const b of bonds) b.attachedAt = s.now;
      s.members.push({ id: q.target, genesis: false });
      s.admissions.push({ subject: q.target, at: s.now, vouches: [...q.bonds].sort(), guarantors: bonds.map(b => b.voucher).sort() });
    } else if (q.op === 'exit') {
      member(q.owner); const b = get(s.bonds, q.id);
      requireThat(b.exitedAt === null && (q.owner === b.voucher || (b.attachedAt !== null && q.owner === b.target))
        && (s.now < b.expiresAt || b.attachedAt !== null), 'no exit authority/live relation');
      b.exitedAt = s.now;
    } else if (q.op === 'hold') {
      const b = get(s.bonds, q.id);
      requireThat(b.bondStatus === 'reserved' && name(q.caseId) && !pending(q.id)
        && !s.cases.some(c => c.vouch === q.id && c.caseId === q.caseId), 'case custody/replay/overlap');
      s.cases.push({ vouch: q.id, caseId: q.caseId, status: 'pending', openedAt: s.now, availableAtOpen: b.bondRemaining,
        resolvedAt: null, upheld: null, amount: 0, burned: 0, transfers: [] });
    } else if (q.op === 'settle') {
      const b = get(s.bonds, q.id), c = s.cases.find(c => c.vouch === q.id && c.caseId === q.caseId);
      requireThat(c?.status === 'pending' && typeof q.upheld === 'boolean' && uint(q.burn) && Array.isArray(q.transfers), 'invalid pending decision');
      let amount = BigInt(q.burn);
      requireThat(unique(q.transfers.map(p => p.recipient)), 'duplicate payee');
      for (const p of q.transfers) { member(p.recipient); requireThat(uint(p.amount, 1), 'invalid payout'); amount += BigInt(p.amount); }
      requireThat((q.upheld || amount === 0n) && amount <= BigInt(b.bondRemaining), 'unbacked decision');
      const debit = number(amount);
      b.bondRemaining -= debit; b.slashed += debit;
      Object.assign(c, { status: 'resolved', resolvedAt: s.now, upheld: q.upheld, amount: debit,
        burned: q.burn, transfers: structuredClone(q.transfers).sort((a, b) => a.recipient < b.recipient ? -1 : 1) });
    } else if (q.op === 'refund') {
      const b = get(s.bonds, q.id);
      requireThat(b.bondStatus === 'reserved' && !pending(q.id) && s.now >= b.expiresAt && q.clear === true && name(q.clearanceId), 'no refund clearance/custody');
      b.refunded = b.bondRemaining; b.bondRemaining = 0;
      b.bondStatus = 'released'; b.releasedAt = s.now; b.clearanceId = q.clearanceId;
    } else if (q.op === 'pool') {
      requireThat(s.work === null && q.options.reference === 'paid-single-suspicion-veto-reference'
        && uint(q.options.costs.inspect, 1) && uint(q.options.costs.respond, 1), 'unsupported work pool');
      const actors = structuredClone(q.options.actors);
      requireThat(Array.isArray(actors) && unique(actors.map(a => a.id)) && unique(actors.filter(a => a.subject !== null).map(a => a.subject)), 'duplicate work accounts');
      for (const a of actors) {
        requireThat(name(a.id) && uint(a.budget), 'invalid work account');
        if (a.subject !== null) member(a.subject);
        else requireThat(!s.members.some(m => m.id === a.id), 'external account impersonation');
      }
      s.work = { costs: structuredClone(q.options.costs), actors, receipts: [] };
    } else if (q.op === 'review') {
      requireThat(s.work !== null && name(q.opportunity), 'no work pool/opportunity');
      const actor = s.work.actors.find(a => a.id === q.actor), a = get(s.sources, q.id);
      requireThat(actor, 'unknown work account');
      const replay = s.work.receipts.some(r => r.actor === q.actor && r.selfId === q.id && r.atHour === s.now && r.opportunity === q.opportunity);
      if (!replay) {
        const spent = s.work.receipts.filter(r => r.actor === q.actor).reduce((n, r) => n + r.work.inspect + r.work.respond, 0);
        const available = actor.budget - spent, costs = s.work.costs, authorized = a.guarantors.includes(actor.subject);
        const acquired = s.now < a.at + day && a.status === 'unspent' && available >= costs.inspect;
        const response = acquired && q.signal === true && authorized && available - costs.inspect >= costs.respond;
        const outcome = s.now >= a.at + day ? 'window-closed' : a.status !== 'unspent' ? 'act-unavailable'
          : !acquired ? 'inspection-denied' : !q.signal ? 'observed-no-suspicion' : !authorized ? 'no-veto-authority'
            : !response ? 'response-denied' : 'vetoed';
        requireThat(!acquired || typeof q.signal === 'boolean', 'invalid received signal');
        const role = authorized ? 'guarantor' : 'ordinary';
        if (acquired) s.requests.push({ act: q.id, observer: q.actor, role, atHour: s.now, opportunity: q.opportunity });
        s.work.receipts.push({ actor: q.actor, selfId: q.id, atHour: s.now, opportunity: q.opportunity, role,
          suspicious: acquired ? q.signal : null, work: { inspect: acquired ? costs.inspect : 0, respond: response ? costs.respond : 0 }, outcome, reason: null });
        if (response) { a.status = 'cancelled'; a.disposition = 'guarantor-veto'; }
      }
    } else throw new Error('Unsupported reference operation: ' + q.op);
    for (const m of s.members) number(cash(s, m.id));
    this.#state = s;
  }
  snapshot() {
    const s = this.#state;
    const sources = order(s.sources.map(a => ({ ...a, xpCredited: credit(s, a) !== null, credit: credit(s, a) })));
    const members = order(s.members.map(m => ({ ...m, identityStatus: 'accepted', debt: 0, liquidFacy: number(cash(s, m.id)),
      xp: sources.reduce((n, a) => n + (a.credit?.recipients.filter(r => r.subject === m.id && r.revokedAt === null).length ?? 0), 0),
      lastRewardAt: s.sources.filter(a => a.owner === m.id).at(-1)?.at ?? null })));
    const bonds = order(s.bonds.map(({ attachedAt, ...b }) => ({ ...b })));
    const relations = s.bonds.filter(b => b.attachedAt !== null).map(b => ({ vouch: b.id, guarantor: b.voucher, guaranteed: b.target,
      proposedAt: b.committedAt, activatedAt: b.attachedAt, endedAt: b.exitedAt, status: b.exitedAt === null ? 'active' : 'ended' })).sort((a, b) => a.vouch < b.vouch ? -1 : 1);
    const work = s.work === null ? null : { costs: s.work.costs, receipts: s.work.receipts,
      actors: order(s.work.actors.map(a => {
        const spent = s.work.receipts.filter(r => r.actor === a.id).reduce((n, r) => n + r.work.inspect + r.work.respond, 0);
        return { ...a, spent, remaining: a.budget - spent };
      })) };
    return structuredClone({ now: s.now, members, artifacts: order([...s.artifacts]), sources, bonds,
      admissions: [...s.admissions].sort((a, b) => a.subject < b.subject ? -1 : 1), relations,
      cases: [...s.cases].sort((a, b) => JSON.stringify([a.vouch, a.caseId]) < JSON.stringify([b.vouch, b.caseId]) ? -1 : 1),
      work, requests: s.requests, ledger: balance(s), capacities: members.map(m => capacity(s, this.#cfg, m.id)),
      graph: { nodes: members.map(m => m.id), lineageNodes: members.map(m => m.id), edges: relations.filter(r => r.status === 'active').map(r => [r.guarantor, r.guaranteed]).sort(), lineageEdges: [] } });
  }
}
