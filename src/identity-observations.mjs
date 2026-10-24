// Owns: Environment-only noisy identity signals; excludes defense authority, protocol state and evidence authenticity.
// Truth stays in the environment. A target has one stable declared identity class within a run.
export function observationEnvironment(truth, random, config) {
  return (id, context, identity = truth.get(id)) => {
    const key = config.invitationEvidence === 'shared-target' && Array.isArray(context) && context[0] === 'invitation-review'
      ? ['invitation-shared-target-v1', id] : [id, context];
    return Object.freeze({ suspicious: random.fork(JSON.stringify(key)).chance(identity.genuine ? config.falsePositiveRate : config.sensitivity) });
  };
}
