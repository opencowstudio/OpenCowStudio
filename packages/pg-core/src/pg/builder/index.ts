// ---------------------------------------------------------------------------
// PostgreSQL — builder subpath exports (build-time only)
//
// This entry pulls in `typescript` via the parser. Runtime-only consumers
// MUST NOT import from here; use the package root (`@opencowstudio/pg-core`).
// ---------------------------------------------------------------------------

export {
  createProgram,
  findEntityClassDeclarations,
  parseClassDecorator,
  parsePropertyDecorators,
  parsePgKey,
  parsePgColumn,
  parseIndexDecorators,
  parsePgEntityRaw,
  parsePgEntities,
} from './parser'
export type {
  ParseProgramOptions,
  ParsedPropertyDecorators,
  LiteralValue,
  EntityClassNode,
} from './parser'
