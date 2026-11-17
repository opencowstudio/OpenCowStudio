// ---------------------------------------------------------------------------
// API — builder subpath exports (build-time only)
//
// This entry pulls in `typescript` via the parser. Runtime-only consumers MUST
// NOT import from here; use the package root (`@opencowstudio/api-core`), which
// only reaches `decorators.ts` inside this layer.
// ---------------------------------------------------------------------------

export {
  createProgram,
  findApiControllerDeclarations,
  parseControllerDecorator,
  parseApiRoute,
  parseApiController,
  parseApiControllers,
} from './parser.ts'

export type {
  ApiControllerClassNode,
  LiteralValue,
  ParseApiControllerOptions,
  ParseProgramOptions,
} from './parser.ts'
