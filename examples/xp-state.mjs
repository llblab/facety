import { FacetyModel, DAY } from '../src/model.mjs';
import { provenance } from '../src/provenance.mjs';

const model = new FacetyModel({ genesis: ['author', 'initial', 'later'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' } });
const identify = id => model.createSelfId(id, model.registerArtifact(id));
const link = id => { const relation = model.proposeGuarantee(id, 'author'); model.confirmGuarantee('author', relation); return relation; };
const funding = identify('initial');
model.advanceTo(DAY);
model.convertToCollector('initial', funding);
const relation = link('initial');
const act = identify('author');
model.advanceTo(DAY + 1);
model.endGuarantee('initial', relation);
link('later');
model.advanceTo(2 * DAY);
const matured = { selfId: model.selfId(act), subjects: model.subjects(), provenance: model.xpProvenance('initial') };
model.convertToCollector('author', act);
const penalty = model.applySelfIdPenalty(act, { caseId: 'software-supplied-self-id-penalty', fine: 1 });
console.log(JSON.stringify({
  schema: 'facety-xp-state-software/v1', level: 'engineering-example-not-research-or-adjudication', provenance: provenance(),
  assumptions: ['Three supplied genesis subjects, no initial money or XP; inherited bootstrap is not verified independence.',
    'Accepted guarantor qualification and immediate confirmed-link activation are explicit native references; proposed positive-guarantee24h cooling is not implemented.',
    'Only ordinary unencumbered snapshot maturity is exercised; no frozen/debt maturity convention, human utility, price or attack probability is supplied.',
    'Penalty is a trusted explicit one-unit input, not a court verdict or a depth formula; no source-credit remedy or identity invalidation is inferred.'],
  matured, penalty, final: { selfId: model.selfId(act), subjects: model.subjects(), ledger: model.audit(), penalties: model.actPenalties() },
}, null, 2));
