// Owns: Deterministic Facety transitions; excludes attacker truth and adjudication.
import { DirectedGraph } from './graph.mjs';

export const DAY = 24;
export const DEFAULT_POLICY = Object.freeze({
  xpFinality: 'terminal',
  cancellationAuthority: 'snapshot',
  guarantorEligibility: 'active',
  guaranteeFee: 0,
  councilSize: 101,
  debtRecovery: 'reserve-until-mature',
  councilEligibility: 'active',
  invitationFreezeHours: 24,
  linkBreakXp: 'revoke',
  spendMaturityHours: 24,
  conversionMaturityHours: 24,
  // Same-subject replay on an existing artifact is OPEN; preserve the legacy window-only reference.
  artifactReuse: 'registration-only',
});
// Counterfactual mechanism removals for evidence experiments. They are not protocol options.
export const DEFAULT_ABLATIONS = Object.freeze({
  withholdGuarantorXp: false,
  disableInvitationVeto: false,
  fixedInvitationThreshold: null,
});

function natural(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(label + ' must be an integer >= ' + minimum);
}

function idOrder(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export function policyFrom(overrides = {}) {
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(DEFAULT_POLICY, key)) throw new Error('unknown policy: ' + key);
  const policy = { ...DEFAULT_POLICY, ...overrides };
  for (const [key, allowed] of Object.entries({
    xpFinality: ['terminal', 'immediate'],
    cancellationAuthority: ['snapshot', 'current'],
    guarantorEligibility: ['active', 'accepted'],
    debtRecovery: ['reserve-until-mature', 'immediate-burn'],
    councilEligibility: ['active', 'accepted'],
    linkBreakXp: ['keep', 'revoke'],
    artifactReuse: ['registration-only', 'once-per-subject'],
  })) if (!allowed.includes(policy[key])) throw new Error('invalid policy: ' + key);
  natural(policy.guaranteeFee, 'guaranteeFee');
  natural(policy.councilSize, 'councilSize', 1);
  natural(policy.invitationFreezeHours, 'invitationFreezeHours');
  natural(policy.spendMaturityHours, 'spendMaturityHours');
  natural(policy.conversionMaturityHours, 'conversionMaturityHours');
  return Object.freeze(policy);
}

export function ablationsFrom(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('ablations must be an object');
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(DEFAULT_ABLATIONS, key)) throw new Error('unknown ablation: ' + key);
  const ablations = { ...DEFAULT_ABLATIONS, ...overrides };
  if (typeof ablations.withholdGuarantorXp !== 'boolean') throw new TypeError('withholdGuarantorXp must be boolean');
  if (typeof ablations.disableInvitationVeto !== 'boolean') throw new TypeError('disableInvitationVeto must be boolean');
  if (ablations.fixedInvitationThreshold !== null) natural(ablations.fixedInvitationThreshold, 'fixedInvitationThreshold', 1);
  return Object.freeze(ablations);
}

export class ProtocolRejection extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtocolRejection';
  }
}

export class FacetyModel {
  #subjects = new Map();
  #artifacts = new Map();
  #acts = new Map();
  #subjectActs = new Map();
  #guaranteeRecords = new Map();
  #invitations = new Map();
  #claims = new Map();
  #xpSources = new Set();
  #debtReservations = new Set();
  #disputeStakes = new Map();
  #contentHashes = new Set();
  #activityVersion = 0;
  #activeCache = null;
  #events = [];
  #now = 0;
  #sequence = 0;
  #minted = 0;
  #burned = 0;
  #vault = 0;
  #fees = 0;
  #stakeVault = 0;
  constructor({ genesis = ['root'], policy = {}, ablations = {} } = {}) {
    if (!Array.isArray(genesis) || !genesis.length || new Set(genesis).size !== genesis.length) throw new ProtocolRejection('genesis must contain distinct subject IDs');
    Object.defineProperty(this, 'policy', { value: policyFrom(policy), enumerable: true });
    Object.defineProperty(this, 'ablations', { value: ablationsFrom(ablations), enumerable: true });
    this.lineage = new DirectedGraph('invitation-lineage');
    this.guarantees = new DirectedGraph('guarantees');
    Object.defineProperty(this, 'roots', { value: Object.freeze([...genesis]), enumerable: true });
    for (const id of genesis) this.#addSubject(id, true);
  }
  get now() { return this.#now; }
  get size() { return this.#subjects.size; }
  #id(prefix) { return prefix + ':' + this.#sequence++; }
  #event(type, data) { this.#events.push(Object.freeze({ at: this.now, type, ...data })); }
  #subject(id, accepted = false) {
    const subject = this.#subjects.get(id);
    if (!subject) throw new ProtocolRejection('unknown subject: ' + id);
    if (accepted && subject.identityStatus !== 'accepted') throw new ProtocolRejection('subject identity is not accepted');
    return subject;
  }
  #act(id) {
    const act = this.#acts.get(id);
    if (!act) throw new ProtocolRejection('unknown Self-ID: ' + id);
    return act;
  }
  #addSubject(id, genesis = false, inviter = null) {
    if (typeof id !== 'string' || !id.length || this.#subjects.has(id)) throw new ProtocolRejection('invalid or duplicate subject ID');
    this.lineage.assertCapacity({ revisions: inviter === null ? 1 : 2, edgeIds: inviter === null ? 0 : 1 });
    this.guarantees.assertCapacity();
    this.#subjects.set(id, { id, genesis, key: id + ':key:0', identityStatus: 'accepted', xp: 0, xpEvents: [], liquidFacy: 0, debt: 0, lastRewardAt: null });
    this.#subjectActs.set(id, []);
    this.lineage.addNode(id);
    this.guarantees.addNode(id);
    if (inviter !== null) this.lineage.addEdge(inviter, id);
    this.#event('subject-added', { subject: id, genesis });
  }
  subject(id) {
    const { xpEvents, ...subject } = this.#subject(id);
    return Object.freeze(subject);
  }
  subjects() { return [...this.#subjects.keys()].map(id => this.subject(id)); }
  selfId(id) {
    const act = this.#act(id);
    return Object.freeze({ ...act, guarantors: Object.freeze([...act.guarantors]), xpRecipients: Object.freeze([...act.xpRecipients]) });
  }
  selfIds() { return [...this.#acts.keys()].map(id => this.selfId(id)); }
  invitations() { return [...this.#invitations.values()].map(value => Object.freeze({ ...value })); }
  guaranteeRelations() { return [...this.#guaranteeRecords.values()].map(value => Object.freeze({ ...value })); }
  events() { return [...this.#events]; }
  disputeStakes() { return [...this.#disputeStakes.values()].map(value => Object.freeze({ ...value })); }
  advanceTo(hour) {
    natural(hour, 'hour');
    if (hour < this.now) throw new ProtocolRejection('simulation time cannot move backwards');
    this.#now = hour;
    this.#settleDebtReservations();
  }
  // Reserved debt-recovery rights burn once their guarantor veto window has elapsed.
  #settleDebtReservations() {
    for (const act of [...this.#debtReservations]) {
      if (act.disputeLock !== null || this.now - act.recordedAt < this.policy.spendMaturityHours) continue;
      const subject = this.#subject(act.subject);
      act.debtReserved = false;
      this.#debtReservations.delete(act);
      if (subject.debt < 1) continue;
      subject.debt--;
      this.#dispose(act, 'consumed', 'debt-repayment');
      this.#event('debt-recovered', { selfId: act.id, subject: act.subject });
    }
  }
  rotateKey(id, key) {
    if (typeof key !== 'string' || !key.length) throw new ProtocolRejection('key must be non-empty');
    this.#subject(id, true).key = key;
    this.#event('key-rotated', { subject: id, key });
  }
  // A content hash, when supplied, may be registered only once: the same media cannot be reused.
  registerArtifact(publisher, { id, faceCount = 1, contentHash = null } = {}) {
    this.#subject(publisher, true);
    natural(faceCount, 'faceCount', 1);
    if (id !== undefined && (typeof id !== 'string' || !id.length || this.#artifacts.has(id))) throw new ProtocolRejection('invalid or duplicate artifact');
    if (contentHash !== null && (typeof contentHash !== 'string' || !contentHash.length)) throw new ProtocolRejection('invalid content hash');
    if (contentHash !== null && this.#contentHashes.has(contentHash)) throw new ProtocolRejection('duplicate media content');
    if (id === undefined) {
      // Allocate only after validation; caller-supplied IDs can occupy generated names.
      while (this.#artifacts.has('artifact:' + this.#sequence)) this.#sequence++;
      id = this.#id('artifact');
    }
    if (contentHash !== null) this.#contentHashes.add(contentHash);
    this.#artifacts.set(id, Object.freeze({ id, publisher, faceCount, registeredAt: this.now }));
    this.#event('artifact-registered', { artifact: id, publisher });
    return id;
  }
  proposeGuarantee(guarantor, guaranteed) {
    this.#subject(guarantor, true);
    this.#subject(guaranteed, true);
    if (guarantor === guaranteed || this.guarantees.edge(guarantor, guaranteed)) throw new ProtocolRejection('invalid or duplicate guarantee');
    const id = this.#id('guarantee');
    this.#guaranteeRecords.set(id, { id, guarantor, guaranteed, proposedAt: this.now, activatedAt: null, endedAt: null, status: 'proposed' });
    this.#event('guarantee-proposed', { relation: id, guarantor, guaranteed });
    return id;
  }
  confirmGuarantee(actor, relationId) {
    const relation = this.#guaranteeRecords.get(relationId);
    if (!relation || relation.status !== 'proposed' || relation.guaranteed !== actor) throw new ProtocolRejection('no matching guarantee proposal');
    const payer = this.#subject(relation.guarantor, true);
    this.#subject(actor, true);
    if (this.guarantees.edge(relation.guarantor, actor)) throw new ProtocolRejection('guarantee already active');
    if (payer.liquidFacy < this.policy.guaranteeFee) throw new ProtocolRejection('insufficient guarantee fee');
    this.guarantees.assertCapacity({ edgeIds: 1 });
    payer.liquidFacy -= this.policy.guaranteeFee;
    this.#fees += this.policy.guaranteeFee;
    this.guarantees.addEdge(relation.guarantor, actor);
    relation.status = 'active';
    relation.activatedAt = this.now;
    this.#event('guarantee-activated', { relation: relationId });
  }
  endGuarantee(actor, relationId) {
    const relation = this.#guaranteeRecords.get(relationId);
    if (!relation || relation.status !== 'active' || ![relation.guarantor, relation.guaranteed].includes(actor)) throw new ProtocolRejection('no authority to end guarantee');
    const payer = this.#subject(actor, true);
    if (payer.liquidFacy < 1) throw new ProtocolRejection('insufficient link-break fee');
    this.guarantees.assertCapacity();
    payer.liquidFacy--;
    this.#fees++;
    this.guarantees.removeEdge(relation.guarantor, relation.guaranteed);
    relation.status = 'ended';
    relation.endedAt = this.now;
    if (this.policy.linkBreakXp === 'revoke') {
      const sources = new Set(this.#subjectActs.get(relation.guaranteed));
      const guarantor = this.#subject(relation.guarantor);
      guarantor.xpEvents = guarantor.xpEvents.filter(event => event.type !== 'credit' || !sources.has(event.source));
      this.#replayXp(guarantor);
    }
    this.#event('guarantee-ended', { relation: relationId, actor });
  }
  isActive(id) {
    if (this.#subject(id).identityStatus !== 'accepted') return false;
    const acts = this.#subjectActs.get(id);
    // Acts are recorded chronologically, so the scan can stop at the first expired act.
    for (let i = acts.length - 1; i >= 0; i--) {
      const act = this.#acts.get(acts[i]);
      if (this.now - act.recordedAt >= 28 * DAY) return false;
      if (act.status !== 'cancelled') return true;
    }
    return false;
  }
  activeCount() {
    const cache = this.#activeCache;
    if (cache && cache.now === this.now && cache.version === this.#activityVersion) return cache.count;
    let count = 0;
    for (const id of this.#subjects.keys()) if (this.isActive(id)) count++;
    this.#activeCache = { now: this.now, version: this.#activityVersion, count };
    return count;
  }
  requiredGuarantors() {
    return this.ablations.fixedInvitationThreshold ?? String(Math.max(1, this.activeCount())).length;
  }
  eligibleGuarantors(id) {
    this.#subject(id);
    return [...this.guarantees.inEdges(id)].map(edge => edge.from).filter(guarantor =>
      this.#subject(guarantor).identityStatus === 'accepted' && (this.policy.guarantorEligibility === 'accepted' || this.isActive(guarantor)));
  }
  #replayXp(subject) {
    let xp = 0;
    for (const event of subject.xpEvents) {
      if (event.type === 'credit' && this.#xpSources.has(event.source)) xp++;
      if (event.type === 'halve') xp = Math.floor(xp / 2);
    }
    subject.xp = xp;
  }
  #credit(act) {
    if (act.xpCredited) return;
    act.xpCredited = true;
    this.#xpSources.add(act.id);
    for (const id of act.xpRecipients) {
      // Under linkBreakXp "revoke", a guarantor who has since left the relation earns nothing more from it.
      if (this.policy.linkBreakXp === 'revoke' && id !== act.subject && !this.guarantees.edge(id, act.subject)) continue;
      const subject = this.#subject(id);
      subject.xpEvents.push({ type: 'credit', source: act.id, at: this.now });
      subject.xp++;
    }
  }
  createSelfId(subjectId, artifactId, faceIndex = 0) {
    const subject = this.#subject(subjectId, true);
    const artifact = this.#artifacts.get(artifactId);
    if (!artifact || this.now - artifact.registeredAt > DAY) throw new ProtocolRejection('artifact is unknown or outside reference window');
    natural(faceIndex, 'faceIndex');
    if (faceIndex >= artifact.faceCount) throw new ProtocolRejection('faceIndex outside modeled detector output');
    if (subject.lastRewardAt !== null && this.now - subject.lastRewardAt < DAY) throw new ProtocolRejection('rolling 24-hour reward limit');
    if (this.policy.artifactReuse === 'once-per-subject' && this.#subjectActs.get(subjectId).some(id => this.#acts.get(id).artifact === artifactId)) throw new ProtocolRejection('subject has already used this artifact');
    const guarantors = this.eligibleGuarantors(subjectId);
    const id = this.#id('self-id');
    const faceRef = JSON.stringify([artifactId, 'abstract-detector-v1', faceIndex]);
    const claims = this.#claims.get(faceRef) ?? [];
    const collision = claims.some(claim => this.#acts.get(claim).subject !== subjectId);
    const xpRecipients = this.ablations.withholdGuarantorXp ? [subjectId] : [subjectId, ...guarantors];
    const reservedDebt = this.#subjectActs.get(subjectId).filter(actId => this.#acts.get(actId).debtReserved).length;
    const debtReserved = this.policy.debtRecovery === 'reserve-until-mature' && subject.debt > reservedDebt;
    const act = { id, subject: subjectId, artifact: artifactId, faceIndex, recordedAt: this.now, guarantors, xpRecipients, xpCredited: false, status: 'unspent', disposition: null, disputeLock: null, collision, debtReserved };
    if (collision) for (const claim of claims) this.#acts.get(claim).collision = true;
    claims.push(id);
    this.#claims.set(faceRef, claims);
    this.#acts.set(id, act);
    if (debtReserved) this.#debtReservations.add(act);
    this.#subjectActs.get(subjectId).push(id);
    this.#activityVersion++;
    subject.lastRewardAt = this.now;
    this.#minted++;
    this.#vault++;
    if (this.policy.xpFinality === 'immediate') this.#credit(act);
    if (this.policy.debtRecovery === 'immediate-burn' && subject.debt > 0) {
      subject.debt--;
      this.#dispose(act, 'consumed', 'debt-repayment');
    }
    this.#event('self-id-created', { selfId: id, subject: subjectId, collision: act.collision });
    return id;
  }
  #requireUnspent(act) {
    if (act.status !== 'unspent' || act.disputeLock !== null) throw new ProtocolRejection('emission is spent or disputed');
  }
  #dispose(act, status, disposition) {
    this.#requireUnspent(act);
    act.debtReserved = false;
    this.#debtReservations.delete(act);
    act.status = status;
    act.disposition = disposition;
    this.#vault--;
    if (status === 'converted') this.#subject(act.subject).liquidFacy++;
    else this.#burned++;
    if (status === 'cancelled') {
      this.#activityVersion++;
      this.#xpSources.delete(act.id);
      if (act.xpCredited) for (const id of act.xpRecipients) this.#replayXp(this.#subject(id));
    } else this.#credit(act);
  }
  cancelSelfId(guarantor, selfIdId) {
    this.#subject(guarantor, true);
    const act = this.#act(selfIdId);
    const authorized = this.policy.cancellationAuthority === 'snapshot' ? act.guarantors.includes(guarantor) : Boolean(this.guarantees.edge(guarantor, act.subject));
    if (!authorized) throw new ProtocolRejection('no cancellation authority');
    this.#dispose(act, 'cancelled', 'guarantor-veto');
    this.#event('self-id-cancelled', { selfId: selfIdId, guarantor });
  }
  eligibleEmissions(subjectId, minimumAge = this.policy.spendMaturityHours) {
    this.#subject(subjectId);
    return this.#subjectActs.get(subjectId).map(id => this.#acts.get(id)).filter(act =>
      act.status === 'unspent' && act.disputeLock === null && !act.debtReserved && this.now - act.recordedAt >= minimumAge).map(act => act.id);
  }
  createInvitation(creatorId, selfIdId, target) {
    const creator = this.#subject(creatorId, true);
    const act = this.#act(selfIdId);
    this.#requireUnspent(act);
    if (act.subject !== creator.id || this.now - act.recordedAt < this.policy.spendMaturityHours) throw new ProtocolRejection('invitation requires own mature Emitter right');
    if (act.debtReserved) throw new ProtocolRejection('emission is reserved for debt recovery');
    if (this.eligibleGuarantors(creatorId).length < this.requiredGuarantors()) throw new ProtocolRejection('insufficient eligible guarantors');
    if (typeof target !== 'string' || !target.length || this.#subjects.has(target)) throw new ProtocolRejection('invitation must target a new subject');
    const id = this.#id('invitation');
    this.#dispose(act, 'consumed', 'invitation');
    this.#invitations.set(id, { id, creator: creatorId, sourceSelfId: selfIdId, target, createdAt: this.now, acceptedAt: null, status: 'open' });
    this.#event('invitation-created', { invitation: id, creator: creatorId, target });
    return id;
  }
  acceptInvitation(invitationId, subjectId) {
    const invitation = this.#invitations.get(invitationId);
    if (!invitation || invitation.status !== 'open' || invitation.target !== subjectId) throw new ProtocolRejection('invalid invitation acceptance');
    if (this.now - invitation.createdAt < this.policy.invitationFreezeHours) throw new ProtocolRejection('invitation is frozen');
    this.#subject(invitation.creator, true);
    this.#addSubject(subjectId, false, invitation.creator);
    invitation.status = 'accepted';
    invitation.acceptedAt = this.now;
    this.#event('invitation-accepted', { invitation: invitationId, subject: subjectId });
  }
  // During the freeze, any current guarantor of the creator can cancel an open invitation.
  // The burned emission stays burned; XP credited by its consumption is revoked.
  cancelInvitation(guarantor, invitationId) {
    this.#subject(guarantor, true);
    const invitation = this.#invitations.get(invitationId);
    if (!invitation || invitation.status !== 'open' || this.now - invitation.createdAt >= this.policy.invitationFreezeHours) throw new ProtocolRejection('invitation is not cancellable');
    if (!this.guarantees.edge(guarantor, invitation.creator)) throw new ProtocolRejection('no authority to cancel invitation');
    if (this.ablations.disableInvitationVeto) throw new ProtocolRejection('invitation veto disabled by counterfactual ablation');
    invitation.status = 'cancelled';
    const act = this.#act(invitation.sourceSelfId);
    act.disposition = 'invitation-cancelled';
    if (this.#xpSources.delete(act.id) && act.xpCredited) for (const id of act.xpRecipients) this.#replayXp(this.#subject(id));
    this.#event('invitation-cancelled', { invitation: invitationId, guarantor });
  }
  convertToCollector(owner, selfIdId) {
    this.#subject(owner, true);
    const act = this.#act(selfIdId);
    if (act.subject !== owner || this.now - act.recordedAt < this.policy.conversionMaturityHours) throw new ProtocolRejection('conversion requires own mature emission');
    if (act.debtReserved) throw new ProtocolRejection('emission is reserved for debt recovery');
    this.#dispose(act, 'converted', 'collector');
    this.#event('collector-converted', { selfId: selfIdId, subject: owner });
  }
  freezeSelfId(selfIdId, lockId) {
    const act = this.#act(selfIdId);
    this.#requireUnspent(act);
    if (typeof lockId !== 'string' || !lockId.length) throw new ProtocolRejection('invalid dispute lock');
    act.disputeLock = lockId;
    this.#event('self-id-frozen', { selfId: selfIdId, lockId });
  }
  unfreezeSelfId(selfIdId, lockId) {
    const act = this.#act(selfIdId);
    if (act.disputeLock !== lockId || act.disputeLock === null) throw new ProtocolRejection('wrong dispute lock');
    act.disputeLock = null;
    this.#event('self-id-unfrozen', { selfId: selfIdId, lockId });
    this.#settleDebtReservations();
  }
  // The memo labels public transfers (e.g. dispute settlements) for flow analysis; it is not a protocol field.
  transferFacy(from, to, amount, memo = 'transfer') {
    natural(amount, 'amount', 1);
    if (typeof memo !== 'string' || !memo.length) throw new TypeError('transfer memo must be non-empty');
    const payer = this.#subject(from, true);
    const recipient = this.#subject(to, true);
    if (payer.liquidFacy < amount) throw new ProtocolRejection('insufficient liquid FACY');
    payer.liquidFacy -= amount;
    recipient.liquidFacy += amount;
    this.#event('facy-transferred', { from, to, amount, memo });
  }
  // Reference custody for OPEN stake-backing semantics; reserved funds are no longer liquid.
  reserveDisputeStake(caseId, owner, amount) {
    natural(amount, 'stake');
    if (typeof caseId !== 'string' || !caseId.length) throw new ProtocolRejection('invalid stake case ID');
    const key = JSON.stringify([caseId, owner]);
    if (this.#disputeStakes.has(key)) throw new ProtocolRejection('duplicate stake commitment');
    const payer = this.#subject(owner, true);
    if (payer.liquidFacy < amount) throw new ProtocolRejection('insufficient liquid stake');
    natural(this.#stakeVault + amount, 'stake vault');
    payer.liquidFacy -= amount;
    this.#stakeVault += amount;
    this.#disputeStakes.set(key, { caseId, owner, amount, status: 'reserved', reservedAt: this.now, settledAt: null, disposition: null, recipient: null });
    this.#event('dispute-stake-reserved', { caseId, subject: owner, amount });
  }
  settleDisputeStake(caseId, owner, { disposition = 'release', recipient = null } = {}) {
    const stake = this.#disputeStakes.get(JSON.stringify([caseId, owner]));
    if (!stake || stake.status !== 'reserved') throw new ProtocolRejection('stake is not reserved');
    if (!['release', 'transfer', 'burn'].includes(disposition) || (disposition !== 'transfer' && recipient !== null)) throw new ProtocolRejection('invalid stake disposition');
    // Settlement is an adjudication input, not a new action by the recipient: invalidated accounts can
    // receive custody refunds/winnings. Ordinary transfers from them remain prohibited.
    const receiver = disposition === 'burn' ? null : this.#subject(disposition === 'release' ? owner : recipient);
    if (receiver) natural(receiver.liquidFacy + stake.amount, 'settlement balance');
    this.#stakeVault -= stake.amount;
    if (receiver) receiver.liquidFacy += stake.amount;
    else this.#burned += stake.amount;
    stake.status = 'settled';
    stake.settledAt = this.now;
    stake.disposition = disposition;
    stake.recipient = recipient;
    if (disposition === 'transfer' && stake.amount > 0) this.#event('facy-transferred', { from: owner, to: recipient, amount: stake.amount, memo: 'ladder-settlement' });
    this.#event('dispute-stake-settled', { caseId, subject: owner, amount: stake.amount, disposition, recipient });
    return stake.amount;
  }
  penalize(id, { fine = 0, halveXp = true } = {}) {
    natural(fine, 'fine');
    if (typeof halveXp !== 'boolean') throw new TypeError('halveXp must be boolean');
    const subject = this.#subject(id);
    const collected = Math.min(subject.liquidFacy, fine);
    const debtAdded = fine - collected;
    natural(this.ledger().debt + debtAdded, 'aggregate debt');
    subject.liquidFacy -= collected;
    subject.debt += debtAdded;
    this.#burned += collected;
    if (halveXp) {
      subject.xpEvents.push({ type: 'halve', at: this.now });
      subject.xp = Math.floor(subject.xp / 2);
    }
    this.#event('penalty-applied', { subject: id, fine, collected, debtAdded, halveXp });
    return { collected, debtAdded };
  }
  invalidateIdentity(id) {
    this.#subject(id).identityStatus = 'false';
    this.#activityVersion++;
    this.#event('identity-invalidated', { subject: id });
  }
  // Adjudicated cut of a subject's Self-ID chain from one act onward (default: the whole chain).
  // Unspent rights burn without XP; XP credited by the cut acts is revoked from every recipient.
  // Already converted or burned coins cannot be un-minted; recovering them is a separate fine.
  voidSelfIdChain(id, { fromAct = null } = {}) {
    this.#subject(id);
    const chain = this.#subjectActs.get(id);
    const start = fromAct === null ? 0 : chain.indexOf(fromAct);
    if (start < 0) throw new ProtocolRejection('act is not in the subject chain');
    const cut = chain.slice(start).map(actId => this.#acts.get(actId)).filter(act => act.status !== 'cancelled');
    const recipients = new Set();
    let burned = 0;
    for (const act of cut) {
      if (act.status === 'unspent') {
        act.status = 'cancelled';
        act.disposition = 'adjudicated-void';
        act.debtReserved = false;
        this.#debtReservations.delete(act);
        this.#vault--;
        this.#burned++;
        burned++;
      } else act.disposition = act.disposition + '+voided';
      if (this.#xpSources.delete(act.id) && act.xpCredited) for (const recipient of act.xpRecipients) recipients.add(recipient);
    }
    for (const recipient of recipients) this.#replayXp(this.#subject(recipient));
    this.#activityVersion++;
    this.#event('self-id-chain-voided', { subject: id, fromAct, acts: cut.length, burnedRights: burned });
    return { acts: cut.length, burnedRights: burned, xpRecipients: [...recipients] };
  }
  council() {
    const active = this.policy.councilEligibility === 'active';
    return [...this.#subjects.values()].filter(subject => subject.identityStatus === 'accepted' && (!active || this.isActive(subject.id))).map(subject => ({ id: subject.id, xp: subject.xp }))
      .sort((a, b) => b.xp - a.xp || idOrder(a.id, b.id)).slice(0, this.policy.councilSize);
  }
  ledger() {
    const subjects = [...this.#subjects.values()];
    return { minted: this.#minted, burned: this.#burned, supply: this.#minted - this.#burned, emitterVault: this.#vault, collector: subjects.reduce((sum, subject) => sum + subject.liquidFacy, 0), feeVault: this.#fees, stakeVault: this.#stakeVault, debt: subjects.reduce((sum, subject) => sum + subject.debt, 0) };
  }
  audit() {
    const ledger = this.ledger();
    const outstanding = [...this.#acts.values()].filter(act => act.status === 'unspent').length;
    const reserved = [...this.#disputeStakes.values()].filter(stake => stake.status === 'reserved').reduce((sum, stake) => sum + stake.amount, 0);
    if (reserved !== ledger.stakeVault || outstanding !== ledger.emitterVault || ledger.supply !== ledger.emitterVault + ledger.collector + ledger.feeVault + ledger.stakeVault) throw new Error('FACY conservation invariant failed');
    for (const value of Object.values(ledger)) natural(value, 'ledger value');
    for (const subject of this.#subjects.values()) {
      natural(subject.xp, 'XP');
      natural(subject.liquidFacy, 'liquidFacy');
      natural(subject.debt, 'debt');
    }
    return ledger;
  }
}
