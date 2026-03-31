export interface SymbolReference {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'module';
  filePath: string;
  line?: number;
  endLine?: number;
}

export function createSymbolReferenceId(name: string, filePath: string): string {
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedPath = filePath.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sym_${sanitizedName}_${sanitizedPath}`;
}
