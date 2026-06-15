// The Store port: key/value persistence that travels with the document and
// survives reloads. The tool keeps its registries here (slices, specs, links),
// because containers cannot themselves carry metadata on every canvas.

export interface Store {
  read<T>(key: string, fallback: T): Promise<T>;
  write(key: string, value: unknown): Promise<void>;
}
