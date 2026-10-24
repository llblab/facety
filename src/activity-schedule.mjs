// Owns: Declared daily quotas and sub-day availability; excludes protocol state, sanctions and human calibration.
import { Random, RANDOM_GENERATOR } from './random.mjs';

export const SUBDAY_RANDOMNESS = Object.freeze({ generator: RANDOM_GENERATOR, decisions: 'decision-keyed-subday-v1', placement: 'daily-quota-keyed-slots-v1' });

export function createActivitySchedule({ seed, stepHours, actorProfiles }) {
  const random = new Random(seed).fork(SUBDAY_RANDOMNESS.placement);
  const profiles = new Map(actorProfiles.map(profile => [profile.subject, profile]));
  function available(subject, atHour, kind) {
    const hours = profiles.get(subject)?.[kind === 'attention' ? 'attentionHours' : 'transactionHours'];
    return hours == null || hours.includes(atHour);
  }
  return {
    activity(subject, base) { return { ...base, ...profiles.get(subject)?.activity }; },
    available,
    slots(subject, atHour, channel, rate, key = [], kind = 'transaction') {
      if (!available(subject, atHour, kind)) return [];
      const day = Math.floor(atHour / 24);
      const countKey = JSON.stringify(['count', day, subject, channel, key]);
      const count = Math.floor(rate) + Number(random.fork(countKey).chance(rate % 1));
      const slot = (atHour % 24) / stepHours;
      const result = [];
      for (let i = 0; i < count; i++) {
        // A fixed Self-ID phase avoids sub-24-hour attempts on successive days.
        const phaseDay = channel === 'self-id' ? 0 : day;
        const draw = random.fork(JSON.stringify(['slot', phaseDay, subject, channel, key, i]));
        if (draw.int(24 / stepHours) === slot) result.push(i);
      }
      return result;
    },
  };
}
