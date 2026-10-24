// Owns: Fixed comparison inputs and offline measurement; excludes simulation, inference and protocol choices.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { digestOf } from '../../src/provenance.mjs';

export const METHOD_FILES = ['run.mjs', 'contract.mjs', 'analyze.mjs', 'design.json'];
export function methodDigests() {
  return Object.fromEntries(METHOD_FILES.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('hex')]));
}
export const COUNTERS = ['pairTickOpportunities', 'reviewSlots', 'inspections', 'inspectionDenied', 'positiveSignals', 'verificationCalls', 'verificationDenied', 'verificationPassed', 'cancelCalls', 'cancelBudgetDenied', 'cancelUnavailable', 'cancelRejected', 'cancelled'];
export const EVALUATOR = ['falseTargetsInspected', 'genuineTargetsInspected', 'falseTargetPositive', 'genuineTargetPositive'];
export const FIELDS = ['falseAccepted', 'genuineAcceptedDescendants', 'falseConverted', 'falseXp', 'genuineXp', 'falseInvitationsCancelled', 'genuineInvitationsCancelled', 'invitationsCreated', 'openInvitations', 'operators', 'defenderEffort', 'coalitionEffort'];

export function caseConfig(design, seed, population, calendar, timing, arm) {
  const actorProfiles = calendar.offset === null ? [] : Array.from({ length: design.base.initialSize }, (_, index) => ({
    subject: 'n' + index, activity: {}, transactionHours: null,
    attentionHours: Array.from({ length: design.base.days }, (_, day) => 24 * day + 4 * ((index + calendar.offset) % 6)),
  }));
  return { ...design.base, seed, scenario: population.scenario, successCriterion: population.criterion, actorProfiles, invitationReviewTiming: timing, ablations: { ...design.base.ablations, disableInvitationVeto: arm.disabled } };
}

export function projectRun(run, population, calendar, timing, arm) {
  return { seed: run.config.seed, population: population.id, calendar: calendar.id, timing, arm: arm.id,
    configDigest: digestOf(run.config), randomness: run.randomness, assumptionsDigest: digestOf(run.assumptions),
    outcome: run.outcome, state: run.state, process: run.invitationReview, effort: run.effort,
    ledger: run.metrics.ledger, money: run.money, system: run.system, impact: run.impact, nativePopulation: run.population,
    daily: run.history.filter(row => row.stage === 'day-end').map(row => ({ atHour: row.atHour, subjects: row.subjects, falseShare: row.falseShare, falseConverted: row.falseConversions, totalXp: row.xp.total })),
  };
}

export function measure(row, population) {
  const identities = new Map(row.state.truth.map(identity => [identity.id, identity]));
  if (identities.size !== row.state.truth.length || row.state.subjects.some(subject => !identities.has(subject.id)) || row.state.truth.some(identity => typeof identity.genuine !== 'boolean' || !['honest', 'attackers'].includes(identity.cohort) || typeof identity.operator !== 'string')) throw new Error('comparison requires complete evaluator identities');
  const falseIds = new Set(row.state.truth.filter(identity => !identity.genuine).map(identity => identity.id));
  const subjects = row.state.subjects;
  const cancelled = row.state.events.filter(event => event.type === 'invitation-cancelled');
  return {
    falseAccepted: subjects.filter(subject => falseIds.has(subject.id) && subject.identityStatus === 'accepted').length,
    genuineAcceptedDescendants: subjects.filter(subject => !subject.genesis && !falseIds.has(subject.id) && subject.identityStatus === 'accepted').length,
    falseConverted: row.state.selfIds.filter(act => falseIds.has(act.subject) && act.status === 'converted').length,
    falseXp: subjects.filter(subject => falseIds.has(subject.id)).reduce((sum, subject) => sum + subject.xp, 0),
    genuineXp: subjects.filter(subject => !falseIds.has(subject.id)).reduce((sum, subject) => sum + subject.xp, 0),
    falseInvitationsCancelled: population.descendantsGenuine ? 0 : cancelled.length,
    genuineInvitationsCancelled: population.descendantsGenuine ? cancelled.length : 0,
    invitationsCreated: row.state.invitations.length,
    openInvitations: row.state.invitations.filter(invitation => invitation.status === 'open').length,
    operators: new Set(row.state.truth.map(identity => identity.operator)).size,
    defenderEffort: row.effort.cohorts.honest.effort,
    coalitionEffort: row.effort.cohorts.attackers.effort,
  };
}
