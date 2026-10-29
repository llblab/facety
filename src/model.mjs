// Owns: Deterministic Facety transitions; excludes attacker truth and adjudication.
import { DirectedGraph } from './graph.mjs';
import { findInternallyDisjointPaths, verifyInternallyDisjointPaths } from './proofs.mjs';

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
    xpFinality: ['terminal', 'immediate', 'maturity'],
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
  if (policy.xpFinality === 'maturity' && (policy.cancellationAuthority !== 'snapshot' || policy.debtRecovery !== 'reserve-until-mature'
    || policy.spendMaturityHours < DAY || policy.conversionMaturityHours < DAY)) throw new Error('maturity XP requires snapshot veto, reserved debt and no spending before24h');
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

// Experimental constructor-only arm: callers cannot switch limits between invitations.
function invitationLimitFrom(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'P') || !Object.hasOwn(value, 'b')) throw new TypeError('invitationLimit requires only P and b');
  const { P, b } = value;
  if (P !== null) { natural(P, 'P', 1); natural(P * DAY, 'cooldown hours', 1); }
  natural(b, 'b');
  return Object.freeze({ P, b });
}

// Constructor-only diagnostic reference; none of these bindings is a selected CORE contract.
function vouchingFrom(value) {
  if (value === null) return null;
  const keys = ['K', 'T', 'V', 'B', 'reference'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('vouching requires K, T, V, B and explicit reference bindings');
  const { K, T, V, B, reference } = value;
  natural(K, 'K'); natural(T, 'T', 1); natural(V, 'V', 1); natural(B, 'B');
  natural(T * DAY, 'vouch cooldown hours', 1); natural(V * DAY, 'probation hours', 1);
  const fields = ['eligibility', 'clockOrigin', 'funding', 'exitSlot', 'bondRelease'];
  if (!reference || typeof reference !== 'object' || Array.isArray(reference) || Object.keys(reference).length !== fields.length
    || fields.some(key => !Object.hasOwn(reference, key))) throw new TypeError('vouching requires explicit reference semantics');
  const binding = Object.fromEntries(fields.map(key => [key, reference[key]]));
  if (binding.eligibility !== 'accepted-reference' || binding.clockOrigin !== 'commitment' || binding.funding !== 'collector-liquid'
    || !['retain-until-V', 'release-on-exit'].includes(binding.exitSlot) || binding.bondRelease !== 'supplied-clearance') throw new TypeError('unsupported vouching reference binding');
  return Object.freeze({ K, T, V, B, reference: Object.freeze(binding) });
}

// Opt-in D83/D93/D94/D97/D100 owned-valence reference (V1); OPEN choices are required bindings, never defaults.
function valencesFrom(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== 'K,genesisPairs,reference') throw new TypeError('valences requires K, genesisPairs and explicit reference bindings');
  const { K, reference, genesisPairs } = value;
  natural(K, 'valence K', 1);
  const allowed = { source: ['own-mature-right'], withdrawal: ['free', 'burn-one-liquid'], pairEndXp: ['withdrawer-only', 'both-relations'], withdrawDuringHold: ['allow', 'refuse'],
    invitations: ['v2-special-link', 'refuse'], eligibility: ['v3-council-paths', 'off'] };
  const keys = [...Object.keys(allowed), 'councilPaths'].sort().join();
  if (!reference || typeof reference !== 'object' || Array.isArray(reference) || Object.keys(reference).sort().join() !== keys) throw new TypeError('valences requires source, withdrawal, pairEndXp, withdrawDuringHold, invitations, eligibility and councilPaths bindings');
  for (const [key, values] of Object.entries(allowed)) if (!values.includes(reference[key])) throw new TypeError('unsupported valence binding: ' + key);
  const paths = { council: ['legacy-active-xp-leaderboard', 'd33-active-lookup'], terminal: ['single-member'], self: ['other-member'], bootstrap: ['latch-first-100-active'], intermediaries: ['accepted-subjects'], search: ['exact-unbounded'] };
  let councilPaths = null;
  // With eligibility off, a supplied councilPaths binding only sets the Council reference (no path gate).
  if (reference.eligibility !== 'off' || reference.councilPaths !== null) {
    const supplied = reference.councilPaths;
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || Object.keys(supplied).sort().join() !== Object.keys(paths).sort().join()
      || Object.entries(paths).some(([key, allowed]) => !allowed.includes(supplied[key]))) throw new TypeError('unsupported councilPaths binding');
    councilPaths = Object.freeze({ ...supplied });
  }
  if (!Array.isArray(genesisPairs) || genesisPairs.some(pair => !Array.isArray(pair) || pair.length !== 2)) throw new TypeError('genesisPairs must be an array of pairs');
  return Object.freeze({ K, genesisPairs: Object.freeze(genesisPairs.map(pair => Object.freeze([...pair]))),
    reference: Object.freeze({ ...reference, councilPaths }) });
}

function vouchAdmissionFrom(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== 'c,reference') throw new TypeError('vouchAdmission requires c and an explicit reference');
  const { c, reference } = value;
  natural(c, 'vouch admission c', 1); natural(c + 1, 'admission graph revisions', 1);
  if (reference !== 'native-guarantees-commitment-reference') throw new TypeError('unsupported vouch admission reference');
  return Object.freeze({ c, reference });
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
  #lastInvitationAt = new Map();
  #vouches = new Map();
  #lastVouchAt = new Map();
  #vouchVault = 0;
  #vouchAdmissions = new Map();
  #vouchRelations = new Map();
  #vouchBondCases = new Map();
  #pendingVouchBondCases = new Map();
  #claims = new Map();
  #xpByRecipient = new Map();
  #xpMaturities = new Set();
  #actPenalties = new Map();
  #selfIdResolutions = new Map();
  #debtReservations = new Set();
  #disputeStakes = new Map();
  #disputeParticipations = new Map();
  #activityCasesBySubject = new Map();
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
  #valences = new Map();
  #openValences = new Map();
  #ownedValences = new Map();
  #valenceCeiling = null;
  #preregistrations = new Map();
  #invitationUnits = new Map();
  #bootstrap = true;
  constructor({ genesis = ['root'], policy = {}, ablations = {}, invitationLimit = null, vouching = null, vouchAdmission = null, valences = null } = {}) {
    if (!Array.isArray(genesis) || !genesis.length || new Set(genesis).size !== genesis.length) throw new ProtocolRejection('genesis must contain distinct subject IDs');
    const vouchPolicy = vouchingFrom(vouching), admissionPolicy = vouchAdmissionFrom(vouchAdmission);
    if (admissionPolicy !== null && (vouchPolicy === null || invitationLimit !== null)) throw new TypeError('vouch admission requires funded vouching and no invitation-limit arm');
    Object.defineProperty(this, 'invitationLimit', { value: invitationLimitFrom(invitationLimit), enumerable: invitationLimit !== null });
    Object.defineProperty(this, 'vouching', { value: vouchPolicy, enumerable: vouching !== null });
    Object.defineProperty(this, 'vouchAdmission', { value: admissionPolicy, enumerable: vouchAdmission !== null });
    const valencePolicy = valencesFrom(valences);
    if (valencePolicy !== null && (vouchPolicy !== null || admissionPolicy !== null)) throw new TypeError('valences cannot combine with the vouching references');
    Object.defineProperty(this, 'valences', { value: valencePolicy, enumerable: valences !== null });
    this.#valenceCeiling = valencePolicy?.K ?? null;
    Object.defineProperty(this, 'policy', { value: policyFrom(policy), enumerable: true });
    Object.defineProperty(this, 'ablations', { value: ablationsFrom(ablations), enumerable: true });
    this.lineage = new DirectedGraph('invitation-lineage');
    this.guarantees = new DirectedGraph('guarantees');
    Object.defineProperty(this, 'roots', { value: Object.freeze([...genesis]), enumerable: true });
    for (const id of genesis) this.#addSubject(id, true);
    if (valencePolicy !== null) for (const [a, b] of valencePolicy.genesisPairs) this.#establishGenesisPair(a, b);
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
    this.#subjects.set(id, { id, genesis, key: id + ':key:0', identityStatus: 'accepted', xp: 0, xpHalvings: 0, liquidFacy: 0, debt: 0, lastRewardAt: null });
    this.#xpByRecipient.set(id, []);
    this.#subjectActs.set(id, []);
    this.lineage.addNode(id);
    this.guarantees.addNode(id);
    if (inviter !== null) this.lineage.addEdge(inviter, id);
    this.#event('subject-added', { subject: id, genesis });
  }
  subject(id) { return Object.freeze({ ...this.#subject(id) }); }
  subjects() { return [...this.#subjects.keys()].map(id => this.subject(id)); }
  xpProvenance(id) {
    const subject = this.#subject(id);
    const credits = this.#xpByRecipient.get(id).map(({ act, receipt }) => Object.freeze({ selfId: act.id, at: act.xpCredit.at,
      ...receipt, sourceRevokedAt: act.xpCredit.revokedAt, sourceRevocation: act.xpCredit.revocation }));
    return Object.freeze({ subject: id, xp: this.#computeXp(subject), halvings: subject.xpHalvings, credits: Object.freeze(credits) });
  }
  selfId(id) {
    const act = this.#act(id);
    const xpCredit = act.xpCredit === null ? null : Object.freeze({ ...act.xpCredit,
      recipients: Object.freeze(act.xpCredit.recipients.map(receipt => Object.freeze({ ...receipt }))) });
    return Object.freeze({ ...act, guarantors: Object.freeze([...act.guarantors]), xpRecipients: Object.freeze([...act.xpRecipients]), xpCredit });
  }
  selfIds() { return [...this.#acts.keys()].map(id => this.selfId(id)); }
  invitations() { return [...this.#invitations.values()].map(value => Object.freeze({ ...value, guarantors: Object.freeze([...value.guarantors]),
    ...(value.sourceSelfIds ? { sourceSelfIds: Object.freeze([...value.sourceSelfIds]) } : {}) })); }
  #penaltySnapshot(value) { return Object.freeze({ ...value,
    parties: Object.freeze([...value.parties]), penalties: Object.freeze(value.penalties.map(penalty => Object.freeze({ ...penalty }))) }); }
  actPenalties() { return [...this.#actPenalties.values()].map(value => this.#penaltySnapshot(value)); }
  #requireLegacyGuarantees() {
    if (this.valences !== null) throw new ProtocolRejection('valence reference replaces legacy guarantee operations');
  }
  #requireValences() {
    if (this.valences === null) throw new ProtocolRejection('valence reference is disabled');
    return this.valences;
  }
  #valenceKey(owner, counterpart) { return owner + '\u0000' + counterpart; }
  valenceRecords() { return [...this.#valences.values()].map(value => Object.freeze({ ...value, pairRelations: Object.freeze([...value.pairRelations]) })); }
  #establishGenesisPair(a, b) {
    if (a === b || !this.roots.includes(a) || !this.roots.includes(b)) throw new ProtocolRejection('genesis pairs require two distinct genesis members');
    if (this.#openValences.has(this.#valenceKey(a, b)) || this.#openValences.has(this.#valenceKey(b, a))) throw new ProtocolRejection('duplicate genesis pair');
    if (this.#usedSlots(a) >= this.#valenceCeiling || this.#usedSlots(b) >= this.#valenceCeiling) throw new ProtocolRejection('genesis pairs exceed the owned-slot ceiling');
    this.guarantees.assertCapacity({ edgeIds: 2 });
    const ids = [];
    for (const [owner, counterpart] of [[a, b], [b, a]]) {
      const id = this.#id('valence');
      this.#valences.set(id, { id, owner, counterpart, openedAt: this.now, closedAt: null, status: 'open', burnSource: null, origin: 'genesis-supplied', pairRelations: [] });
      this.#openValences.set(this.#valenceKey(owner, counterpart), id);
      if (!this.#ownedValences.has(owner)) this.#ownedValences.set(owner, new Set());
      this.#ownedValences.get(owner).add(id);
      ids.push(id);
    }
    const relations = [];
    for (const [guarantor, guaranteed] of [[a, b], [b, a]]) {
      const relationId = this.#id('guarantee');
      this.guarantees.addEdge(guarantor, guaranteed);
      this.#guaranteeRecords.set(relationId, { id: relationId, guarantor, guaranteed, proposedAt: this.now, activatedAt: this.now, endedAt: null, status: 'active', valencePair: ids });
      relations.push(relationId);
    }
    for (const id of ids) this.#valences.get(id).pairRelations = [...relations];
    this.#event('valence-pair-established', { valences: ids, relations, genesis: true });
  }
  #councilPathsActive() { return this.valences !== null && this.valences.reference.eligibility === 'v3-council-paths'; }
  // D91 reference: initial bootstrap lasts until 100 active participants are first observed, then latches off permanently.
  #observeBootstrap() {
    if (!this.#councilPathsActive() || !this.#bootstrap || this.activeCount() < 100) return;
    this.#bootstrap = false;
    this.#event('bootstrap-ended', { active: this.activeCount() });
  }
  get initialBootstrap() {
    if (!this.#councilPathsActive()) return null;
    this.#observeBootstrap();
    return this.#bootstrap;
  }
  #mutualPartners(id) {
    return [...this.guarantees.inEdges(id)].map(edge => edge.from).filter(partner => this.#subject(partner).identityStatus === 'accepted' && this.guarantees.edge(id, partner));
  }
  // D84/D104 reference: exact internally vertex-disjoint paths over current mutual links to one admissible Council member other than the source.
  #councilPathCertificate(source, minimumPaths) {
    const blockedNodes = [...this.#subjects.values()].filter(subject => subject.identityStatus !== 'accepted').map(subject => subject.id);
    for (const { id: target } of this.council()) {
      if (target === source) continue;
      const result = findInternallyDisjointPaths(this.guarantees, { source, target, minimumPaths, blockedNodes });
      if (result.status !== 'found') continue;
      if (!verifyInternallyDisjointPaths(this.guarantees, result.proof, { source, target, minimumPaths, blockedNodes })) throw new Error('Council path certificate failed independent verification');
      return Object.freeze({ target, minimumPaths, proof: result.proof });
    }
    return null;
  }
  #requireSelfIdSupport(subjectId) {
    if (!this.#councilPathsActive()) return null;
    this.#observeBootstrap();
    const partners = this.#mutualPartners(subjectId);
    if (!partners.length) throw new ProtocolRejection('Self-ID requires an established mutual guarantor');
    if (this.#bootstrap) return null;
    for (const partner of partners) {
      const certificate = this.#councilPathCertificate(partner, 1);
      if (certificate) return Object.freeze({ guarantor: partner, ...certificate });
    }
    throw new ProtocolRejection('insufficient Council paths');
  }
  #requireInvitationPaths(creatorId) {
    if (!this.#councilPathsActive()) return null;
    this.#observeBootstrap();
    if (this.#bootstrap) return null;
    const certificate = this.#councilPathCertificate(creatorId, this.requiredGuarantors());
    if (!certificate) throw new ProtocolRejection('insufficient Council paths');
    return certificate;
  }
  #usedSlots(id) { return (this.#ownedValences.get(id)?.size ?? 0) + (this.#invitationUnits.get(id)?.size ?? 0); }
  ownedSlots(id) {
    this.#requireValences();
    if (!this.#preregistrations.has(id)) this.#subject(id);
    const open = [...(this.#ownedValences.get(id) ?? [])], invitations = [...(this.#invitationUnits.get(id) ?? [])];
    return Object.freeze({ K: this.#valenceCeiling, used: open.length + invitations.length, open: Object.freeze(open), invitations: Object.freeze(invitations) });
  }
  #requireValenceInvitations() {
    if (this.#requireValences().reference.invitations !== 'v2-special-link') throw new ProtocolRejection('valence reference V1 does not count invitation-side units');
  }
  preregistrations() { return [...this.#preregistrations.values()].map(value => Object.freeze({ ...value })); }
  // D107: a caller-supplied assertion that required fields are complete and the zero Genesis act is published; no FACY, right, XP, chain position or slot.
  preregisterAccount(id) {
    this.#requireValenceInvitations();
    if (typeof id !== 'string' || !id.length || this.#subjects.has(id) || this.#preregistrations.has(id)) throw new ProtocolRejection('invalid, duplicate or admitted pre-registration');
    this.#preregistrations.set(id, { id, registeredAt: this.now, status: 'preregistered', zeroGenesis: 'supplied' });
    this.#event('account-preregistered', { account: id });
  }
  #addInvitationUnit(id, invitationId) {
    if (!this.#invitationUnits.has(id)) this.#invitationUnits.set(id, new Set());
    this.#invitationUnits.get(id).add(invitationId);
  }
  #releaseInvitationUnits(invitation) {
    for (const id of invitation.units) {
      const units = this.#invitationUnits.get(id);
      units.delete(invitation.id);
      if (!units.size) this.#invitationUnits.delete(id);
    }
  }
  #createValenceInvitation(creatorId, selfIdId, target) {
    this.#subject(creatorId, true);
    this.#requireActivity(creatorId);
    const registration = this.#preregistrations.get(target);
    if (!registration || registration.status !== 'preregistered') throw new ProtocolRejection('invitation must target a pre-registered account');
    if ([...this.#invitations.values()].some(value => value.target === target && value.status === 'pending')) throw new ProtocolRejection('target already holds a pending invitation');
    const act = this.#act(selfIdId);
    this.#requireUnspent(act);
    if (act.subject !== creatorId || this.now - act.recordedAt < Math.max(DAY, this.policy.spendMaturityHours)) throw new ProtocolRejection('invitation requires own mature Emitter right');
    if (act.debtReserved) throw new ProtocolRejection('emission is reserved for debt recovery');
    const guarantors = this.eligibleGuarantors(creatorId);
    if (guarantors.length < this.requiredGuarantors()) throw new ProtocolRejection('insufficient eligible guarantors');
    if (this.#usedSlots(creatorId) >= this.#valenceCeiling) throw new ProtocolRejection('owned-slot ceiling reached');
    if (this.#usedSlots(target) >= this.#valenceCeiling) throw new ProtocolRejection('recipient owned-slot ceiling reached');
    const councilPath = this.#requireInvitationPaths(creatorId);
    const id = this.#id('invitation');
    this.#dispose(act, 'consumed', 'invitation');
    this.#invitations.set(id, { id, creator: creatorId, sourceSelfId: selfIdId, target, guarantors, createdAt: this.now, acceptedAt: null, endedAt: null,
      status: 'pending', units: Object.freeze([creatorId, target]), linkRelations: Object.freeze([]), ...(councilPath === null ? {} : { councilPath }) });
    this.#addInvitationUnit(creatorId, id);
    this.#addInvitationUnit(target, id);
    this.#event('invitation-created', { invitation: id, creator: creatorId, target, valenceReference: true });
    return id;
  }
  #acceptValenceInvitation(invitationId, subjectId) {
    const invitation = this.#invitations.get(invitationId);
    if (!invitation || invitation.status !== 'pending' || invitation.target !== subjectId) throw new ProtocolRejection('invalid invitation acceptance');
    if (this.now - invitation.createdAt < this.policy.invitationFreezeHours) throw new ProtocolRejection('invitation is frozen');
    this.guarantees.assertCapacity({ edgeIds: 2 });
    // D107: eligibility was validated at issuance; creator support, paths or K are not rechecked here.
    this.#addSubject(subjectId, false, invitation.creator);
    this.#preregistrations.get(subjectId).status = 'admitted';
    const relations = [];
    for (const [guarantor, guaranteed] of [[invitation.creator, subjectId], [subjectId, invitation.creator]]) {
      const relationId = this.#id('guarantee');
      this.guarantees.addEdge(guarantor, guaranteed);
      this.#guaranteeRecords.set(relationId, { id: relationId, guarantor, guaranteed, proposedAt: invitation.createdAt, activatedAt: this.now, endedAt: null, status: 'active', invitationLink: invitationId });
      relations.push(relationId);
    }
    invitation.status = 'active';
    invitation.acceptedAt = this.now;
    invitation.linkRelations = Object.freeze(relations);
    this.#event('invitation-accepted', { invitation: invitationId, subject: subjectId, relations });
  }
  endInvitationLink(actor, invitationId) {
    this.#requireValenceInvitations();
    const { reference } = this.valences;
    const invitation = this.#invitations.get(invitationId);
    if (!invitation || invitation.status !== 'active' || ![invitation.creator, invitation.target].includes(actor)) throw new ProtocolRejection('no active invitation link to end');
    const payer = this.#subject(actor, true);
    if (reference.withdrawDuringHold === 'refuse') this.#requireActivity(actor);
    if (reference.withdrawal === 'burn-one-liquid' && payer.liquidFacy < 1) throw new ProtocolRejection('insufficient valence withdrawal burn');
    this.guarantees.assertCapacity();
    if (reference.withdrawal === 'burn-one-liquid') { payer.liquidFacy--; this.#burned++; }
    invitation.status = 'closed';
    invitation.endedAt = this.now;
    this.#releaseInvitationUnits(invitation);
    this.#event('invitation-link-ended', { invitation: invitationId, actor, burned: reference.withdrawal === 'burn-one-liquid' ? 1 : 0 });
    for (const id of invitation.linkRelations) {
      const relation = this.#guaranteeRecords.get(id);
      this.#deactivateGuarantee(relation, actor, this.policy.linkBreakXp === 'revoke' && (reference.pairEndXp === 'both-relations' || relation.guarantor === actor));
    }
  }
  setOwnedSlotCeiling(K) {
    this.#requireValences();
    natural(K, 'valence K', 1);
    const previous = this.#valenceCeiling;
    this.#valenceCeiling = K;
    this.#event('owned-slot-ceiling-set', { K, previous });
  }
  openValence(owner, counterpart, sourceSelfId) {
    this.#requireValences();
    this.#subject(owner, true);
    this.#subject(counterpart, true);
    if (owner === counterpart) throw new ProtocolRejection('valence requires a distinct counterpart');
    this.#requireActivity(owner);
    if (this.#openValences.has(this.#valenceKey(owner, counterpart))) throw new ProtocolRejection('owner already holds an open valence toward counterpart');
    if (this.#usedSlots(owner) >= this.#valenceCeiling) throw new ProtocolRejection('owned-slot ceiling reached');
    const act = this.#act(sourceSelfId);
    this.#requireUnspent(act);
    if (act.subject !== owner || this.now - act.recordedAt < this.policy.spendMaturityHours) throw new ProtocolRejection('valence requires own mature Emitter right');
    if (act.debtReserved) throw new ProtocolRejection('emission is reserved for debt recovery');
    const oppositeId = this.#openValences.get(this.#valenceKey(counterpart, owner));
    if (oppositeId !== undefined) {
      // Conservative V1 boundary: establishment creates a new guarantee for both sides, so a D77-held retained side blocks it.
      this.#requireActivity(counterpart);
      if (this.guarantees.edge(owner, counterpart) || this.guarantees.edge(counterpart, owner)) throw new ProtocolRejection('guarantee edge already active');
      this.guarantees.assertCapacity({ edgeIds: 2 });
    }
    const id = this.#id('valence');
    this.#dispose(act, 'consumed', 'valence-burn');
    const record = { id, owner, counterpart, openedAt: this.now, closedAt: null, status: 'open', burnSource: sourceSelfId, pairRelations: [] };
    this.#valences.set(id, record);
    this.#openValences.set(this.#valenceKey(owner, counterpart), id);
    if (!this.#ownedValences.has(owner)) this.#ownedValences.set(owner, new Set());
    this.#ownedValences.get(owner).add(id);
    this.#event('valence-opened', { valence: id, owner, counterpart, burnSource: sourceSelfId });
    if (oppositeId !== undefined) {
      const opposite = this.#valences.get(oppositeId), relations = [];
      for (const [guarantor, guaranteed] of [[owner, counterpart], [counterpart, owner]]) {
        const relationId = this.#id('guarantee');
        this.guarantees.addEdge(guarantor, guaranteed);
        this.#guaranteeRecords.set(relationId, { id: relationId, guarantor, guaranteed, proposedAt: this.now, activatedAt: this.now, endedAt: null, status: 'active', valencePair: [id, oppositeId] });
        relations.push(relationId);
      }
      record.pairRelations = relations;
      opposite.pairRelations = [...opposite.pairRelations, ...relations];
      this.#event('valence-pair-established', { valences: [id, oppositeId], relations });
    }
    return id;
  }
  withdrawValence(owner, valenceId, sourceSelfId = null) {
    const { reference } = this.#requireValences();
    const record = this.#valences.get(valenceId);
    if (!record || record.status !== 'open' || record.owner !== owner) throw new ProtocolRejection('no open own valence to withdraw');
    const payer = this.#subject(owner, true);
    if (sourceSelfId !== null) throw new ProtocolRejection('valence withdrawal takes no source in V1');
    if (reference.withdrawDuringHold === 'refuse') this.#requireActivity(owner);
    if (reference.withdrawal === 'burn-one-liquid' && payer.liquidFacy < 1) throw new ProtocolRejection('insufficient valence withdrawal burn');
    const active = record.pairRelations.map(id => this.#guaranteeRecords.get(id)).filter(relation => relation.status === 'active');
    if (active.length) this.guarantees.assertCapacity();
    if (reference.withdrawal === 'burn-one-liquid') { payer.liquidFacy--; this.#burned++; }
    record.status = 'withdrawn';
    record.closedAt = this.now;
    this.#openValences.delete(this.#valenceKey(owner, record.counterpart));
    this.#ownedValences.get(owner).delete(valenceId);
    this.#event('valence-withdrawn', { valence: valenceId, owner, burned: reference.withdrawal === 'burn-one-liquid' ? 1 : 0 });
    for (const relation of active) this.#deactivateGuarantee(relation, owner,
      this.policy.linkBreakXp === 'revoke' && (reference.pairEndXp === 'both-relations' || relation.guarantor === owner));
  }
  guaranteeRelations() { return [...this.#guaranteeRecords.values()].map(value => Object.freeze({ ...value })); }
  events() { return [...this.#events]; }
  disputeStakes() { return [...this.#disputeStakes.values()].map(value => Object.freeze({ ...value })); }
  // Trusted execution port: admission/merits belong to the controller, not this activity index.
  previewDisputeParticipation(caseId, subjects) {
    if (this.vouching !== null) throw new ProtocolRejection('D77 vouching participation requires an explicit reference');
    if (typeof caseId !== 'string' || !caseId.length || this.#disputeParticipations.has(caseId)) throw new ProtocolRejection('invalid or repeated participation case');
    if (!Array.isArray(subjects) || subjects.length < 2 || new Set(subjects).size !== subjects.length) throw new ProtocolRejection('participation requires distinct case subjects');
    for (const id of subjects) this.#subject(id, true);
    return Object.freeze({ caseId, subjects: Object.freeze([...subjects]) });
  }
  beginDisputeParticipation(caseId, subjects) {
    const plan = this.previewDisputeParticipation(caseId, subjects);
    this.#disputeParticipations.set(caseId, { ...plan, openedAt: this.now, closedAt: null });
    for (const id of plan.subjects) {
      if (!this.#activityCasesBySubject.has(id)) this.#activityCasesBySubject.set(id, new Set());
      this.#activityCasesBySubject.get(id).add(caseId);
    }
    this.#event('dispute-participation-started', plan);
  }
  previewDisputeParticipant(caseId, subject) {
    const record = this.#disputeParticipations.get(caseId);
    if (!record || record.closedAt !== null) throw new ProtocolRejection('participation case is not open');
    this.#subject(subject, true);
    if (record.subjects.includes(subject)) throw new ProtocolRejection('subject already participates in case');
    return Object.freeze({ caseId, subject });
  }
  addDisputeParticipant(caseId, subject) {
    const plan = this.previewDisputeParticipant(caseId, subject), record = this.#disputeParticipations.get(caseId);
    record.subjects = Object.freeze([...record.subjects, subject]);
    if (!this.#activityCasesBySubject.has(subject)) this.#activityCasesBySubject.set(subject, new Set());
    this.#activityCasesBySubject.get(subject).add(caseId);
    this.#event('dispute-participant-joined', plan);
  }
  endDisputeParticipation(caseId) {
    const record = this.#disputeParticipations.get(caseId);
    if (!record || record.closedAt !== null) throw new ProtocolRejection('participation case is not open');
    record.closedAt = this.now;
    for (const id of record.subjects) {
      const cases = this.#activityCasesBySubject.get(id);
      cases.delete(caseId);
      if (!cases.size) this.#activityCasesBySubject.delete(id);
    }
    this.#event('dispute-participation-ended', { caseId });
  }
  disputeParticipations() { return [...this.#disputeParticipations.values()].map(record => Object.freeze({ ...record, subjects: Object.freeze([...record.subjects]) })); }
  #requireActivity(id) {
    if (this.#activityCasesBySubject.has(id)) throw new ProtocolRejection('open-dispute activity restriction');
  }
  #requireVouching() {
    if (this.vouching === null) throw new ProtocolRejection('experimental vouching is disabled');
    return this.vouching;
  }
  vouchCommitments() { return [...this.#vouches.values()].map(value => Object.freeze({ ...value })); }
  #vouchOccupies(record) {
    return this.now < record.expiresAt && (this.vouching.reference.exitSlot === 'retain-until-V' || record.exitedAt === null);
  }
  vouchCapacity(voucher) {
    const { K, T } = this.#requireVouching();
    this.#subject(voucher);
    const used = [...this.#vouches.values()].filter(record => record.voucher === voucher && this.#vouchOccupies(record)).length;
    const last = this.#lastVouchAt.get(voucher);
    return Object.freeze({ limit: K, used, free: K - used,
      cooldownRemainingHours: last === undefined ? 0 : Math.max(0, T * DAY - (this.now - last)) });
  }
  // A funded reservation only: no membership, graph edge, Standing or XP is granted here.
  commitVouch(voucher, target) {
    const { B, V } = this.#requireVouching();
    const payer = this.#subject(voucher, true);
    if (typeof target !== 'string' || !target.length || target === voucher) throw new ProtocolRejection('vouch requires a distinct target reference');
    if (this.#subjects.has(target)) this.#subject(target, true);
    const capacity = this.vouchCapacity(voucher);
    if (capacity.cooldownRemainingHours > 0) throw new ProtocolRejection('vouch cooldown after use');
    if (capacity.free < 1) throw new ProtocolRejection('no probation slot');
    if ([...this.#vouches.values()].some(record => record.voucher === voucher && record.target === target && this.now < record.expiresAt)) throw new ProtocolRejection('overlapping vouch commitment');
    if (payer.liquidFacy < B) throw new ProtocolRejection('insufficient liquid vouch bond');
    const expiresAt = this.now + V * DAY;
    natural(expiresAt, 'probation endpoint'); natural(this.#vouchVault + B, 'vouch vault');
    const id = this.#id('vouch');
    payer.liquidFacy -= B;
    this.#vouchVault += B;
    this.#vouches.set(id, { id, voucher, target, committedAt: this.now, expiresAt, exitedAt: null,
      bond: B, bondRemaining: B, slashed: 0, refunded: 0, bondStatus: 'reserved', releasedAt: null, clearanceId: null });
    this.#lastVouchAt.set(voucher, this.now);
    this.#event('vouch-committed', { vouch: id, voucher, target, bond: B, expiresAt });
    return id;
  }
  vouchAdmissions() { return [...this.#vouchAdmissions.values()].map(value => Object.freeze({ ...value,
    vouches: Object.freeze([...value.vouches]), guarantors: Object.freeze([...value.guarantors]), relations: Object.freeze([...value.relations]) })); }
  // The target's trusted acceptance call supplies consent; cryptographic identity and merits are outside this reference.
  admitVouched(target, vouchIds) {
    if (this.vouchAdmission === null) throw new ProtocolRejection('experimental vouch admission is disabled');
    const { c, reference } = this.vouchAdmission;
    if (typeof target !== 'string' || !target.length || this.#subjects.has(target)
      || this.lineage.hasNode(target) || this.guarantees.hasNode(target)) throw new ProtocolRejection('vouch admission requires a new canonical subject');
    if (!Array.isArray(vouchIds) || vouchIds.length !== c) throw new ProtocolRejection('vouch admission requires exactly c distinct commitments');
    const ids = [...vouchIds];
    if (ids.some(id => typeof id !== 'string' || !id.length) || new Set(ids).size !== c) throw new ProtocolRejection('vouch admission requires exactly c distinct commitments');
    const records = ids.map(id => this.#vouches.get(id));
    if (records.some(record => !record || record.target !== target || record.exitedAt !== null || this.now >= record.expiresAt
      || record.bondStatus !== 'reserved' || record.bondRemaining !== record.bond || this.#pendingVouchBondCases.has(record.id)
      || this.#vouchRelations.has(record.id))) throw new ProtocolRejection('vouch admission requires live funded target commitments');
    if (new Set(records.map(record => record.voucher)).size !== c) throw new ProtocolRejection('vouch admission requires distinct voucher subjects');
    for (const record of records) this.#subject(record.voucher, true);
    records.sort((a, b) => idOrder(a.voucher, b.voucher));
    this.lineage.assertCapacity({ revisions: 1, edgeIds: 0 });
    this.guarantees.assertCapacity({ revisions: c + 1, edgeIds: c });
    // All parties, backing and graph capacity are validated before any ID/node/edge/event mutation.
    this.#addSubject(target);
    const id = this.#id('vouch-admission'), relations = [];
    for (const record of records) {
      const relationId = this.#id('guarantee');
      this.guarantees.addEdge(record.voucher, target);
      this.#guaranteeRecords.set(relationId, { id: relationId, guarantor: record.voucher, guaranteed: target,
        proposedAt: record.committedAt, activatedAt: this.now, endedAt: null, status: 'active', vouch: record.id });
      this.#vouchRelations.set(record.id, relationId);
      relations.push(relationId);
      this.#event('guarantee-activated', { relation: relationId, vouch: record.id });
    }
    this.#vouchAdmissions.set(target, { id, subject: target, acceptedAt: this.now,
      vouches: records.map(record => record.id), guarantors: records.map(record => record.voucher), relations, reference });
    this.#event('vouch-admitted', { admission: id, subject: target, vouches: Object.freeze(records.map(record => record.id)) });
    return id;
  }
  exitVouch(actor, id) {
    this.#requireVouching();
    this.#subject(actor);
    const record = this.#vouches.get(id), relation = this.#guaranteeRecords.get(this.#vouchRelations.get(id));
    if (!record || (actor !== record.voucher && !(relation && actor === record.target)) || record.exitedAt !== null
      || (this.now >= record.expiresAt && relation?.status !== 'active')) throw new ProtocolRejection('no live own vouch commitment');
    if (relation) {
      if (relation.status !== 'active') throw new ProtocolRejection('vouch relation is not active');
      this.guarantees.assertCapacity();
    }
    record.exitedAt = this.now;
    if (relation) this.#deactivateGuarantee(relation, actor);
    this.#event('vouch-exited', { vouch: id, voucher: record.voucher, ...(relation ? { actor } : {}) });
  }
  // Trusted external clearance, not case access/adjudication or automatic expiry of pending liability.
  releaseVouchBond(id, clearance) {
    this.#requireVouching();
    if (!clearance || typeof clearance !== 'object' || Array.isArray(clearance) || Object.keys(clearance).sort().join() !== 'clear,clearanceId') throw new TypeError('vouch release requires clearanceId and supplied clear=true');
    const { clearanceId, clear } = clearance;
    if (clear !== true || typeof clearanceId !== 'string' || !clearanceId.length) throw new TypeError('vouch release requires clearanceId and supplied clear=true');
    const record = this.#vouches.get(id);
    if (!record || record.bondStatus !== 'reserved') throw new ProtocolRejection('vouch bond is not reserved');
    if (this.#pendingVouchBondCases.has(id)) throw new ProtocolRejection('pending vouch bond case blocks refund');
    if (this.now < record.expiresAt) throw new ProtocolRejection('vouch bond remains locked until V');
    const owner = this.#subject(record.voucher), amount = record.bondRemaining;
    natural(owner.liquidFacy + amount, 'vouch refund balance');
    this.#vouchVault -= amount;
    owner.liquidFacy += amount;
    record.bondRemaining = 0;
    record.refunded = amount;
    record.bondStatus = 'released';
    record.releasedAt = this.now;
    record.clearanceId = clearanceId;
    this.#event('vouch-bond-released', { vouch: id, voucher: record.voucher, amount, clearanceId: record.clearanceId });
    return amount;
  }
  #vouchCaseSnapshot(record) { return Object.freeze({ ...record,
    transfers: Object.freeze(record.transfers.map(transfer => Object.freeze({ ...transfer }))) }); }
  vouchBondCases() { return [...this.#vouchBondCases.values()].map(record => this.#vouchCaseSnapshot(record)); }
  // Trusted custody request: access, covered acts, late-case admissibility and merits belong to a future case layer.
  openVouchBondCase(id, options) {
    this.#requireVouching();
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).join() !== 'caseId') throw new TypeError('vouch bond case requires only caseId');
    const { caseId } = options;
    if (typeof caseId !== 'string' || !caseId.length) throw new TypeError('vouch bond case requires a case ID');
    const record = this.#vouches.get(id), key = JSON.stringify([id, caseId]);
    if (!record || record.bondStatus !== 'reserved') throw new ProtocolRejection('vouch bond is not reserved');
    if (this.#vouchBondCases.has(key)) throw new ProtocolRejection('vouch bond case already recorded');
    if (this.#pendingVouchBondCases.has(id)) throw new ProtocolRejection('overlapping vouch bond cases require an explicit ordering contract');
    const value = { vouch: id, caseId, status: 'pending', openedAt: this.now, availableAtOpen: record.bondRemaining,
      resolvedAt: null, upheld: null, amount: 0, burned: 0, transfers: [] };
    this.#vouchBondCases.set(key, value);
    this.#pendingVouchBondCases.set(id, key);
    this.#event('vouch-bond-case-opened', { vouch: id, caseId, available: record.bondRemaining });
    return this.#vouchCaseSnapshot(value);
  }
  resolveVouchBondCase(id, decision) {
    this.#requireVouching();
    if (!decision || typeof decision !== 'object' || Array.isArray(decision) || Object.keys(decision).sort().join() !== 'burn,caseId,transfers,upheld') throw new TypeError('vouch bond verdict requires caseId, upheld, burn and transfers');
    const { caseId, upheld, burn, transfers } = decision;
    if (typeof caseId !== 'string' || !caseId.length || typeof upheld !== 'boolean' || !Array.isArray(transfers)) throw new TypeError('vouch bond requires a supplied verdict/allocation, not truth');
    natural(burn, 'vouch bond burn');
    const key = JSON.stringify([id, caseId]), verdict = this.#vouchBondCases.get(key), record = this.#vouches.get(id);
    if (!verdict || verdict.status !== 'pending' || this.#pendingVouchBondCases.get(id) !== key || record?.bondStatus !== 'reserved') throw new ProtocolRejection('vouch bond case is not pending');
    let amount = burn;
    const recipients = new Set(), payouts = [];
    for (const transfer of [...transfers]) {
      if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer) || Object.keys(transfer).sort().join() !== 'amount,recipient') throw new TypeError('vouch bond transfer requires recipient and amount');
      const { recipient, amount: value } = transfer;
      if (typeof recipient !== 'string' || !recipient.length || recipients.has(recipient)) throw new ProtocolRejection('vouch bond recipients must be distinct known subjects');
      natural(value, 'vouch bond transfer', 1);
      const receiver = this.#subject(recipient);
      natural(receiver.liquidFacy + value, 'vouch bond recipient balance');
      natural(amount + value, 'vouch bond allocation');
      amount += value;
      recipients.add(recipient);
      payouts.push({ recipient, amount: value });
    }
    if (!upheld && amount !== 0) throw new ProtocolRejection('rejected vouch bond verdict cannot debit funds');
    if (amount > record.bondRemaining) throw new ProtocolRejection('vouch bond debit exceeds remaining backing');
    natural(this.#burned + burn, 'burned FACY');
    natural(this.#vouchVault - amount, 'vouch vault');
    payouts.sort((a, b) => idOrder(a.recipient, b.recipient));
    // All value/recipient/coverage bounds precede the first mutation. No debt, XP or identity consequence is implied.
    this.#vouchVault -= amount;
    this.#burned += burn;
    record.bondRemaining -= amount;
    record.slashed += amount;
    for (const payout of payouts) {
      this.#subject(payout.recipient).liquidFacy += payout.amount;
      this.#event('facy-transferred', { from: record.voucher, to: payout.recipient, amount: payout.amount, memo: 'vouch-bond-settlement' });
    }
    Object.assign(verdict, { status: 'resolved', resolvedAt: this.now, upheld, amount, burned: burn, transfers: payouts });
    this.#pendingVouchBondCases.delete(id);
    this.#event('vouch-bond-case-resolved', { vouch: id, caseId, upheld, amount, burned: burn });
    return this.#vouchCaseSnapshot(verdict);
  }
  advanceTo(hour) {
    natural(hour, 'hour');
    if (hour < this.now) throw new ProtocolRejection('simulation time cannot move backwards');
    if (this.policy.xpFinality === 'maturity') {
      const due = [...this.#xpMaturities].filter(act => act.recordedAt + DAY <= hour);
      for (const act of due) {
        if (act.disputeLock !== null) throw new ProtocolRejection('frozen maturity requires an explicit XP contract');
        if (act.debtReserved || this.#subject(act.subject).debt > 0) throw new ProtocolRejection('debt/maturity ordering requires an explicit contract');
        if (act.xpRecipients.some(id => this.#subject(id).identityStatus !== 'accepted')) throw new ProtocolRejection('changed identity at maturity requires an eligibility contract');
      }
      for (const act of due) { this.#now = act.recordedAt + DAY; this.#credit(act); }
    }
    this.#now = hour;
    this.#settleDebtReservations();
    this.#observeBootstrap();
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
    this.#requireLegacyGuarantees();
    this.#subject(guarantor, true);
    this.#subject(guaranteed, true);
    this.#requireActivity(guarantor);
    if (guarantor === guaranteed || this.guarantees.edge(guarantor, guaranteed)) throw new ProtocolRejection('invalid or duplicate guarantee');
    const id = this.#id('guarantee');
    this.#guaranteeRecords.set(id, { id, guarantor, guaranteed, proposedAt: this.now, activatedAt: null, endedAt: null, status: 'proposed' });
    this.#event('guarantee-proposed', { relation: id, guarantor, guaranteed });
    return id;
  }
  confirmGuarantee(actor, relationId) {
    this.#requireLegacyGuarantees();
    const relation = this.#guaranteeRecords.get(relationId);
    if (!relation || relation.status !== 'proposed' || relation.guaranteed !== actor) throw new ProtocolRejection('no matching guarantee proposal');
    const payer = this.#subject(relation.guarantor, true);
    this.#subject(actor, true);
    this.#requireActivity(relation.guarantor);
    this.#requireActivity(actor);
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
    if (relation.valencePair !== undefined) throw new ProtocolRejection('valence pairs end only through withdrawValence');
    if (relation.vouch !== undefined) return this.exitVouch(actor, relation.vouch);
    const payer = this.#subject(actor, true);
    if (payer.liquidFacy < 1) throw new ProtocolRejection('insufficient link-break fee');
    this.guarantees.assertCapacity();
    payer.liquidFacy--;
    this.#fees++;
    this.#deactivateGuarantee(relation, actor);
  }
  #deactivateGuarantee(relation, actor, revoke = this.policy.linkBreakXp === 'revoke') {
    this.guarantees.removeEdge(relation.guarantor, relation.guaranteed);
    relation.status = 'ended';
    relation.endedAt = this.now;
    if (revoke) {
      const guarantor = this.#subject(relation.guarantor);
      for (const { act, receipt } of this.#xpByRecipient.get(relation.guarantor)) {
        if (act.subject !== relation.guaranteed || act.xpCredit.revokedAt !== null || receipt.revokedAt !== null) continue;
        receipt.revokedAt = this.now;
        receipt.revocation = 'guarantee-ended';
      }
      this.#replayXp(guarantor);
    }
    this.#event('guarantee-ended', { relation: relation.id, actor });
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
  #computeXp(subject) {
    let xp = 0, halvings = 0;
    for (const { act, receipt } of this.#xpByRecipient.get(subject.id)) {
      if (act.xpCredit.revokedAt !== null || receipt.revokedAt !== null) continue;
      const elapsed = receipt.halvingsBefore - halvings;
      xp = (elapsed >= 53 ? 0 : Math.floor(xp / 2 ** elapsed)) + 1;
      halvings = receipt.halvingsBefore;
    }
    const elapsed = subject.xpHalvings - halvings;
    return elapsed >= 53 ? 0 : Math.floor(xp / 2 ** elapsed);
  }
  #replayXp(subject) { subject.xp = this.#computeXp(subject); }
  #revokeXp(act, reason) {
    if (act.xpCredit === null || act.xpCredit.revokedAt !== null) return false;
    act.xpCredit.revokedAt = this.now;
    act.xpCredit.revocation = reason;
    return true;
  }
  #credit(act) {
    if (act.xpCredit !== null) return;
    if (this.policy.xpFinality === 'maturity' && this.now - act.recordedAt < DAY) throw new ProtocolRejection('ordinary XP is not mature');
    this.#xpMaturities.delete(act);
    act.xpCredited = true;
    act.xpCredit = { at: this.now, revokedAt: null, revocation: null, recipients: [] };
    for (const id of act.xpRecipients) {
      // Legacy eligibility is unchanged; the receipt records actual credit, not the candidate list.
      if (this.policy.xpFinality !== 'maturity' && this.policy.linkBreakXp === 'revoke' && id !== act.subject && !this.guarantees.edge(id, act.subject)) continue;
      const subject = this.#subject(id);
      const receipt = { subject: id, role: id === act.subject ? 'subject' : 'guarantor', halvingsBefore: subject.xpHalvings,
        revokedAt: null, revocation: null };
      act.xpCredit.recipients.push(receipt);
      this.#xpByRecipient.get(id).push({ act, receipt });
      subject.xp++;
    }
  }
  createSelfId(subjectId, artifactId, faceIndex = 0) {
    const subject = this.#subject(subjectId, true);
    this.#requireActivity(subjectId);
    const artifact = this.#artifacts.get(artifactId);
    if (!artifact || this.now - artifact.registeredAt > DAY) throw new ProtocolRejection('artifact is unknown or outside reference window');
    natural(faceIndex, 'faceIndex');
    if (faceIndex >= artifact.faceCount) throw new ProtocolRejection('faceIndex outside modeled detector output');
    if (subject.lastRewardAt !== null && this.now - subject.lastRewardAt < DAY) throw new ProtocolRejection('rolling 24-hour reward limit');
    if (this.policy.artifactReuse === 'once-per-subject' && this.#subjectActs.get(subjectId).some(id => this.#acts.get(id).artifact === artifactId)) throw new ProtocolRejection('subject has already used this artifact');
    const councilPath = this.#requireSelfIdSupport(subjectId);
    const guarantors = this.eligibleGuarantors(subjectId);
    const id = this.#id('self-id');
    const faceRef = JSON.stringify([artifactId, 'abstract-detector-v1', faceIndex]);
    const claims = this.#claims.get(faceRef) ?? [];
    const collision = claims.some(claim => this.#acts.get(claim).subject !== subjectId);
    const xpRecipients = this.ablations.withholdGuarantorXp ? [subjectId] : [subjectId, ...guarantors];
    const reservedDebt = this.#subjectActs.get(subjectId).filter(actId => this.#acts.get(actId).debtReserved).length;
    const debtReserved = this.policy.debtRecovery === 'reserve-until-mature' && subject.debt > reservedDebt;
    const chain = this.#subjectActs.get(subjectId);
    const act = { id, subject: subjectId, chainIndex: chain.length + 1, previousSelfId: chain.at(-1) ?? null,
      artifact: artifactId, faceIndex, recordedAt: this.now, guarantors, xpRecipients, xpCredited: false, xpCredit: null, status: 'unspent', disposition: null, disputeLock: null, collision, debtReserved,
      ...(councilPath === null ? {} : { councilPath }) };
    if (collision) for (const claim of claims) this.#acts.get(claim).collision = true;
    claims.push(id);
    this.#claims.set(faceRef, claims);
    this.#acts.set(id, act);
    if (this.policy.xpFinality === 'maturity') this.#xpMaturities.add(act);
    if (debtReserved) this.#debtReservations.add(act);
    chain.push(id);
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
      this.#xpMaturities.delete(act);
      if (this.#revokeXp(act, 'self-id-cancelled')) for (const receipt of act.xpCredit.recipients) this.#replayXp(this.#subject(receipt.subject));
    } else this.#credit(act);
  }
  cancelSelfId(actor, selfIdId) {
    this.#subject(actor, true);
    const act = this.#act(selfIdId);
    if (actor === act.subject) {
      if (this.now - act.recordedAt >= DAY) throw new ProtocolRejection('original Self-ID veto expired at24h');
      this.#dispose(act, 'cancelled', 'author-cancelled');
      this.#event('self-id-self-cancelled', { selfId: selfIdId, author: actor });
      return;
    }
    const guarantor = actor;
    if (this.policy.xpFinality === 'maturity' && this.now - act.recordedAt >= DAY) throw new ProtocolRejection('original Self-ID veto expired at24h');
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
    if (this.valences !== null) { this.#requireValenceInvitations(); return this.#createValenceInvitation(creatorId, selfIdId, target); }
    this.#requireActivity(creatorId);
    if (this.vouchAdmission !== null) throw new ProtocolRejection('vouch admission reference disables invitation admission');
    if (this.invitationLimit !== null) return this.#createLimitedInvitation(creatorId, selfIdId, target);
    const creator = this.#subject(creatorId, true);
    const act = this.#act(selfIdId);
    this.#requireUnspent(act);
    if (act.subject !== creator.id || this.now - act.recordedAt < this.policy.spendMaturityHours) throw new ProtocolRejection('invitation requires own mature Emitter right');
    if (act.debtReserved) throw new ProtocolRejection('emission is reserved for debt recovery');
    if (this.eligibleGuarantors(creatorId).length < this.requiredGuarantors()) throw new ProtocolRejection('insufficient eligible guarantors');
    if (typeof target !== 'string' || !target.length || this.#subjects.has(target)) throw new ProtocolRejection('invitation must target a new subject');
    const id = this.#id('invitation');
    this.#dispose(act, 'consumed', 'invitation');
    this.#invitations.set(id, { id, creator: creatorId, sourceSelfId: selfIdId, target, guarantors: [...this.eligibleGuarantors(creatorId)], createdAt: this.now, acceptedAt: null, status: 'open' });
    this.#event('invitation-created', { invitation: id, creator: creatorId, target });
    return id;
  }
  #createLimitedInvitation(creatorId, sourceIds, target) {
    this.#subject(creatorId, true);
    const { P, b } = this.invitationLimit;
    const last = this.#lastInvitationAt.get(creatorId);
    if (P !== null && last !== undefined && this.now - last < P * DAY) throw new ProtocolRejection('invitation cooldown after use');
    const ids = Array.isArray(sourceIds) ? Array.from(sourceIds) : sourceIds === null ? [] : [sourceIds];
    if (ids.length !== b || new Set(ids).size !== ids.length) throw new ProtocolRejection('invitation requires exactly b distinct own mature sources');
    const acts = ids.map(id => this.#act(id));
    for (const act of acts) {
      this.#requireUnspent(act);
      if (act.subject !== creatorId || this.now - act.recordedAt < Math.max(DAY, this.policy.spendMaturityHours)) throw new ProtocolRejection('invitation requires own mature Emitter right');
      if (act.debtReserved) throw new ProtocolRejection('emission is reserved for debt recovery');
    }
    const guarantors = this.eligibleGuarantors(creatorId);
    if (guarantors.length < this.requiredGuarantors()) throw new ProtocolRejection('insufficient eligible guarantors');
    if (typeof target !== 'string' || !target.length || this.#subjects.has(target)) throw new ProtocolRejection('invitation must target a new subject');
    const id = this.#id('invitation');
    for (const act of acts) this.#dispose(act, 'consumed', 'invitation');
    this.#invitations.set(id, { id, creator: creatorId, sourceSelfId: ids[0] ?? null, sourceSelfIds: ids,
      invitationLimit: this.invitationLimit, target, guarantors, createdAt: this.now, acceptedAt: null, status: 'open' });
    this.#lastInvitationAt.set(creatorId, this.now);
    this.#event('invitation-created', { invitation: id, creator: creatorId, target, experimental: true, burnedFacy: b, cooldownDays: P });
    return id;
  }
  acceptInvitation(invitationId, subjectId) {
    if (this.valences !== null) { this.#requireValenceInvitations(); return this.#acceptValenceInvitation(invitationId, subjectId); }
    if (this.vouchAdmission !== null) throw new ProtocolRejection('vouch admission reference disables invitation admission');
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
    const pendingStatus = this.valences === null ? 'open' : 'pending';
    if (!invitation || invitation.status !== pendingStatus || this.now - invitation.createdAt >= this.policy.invitationFreezeHours) throw new ProtocolRejection('invitation is not cancellable');
    if (!this.guarantees.edge(guarantor, invitation.creator)) throw new ProtocolRejection('no authority to cancel invitation');
    if (this.ablations.disableInvitationVeto) throw new ProtocolRejection('invitation veto disabled by counterfactual ablation');
    invitation.status = 'cancelled';
    if (this.valences !== null) { invitation.endedAt = this.now; this.#releaseInvitationUnits(invitation); }
    for (const id of invitation.sourceSelfIds ?? [invitation.sourceSelfId]) {
      const act = this.#act(id);
      act.disposition = 'invitation-cancelled';
      if (this.policy.xpFinality !== 'maturity' && this.#revokeXp(act, 'invitation-cancelled')) for (const receipt of act.xpCredit.recipients) this.#replayXp(this.#subject(receipt.subject));
    }
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
    if (this.policy.xpFinality === 'maturity' && act.xpCredit !== null) throw new ProtocolRejection('post-maturity XP freeze requires an explicit contract');
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
  #collectFacy(subject, collected, debtAdded) {
    subject.liquidFacy -= collected;
    subject.debt += debtAdded;
    this.#burned += collected;
  }
  penalize(id, { fine = 0, halveXp = true } = {}) {
    natural(fine, 'fine');
    if (typeof halveXp !== 'boolean') throw new TypeError('halveXp must be boolean');
    const subject = this.#subject(id);
    const collected = Math.min(subject.liquidFacy, fine);
    const debtAdded = fine - collected;
    natural(this.ledger().debt + debtAdded, 'aggregate debt');
    if (halveXp) natural(subject.xpHalvings + 1, 'XP halvings');
    this.#collectFacy(subject, collected, debtAdded);
    if (halveXp) {
      subject.xpHalvings++;
      subject.xp = Math.floor(subject.xp / 2);
    }
    this.#event('penalty-applied', { subject: id, fine, collected, debtAdded, halveXp });
    return { collected, debtAdded };
  }
  // Trusted sanction inputs, not admissibility, depth calculation or a verdict oracle.
  applySelfIdPenalty(selfId, { caseId, fine } = {}) {
    const act = this.#act(selfId);
    natural(fine, 'Self-ID fine', 1);
    return this.#applyActPenalty('self-id', act.id, act.subject, act.guarantors, caseId, fine, false);
  }
  applyInvitationPenalty(invitationId, { caseId, fine } = {}) {
    const act = this.#invitations.get(invitationId);
    if (!act) throw new ProtocolRejection('unknown invitation');
    natural(fine, 'invitation fine');
    return this.#applyActPenalty('invitation', act.id, act.creator, act.guarantors, caseId, fine, true);
  }
  #applyActPenalty(kind, act, owner, guarantors, caseId, fine, halveGuarantors) {
    if (typeof caseId !== 'string' || !caseId.length) throw new ProtocolRejection('act penalty requires a case ID');
    if (this.#actPenalties.has(caseId)) throw new ProtocolRejection('act penalty case already applied');
    const parties = [...new Set([owner, ...guarantors])];
    let debt = BigInt(this.ledger().debt);
    for (const id of parties) {
      const subject = this.#subject(id);
      debt += BigInt(Math.max(0, fine - subject.liquidFacy));
      if (id === owner || halveGuarantors) natural(subject.xpHalvings + 1, 'XP halvings');
    }
    if (debt > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('act penalty would overflow aggregate debt');
    const penalties = parties.map(id => ({ subject: id, halveXp: id === owner || halveGuarantors,
      ...this.penalize(id, { fine, halveXp: id === owner || halveGuarantors }) }));
    const record = { caseId, kind, act, owner, at: this.now, fine, parties, penalties };
    this.#actPenalties.set(caseId, record);
    this.#event('act-penalty-applied', { caseId, kind, act });
    return this.#penaltySnapshot(record);
  }
  #resolutionSnapshot(value) {
    return Object.freeze({ ...value, recovery: Object.freeze({ ...value.recovery }),
      acts: Object.freeze(value.acts.map(act => Object.freeze({ ...act, recipients: Object.freeze([...act.recipients]) }))),
      xpChanges: Object.freeze(value.xpChanges.map(change => Object.freeze({ ...change }))) });
  }
  selfIdResolutions() { return [...this.#selfIdResolutions.values()].map(value => this.#resolutionSnapshot(value)); }
  // Trusted supplied verdict only: case access, merits, stakes and punitive fines belong to the caller.
  previewSelfIdResolution(selfId, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['caseId', 'initiator', 'upheld'].includes(key))) throw new TypeError('Self-ID resolution requires only caseId, initiator and upheld');
    const { caseId, initiator, upheld } = options;
    if (typeof upheld !== 'boolean') throw new TypeError('Self-ID resolution requires a supplied reference verdict, not truth');
    if (typeof caseId !== 'string' || !caseId.length) throw new ProtocolRejection('Self-ID resolution requires a case ID');
    if (this.#selfIdResolutions.has(caseId)) throw new ProtocolRejection('Self-ID resolution case already applied');
    const source = this.#act(selfId);
    this.#subject(initiator);
    const voided = act => act.status === 'cancelled' || act.disposition?.endsWith('+voided');
    if (voided(source)) throw new ProtocolRejection('Self-ID source is already corrected or voided');
    if (source.disputeLock !== null) throw new ProtocolRejection('locked Self-ID resolution requires an explicit case contract');
    const chain = this.#subjectActs.get(source.subject);
    const kind = initiator === source.subject ? 'self-correction' : 'external-chain-cut';
    const affected = !upheld ? [] : kind === 'self-correction' ? [source]
      : chain.slice(source.chainIndex - 1).map(id => this.#acts.get(id)).filter(act => !voided(act));
    for (const act of affected) {
      if (act.disputeLock !== null) throw new ProtocolRejection('locked Self-ID resolution requires an explicit case contract');
      if (act.debtReserved || act.disposition === 'debt-repayment') throw new ProtocolRejection('debt-used Self-ID correction requires an explicit restoration contract');
    }
    const acts = affected.map(act => ({ selfId: act.id, previousStatus: act.status, previousDisposition: act.disposition,
      recovery: act.status === 'unspent' ? 'emitter-right' : act.status === 'converted' ? 'liquid-or-debt' : 'already-burned',
      recipients: (act.xpCredit?.recipients ?? []).map(receipt => receipt.subject) }));
    const requestedFromAuthor = acts.filter(act => act.recovery === 'liquid-or-debt').length;
    const collected = Math.min(this.#subject(source.subject).liquidFacy, requestedFromAuthor);
    const debtAdded = requestedFromAuthor - collected;
    if (BigInt(this.ledger().debt) + BigInt(debtAdded) > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Self-ID resolution would overflow aggregate debt');
    return this.#resolutionSnapshot({ caseId, selfId, subject: source.subject, initiator, upheld, kind, at: this.now,
      head: chain.at(-1), acts, recovery: { emitterBurn: acts.filter(act => act.recovery === 'emitter-right').length,
        alreadyBurned: acts.filter(act => act.recovery === 'already-burned').length, requestedFromAuthor, collected, debtAdded },
      accountingPolicy: 'self-id-source-recovery/v1', punitivePenaltiesApplied: false, xpChanges: [] });
  }
  resolveSelfId(selfId, options) {
    const plan = this.previewSelfIdResolution(selfId, options);
    const recipients = new Set(plan.acts.flatMap(act => act.recipients));
    const before = new Map([...recipients].map(id => [id, this.#subject(id).xp]));
    if (plan.recovery.requestedFromAuthor > 0) {
      this.#collectFacy(this.#subject(plan.subject), plan.recovery.collected, plan.recovery.debtAdded);
      this.#event('self-id-source-recovered', { caseId: plan.caseId, subject: plan.subject,
        requested: plan.recovery.requestedFromAuthor, collected: plan.recovery.collected, debtAdded: plan.recovery.debtAdded });
    }
    for (const row of plan.acts) {
      const act = this.#act(row.selfId);
      if (row.recovery === 'emitter-right') { this.#vault--; this.#burned++; }
      act.status = 'cancelled';
      act.disposition = plan.kind === 'self-correction' ? 'self-corrected' : 'adjudicated-void';
      this.#xpMaturities.delete(act);
      this.#revokeXp(act, act.disposition);
    }
    for (const id of recipients) this.#replayXp(this.#subject(id));
    if (plan.acts.length) this.#activityVersion++;
    const record = { ...plan, xpChanges: [...recipients].map(id => ({ subject: id, before: before.get(id), after: this.#subject(id).xp })) };
    this.#selfIdResolutions.set(plan.caseId, record);
    this.#event('self-id-resolved', { caseId: plan.caseId, selfId, initiator: plan.initiator, upheld: plan.upheld, kind: plan.kind });
    return this.#resolutionSnapshot(record);
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
      this.#xpMaturities.delete(act);
      if (act.status === 'unspent') {
        act.status = 'cancelled';
        act.disposition = 'adjudicated-void';
        act.debtReserved = false;
        this.#debtReservations.delete(act);
        this.#vault--;
        this.#burned++;
        burned++;
      } else act.disposition = act.disposition + '+voided';
      if (this.#revokeXp(act, 'adjudicated-void')) for (const recipient of act.xpRecipients) recipients.add(recipient);
    }
    for (const recipient of recipients) this.#replayXp(this.#subject(recipient));
    this.#activityVersion++;
    this.#event('self-id-chain-voided', { subject: id, fromAct, acts: cut.length, burnedRights: burned });
    return { acts: cut.length, burnedRights: burned, xpRecipients: [...recipients] };
  }
  // D33 reference size: D = digits(max(1, activeCount)) stands in for N_verified (OPEN); C = 1 means no formal Council.
  councilTarget() {
    if (this.valences?.reference.councilPaths?.council !== 'd33-active-lookup') return this.policy.councilSize;
    const r = Math.round(Math.sqrt(String(Math.max(1, this.activeCount())).length));
    if (r > 6) throw new ProtocolRejection('D33 Council lookup is OPEN beyond r = 6');
    return [1, 11, 101, 1001, 10001, 100001][r - 1];
  }
  council() {
    const active = this.policy.councilEligibility === 'active';
    const size = this.councilTarget();
    if (this.valences?.reference.councilPaths?.council === 'd33-active-lookup' && size === 1) return [];
    return [...this.#subjects.values()].filter(subject => subject.identityStatus === 'accepted' && (!active || this.isActive(subject.id))).map(subject => ({ id: subject.id, xp: subject.xp }))
      .sort((a, b) => b.xp - a.xp || idOrder(a.id, b.id)).slice(0, size);
  }
  ledger() {
    const subjects = [...this.#subjects.values()];
    return { minted: this.#minted, burned: this.#burned, supply: this.#minted - this.#burned, emitterVault: this.#vault, collector: subjects.reduce((sum, subject) => sum + subject.liquidFacy, 0), feeVault: this.#fees, stakeVault: this.#stakeVault, debt: subjects.reduce((sum, subject) => sum + subject.debt, 0),
      ...(this.vouching === null ? {} : { vouchVault: this.#vouchVault }) };
  }
  #auditValences() {
    const open = new Map(), owned = new Map(), sources = new Set();
    for (const record of this.#valences.values()) {
      if (record.burnSource === null) {
        if (record.origin !== 'genesis-supplied' || !this.roots.includes(record.owner) || !this.roots.includes(record.counterpart)) throw new Error('valence burn invariant failed');
      } else {
        const act = this.#acts.get(record.burnSource);
        if (!act || act.subject !== record.owner || act.status !== 'consumed' || act.disposition !== 'valence-burn' || sources.has(record.burnSource)) throw new Error('valence burn invariant failed');
        sources.add(record.burnSource);
      }
      if ((record.status === 'open') !== (record.closedAt === null)) throw new Error('valence status invariant failed');
      if (record.status !== 'open') continue;
      const key = this.#valenceKey(record.owner, record.counterpart);
      if (open.has(key)) throw new Error('duplicate open valence');
      open.set(key, record.id);
      if (!owned.has(record.owner)) owned.set(record.owner, new Set());
      owned.get(record.owner).add(record.id);
    }
    if (open.size !== this.#openValences.size || [...open].some(([key, id]) => this.#openValences.get(key) !== id)) throw new Error('open valence index invariant failed');
    for (const [subject, ids] of this.#ownedValences) if (ids.size !== (owned.get(subject)?.size ?? 0) || [...ids].some(id => !owned.get(subject).has(id))) throw new Error('owned valence index invariant failed');
    const liveEdges = new Set(), units = new Map(), invitationSources = new Set();
    for (const invitation of this.#invitations.values()) {
      const act = this.#acts.get(invitation.sourceSelfId), counted = ['pending', 'active'].includes(invitation.status);
      if (!act || act.subject !== invitation.creator || act.status !== 'consumed' || invitationSources.has(act.id) || sources.has(act.id)
        || invitation.units.length !== 2 || invitation.units[0] !== invitation.creator || invitation.units[1] !== invitation.target
        || !this.#preregistrations.has(invitation.target)
        || invitation.linkRelations.length !== (['active', 'closed'].includes(invitation.status) ? 2 : 0)
        || this.#subjects.has(invitation.target) !== (this.#preregistrations.get(invitation.target).status === 'admitted')
        || (invitation.status === 'pending' && this.#subjects.has(invitation.target))) throw new Error('valence invitation invariant failed');
      invitationSources.add(act.id);
      if (counted) for (const id of invitation.units) {
        if (!units.has(id)) units.set(id, new Set());
        units.get(id).add(invitation.id);
      }
    }
    if (units.size !== this.#invitationUnits.size || [...units].some(([id, set]) => set.size !== this.#invitationUnits.get(id)?.size
      || [...set].some(value => !this.#invitationUnits.get(id).has(value)))) throw new Error('invitation unit index invariant failed');
    for (const relation of this.#guaranteeRecords.values()) {
      if (relation.valencePair === undefined && relation.invitationLink === undefined) throw new Error('legacy guarantee in valence reference');
      const parents = relation.valencePair !== undefined ? relation.valencePair.map(id => this.#valences.get(id)) : [this.#invitations.get(relation.invitationLink)];
      if (relation.valencePair !== undefined ? !parents.every(record => record.pairRelations.includes(relation.id)) : !parents[0].linkRelations.includes(relation.id)) throw new Error('valence pair invariant failed');
      if (relation.status !== 'active') continue;
      const key = this.#valenceKey(relation.guarantor, relation.guaranteed);
      if (liveEdges.has(key) || !this.guarantees.edge(relation.guarantor, relation.guaranteed)
        || parents.some(record => record.status !== (relation.valencePair !== undefined ? 'open' : 'active'))) throw new Error('valence pair invariant failed');
      liveEdges.add(key);
    }
    if (liveEdges.size !== this.guarantees.edgeCount) throw new Error('valence pair edge count invariant failed');
    for (const id of open.values()) {
      const record = this.#valences.get(id), opposite = this.#openValences.get(this.#valenceKey(record.counterpart, record.owner));
      if (opposite !== undefined && !this.guarantees.edge(record.owner, record.counterpart)) throw new Error('matched valences lack an established pair');
    }
  }
  audit() {
    const ledger = this.ledger();
    const outstanding = [...this.#acts.values()].filter(act => act.status === 'unspent').length;
    const reserved = [...this.#disputeStakes.values()].filter(stake => stake.status === 'reserved').reduce((sum, stake) => sum + stake.amount, 0);
    const vouchReserved = [...this.#vouches.values()].filter(record => record.bondStatus === 'reserved').reduce((sum, record) => sum + record.bondRemaining, 0);
    if (vouchReserved !== this.#vouchVault || reserved !== ledger.stakeVault || outstanding !== ledger.emitterVault
      || ledger.supply !== ledger.emitterVault + ledger.collector + ledger.feeVault + ledger.stakeVault + this.#vouchVault) throw new Error('FACY conservation invariant failed');
    for (const value of Object.values(ledger)) natural(value, 'ledger value');
    const activity = new Map();
    for (const [caseId, record] of this.#disputeParticipations) {
      if (caseId !== record.caseId || record.openedAt > this.now || (record.closedAt !== null && (record.closedAt < record.openedAt || record.closedAt > this.now))
        || record.subjects.length < 2 || new Set(record.subjects).size !== record.subjects.length || record.subjects.some(id => !this.#subjects.has(id))) throw new Error('dispute participation invariant failed');
      if (record.closedAt === null) for (const id of record.subjects) {
        if (!activity.has(id)) activity.set(id, new Set());
        activity.get(id).add(caseId);
      }
    }
    if (activity.size !== this.#activityCasesBySubject.size || [...activity].some(([id, cases]) => cases.size !== this.#activityCasesBySubject.get(id)?.size
      || [...cases].some(caseId => !this.#activityCasesBySubject.get(id).has(caseId)))) throw new Error('dispute activity index invariant failed');
    for (const subject of this.#subjects.values()) {
      natural(subject.xp, 'XP');
      natural(subject.xpHalvings, 'XP halvings');
      if (subject.xp !== this.#computeXp(subject)) throw new Error('XP source/cache invariant failed');
      natural(subject.liquidFacy, 'liquidFacy');
      natural(subject.debt, 'debt');
      const chain = this.#subjectActs.get(subject.id);
      for (const [index, id] of chain.entries()) {
        const act = this.#acts.get(id);
        if (act.subject !== subject.id || act.chainIndex !== index + 1 || act.previousSelfId !== (chain[index - 1] ?? null)) throw new Error('Self-ID personal-chain invariant failed');
      }
    }
    if (this.valences !== null) this.#auditValences();
    if (this.invitationLimit !== null) {
      const last = new Map(), sources = new Set();
      const { P, b } = this.invitationLimit;
      for (const invitation of this.#invitations.values()) {
        const previous = last.get(invitation.creator);
        if (invitation.invitationLimit !== this.invitationLimit || invitation.sourceSelfIds.length !== b
          || invitation.sourceSelfId !== (invitation.sourceSelfIds[0] ?? null)
          || (P !== null && previous !== undefined && invitation.createdAt - previous < P * DAY)) throw new Error('invitation limit invariant failed');
        for (const id of invitation.sourceSelfIds) {
          const act = this.#acts.get(id);
          if (!act || act.subject !== invitation.creator || act.status === 'unspent' || sources.has(id)) throw new Error('invitation funding invariant failed');
          sources.add(id);
        }
        last.set(invitation.creator, invitation.createdAt);
      }
      if (last.size !== this.#lastInvitationAt.size || [...last].some(([id, at]) => this.#lastInvitationAt.get(id) !== at)) throw new Error('invitation cooldown index invariant failed');
    }
    if (this.vouching !== null) {
      const last = new Map(), pairs = new Map();
      for (const record of this.#vouches.values()) {
        const previous = last.get(record.voucher), pair = JSON.stringify([record.voucher, record.target]);
        if (!this.#subjects.has(record.voucher) || typeof record.target !== 'string' || !record.target.length || record.target === record.voucher
          || record.bond !== this.vouching.B || !Number.isSafeInteger(record.committedAt) || record.committedAt < 0 || record.committedAt > this.now
          || record.expiresAt !== record.committedAt + this.vouching.V * DAY || !Number.isSafeInteger(record.expiresAt)
          || (previous !== undefined && record.committedAt - previous < this.vouching.T * DAY)
          || (pairs.has(pair) && record.committedAt < pairs.get(pair))
          || (record.exitedAt !== null && (!Number.isSafeInteger(record.exitedAt) || record.exitedAt < record.committedAt || (!this.#vouchRelations.has(record.id) && record.exitedAt >= record.expiresAt) || record.exitedAt > this.now))) throw new Error('vouch commitment invariant failed');
        for (const value of [record.bondRemaining, record.slashed, record.refunded]) natural(value, 'vouch principal');
        if (record.bondRemaining + record.slashed + record.refunded !== record.bond) throw new Error('vouch principal invariant failed');
        if (record.bondStatus === 'reserved') {
          if (record.refunded !== 0 || record.releasedAt !== null || record.clearanceId !== null) throw new Error('vouch custody invariant failed');
        } else if (record.bondStatus !== 'released' || record.bondRemaining !== 0 || !Number.isSafeInteger(record.releasedAt) || record.releasedAt < record.expiresAt || record.releasedAt > this.now
          || typeof record.clearanceId !== 'string' || !record.clearanceId.length) throw new Error('vouch custody invariant failed');
        last.set(record.voucher, record.committedAt);
        pairs.set(pair, record.expiresAt);
      }
      if (last.size !== this.#lastVouchAt.size || [...last].some(([id, at]) => this.#lastVouchAt.get(id) !== at)) throw new Error('vouch cooldown index invariant failed');
      for (const id of last.keys()) if (this.vouchCapacity(id).used > this.vouching.K) throw new Error('vouch capacity invariant failed');
    }
    const pending = new Map(), slashed = new Map();
    for (const [key, verdict] of this.#vouchBondCases) {
      const record = this.#vouches.get(verdict.vouch), prior = slashed.get(verdict.vouch) ?? 0;
      if (!record || key !== JSON.stringify([verdict.vouch, verdict.caseId]) || typeof verdict.caseId !== 'string' || !verdict.caseId.length
        || !Number.isSafeInteger(verdict.openedAt) || verdict.openedAt < record.committedAt || verdict.openedAt > this.now
        || verdict.availableAtOpen !== record.bond - prior) throw new Error('vouch case coverage invariant failed');
      if (verdict.status === 'pending') {
        if (pending.has(verdict.vouch) || record.bondStatus !== 'reserved' || verdict.resolvedAt !== null || verdict.upheld !== null
          || verdict.amount !== 0 || verdict.burned !== 0 || verdict.transfers.length !== 0) throw new Error('vouch pending case invariant failed');
        pending.set(verdict.vouch, key);
      } else {
        if (verdict.status !== 'resolved' || typeof verdict.upheld !== 'boolean' || !Number.isSafeInteger(verdict.resolvedAt)
          || verdict.resolvedAt < verdict.openedAt || verdict.resolvedAt > this.now
          || (record.releasedAt !== null && verdict.resolvedAt > record.releasedAt)) throw new Error('vouch case resolution invariant failed');
        natural(verdict.amount, 'vouch case debit'); natural(verdict.burned, 'vouch case burn');
        const payees = new Set();
        let total = verdict.burned;
        for (const payout of verdict.transfers) {
          if (!this.#subjects.has(payout.recipient) || payees.has(payout.recipient)) throw new Error('vouch case payee invariant failed');
          natural(payout.amount, 'vouch case payout', 1); natural(total + payout.amount, 'vouch case allocation');
          total += payout.amount;
          payees.add(payout.recipient);
        }
        if (total !== verdict.amount || verdict.amount > verdict.availableAtOpen || (!verdict.upheld && verdict.amount !== 0)) throw new Error('vouch case allocation invariant failed');
        slashed.set(verdict.vouch, prior + verdict.amount);
      }
    }
    if (pending.size !== this.#pendingVouchBondCases.size || [...pending].some(([id, key]) => this.#pendingVouchBondCases.get(id) !== key)) throw new Error('vouch pending case index invariant failed');
    for (const record of this.#vouches.values()) if (record.slashed !== (slashed.get(record.id) ?? 0)) throw new Error('vouch debit history invariant failed');
    const backed = new Map();
    for (const admission of this.#vouchAdmissions.values()) {
      if (this.vouchAdmission === null || !this.#subjects.has(admission.subject) || this.#subject(admission.subject).genesis
        || !this.lineage.hasNode(admission.subject) || !this.guarantees.hasNode(admission.subject)
        || !Number.isSafeInteger(admission.acceptedAt) || admission.acceptedAt < 0 || admission.acceptedAt > this.now
        || admission.reference !== this.vouchAdmission.reference || admission.vouches.length !== this.vouchAdmission.c
        || admission.guarantors.length !== admission.vouches.length || admission.relations.length !== admission.vouches.length
        || new Set(admission.guarantors).size !== admission.vouches.length) throw new Error('vouch admission invariant failed');
      for (const [index, id] of admission.vouches.entries()) {
        const record = this.#vouches.get(id), relationId = admission.relations[index], relation = this.#guaranteeRecords.get(relationId);
        if (!record || backed.has(id) || record.target !== admission.subject || record.voucher !== admission.guarantors[index]
          || record.committedAt > admission.acceptedAt || admission.acceptedAt >= record.expiresAt
          || (record.exitedAt !== null && record.exitedAt < admission.acceptedAt)
          || !relation || relation.vouch !== id || relation.guarantor !== record.voucher || relation.guaranteed !== admission.subject
          || relation.proposedAt !== record.committedAt || relation.activatedAt !== admission.acceptedAt || !['active', 'ended'].includes(relation.status)
          || (relation.status === 'active' && (!this.guarantees.edge(record.voucher, admission.subject) || record.exitedAt !== null || relation.endedAt !== null))
          || (relation.status === 'ended' && (record.exitedAt === null || relation.endedAt !== record.exitedAt))) throw new Error('vouch admission backing invariant failed');
        backed.set(id, relationId);
      }
    }
    if (backed.size !== this.#vouchRelations.size || [...backed].some(([id, relation]) => this.#vouchRelations.get(id) !== relation)) throw new Error('vouch relation index invariant failed');
    return ledger;
  }
}
