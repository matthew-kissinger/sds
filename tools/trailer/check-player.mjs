// SPDX-License-Identifier: AGPL-3.0-or-later
import { buildSync } from 'esbuild';
import { resolve } from 'node:path';
const result=buildSync({stdin:{contents:`
import { createSimState, createTickRng } from './sim/state';
import { HOME_FIELD } from './sim/field';
import { step } from './sim/step';
import { createPlayer } from './tools/trailer/player.mjs';
for(const gain of [.065,.09,.12]) {
 const state=createSimState(HOME_FIELD,25,20260821),rng=createTickRng(20260821),drive=createPlayer({gain});
 let stops=0,last=0; const entries=[];
 for(let tick=0;tick<36000&&!state.completed;tick++) {
   const input=drive(state);step(state,[input],rng);
   const speed=state.dogs[0].velocity.magnitude(); if(speed<.2&&last>=.2)stops++;last=speed;
   if(state.pennedCount>(entries.at(-1)?.penned??0))entries.push({seconds:tick/60,penned:state.pennedCount});
 }
 console.log(JSON.stringify({gain,completed:state.completed,seconds:state.tick/60,stops,entries}));
}
`,resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
