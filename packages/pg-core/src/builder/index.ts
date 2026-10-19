// ---------------------------------------------------------------------------
// PostgreSQL — builder subpath exports (build-time only)
//
// This entry pulls in `typescript` via the parser. Runtime-only consumers MUST
// NOT import from here; use the package root (`@opencowstudio/pg-core`), which
// only reaches `decorators.ts` inside this layer.
// ---------------------------------------------------------------------------

export {
  createProgram,
  findEntityClassDeclarations,
  parseClassDecorator,
  parsePropertyDecorators,
  parsePgKey,
  parsePgColumn,
  parsePgEntity,
  parsePgEntities,
} from './parser'

// Identifier validation lives in `shared/` (naming concern, no parser needed);
// it is re-exported here because the builder is what enforces it.
export { assertValidPgName } from '../shared/naming.ts'
export type {
  ParsePgEntityOptions,
  ParseProgramOptions,
  ParsedPropertyDecorators,
  ParsedKeyField,
  ParsedColumnField,
  LiteralValue,
  EntityClassNode,
} from './parser'
