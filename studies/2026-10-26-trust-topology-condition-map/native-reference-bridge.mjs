// Owns: Diagnostic Native invocation/actual-state projection for differential tests; excludes expected rules, authentication and research execution.
import { FacetyModel } from '../../src/model.mjs';
import { VouchActReview } from '../../src/vouch-review.mjs';
import { ACT_OBSERVATION_RANDOMNESS } from '../../src/act-observations.mjs';

const order = rows => rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export class NativeReferenceBridge {
  #model;
  #sources = new Map();
  #bonds = new Map();
  #work = null;
  #requests = [];
  constructor(profile) {
    this.#model = new FacetyModel({ genesis: profile.genesis, policy: profile.policy, ablations: profile.ablations,
      invitationLimit: profile.invitationLimit, vouching: profile.vouching, vouchAdmission: profile.vouchAdmission });
  }
  #source(id) { return this.#sources.get(id) ?? '@missing-source:' + id; }
  #bond(id) { return this.#bonds.get(id) ?? '@missing-bond:' + id; }
  #sourceLabel(id) { return [...this.#sources].find(([, actual]) => actual === id)?.[0] ?? null; }
  #bondLabel(id) { return [...this.#bonds].find(([, actual]) => actual === id)?.[0] ?? null; }
  apply(q) {
    const m = this.#model;
    if (q.op === 'time') m.advanceTo(q.hour);
    else if (q.op === 'artifact') m.registerArtifact(q.owner, { id: q.id, faceCount: 1, contentHash: null });
    else if (q.op === 'issue') this.#sources.set(q.id, m.createSelfId(q.owner, q.artifact));
    else if (q.op === 'withdraw') m.convertToCollector(q.owner, this.#source(q.id));
    else if (q.op === 'commit') this.#bonds.set(q.id, m.commitVouch(q.owner, q.target));
    else if (q.op === 'admit') m.admitVouched(q.target, q.bonds.map(id => this.#bond(id)));
    else if (q.op === 'exit') m.exitVouch(q.owner, this.#bond(q.id));
    else if (q.op === 'hold') m.openVouchBondCase(this.#bond(q.id), { caseId: q.caseId });
    else if (q.op === 'settle') m.resolveVouchBondCase(this.#bond(q.id), { caseId: q.caseId, upheld: q.upheld, burn: q.burn, transfers: q.transfers });
    else if (q.op === 'refund') m.releaseVouchBond(this.#bond(q.id), { clear: q.clear, clearanceId: q.clearanceId });
    else if (q.op === 'pool') {
      if (this.#work !== null) throw new Error('one pool only in the closed profile');
      this.#work = new VouchActReview(m, q.options);
    } else if (q.op === 'review') {
      const id = this.#source(q.id), a = m.selfId(id);
      // The controlled received-signal tape is exogenous, not a truth verdict or a new random generator.
      const port = { randomness: ACT_OBSERVATION_RANDOMNESS,
        acts: [{ id, subject: a.subject, kind: 'self-id', recordedAt: a.recordedAt }],
        observe: request => { this.#requests.push({ ...request, act: this.#sourceLabel(request.act) }); return { suspicious: q.signal }; } };
      this.#work.review(q.actor, id, port, { opportunity: q.opportunity });
    } else throw new Error('Unsupported bridge operation: ' + q.op);
    m.audit();
    this.#work?.audit();
  }
  snapshot() {
    const m = this.#model, w = this.#work?.snapshot(), members = order(m.subjects().map(a => ({ id: a.id, genesis: a.genesis,
      identityStatus: a.identityStatus, debt: a.debt, liquidFacy: a.liquidFacy, xp: a.xp, lastRewardAt: a.lastRewardAt })));
    const sources = order(m.selfIds().map(a => ({ id: this.#sourceLabel(a.id), owner: a.subject, artifact: a.artifact, at: a.recordedAt,
      index: a.chainIndex, previous: this.#sourceLabel(a.previousSelfId), guarantors: [...a.guarantors].sort(), status: a.status,
      disposition: a.disposition, xpCredited: a.xpCredited, credit: a.xpCredit === null ? null : {
        at: a.xpCredit.at, revokedAt: a.xpCredit.revokedAt, revocation: a.xpCredit.revocation,
        recipients: a.xpCredit.recipients.map(r => ({ subject: r.subject, role: r.role, halvingsBefore: r.halvingsBefore,
          revokedAt: r.revokedAt, revocation: r.revocation })).sort((a, b) => a.subject < b.subject ? -1 : 1) } })));
    const cases = m.vouchBondCases().map(c => ({ ...c, vouch: this.#bondLabel(c.vouch), transfers: c.transfers.map(p => ({ ...p })) }))
      .sort((a, b) => JSON.stringify([a.vouch, a.caseId]) < JSON.stringify([b.vouch, b.caseId]) ? -1 : 1);
    return { now: m.now, members, sources,
      artifacts: order(m.events().filter(e => e.type === 'artifact-registered').map(e => ({ id: e.artifact, publisher: e.publisher, at: e.at }))),
      bonds: order(m.vouchCommitments().map(b => ({ ...b, id: this.#bondLabel(b.id) }))), cases,
      admissions: m.vouchAdmissions().map(a => ({ subject: a.subject, at: a.acceptedAt,
        vouches: a.vouches.map(id => this.#bondLabel(id)).sort(), guarantors: [...a.guarantors].sort() })).sort((a, b) => a.subject < b.subject ? -1 : 1),
      relations: m.guaranteeRelations().map(r => ({ vouch: this.#bondLabel(r.vouch), guarantor: r.guarantor, guaranteed: r.guaranteed,
        proposedAt: r.proposedAt, activatedAt: r.activatedAt, endedAt: r.endedAt, status: r.status })).sort((a, b) => a.vouch < b.vouch ? -1 : 1),
      work: !w ? null : { costs: { ...w.costs }, actors: w.actors.map(a => ({ ...a })),
        receipts: w.receipts.map(r => ({ ...r, selfId: this.#sourceLabel(r.selfId), work: { ...r.work } })) },
      requests: structuredClone(this.#requests), ledger: m.audit(),
      capacities: members.map(a => ({ subject: a.id, ...m.vouchCapacity(a.id) })),
      graph: { nodes: m.guarantees.toJSON().nodes.sort(), lineageNodes: m.lineage.toJSON().nodes.sort(), edges: m.guarantees.toJSON().edges.map(e => [e.from, e.to]).sort(),
        lineageEdges: m.lineage.toJSON().edges.map(e => [e.from, e.to]).sort() } };
  }
}
