// SPDX-License-Identifier: AGPL-3.0-or-later
// A `?url` import of a binary, for the lab only.
//
// The game resolves its binaries with `new URL(..., import.meta.url)` so those
// modules stay valid without a bundler rewriting the specifier
// (app/src/world/heightfield.ts says why). The lab cannot: its Vite root is
// `lab/`, so a relative URL from a lab module resolves under that root rather
// than under the repository, and the asset sits outside it. `?url` is Vite
// asking the bundler for the served path, which is correct here precisely
// because nothing in `lab/` ever leaves the dev server.
declare module '*.glb?url' {
  const src: string;
  export default src;
}
