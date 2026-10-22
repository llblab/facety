// Owns: Shared reference challenge access and verdict consequences; excludes observations, truth and choice.

export function challengeAccess(model, challenger, subject, stake) {
  const target = model.subject(subject);
  const candidate = model.subject(challenger);
  const preconditions = { challengerStatus: candidate.identityStatus, targetStatus: target.identityStatus,
    challengerXp: candidate.xp, targetXp: target.xp, liquidFacy: candidate.liquidFacy, stake };
  const reason = target.identityStatus !== 'accepted' ? 'challenge target is not accepted'
    : candidate.identityStatus !== 'accepted' || candidate.xp <= target.xp ? 'challenge XP gate'
    : candidate.liquidFacy < stake ? 'insufficient challenge stake' : null;
  return { allowed: reason === null, reason, preconditions };
}

export function settleOneStepPosition(model, book, caseId, challenger, upheld, rules) {
  const result = book.settle(caseId, upheld ? 'fraud' : 'genuine');
  if (!upheld && rules.loserHalvesXp) model.penalize(challenger, { fine: 0, halveXp: true });
  return result;
}

// Pure arithmetic plan under normalized rules. releasedStake projects the one-step winner's pending
// custody refund; no assets move here. This is headroom validation, not transaction recovery.
export function preflightIdentityVerdict(model, challenger, subject, rules, { releasedStake = 0 } = {}) {
  const liable = [subject];
  const inviters = [...model.lineage.inEdges(subject)].map(edge => edge.from);
  if (rules.liability !== 'subject') liable.push(...[...model.guarantees.inEdges(subject)].map(edge => edge.from));
  if (['guarantors-and-inviter', 'inviter-chain'].includes(rules.liability)) liable.push(...inviters);
  if (rules.liability === 'inviter-chain') liable.push(...inviters.flatMap(inviter => [...model.guarantees.inEdges(inviter)].map(edge => edge.from)));
  const parties = [...new Set(liable)];
  const voidedActs = rules.fineMode === 'chain' ? model.selfIds().filter(act => act.subject === subject && act.status !== 'cancelled').length : 0;
  const fine = rules.fineMode === 'chain' ? Math.max(1, voidedActs) : rules.fine;
  const balances = new Map(model.subjects().map(party => [party.id, BigInt(party.liquidFacy)]));
  balances.set(challenger, balances.get(challenger) + BigInt(releasedStake));
  let debt = BigInt(model.ledger().debt);
  const penalties = [];
  for (const party of parties) {
    if (model.subject(party).identityStatus !== 'accepted') continue;
    const liquid = balances.get(party);
    const reward = party === challenger ? 0 : Math.floor(Math.min(Number(liquid), fine) * rules.rewardShare);
    const transfer = reward > 0 && model.subject(challenger).identityStatus === 'accepted' ? reward : 0;
    balances.set(party, liquid - BigInt(transfer));
    balances.set(challenger, balances.get(challenger) + BigInt(transfer));
    const penalty = fine - reward;
    const collected = balances.get(party) < BigInt(penalty) ? balances.get(party) : BigInt(penalty);
    balances.set(party, balances.get(party) - collected);
    debt += BigInt(penalty) - collected;
    if (debt > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('verdict would overflow aggregate debt');
    penalties.push({ party, transfer, fine: penalty });
  }
  return { liable: parties, voidedActs, fine, penalties };
}

// This is an adjudication input under normalized research rules, not a detector of actual personhood.
export function enforceIdentityVerdict(model, challenger, subject, rules, onInvalidated = () => {}) {
  const plan = preflightIdentityVerdict(model, challenger, subject, rules);
  if (rules.fineMode === 'chain') model.voidSelfIdChain(subject);
  let transferred = 0;
  let burned = 0;
  let debtAdded = 0;
  for (const penalty of plan.penalties) {
    if (penalty.transfer > 0) {
      model.transferFacy(penalty.party, challenger, penalty.transfer, 'challenge-reward');
      transferred += penalty.transfer;
    }
    const collection = model.penalize(penalty.party, { fine: penalty.fine, halveXp: true });
    burned += collection.collected;
    debtAdded += collection.debtAdded;
  }
  const invalidated = [];
  for (const party of [subject, ...(rules.excludeLiable ? plan.liable.filter(party => party !== subject && party !== challenger) : [])]) {
    if (model.subject(party).identityStatus !== 'accepted') continue;
    model.invalidateIdentity(party);
    invalidated.push(party);
    onInvalidated(party);
  }
  return { liable: plan.liable, invalidated, voidedActs: plan.voidedActs, fine: plan.fine, transferred, burned, debtAdded };
}
