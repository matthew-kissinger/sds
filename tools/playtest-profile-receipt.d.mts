export interface BuiltFileReceipt {
  readonly name: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export interface BuildReceipt {
  readonly gitHead: string;
  readonly files: readonly BuiltFileReceipt[];
}

export function collectBuiltFiles(dist: string): BuiltFileReceipt[];
export function collectBuildReceipt(repo: string): BuildReceipt;
export function sameBuildReceipt(a: BuildReceipt, b: BuildReceipt): boolean;
