// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const report = JSON.parse(readFileSync(resolve(process.argv[2], 'report.json'), 'utf8'));
for (const trial of report.trials) {
  if (!trial.shaderCompletion) throw new Error('Requires --shader-trace receipt');
  const programs = trial.shaderCompletion.programs;
  const polls = programs.flatMap(program => program.polls);
  const waits = programs.filter(program => program.polls.length).map(program => ({
    id: program.id, elapsed: program.polls.at(-1).at - program.linkAt,
    polls: program.polls.length, completed: program.polls.at(-1).complete,
  })).sort((a, b) => b.elapsed - a.elapsed);
  console.log(JSON.stringify({ round: trial.round, variant: trial.variant,
    parallelDisabled: trial.shaderCompletion.disableParallel, ready: trial.ready,
    maxLinkStatusCall: Math.max(0, ...programs.map(program => program.linkStatus?.callMs ?? 0)),
    totalLinkStatusCall: programs.reduce((sum, program) => sum + (program.linkStatus?.callMs ?? 0), 0),
    maxCompletionQueryCall: Math.max(0, ...polls.map(poll => poll.callMs)),
    longestWait: waits[0] ?? null, programs: programs.length,
    maxBootLongTask: Math.max(0, ...trial.trace.longTasks.filter(task => task.at < trial.ready).map(task => task.duration)),
    firstBark: trial.windows[0].max, nonblank: trial.visual.nonblank,
    errors: trial.errors.length, stable: report.stable ?? null,
    limitation: 'Diagnostic browser API timings; not GPU execution durations.' }));
}
