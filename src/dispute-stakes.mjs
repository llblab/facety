// Owns: Reference dispute commitment lifecycle and actual stake collection; excludes XP, truth and merits.
import { ProtocolRejection } from './model.mjs';

export const STAKE_BACKINGS = Object.freeze(['unsecured', 'reserved']);

export class DisputeStakes {
  #model;
  #cases = new Map();
  #nominal = 0;
  constructor(model, backing = 'unsecured') {
    if (!STAKE_BACKINGS.includes(backing)) throw new Error('unknown dispute stake backing');
    this.#model = model;
    Object.defineProperty(this, 'backing', { value: backing, enumerable: true });
  }
  #openCase(id) {
    const record = this.#cases.get(id);
    if (!record || record.status !== 'open') throw new ProtocolRejection('stake case is not open');
    return record;
  }
  #position(record, owner, amount) {
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(this.#nominal + amount)) throw new RangeError('stake commitment exceeds safe integer bounds');
    if (record.positions.some(position => position.owner === owner)) throw new ProtocolRejection('duplicate case participant');
    const previous = record.positions.at(-1);
    if (previous && amount < previous.amount) throw new ProtocolRejection('stake cannot decrease');
    const subject = this.#model.subject(owner);
    if (subject.identityStatus !== 'accepted' || subject.liquidFacy < amount) throw new ProtocolRejection('insufficient eligible liquid stake');
    if (this.backing === 'reserved') this.#model.reserveDisputeStake(record.id, owner, amount);
    record.positions.push({ owner, amount, side: previous?.side === 'fraud' ? 'genuine' : 'fraud', atHour: this.#model.now });
    this.#nominal += amount;
  }
  open(id, owner, amount) {
    if (typeof id !== 'string' || !id.length || this.#cases.has(id)) throw new ProtocolRejection('invalid or duplicate stake case');
    const record = { id, openedAt: this.#model.now, closedAt: null, status: 'open', winner: null, positions: [], accounting: null };
    this.#position(record, owner, amount);
    this.#cases.set(id, record);
  }
  enter(id, owner, amount) { this.#position(this.#openCase(id), owner, amount); }
  hasParticipant(id, owner) {
    const record = this.#cases.get(id);
    if (!record) throw new ProtocolRejection('unknown stake case');
    return record.positions.some(position => position.owner === owner);
  }
  get(id) {
    const record = this.#cases.get(id);
    if (!record) throw new ProtocolRejection('unknown stake case');
    return structuredClone(record);
  }
  cases() { return [...this.#cases.keys()].map(id => this.get(id)); }
  settle(id, winner) {
    const record = this.#openCase(id);
    if (!['fraud', 'genuine'].includes(winner)) throw new ProtocolRejection('invalid winning side');
    const accounting = { nominalLosing: 0, transferred: 0, burned: 0, released: 0, unpaid: 0 };
    for (let k = record.positions.length - 1; k >= 0; k--) {
      const lower = record.positions[k];
      const upper = record.positions[k + 1];
      if (lower.side === winner) continue;
      accounting.nominalLosing += lower.amount;
      if (this.backing === 'reserved') {
        const recipient = upper?.side === winner ? upper.owner : null;
        this.#model.settleDisputeStake(id, lower.owner, { disposition: recipient === null ? 'burn' : 'transfer', recipient });
        accounting[recipient === null ? 'burned' : 'transferred'] += lower.amount;
      } else {
        const payer = this.#model.subject(lower.owner);
        const amount = Math.min(lower.amount, payer.liquidFacy);
        if (payer.identityStatus === 'accepted') {
          if (upper?.side === winner && this.#model.subject(upper.owner).identityStatus === 'accepted' && amount > 0) {
            this.#model.transferFacy(lower.owner, upper.owner, amount, 'ladder-settlement');
            accounting.transferred += amount;
          } else if (!upper) {
            this.#model.penalize(lower.owner, { fine: amount, halveXp: false });
            accounting.burned += amount;
          }
        }
      }
    }
    if (this.backing === 'reserved') for (const position of record.positions) {
      if (position.side === winner) accounting.released += this.#model.settleDisputeStake(id, position.owner);
    }
    accounting.unpaid = accounting.nominalLosing - accounting.transferred - accounting.burned;
    record.accounting = accounting;
    record.winner = winner;
    record.status = 'settled';
    record.closedAt = this.#model.now;
    return this.get(id);
  }
  moot(id) {
    const record = this.#openCase(id);
    let released = 0;
    if (this.backing === 'reserved') for (const position of record.positions) released += this.#model.settleDisputeStake(id, position.owner);
    record.accounting = { nominalLosing: 0, transferred: 0, burned: 0, released, unpaid: 0 };
    record.status = 'mooted';
    record.closedAt = this.#model.now;
    return this.get(id);
  }
  summary() {
    const result = { backing: this.backing, cases: this.#cases.size, openCases: 0, nominalCommitted: this.#nominal, pendingNominal: 0, nominalLosing: 0, transferred: 0, burned: 0, released: 0, unpaid: 0 };
    for (const record of this.#cases.values()) {
      if (record.status === 'open') {
        result.openCases++;
        result.pendingNominal += record.positions.reduce((sum, position) => sum + position.amount, 0);
      } else for (const [key, value] of Object.entries(record.accounting)) result[key] += value;
    }
    return result;
  }
}
