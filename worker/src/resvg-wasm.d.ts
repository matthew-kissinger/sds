// The card rasterizer loads this module. The file itself is the wasm the
// package ships; this declaration is only so the worker typecheck accepts
// the dynamic import.
declare module '@resvg/resvg-wasm/index_bg.wasm' {
  const wasm: WebAssembly.Module;
  export default wasm;
}
