// SPDX-License-Identifier: AGPL-3.0-or-later
// Attribute sampled CPU time within recorded boot stages; no runtime changes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2]);
const report = JSON.parse(readFileSync(resolve(root, 'report.json'), 'utf8'));
for (const trial of report.trials) {
  const navigation = trial.cpuClock?.find(metric => metric.name === 'NavigationStart')?.value;
  if (!Number.isFinite(navigation)) throw new Error('Profile needs NavigationStart clock alignment');
  const name = `${trial.backend}-${trial.quality}-${trial.round}-${trial.variant}`;
  const profile = JSON.parse(readFileSync(resolve(root, `${name}.cpuprofile`), 'utf8'));
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const marks = new Map(trial.trace.marks.map(mark => [mark.name.replace('herd:boot:', ''), mark.at]));
  const stages = [['scene', 'shaders'], ['shaders', 'presented']];
  for (const [start, end] of stages) {
    const from = marks.get(start); const to = marks.get(end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error(`Missing ${start}/${end} marks`);
    let time = profile.startTime / 1000 - navigation * 1000;
    const costs = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const delta = profile.timeDeltas[i] / 1000;
      const next = time + delta;
      const overlap = Math.max(0, Math.min(next, to) - Math.max(time, from));
      if (overlap > 0) {
        const id = profile.samples[i];
        const node = nodes.get(id);
        const parent = nodes.get(parents.get(id));
        const label = `${node.callFrame.functionName || '(anonymous)'} <- ${parent?.callFrame.functionName || '(root)'}`;
        costs.set(label, (costs.get(label) ?? 0) + overlap);
      }
      time = next;
    }
    console.log(JSON.stringify({ name, stage: `${start}->${end}`, duration: to - from,
      sampledMs: [...costs.values()].reduce((a, b) => a + b, 0),
      top: [...costs].sort((a, b) => b[1] - a[1]).slice(0, 8),
      limitation: 'Sample attribution includes idle/program time; not exact function duration or GPU time.' }));
  }
}
