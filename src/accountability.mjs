// Owns: A bounded, input-driven evidence/sponsor reference and optional causal journal; excludes truth and calibration.
import { ProtocolRejection } from './model.mjs';
import { DisputeStakes } from './dispute-stakes.mjs';
import { ACT_OBSERVATION_RANDOMNESS } from './act-observations.mjs';
import { assessSponsorship, SPONSOR_ASSESSMENT_POLICY } from './sponsor-assessment.mjs';
import { challengeAccess, settleOneStepPosition, enforceIdentityVerdict, preflightIdentityVerdict } from './disputes.mjs';

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + ' must be a non-negative safe integer');
}
function signal(value) {
  if (!value || Object.keys(value).some(key => !['suspicious', 'sourceGroup'].includes(key)) || typeof value.suspicious !== 'boolean'
    || typeof value.sourceGroup !== 'string' || !value.sourceGroup.length) throw new TypeError('signal needs only suspicious and sourceGroup; correctness is evaluator-only');
  return { suspicious: value.suspicious, sourceGroup: value.sourceGroup };
}
export function accountabilitySnapshot(model) {
  return { atHour: model.now, subjects: model.subjects(), ledger: model.audit(), council: model.council(),
    relations: model.guaranteeRelations(), acts: model.selfIds(), events: model.events(), stakes: model.disputeStakes() };
}
function point(model) {
  return { atHour: model.now, subjects: model.subjects(), ledger: model.ledger(), council: model.council().map(member => member.id), events: model.events().length };
}
function changes(before, after) {
  const old = new Map(before.subjects.map(subject => [subject.id, subject]));
  return {
    subjects: after.subjects.flatMap(subject => {
      const previous = old.get(subject.id);
      const delta = Object.fromEntries(['xp', 'liquidFacy', 'debt', 'identityStatus'].filter(key => subject[key] !== previous?.[key]).map(key => [key, { before: previous?.[key] ?? null, after: subject[key] }]));
      return Object.keys(delta).length ? [{ subject: subject.id, ...delta }] : [];
    }),
    ledger: Object.fromEntries(Object.keys(after.ledger).filter(key => after.ledger[key] !== before.ledger[key]).map(key => [key, after.ledger[key] - before.ledger[key]])),
    council: { entered: after.council.filter(id => !before.council.includes(id)), left: before.council.filter(id => !after.council.includes(id)) },
  };
}

export class CausalJournal {
  #limit;
  #sequence = 0;
  #records = [];
  #omitted = 0;
  constructor(limit = 0) {
    integer(limit, 'traceLimit');
    if (limit > 10000) throw new RangeError('traceLimit exceeds 10000');
    this.#limit = limit;
  }
  step(model, context, operation) {
    const before = point(model);
    let result;
    let failure = null;
    try { result = operation(); } catch (error) {
      if (!(error instanceof ProtocolRejection)) failure = error;
      result = { ok: false, reason: failure ? 'unexpected-error' : error.message };
    }
    const after = point(model);
    const id = 'decision:' + this.#sequence++;
    const record = { id, startedAt: before.atHour, atHour: after.atHour, actor: context.actor, action: context.action, target: context.target,
      visible: structuredClone(context.visible ?? {}), preconditions: structuredClone(result.preconditions ?? {}),
      basis: failure ? 'execution exception, not a policy decision' : result.basis ?? context.basis ?? result.reason ?? 'declared input-driven policy',
      outcome: { ok: result.ok, reason: result.reason ?? null }, work: result.work ?? context.work ?? null,
      error: failure ? { name: failure.name, message: failure.message } : null,
      changes: changes(before, after), supports: (context.supports ?? []).filter(value => value !== undefined), mechanisms: context.mechanisms ?? [],
      protocolEvents: Array.from({ length: after.events - before.events }, (_, i) => 'protocol:' + (before.events + i)) };
    if (this.#records.length < this.#limit) this.#records.push(record);
    else this.#omitted++;
    if (failure) throw failure;
    return { ...structuredClone(result), traceRef: id };
  }
  snapshot() { return { limit: this.#limit, omitted: this.#omitted, records: structuredClone(this.#records), interpretation: 'Execution ancestry and mechanism tags are explanations, not independent causal evidence.' }; }
}

export class EvidenceRelay {
  #model;
  #book;
  #rules;
  #claim;
  #participationReference;
  #actors = new Map();
  #observations = new Map();
  #packages = new Map();
  #packageKeys = new Map();
  #cases = new Map();
  #refs = new Map();
  #sequence = 0;
  #journal;
  constructor(model, { actors, rules, traceLimit = 0, journal = null, claim = 'false-identity', participationReference = null }) {
    if (!['false-identity', 'act-defect'].includes(claim)) throw new Error('unsupported relay claim');
    this.#claim = claim;
    if (!rules?.enabled || rules.procedure !== 'one-step') throw new Error('relay reference requires normalized enabled one-step rules');
    if (participationReference !== null && (participationReference !== 'd77-one-step-converted/v1' || claim !== 'false-identity' || rules.stakeBacking !== 'reserved'
      || model.vouching !== null || model.invitationLimit !== null)) throw new Error('unsupported D77 participation reference');
    this.#participationReference = participationReference;
    this.#model = model;
    this.#rules = Object.freeze(structuredClone(rules));
    this.#book = new DisputeStakes(model, rules.stakeBacking);
    this.#journal = journal ?? new CausalJournal(traceLimit);
    for (const actor of actors) {
      if (!actor || Object.keys(actor).some(key => !['id', 'subject', 'budget', 'reviewCapacity'].includes(key)) || typeof actor.id !== 'string' || !actor.id.length || this.#actors.has(actor.id)) throw new Error('invalid relay actor');
      integer(actor.budget, 'work budget');
      integer(actor.reviewCapacity, 'daily review capacity');
      if (actor.subject !== null) {
        model.subject(actor.subject);
        if ([...this.#actors.values()].some(other => other.subject === actor.subject)) throw new Error('one work account per registered subject in this reference');
      } else if (model.subjects().some(subject => subject.id === actor.id)) throw new Error('external actor must not impersonate a subject');
      this.#actors.set(actor.id, { ...actor, spent: 0, denied: 0, reviews: new Map() });
    }
  }
  #actor(id) {
    const actor = this.#actors.get(id);
    if (!actor) throw new Error('unknown relay actor');
    return actor;
  }
  #package(id) {
    const item = this.#packages.get(id);
    if (!item) throw new Error('unknown evidence package');
    return item;
  }
  #act(actorId, action, target, visible, supports, mechanisms, cost, operation) {
    const actor = this.#actor(actorId);
    const result = this.#journal.step(this.#model, { actor: actorId, action, target, visible, supports, mechanisms, work: cost }, () => {
      if (actor.spent + cost > actor.budget) {
        actor.denied++;
        return { ok: false, reason: 'work-budget-exhausted', work: 0 };
      }
      actor.spent += cost;
      return { ...operation(actor), work: cost };
    });
    if (typeof result.value === 'string' && !this.#refs.has(result.value)) this.#refs.set(result.value, result.traceRef);
    return result;
  }
  #acquireAct(actor, selfId, environment, request) {
    if (this.#claim !== 'act-defect') throw new Error('act observation requires an act-defect relay');
    if (!request || Object.keys(request).sort().join() !== 'opportunity,role,sourceGroup'
      || !['ordinary', 'guarantor'].includes(request.role) || typeof request.opportunity !== 'string' || !request.opportunity.length) throw new TypeError('act observation requires role, opportunity and sourceGroup only');
    const { role, opportunity, sourceGroup } = request;
    signal({ suspicious: false, sourceGroup });
    const native = this.#model.selfId(selfId);
    if (role === 'guarantor' && !native.guarantors.includes(this.#actor(actor).subject)) throw new Error('guarantor observation requires a recorded guarantor');
    const reference = environment?.acts?.find(row => row.id === selfId);
    if (typeof environment?.observe !== 'function' || environment?.randomness?.observations !== ACT_OBSERVATION_RANDOMNESS.observations
      || !reference || reference.kind !== 'self-id' || reference.subject !== native.subject || reference.recordedAt !== native.recordedAt) throw new Error('act observation requires a matching native Self-ID reference');
    const atHour = this.#model.now;
    return { acquire: () => signal({ ...environment.observe({ act: selfId, observer: actor, role, atHour, opportunity }), sourceGroup }),
      context: { role, opportunity, observationPolicy: ACT_OBSERVATION_RANDOMNESS.observations } };
  }
  #observe(actor, selfId, visible, acquire, context = {}) {
    const act = this.#model.selfId(selfId);
    const event = this.#model.events().findIndex(row => row.type === 'self-id-created' && row.selfId === selfId);
    return this.#act(actor, 'observe', act.subject, visible, ['protocol:' + event], ['M04'], 1, () => {
      const observation = acquire();
      Object.assign(visible, observation);
      const id = 'observation:' + this.#sequence++;
      this.#observations.set(id, { id, actor, selfId, subject: act.subject, atHour: this.#model.now, ...context, ...observation });
      return { ok: true, value: id, basis: this.#claim === 'false-identity' ? 'supplied fallible public-event observation; no truth label'
        : 'funded native act reference and fallible evidence; no validity verdict' };
    });
  }
  observe(actor, selfId, input) {
    const observation = signal(input);
    return this.#observe(actor, selfId, { selfId, ...observation }, () => observation);
  }
  observeAct(actor, selfId, environment, request) {
    const { acquire, context } = this.#acquireAct(actor, selfId, environment, request);
    return this.#observe(actor, selfId, { selfId, sourceGroup: request.sourceGroup, suspicious: null, ...context }, acquire, context);
  }
  package(actor, observationIds) {
    if (!Array.isArray(observationIds) || !observationIds.length || observationIds.length > 32) throw new Error('package needs 1..32 recorded observations');
    const ids = [...new Set(observationIds)].sort();
    return this.#act(actor, 'package', ids, { observationIds: ids }, ids.flatMap(id => this.#refs.has(id) ? [this.#refs.get(id)] : []), ['M04'], 1, () => {
      const observations = ids.map(id => this.#observations.get(id));
      if (observations.some(value => !value)) return { ok: false, reason: 'unknown-supporting-observation' };
      if (new Set(observations.map(value => value.selfId)).size !== 1) return { ok: false, reason: 'mixed-public-events' };
      const key = JSON.stringify([observations[0].selfId, ids]);
      if (this.#packageKeys.has(key)) return { ok: false, reason: 'duplicate-package', value: this.#packageKeys.get(key) };
      const id = 'package:' + this.#sequence++;
      this.#packages.set(id, { id, origin: actor, selfId: observations[0].selfId, subject: observations[0].subject,
        claim: this.#claim, observationIds: ids, sourceGroups: [...new Set(observations.map(value => value.sourceGroup))],
        createdAt: this.#model.now, status: 'open', routes: [] });
      this.#packageKeys.set(key, id);
      return { ok: true, value: id, basis: 'event-linked allegation, not a correctness certificate' };
    });
  }
  route(actor, packageId, sponsor) {
    const item = this.#package(packageId);
    return this.#act(actor, 'route', sponsor, { packageId, sponsor }, [this.#refs.get(packageId)], ['M04'], 1, () => {
      if (item.status !== 'open') return { ok: false, reason: 'package-not-open' };
      const candidate = this.#actors.get(sponsor);
      if (!candidate) return { ok: false, reason: 'no-sponsor' };
      if (candidate.subject === null) return { ok: false, reason: 'sponsor-has-no-protocol-membership' };
      if (item.routes.some(route => route.sponsor === sponsor)) return { ok: false, reason: 'duplicate-route' };
      const id = 'route:' + JSON.stringify([packageId, sponsor]);
      item.routes.push({ id, sponsor, atHour: this.#model.now, status: 'pending', review: null });
      return { ok: true, value: id, basis: 'explicit routing choice; no automatic fallback or payment' };
    });
  }
  review(sponsor, packageId, input, options = {}) {
    if (!options || Object.keys(options).some(key => !['available', 'conflicted'].includes(key))) throw new TypeError('unknown review option');
    const { available = true, conflicted = false } = options;
    if (typeof available !== 'boolean' || typeof conflicted !== 'boolean') throw new TypeError('availability/conflict must be declared booleans');
    const observation = signal(input);
    return this.#review(sponsor, packageId, available, conflicted, observation, () => observation);
  }
  reviewAct(sponsor, packageId, environment, request, options = {}) {
    if (!options || Object.keys(options).some(key => !['available', 'conflicted'].includes(key))) throw new TypeError('unknown review option');
    const { available = true, conflicted = false } = options;
    if (typeof available !== 'boolean' || typeof conflicted !== 'boolean') throw new TypeError('availability/conflict must be declared booleans');
    const { acquire, context } = this.#acquireAct(sponsor, this.#package(packageId).selfId, environment, request);
    return this.#review(sponsor, packageId, available, conflicted, null, acquire, context);
  }
  #review(sponsor, packageId, available, conflicted, supplied, acquire, context = {}) {
    const item = this.#package(packageId);
    const actor = this.#actor(sponsor);
    const route = item.routes.find(route => route.sponsor === sponsor);
    const day = Math.floor(this.#model.now / 24);
    const blocked = !route || route.status !== 'pending' || item.status !== 'open' ? 'no-pending-route'
      : !available ? 'missed-notification-or-unavailable' : conflicted ? 'disclosed-conflict'
      : (actor.reviews.get(day) ?? 0) >= actor.reviewCapacity ? 'review-capacity-exhausted' : null;
    const visible = { packageId, observation: blocked ? null : supplied, available, conflicted, dailyCapacity: actor.reviewCapacity, ...context };
    return this.#act(sponsor, 'review', item.subject, visible,
      [this.#refs.get(packageId), ...(route ? [this.#refs.get(route.id)] : [])], ['M04', 'M09'], blocked ? 0 : 1, () => {
      if (blocked) {
        if (blocked === 'disclosed-conflict') route.status = 'refused';
        return { ok: false, reason: blocked };
      }
      const observation = acquire();
      visible.observation = observation;
      actor.reviews.set(day, (actor.reviews.get(day) ?? 0) + 1);
      route.review = { id: 'review:' + route.id, ...context, ...observation, atHour: this.#model.now };
      const independent = !item.sourceGroups.includes(observation.sourceGroup);
      route.status = observation.suspicious && independent ? 'reviewed' : 'refused';
      return { ok: route.status === 'reviewed', value: route.review.id, reason: !independent ? 'review-source-not-independent' : !observation.suspicious ? 'review-not-suspicious' : null,
        basis: this.#claim === 'false-identity' ? 'independent supplied review signal, never origin allegiance or an evaluator correctness flag'
          : 'fallible act review; distinct declared source tags do not certify independence' };
    });
  }
  #entry(actor, item, route) {
    if (item.status !== 'open' || route?.status !== 'reviewed') return { ok: false, reason: 'no-reviewed-open-route' };
    if (actor.subject === null) return { ok: false, reason: 'sponsor-has-no-protocol-membership' };
    if ([...this.#cases.values()].some(record => record.subject === item.subject && record.resolvedAt === null)) return { ok: false, reason: 'subject-already-under-dispute' };
    const access = challengeAccess(this.#model, actor.subject, item.subject, this.#rules.stake);
    if (!access.allowed) return { ok: false, reason: access.reason, preconditions: access.preconditions };
    if (item.claim === 'act-defect') return { ok: false, reason: 'act-defect-adjudication-unimplemented', preconditions: access.preconditions,
      basis: 'XP/stake eligibility is not act-level jurisdiction or a defined remedy; no case or stake opened' };
    const id = 'relay-case:' + this.#sequence;
    const subjects = [actor.subject, item.subject];
    if (this.#participationReference !== null) {
      this.#model.previewDisputeParticipation(id, subjects);
      if (subjects.some(id => this.#model.subject(id).debt !== 0) || this.#model.selfIds().some(act => subjects.includes(act.subject)
        && (act.status !== 'converted' || act.disputeLock !== null))) throw new ProtocolRejection('D77 reference requires converted debt-free party sources');
    }
    this.#sequence++;
    this.#book.open(id, actor.subject, this.#rules.stake);
    if (this.#participationReference !== null) this.#model.beginDisputeParticipation(id, subjects);
    this.#cases.set(id, { id, packageId: item.id, challenger: actor.subject, subject: item.subject, openedAt: this.#model.now, resolvedAt: null, upheld: null });
    item.status = 'pending';
    return { ok: true, value: id, preconditions: access.preconditions, basis: 'existing strict XP and liquid-stake access gates passed' };
  }
  sponsor(sponsor, packageId, profile = undefined) {
    const item = this.#package(packageId);
    const route = item.routes.find(row => row.sponsor === sponsor);
    if (profile !== undefined && this.#claim !== 'act-defect') throw new Error('conditional sponsorship currently requires an act-defect relay');
    const assessment = profile === undefined ? null : assessSponsorship(route?.review
      ? { suspicious: route.review.suspicious, distinctSource: !item.sourceGroups.includes(route.review.sourceGroup) }
      : { suspicious: null, distinctSource: null }, profile);
    const visible = assessment ? { packageId, policy: SPONSOR_ASSESSMENT_POLICY, assessment: null } : { packageId };
    return this.#act(sponsor, assessment ? 'sponsor-decision' : 'formal-challenge', item.subject, visible,
      [this.#refs.get(packageId), ...(route?.review ? [this.#refs.get(route.review.id)] : [])], ['M04', 'M07', 'M09'], 1, actor => {
      if (!assessment) return this.#entry(actor, item, route);
      visible.assessment = assessment;
      const access = actor.subject === null ? { allowed: false, reason: 'sponsor-has-no-protocol-membership', preconditions: {} }
        : challengeAccess(this.#model, actor.subject, item.subject, this.#rules.stake);
      const ready = item.status === 'open' && route?.status === 'reviewed';
      const unopposed = ![...this.#cases.values()].some(record => record.subject === item.subject && record.resolvedAt === null);
      const attempted = assessment.willing === true && ready && access.allowed && unopposed;
      const result = assessment.willing === true ? this.#entry(actor, item, route)
        : { ok: false, reason: assessment.willing === false ? 'sponsor-declined' : 'sponsor-willingness-undetermined', basis: 'explicit conditional private utility; no automatic action on ties or unknowns' };
      const decision = { id: 'sponsor-decision:' + this.#sequence++, atHour: this.#model.now, assessment, access, reviewedRoute: ready,
        attempted, caseOpened: result.ok, entrySupported: false, outcome: result.reason ?? null };
      if (route) (route.decisions ??= []).push(structuredClone(decision));
      return { ...result, decision };
    });
  }
  resolve(caseId, upheld) {
    if (this.#claim === 'act-defect') throw new Error('act-defect adjudication cannot use identity verdict enforcement');
    if (typeof upheld !== 'boolean') throw new TypeError('resolution requires a supplied reference verdict, not truth');
    const record = this.#cases.get(caseId);
    if (!record) throw new Error('unknown relay case');
    return this.#journal.step(this.#model, { actor: 'reference-adjudicator', action: 'adjudicate-and-enforce', target: record.subject,
      visible: { caseId, upheld, procedure: 'one-step' }, supports: [this.#refs.get(caseId)], mechanisms: ['M04', 'M07', 'M09'], work: 0 }, () => {
      if (record.resolvedAt !== null) return { ok: false, reason: 'case-already-resolved' };
      if (this.#participationReference !== null) {
        const participation = this.#model.disputeParticipations().find(row => row.caseId === caseId);
        if (!participation || participation.closedAt !== null || participation.subjects.length !== 2
          || participation.subjects[0] !== record.challenger || participation.subjects[1] !== record.subject) return { ok: false, reason: 'case-participation-binding-changed' };
      }
      if (this.#model.subject(record.subject).identityStatus !== 'accepted') {
        this.#book.moot(caseId);
        if (this.#participationReference !== null) this.#model.endDisputeParticipation(caseId);
        record.resolvedAt = this.#model.now;
        this.#package(record.packageId).status = 'resolved';
        return { ok: false, reason: 'moot-target-not-accepted' };
      }
      if (upheld) preflightIdentityVerdict(this.#model, record.challenger, record.subject, this.#rules,
        { releasedStake: this.#book.backing === 'reserved' ? this.#book.get(caseId).positions[0].amount : 0 });
      settleOneStepPosition(this.#model, this.#book, caseId, record.challenger, upheld, this.#rules);
      const consequences = upheld ? enforceIdentityVerdict(this.#model, record.challenger, record.subject, this.#rules) : null;
      if (this.#participationReference !== null) this.#model.endDisputeParticipation(caseId);
      record.resolvedAt = this.#model.now;
      record.upheld = upheld;
      record.consequences = consequences;
      this.#package(record.packageId).status = 'resolved';
      return { ok: true, basis: 'exogenous reference adjudication; same stake/XP/liability enforcement as runExperiment' };
    });
  }
  snapshot() {
    return { actors: [...this.#actors.values()].map(({ reviews, ...actor }) => ({ ...actor, reviews: [...reviews] })),
      observations: structuredClone([...this.#observations.values()]), packages: structuredClone([...this.#packages.values()]),
      cases: structuredClone([...this.#cases.values()]), stakes: this.#book.summary(),
      ...(this.#participationReference === null ? {} : { participationReference: this.#participationReference,
        participations: this.#model.disputeParticipations().filter(row => this.#cases.has(row.caseId)) }) };
  }
  trace() { return this.#journal.snapshot(); }
}
