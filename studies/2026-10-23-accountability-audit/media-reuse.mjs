import { FacetyModel } from '../../src/model.mjs';
import { provenance } from '../../src/provenance.mjs';

function probe(artifactReuse) {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { artifactReuse } });
  const artifact = model.registerArtifact('a', { id: 'H', faceCount: 2, contentHash: 'photo-H' });
  const first = model.createSelfId('a', artifact, 0);
  model.advanceTo(23);
  model.rotateKey('a', 'new-key');
  let at23;
  try { model.createSelfId('a', artifact, 0); } catch (error) { at23 = error.message; }
  model.advanceTo(24);
  let second = null;
  let at24 = 'accepted';
  try { second = model.createSelfId('a', artifact, 0); } catch (error) { at24 = error.message; }
  model.createSelfId('b', artifact, 1);
  model.createSelfId('c', artifact, 0);
  model.convertToCollector('a', first);
  model.advanceTo(48);
  if (second !== null) model.convertToCollector('a', second);
  return { artifactReuse, at23, at24, subject: model.subject('a'), ledger: model.audit(), claims: model.selfIds().map(({ subject, faceIndex, collision }) => ({ subject, faceIndex, collision })) };
}

console.log(JSON.stringify({
  schema: 'facety-media-reuse-probe/v1', level: 'diagnostic', provenance: provenance(),
  assumptions: ['Artifact registration age includes hour 24.', 'registration-only is the legacy reference; once-per-subject is an unselected stronger no-reuse interpretation.'],
  probes: ['registration-only', 'once-per-subject'].map(probe),
}, null, 2));
