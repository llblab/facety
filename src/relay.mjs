// Owns: Reference evidence relay (discovery → package → qualified sponsor → case → outcome); excludes truth and merits courts.
// A labeled research extension, not a protocol rule. Every protocol mutation goes through FacetyModel; work budgets are
// off-protocol attention, never minted FACY or XP. Non-members have no protocol rights. Verdicts are explicit inputs.
import { ProtocolRejection } from './model.mjs';
import { watchState, stateDeltas } from './trace.mjs';

export const RELAY_POLICY = Object.freeze({
  discoveryCost: 1, packageCost: 1, reviewCost: 1, // work units charged to an observer's declared attention budget
  sponsorMinXp: 1, // research stand-in for the unselected challenge XP gate (protocol §25)
  acceptStrength: 2, // sponsor accepts a package whose declared strength reaches this value (0..3)
  maxRoutes: 3, conflict: 'refuse', stake: 1, fine: 2, hearingHours: 24,
});
export const EVIDENCE_KINDS = Object.freeze(['collision', 'media', 'cashflow', 'other']);
export const RELAY_ASSUMPTIONS = Object.freeze([
  'Observer budgets are declared attention units, not FACY or XP; no value is minted for off-protocol work.',
  'A collision package derives its strength from the model\'s public Self-ID collision flag and cannot overstate it; other kinds carry the observer\'s own fallible declared strength.',
  'Sponsor qualification is active membership plus a declared XP gate, standing in for the unselected challenge XP gate.',
  'A sponsor with an active guarantee or invitation-lineage edge to the accused refuses (conflict policy "refuse"); disclosure review is not modeled.',
  'The verdict is an explicit input of the caller (a declared adjudication input, not a merits court); the relay never reads evaluator truth.',
  'Observer compensation, sponsor competition and investigative response to outcomes are not implemented links.',
]);

function nat(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(label + ' must be an integer >= ' + minimum);
}

export class RelayDesk {
  #model; #trace; #observers = new Map(); #packages = new Map(); #cases = new Map(); #digests = new Map(); #sequence = 0;
  #work = { discovery: 0, packaging: 0, review: 0 };
  constructor(model, { policy = {}, trace = null } = {}) {
    for (const key of Object.keys(policy)) if (!Object.hasOwn(RELAY_POLICY, key)) throw new Error('unknown relay policy: ' + key);
    this.policy = Object.freeze({ ...RELAY_POLICY, ...policy });
    for (const key of ['discoveryCost', 'packageCost', 'reviewCost', 'sponsorMinXp', 'stake', 'fine', 'hearingHours']) nat(this.policy[key], key);
    nat(this.policy.acceptStrength, 'acceptStrength'); nat(this.policy.maxRoutes, 'maxRoutes', 1);
    if (!['refuse'].includes(this.policy.conflict)) throw new Error('unsupported conflict policy');
    this.#model = model; this.#trace = trace;
  }
  #note(fields, ids = [], before = null) {
    if (!this.#trace) return null;
    const deltas = before ? stateDeltas(before, watchState(this.#model, ids)) : {};
    return this.#trace.record({ at: this.#model.now, deltas, ...fields });
  }
  #watch(ids) { return this.#trace ? watchState(this.#model, ids.filter(id => this.#isMember(id))) : null; }
  #isMember(id) { try { this.#model.subject(id); return true; } catch { return false; } }
  registerObserver(id, { budget }) {
    nat(budget, 'budget');
    if (typeof id !== 'string' || !id.length || this.#observers.has(id)) throw new ProtocolRejection('invalid or duplicate observer');
    this.#observers.set(id, { id, member: this.#isMember(id), budget });
    return { id, member: this.#observers.get(id).member, budget };
  }
  setBudget(id, budget) {
    nat(budget, 'budget');
    this.#observer(id).budget = budget;
  }
  #observer(id) {
    const observer = this.#observers.get(id);
    if (!observer) throw new ProtocolRejection('unknown observer: ' + id);
    return observer;
  }
  #spend(observer, kind, cost) {
    if (observer.budget < cost) return false;
    observer.budget -= cost; this.#work[kind] += cost;
    return true;
  }
  #stop(fields, ids, reason, outcome = 'blocked') {
    this.#note({ ...fields, outcome, reason }, ids);
    return { status: outcome, reason };
  }
  // Discovery and packaging in one step: the observer inspects the public Self-ID and assembles a package.
  discover(observerId, { selfId, kind, strength = null, evaluator }) {
    const observer = this.#observer(observerId);
    const act = this.#model.selfId(selfId);
    const accused = act.subject;
    const base = { actor: observerId, action: 'discover', target: selfId, mechanisms: ['M4'], ...(evaluator === undefined ? {} : { evaluator }) };
    if (!EVIDENCE_KINDS.includes(kind)) throw new ProtocolRejection('unknown evidence kind');
    const derived = kind === 'collision' ? (act.collision ? 3 : 0) : null;
    const declared = derived ?? strength;
    nat(declared ?? -1, 'evidence strength');
    if (declared > 3) throw new RangeError('evidence strength must be in 0..3');
    const publicView = { selfId, subject: accused, publicCollisionFlag: act.collision, kind, declaredStrength: declared };
    if (derived !== null && strength !== null && strength !== derived) {
      return this.#stop({ ...base, observed: publicView, preconditions: [{ name: 'claimed strength matches the public flag', met: false }], basis: { kind: 'protocol-rule', rule: 'collision strength is derived from the public flag' } }, [], 'forged-input', 'rejected');
    }
    const cost = this.policy.discoveryCost + this.policy.packageCost;
    if (observer.budget < cost) {
      return this.#stop({ ...base, observed: publicView, preconditions: [{ name: 'attention budget covers discovery and packaging', met: false, detail: { budget: observer.budget, cost } }], basis: { kind: 'declared-rule', rule: 'discovery and packaging each cost declared work units' } }, [], 'budget-exhausted');
    }
    const digest = JSON.stringify([selfId, kind, declared]);
    this.#spend(observer, 'discovery', this.policy.discoveryCost);
    this.#spend(observer, 'packaging', this.policy.packageCost);
    const first = this.#digests.get(digest);
    if (first) {
      // A copy is cost, not an independent confirmation.
      return this.#stop({ ...base, observed: publicView, preconditions: [{ name: 'evidence digest is new', met: false }], basis: { kind: 'declared-rule', rule: 'repeated copies of one package are not independent confirmations' }, causes: [first.trace].filter(Boolean) }, [], 'duplicate-evidence', 'rejected');
    }
    const id = 'package:' + this.#sequence++;
    const traceId = this.#note({ ...base, observed: publicView, preconditions: [{ name: 'attention budget covers discovery and packaging', met: true }], basis: { kind: 'declared-rule', rule: 'observer inspects public Self-ID and packages a declared-strength finding' }, outcome: 'applied' }, []);
    const record = { id, observer: observerId, member: observer.member, selfId, accused, kind, strength: declared, digest, discoveredAt: this.#model.now, packagedAt: this.#model.now, routes: [], sponsor: null, status: 'packaged', trace: traceId, caseId: null, stages: { discovery: this.#model.now, package: this.#model.now, sponsor: null, hearing: null, verdict: null, collection: null } };
    this.#packages.set(id, record); this.#digests.set(digest, { package: id, trace: traceId });
    return { status: 'applied', package: id };
  }
  #conflict(sponsor, accused) {
    const { guarantees, lineage } = this.#model;
    return sponsor === accused || [guarantees, lineage].some(graph => graph.edge(sponsor, accused) || graph.edge(accused, sponsor));
  }
  route(packageId, sponsorId) {
    const pkg = this.#package(packageId);
    const base = { actor: sponsorId, action: 'review-package', target: packageId, mechanisms: ['M4'], causes: [pkg.trace].filter(Boolean) };
    if (pkg.status !== 'packaged') throw new ProtocolRejection('package is not awaiting a sponsor');
    const observer = this.#observers.get(sponsorId);
    const member = this.#isMember(sponsorId);
    const ids = [sponsorId, pkg.accused];
    // Only reviewed attempts spend a route; a sponsor who could not review (no budget, gate) leaves the package waiting.
    const spent = pkg.routes.filter(route => route.outcome !== 'blocked').length;
    if (spent >= this.policy.maxRoutes) { pkg.status = 'abandoned'; return this.#stop({ ...base, observed: { routesSpent: spent }, preconditions: [{ name: 'routes remaining', met: false }], basis: { kind: 'declared-rule', rule: 'a package is rerouted at most maxRoutes times' } }, [], 'route-limit'); }
    if (!observer || !member) return this.#attempt(pkg, sponsorId, 'blocked', 'no-sponsor', { ...base, observed: { sponsorRegistered: Boolean(observer), member }, preconditions: [{ name: 'sponsor is a registered member', met: false }], basis: { kind: 'protocol-rule', rule: 'only members hold procedural rights' } });
    const subject = this.#model.subject(sponsorId);
    const xpOk = subject.xp >= this.policy.sponsorMinXp;
    const active = this.#model.isActive(sponsorId) && subject.identityStatus === 'accepted';
    const clear = !this.#conflict(sponsorId, pkg.accused);
    const staffed = observer.budget >= this.policy.reviewCost;
    const observed = { sponsorXp: subject.xp, sponsorActive: active, relationToAccused: clear ? 'none' : 'guarantee-or-lineage', reviewBudget: observer.budget };
    const preconditions = [{ name: 'sponsor is active', met: active }, { name: 'sponsor XP reaches the gate', met: xpOk, detail: { required: this.policy.sponsorMinXp } }, { name: 'no conflict with the accused', met: clear }, { name: 'review budget available', met: staffed }];
    const basis = { kind: 'declared-rule', rule: 'qualification gate, conflict refusal and review cost' };
    if (!active) return this.#attempt(pkg, sponsorId, 'blocked', 'not-eligible', { ...base, observed, preconditions, basis });
    if (!xpOk) return this.#attempt(pkg, sponsorId, 'blocked', 'insufficient-xp', { ...base, observed, preconditions, basis });
    if (!clear) return this.#attempt(pkg, sponsorId, 'refused', 'conflict-of-interest', { ...base, observed, preconditions, basis });
    if (!staffed) return this.#attempt(pkg, sponsorId, 'blocked', 'budget-exhausted', { ...base, observed, preconditions, basis });
    this.#spend(observer, 'review', this.policy.reviewCost);
    const accepted = pkg.strength >= this.policy.acceptStrength;
    const reviewed = { ...base, observed: { ...observed, packageStrength: pkg.strength }, preconditions: [...preconditions, { name: 'strength reaches the sponsor threshold', met: accepted, detail: { required: this.policy.acceptStrength } }], basis: { kind: 'declared-rule', rule: 'sponsor accepts when declared strength reaches the threshold' } };
    if (!accepted) return this.#attempt(pkg, sponsorId, 'refused', 'inadequate-evidence', reviewed);
    pkg.routes.push({ sponsor: sponsorId, at: this.#model.now, outcome: 'accepted', reason: null });
    pkg.sponsor = sponsorId; pkg.status = 'sponsored'; pkg.stages.sponsor = this.#model.now;
    pkg.trace = this.#note({ ...reviewed, target: packageId, outcome: 'applied' }, ids) ?? pkg.trace;
    return { status: 'applied', sponsor: sponsorId };
  }
  #attempt(pkg, sponsor, outcome, reason, fields) {
    pkg.routes.push({ sponsor, at: this.#model.now, outcome, reason });
    const trace = this.#note({ ...fields, outcome, reason }, []);
    if (trace) pkg.trace = trace;
    return { status: outcome, reason };
  }
  #package(id) {
    const record = this.#packages.get(id);
    if (!record) throw new ProtocolRejection('unknown package: ' + id);
    return record;
  }
  // The sponsor's own reserved stake funds a formal case; the accused's unspent right is frozen if one exists.
  open(packageId) {
    const pkg = this.#package(packageId);
    if (pkg.status !== 'sponsored') throw new ProtocolRejection('package has no accepting sponsor');
    const sponsor = this.#model.subject(pkg.sponsor);
    const caseId = 'case:' + this.#sequence++;
    const ids = [pkg.sponsor, pkg.accused];
    const before = this.#watch(ids);
    const base = { actor: pkg.sponsor, action: 'open-case', target: pkg.selfId, mechanisms: ['M4', 'M12'], causes: [pkg.trace].filter(Boolean) };
    if (sponsor.liquidFacy < this.policy.stake) {
      return this.#stop({ ...base, observed: { liquid: sponsor.liquidFacy, stake: this.policy.stake }, preconditions: [{ name: 'sponsor can reserve the stake', met: false }], basis: { kind: 'protocol-rule', rule: 'a challenge stake is reserved liquid FACY' } }, ids, 'funds-insufficient');
    }
    this.#model.reserveDisputeStake(caseId, pkg.sponsor, this.policy.stake);
    const act = this.#model.selfId(pkg.selfId);
    const frozen = act.status === 'unspent' && act.disputeLock === null;
    if (frozen) this.#model.freezeSelfId(pkg.selfId, caseId);
    const record = { id: caseId, package: packageId, sponsor: pkg.sponsor, accused: pkg.accused, selfId: pkg.selfId, openedAt: this.#model.now, dueAt: this.#model.now + this.policy.hearingHours, frozen, status: 'open', verdict: null };
    this.#cases.set(caseId, record); pkg.caseId = caseId; pkg.status = 'opened'; pkg.stages.hearing = this.#model.now;
    pkg.trace = this.#note({ ...base, observed: { stake: this.policy.stake, actStatus: act.status }, preconditions: [{ name: 'sponsor can reserve the stake', met: true }, { name: 'accused right still unspent (can be frozen)', met: frozen }], basis: { kind: 'declared-rule', rule: 'stake reservation and freeze of the unspent right' }, outcome: 'applied' }, ids, before) ?? pkg.trace;
    return { status: 'applied', case: caseId, frozen };
  }
  // `verdict` is an explicit adjudication input: 'violation' or 'no-violation'.
  resolve(caseId, verdict) {
    const record = this.#cases.get(caseId);
    if (!record || record.status !== 'open') throw new ProtocolRejection('case is not open');
    if (!['violation', 'no-violation'].includes(verdict)) throw new ProtocolRejection('verdict must be violation or no-violation');
    const pkg = this.#packages.get(record.package);
    const ids = [record.sponsor, record.accused];
    const due = this.#model.now >= record.dueAt;
    if (!due) return this.#stop({ actor: 'desk', action: 'resolve-case', target: caseId, mechanisms: ['M4', 'M9'], observed: { now: this.#model.now, dueAt: record.dueAt }, preconditions: [{ name: 'hearing window elapsed', met: false }], basis: { kind: 'declared-rule', rule: 'a verdict is taken after hearingHours' }, causes: [pkg.trace].filter(Boolean) }, ids, 'case-unresolved', 'blocked');
    const before = this.#watch(ids);
    let sanction = null;
    if (verdict === 'violation') {
      const voided = this.#model.voidSelfIdChain(record.accused, { fromAct: record.selfId });
      const penalty = this.#model.penalize(record.accused, { fine: this.policy.fine, halveXp: true });
      sanction = { voided, penalty };
    }
    if (record.frozen) this.#model.unfreezeSelfId(record.selfId, caseId);
    this.#model.settleDisputeStake(caseId, record.sponsor, { disposition: verdict === 'violation' ? 'release' : 'burn' });
    record.status = 'resolved'; record.verdict = verdict; pkg.status = 'resolved'; pkg.stages.verdict = this.#model.now; pkg.stages.collection = verdict === 'violation' ? this.#model.now : null;
    pkg.trace = this.#note({ actor: 'desk', action: 'resolve-case', target: caseId, mechanisms: verdict === 'violation' ? ['M4', 'M1', 'M3'] : ['M4', 'M9'], observed: { verdict, hoursFrozen: record.frozen ? this.#model.now - record.openedAt : 0, stakeDisposition: verdict === 'violation' ? 'released to the sponsor' : 'burned (false allegation)' }, preconditions: [{ name: 'hearing window elapsed', met: true }], basis: { kind: 'declared-input', rule: 'verdict supplied by the caller; sanction and stake settlement go through FacetyModel' }, outcome: 'applied', causes: [pkg.trace].filter(Boolean) }, ids, before) ?? pkg.trace;
    return { status: 'applied', verdict, sanction, trace: pkg.trace };
  }
  packages() { return [...this.#packages.values()].map(value => Object.freeze({ ...value, routes: [...value.routes], stages: { ...value.stages } })); }
  cases() { return [...this.#cases.values()].map(value => Object.freeze({ ...value })); }
  // Stage clocks keep pending stages as null, never as zero latency.
  stageClocks(packageId) { return { ...this.#package(packageId).stages }; }
  work() { return { ...this.#work }; }
  observers() { return [...this.#observers.values()].map(value => ({ ...value })); }
}
