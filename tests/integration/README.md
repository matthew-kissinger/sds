# Integration tests

Two-client end-to-end harness for the Cloudflare Workers backend retry. The
suite is split in two:

- `harness.spec.ts` - self-tests of the scaffolding. Runs offline against a
  local mock WebSocket server and must always pass. If these fail, the
  `TestClient`, fixtures, or MessagePack wiring is broken; fix before doing
  anything else.
- `flow.spec.ts` - the seven-step two-client flow from `docs/archive/POSTMORTEM.md`
  section 5.3. All tests are `test.skip` on the current codebase; the worker
  endpoints exist now (Cycle 2 shipped), so unskipping one at a time is a cheap
  insurance follow-up tracked in `docs/cycle-2-todo.md`.

## Running

```bash
npm install
npm run test:integration
```

Equivalent: `npx vitest run tests/integration`.

On the current codebase you should see every harness test pass and every
flow test report `SKIPPED` with the `[C-retry]` marker in its title.

## Unskipping flow tests during the retry

1. Start the local worker:

   ```bash
   cd worker && npx wrangler dev --port 8787
   ```

2. Point the suite at it (optional - these are the defaults):

   ```bash
   export INTEGRATION_WORKER_URL=http://localhost:8787
   export INTEGRATION_WORKER_WS=ws://localhost:8787
   ```

3. Edit `flow.spec.ts`. For the step you are implementing, change
   `test.skip(...)` to `test(...)`. Keep the `// C-retry: unskip when
   worker endpoint exists` comment in place on siblings that are still
   skipped - it is how the next agent finds them.

4. `npm run test:integration` and iterate until green.

5. Do **not** unskip a step whose prerequisite steps are still skipped -
   the test will not be meaningful on its own.

## Extending the harness

- **New client message type.** Add a round-trip case in
  `harness.spec.ts > encodeDecode`.
- **New server broadcast type.** Same place, plus a `client.waitFor(newType)`
  call in the relevant flow step.
- **New fixtures.** Add to `helpers/fixtures.ts` and keep
  `isValidPlayerFixture` permissive enough to cover the new shape, or
  tighten it with another guard.
- **Test-only backdoors.** If the retry decides to expose a
  `{t:'forceComplete'}` message for deterministic completion in step 7,
  keep it behind a compile-time flag in the worker so it cannot ship to
  production. The flow test already documents this as an open decision.

## Why the flow tests are TypeScript but skipped

The TypeScript type annotations on reconstructed message shapes
(`RegisterResponse`, `RoomCreateResponse`) are the cheapest place to
record what the retry is committing to. When the retry agent lands the
corresponding server handler, the type error you get from mismatched
response shape is a first line of defense before the runtime assertions
fire.

## Conventions

- Use `TestClient` from `helpers/wsClient.ts`. Do not write raw `ws`
  sockets in the flow tests - the helper's event log is how assertions
  stay readable when two clients interleave.
- Use `PLAYER_A` and `PLAYER_B` from `helpers/fixtures.ts`. Hard-coded
  persona strings inline in individual tests will drift as the worker
  changes; fixtures are the contract.
- Every test that opens a `TestClient` must `close()` it in a `finally`
  block, or the Vitest runner will hang.
