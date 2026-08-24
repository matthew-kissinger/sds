# Contributing to Sheepdog Sim

Thank you for helping improve the field.

## Before changing code

1. Read `AGENTS.md`.
2. Read `spec/00-vision.md`.
3. Read the specification document for the system you will change.
4. Check `STATUS.md` for known gaps and recorded product decisions.

The specification is the contract. If the implementation and specification
disagree, describe the discrepancy in the change rather than silently choosing
one side.

## Development setup

Use Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Before opening a change:

```bash
npm run lint
npm test
npm run build
node tools/determinism-crosscheck.mjs
npm run probe:release
```

Do not regenerate deterministic fixtures merely to make a test pass. A fixture
diff records a simulation decision and must be reviewed as one.

## Project boundaries

- `sim/` must remain independent from Three.js, React, DOM and network code.
- Flock size is configuration, not a game mode.
- Materials use TSL through one renderer path.
- Player interface state flows through the store, not browser globals or custom
  event bridges.
- Do not add compatibility aliases or dormant feature flags.
- Every runtime asset needs an editable source or reproducible recipe and a
  documented license.
- Validation tools drive the normal application path and do not add production
  player controls.

## Changes and reviews

Keep commits focused and use conventional commit subjects such as `fix:`,
`feat:`, `test:` or `docs:`. Include:

- the player-visible behavior;
- tests and commands run;
- desktop and mobile evidence when presentation changed;
- renderer and performance evidence when visual cost changed;
- asset provenance when media or models changed;
- remaining risks or deliberate specification exceptions.

Do not commit build output, local captures, environment files, credentials,
browser profiles or generated diagnostic archives.

## Licensing

Contributions to source code are provided under AGPL-3.0-or-later. Only submit
assets you own or are allowed to redistribute under the documented asset policy.
Record the source, authoring method, license, processing recipe and digest for
new runtime media.
