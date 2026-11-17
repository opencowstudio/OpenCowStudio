import ts from 'typescript'
import { normalize } from 'node:path'
import { consola } from 'consola'
import { joinApiPaths, normalizeApiPath } from '../shared/path.ts'
import { DEFAULT_API_METHODS } from '../shared/types.ts'
import type { ApiControllerOptions, ApiRouteOptions } from './decorators.ts'
import type {
  ApiControllerMetadata,
  ApiParameterSource,
  ApiRouteMetadata,
  ApiRouteParameter,
} from '../shared/types.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('api-parser')

// ---------------------------------------------------------------------------
// Static decorator parser + metadata resolver (builder)
//
// This module parses controller decorator *source* with the TypeScript compiler
// API — no module import, no class instantiation. The flow:
//
//   1. createProgram               — build a ts.Program over the source files
//   2. findApiControllerDeclarations — locate every @ApiController class
//   3. parseControllerDecorator    — read the @ApiController(...) options
//   4. parseApiRoute               — read the @ApiRoute(...) options per method
//   5. parseApiController          — assemble + validate one controller
//   6. parseApiControllers         — walk every file, reject duplicate routes
//
// A literal evaluator turns the decorator call arguments (object / array /
// string / number / boolean / null / simple identifier references) into plain
// JavaScript values, so options may be written inline or through a
// locally-declared constant.
// ---------------------------------------------------------------------------

/** Name of the class decorator registering a controller. */
const CONTROLLER_DECORATOR = 'ApiController'

/** Name of the method decorator registering a route. */
const ROUTE_DECORATOR = 'ApiRoute'

/**
 * Type names a handler parameter may declare, mapped to the request value
 * injected into it. Adding an injectable type means adding an entry here (and a
 * case to the runtime resolver).
 */
const PARAMETER_SOURCES: Record<string, ApiParameterSource> = {
  ApiRequestContext: 'context',
}

/** Options controlling how a single controller's metadata is assembled. */
export interface ParseApiControllerOptions {
  /**
   * Resolve the `modulePath` recorded on a controller from the absolute path of
   * the source file declaring it. The caller decides the form the runtime needs
   * — the Nuxt module records it relative to the project root so the generated
   * manifest can import the class from there. Defaults to the source file path
   * as-is.
   */
  resolveModulePath?: (sourceFile: string) => string
}

/** Options controlling program creation and parsing behaviour. */
export interface ParseProgramOptions extends ParseApiControllerOptions {
  /** Override the default compiler options used to build the Program. */
  compilerOptions?: ts.CompilerOptions
  /**
   * When true, a controller that fails to parse is skipped (with a logged
   * warning) instead of aborting the whole scan. Default false.
   */
  skipInvalid?: boolean
}

// === Step 1 — create a TypeScript Program ================================

/**
 * Build a `ts.Program` over the given source files.
 *
 * Defaults target ESNext / Bundler resolution so native decorators
 * (`@ApiController`, `@ApiRoute`) are parsed as decorator nodes. Module
 * resolution failures only surface as diagnostics and never prevent the AST
 * from being walked, so a project's imports need not resolve for parsing to
 * succeed.
 */
export function createProgram(rootNames: string[], options: ParseProgramOptions = {}): ts.Program {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
    ...options.compilerOptions,
  }
  return ts.createProgram(rootNames, compilerOptions)
}

// === Step 2 — find class declarations ====================================

/** An `@ApiController`-decorated class together with the file it lives in. */
export interface ApiControllerClassNode {
  /** the class declaration */
  node: ts.ClassDeclaration
  /** the source file the class is declared in (a Program does not set parent
   * pointers, so `node.getSourceFile()` is unavailable) */
  sourceFile: ts.SourceFile
}

/**
 * Find every `@ApiController`-decorated class declared in the root source files
 * of `program`. Declaration files and non-root files (e.g. dependencies pulled
 * in by imports) are skipped so only scanned controllers are returned.
 */
export function findApiControllerDeclarations(
  program: ts.Program,
  rootNames: string[],
): ApiControllerClassNode[] {
  const rootSet = new Set(rootNames.map(name => normalize(name)))
  const result: ApiControllerClassNode[] = []

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue
    if (!rootSet.has(normalize(sourceFile.fileName))) continue

    walkForControllerClasses(sourceFile, sourceFile, result)
  }
  return result
}

function walkForControllerClasses(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  out: ApiControllerClassNode[],
): void {
  if (ts.isClassDeclaration(node) && node.name && getDecorator(node, CONTROLLER_DECORATOR)) {
    out.push({ node, sourceFile })
  }
  ts.forEachChild(node, child => walkForControllerClasses(child, sourceFile, out))
}

// === Step 3 — parse the class decorator (@ApiController) =================

/**
 * Parse the `@ApiController(...)` decorator into its `ApiControllerOptions`.
 *
 * Returns an empty object when the decorator is supplied without arguments.
 */
export function parseControllerDecorator(
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
): ApiControllerOptions {
  return parseOptionsArgument<ApiControllerOptions>(decorator, sourceFile, CONTROLLER_DECORATOR)
}

// === Step 4 — parse a method decorator (@ApiRoute) =======================

/**
 * Parse a single `@ApiRoute(...)` decorator on a controller method into one
 * resolved {@link ApiRouteMetadata} per declared path.
 *
 * Every route answers {@link DEFAULT_API_METHODS} (`POST`); the
 * decorator only configures paths and the description. Out-of-contract values
 * are rejected (logged + thrown), and declaring several paths yields several
 * entries sharing the handler, name and methods.
 *
 * @param member The decorated method declaration.
 * @param decorator The `@ApiRoute` decorator node.
 * @param sourceFile The file declaring the method, used for diagnostics.
 * @param className The declaring class name, used in defaults and diagnostics.
 */
export function parseApiRoute(
  member: ts.MethodDeclaration,
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
  className: string,
): ApiRouteMetadata[] {
  const handler = propertyNameFrom(member.name, sourceFile)
  if (!handler) {
    const message = `Cannot resolve the name of a @ApiRoute method on controller "${className}" at ${positionText(member, sourceFile)}.`
    fail(message)
  }

  const options = parseOptionsArgument<ApiRouteOptions>(decorator, sourceFile, ROUTE_DECORATOR)
  const context = `route ${className}.${handler}`
  const description = resolveDescription(options.description, `${context}.description`)
  const parameters = resolveParameters(member, sourceFile, context)

  return resolvePaths(options.path, `${context}.path`).map(path => ({
    handler,
    methods: [...DEFAULT_API_METHODS],
    parameters,
    path,
    name: `${className}.${handler}`,
    description,
  }))
}

/** Every `METHOD path` pair a route occupies, used for duplicate detection. */
function routeKeys(route: ApiRouteMetadata): string[] {
  return route.methods.map(method => `${method} ${route.path}`)
}

// === Step 5 — assemble + validate one controller ========================

/**
 * Build the fully-resolved `ApiControllerMetadata` for a single
 * `@ApiController` class declaration.
 *
 * Returns `undefined` when the class is not decorated with `@ApiController`, so
 * it can be called defensively while walking the tree. Throws when a
 * `@ApiRoute` is misplaced (only instance methods are allowed) or when the same
 * path is declared twice on the controller.
 *
 * The recorded `className` identifies the class inside its module and
 * `modulePath` the module itself, so the runtime can import the class and bind
 * each route handler by its method name.
 */
export function parseApiController(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  options: ParseApiControllerOptions = {},
): ApiControllerMetadata | undefined {
  const controllerDecorator = getDecorator(node, CONTROLLER_DECORATOR)
  if (!node.name || !controllerDecorator) return undefined

  const className = node.name.text
  const modulePath = options.resolveModulePath
    ? options.resolveModulePath(sourceFile.fileName)
    : sourceFile.fileName
  const controllerOptions = parseControllerDecorator(controllerDecorator, sourceFile) // Step 3
  const context = `controller ${className}`
  // A controller owns neither a path nor a name: every route declares its full
  // path, and the class name identifies the controller.
  const basePath = '/'

  const routes: ApiRouteMetadata[] = []
  const seen = new Set<string>()

  for (const member of node.members) {
    const routeDecorator = getDecorator(member, ROUTE_DECORATOR)
    if (!routeDecorator) continue

    if (!ts.isMethodDeclaration(member)) {
      fail(`Invalid @ApiRoute on ${context}: routes may only be declared on instance methods.`)
    }
    if (isStatic(member)) {
      fail(`Invalid @ApiRoute on ${context}.${propertyNameFrom(member.name, sourceFile) ?? '<anonymous>'}: a route handler must be an instance method, not static.`)
    }

    const parsed = parseApiRoute(member, routeDecorator, sourceFile, className) // Step 4

    for (const route of parsed) {
      const routeWithPath = { ...route, path: joinApiPaths(basePath, route.path) }

      // A method + path pair must be unique: the same path may still be reused
      // by another handler as long as their methods do not overlap.
      for (const key of routeKeys(routeWithPath)) {
        if (seen.has(key)) {
          fail(`Duplicate route "${key}" on ${context}; a method + path pair may only be declared once.`)
        }
        seen.add(key)
      }
      routes.push(routeWithPath)
    }
  }

  if (routes.length === 0) {
    logger.warn(`${context} declares no @ApiRoute method; it will not answer any request.`)
  }

  return {
    className,
    modulePath,
    name: className,
    path: basePath,
    description: resolveDescription(controllerOptions.description, `${context}.description`),
    routes,
  }
}

// === Step 6 — top-level orchestrator ====================================

/**
 * Build a Program from `rootNames`, find every `@ApiController` class, and
 * return their resolved `ApiControllerMetadata` in declaration order.
 *
 * Routes are guaranteed to be unique across the whole scan: the same full path
 * declared by two controllers is rejected (logged + thrown), because only one
 * of them could ever be dispatched.
 */
export function parseApiControllers(
  rootNames: string[],
  options: ParseProgramOptions = {},
): ApiControllerMetadata[] {
  const program = createProgram(rootNames, options) // Step 1
  const classes = findApiControllerDeclarations(program, rootNames) // Step 2

  const result: ApiControllerMetadata[] = []
  const owners = new Map<string, string>()

  // Register one controller: reject the whole controller when any of its routes
  // is already owned by another one, so the scan never yields a partial table.
  const accept = (metadata: ApiControllerMetadata): void => {
    const owner = `${metadata.name} (${metadata.className})`
    const keys = metadata.routes.flatMap(route => routeKeys({
      ...route,
      path: joinApiPaths(metadata.path, route.path),
    }))

    for (const key of keys) {
      const existing = owners.get(key)
      if (existing) {
        fail(`Duplicate route "${key}": declared by both ${existing} and ${owner}.`)
      }
    }
    for (const key of keys) owners.set(key, owner)
    result.push(metadata)
  }

  for (const { node, sourceFile } of classes) {
    if (options.skipInvalid) {
      try {
        const metadata = parseApiController(node, sourceFile, options) // Steps 3–5
        if (metadata) accept(metadata)
      } catch (err) {
        logger.warn(`Skipping controller "${node.name?.text ?? 'anonymous'}": ${String(err)}`)
      }
    } else {
      const metadata = parseApiController(node, sourceFile, options) // Steps 3–5
      if (metadata) accept(metadata)
    }
  }

  return result
}

// === Decorator helpers ===================================================

/** Return the first `@<name>` decorator on `node`, if any (call or bare form). */
function getDecorator(node: ts.Node, name: string): ts.Decorator | undefined {
  if (!ts.canHaveDecorators(node)) return undefined
  const decorators = ts.getDecorators(node)
  if (!decorators) return undefined
  return decorators.find(decorator => isDecoratorNamed(decorator, name))
}

/** Whether a decorator node is `@<name>` (call or bare form). */
function isDecoratorNamed(decorator: ts.Decorator, name: string): boolean {
  const expr = decorator.expression
  if (ts.isCallExpression(expr)) {
    return ts.isIdentifier(expr.expression) && expr.expression.text === name
  }
  return ts.isIdentifier(expr) && expr.text === name
}

/** Return the argument list of a decorator call, or undefined when bare. */
function getDecoratorArguments(decorator: ts.Decorator): ts.NodeArray<ts.Expression> | undefined {
  const expr = decorator.expression
  return ts.isCallExpression(expr) ? expr.arguments : undefined
}

/**
 * Read the first argument of a decorator call as a plain object. Returns an
 * empty object when the decorator is called without arguments.
 */
function parseOptionsArgument<T extends object>(
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
  decoratorName: string,
): T {
  const args = getDecoratorArguments(decorator)
  const arg = args?.[0]
  if (!arg) return {} as T

  const value = evalLiteral(arg, sourceFile)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`@${decoratorName} expects an object-literal argument at ${positionText(arg, sourceFile)}.`)
  }
  return value as T
}

// === Literal evaluation ==================================================

/** The subset of JavaScript values a decorator literal may evaluate to. */
export type LiteralValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LiteralValue[]
  | { [key: string]: LiteralValue }

/**
 * Evaluate a decorator argument expression into a plain JavaScript value.
 *
 * Supports literals (string / number / boolean / null / undefined), unary
 * minus, parentheses / `as` / non-null wrappers, arrays, object literals, and
 * identifiers resolving to a declaration in the same source file (including
 * `true` / `false` / `null` / `undefined`). Anything else (a function call, a
 * cross-file import, a computed expression we cannot statically reduce) is
 * rejected with a position-aware message.
 */
function evalLiteral(node: ts.Node, sourceFile: ts.SourceFile): LiteralValue {
  if (ts.isParenthesizedExpression(node)) return evalLiteral(node.expression, sourceFile)
  if (ts.isAsExpression(node)) return evalLiteral(node.expression, sourceFile)
  if (ts.isNonNullExpression(node)) return evalLiteral(node.expression, sourceFile)

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return undefined

  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evalLiteral(node.operand, sourceFile)
    if (typeof operand !== 'number') {
      fail(`Cannot evaluate unary expression at ${positionText(node, sourceFile)}; operand must be numeric.`)
    }
    return node.operator === ts.SyntaxKind.MinusToken ? -operand : operand
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(element => evalLiteral(element, sourceFile))
  }

  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, LiteralValue> = {}
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const keyName = propertyNameFrom(prop.name, sourceFile)
        if (keyName === undefined) continue
        obj[keyName] = evalLiteral(prop.initializer, sourceFile)
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        obj[prop.name.text] = resolveIdentifier(prop.name.text, sourceFile, prop)
      } else if (ts.isSpreadAssignment(prop)) {
        const spread = evalLiteral(prop.expression, sourceFile)
        if (spread && typeof spread === 'object' && !Array.isArray(spread)) {
          Object.assign(obj, spread)
        }
      }
    }
    return obj
  }

  if (ts.isIdentifier(node)) {
    return resolveIdentifier(node.text, sourceFile, node)
  }

  fail(`Cannot evaluate decorator expression of kind ${ts.SyntaxKind[node.kind]} at ${positionText(node, sourceFile)}.`)
}

/**
 * Resolve an identifier used inside a decorator to a literal value.
 *
 * Keywords `true` / `false` / `null` / `undefined` map to their values. Any
 * other identifier is looked up as a top-level variable declaration in the same
 * source file and its initializer is evaluated recursively.
 */
function resolveIdentifier(name: string, sourceFile: ts.SourceFile, atNode: ts.Node): LiteralValue {
  if (name === 'true') return true
  if (name === 'false') return false
  if (name === 'null') return null
  if (name === 'undefined') return undefined

  let found: LiteralValue | undefined
  // Only top-level variable statements can be referenced from a decorator, so
  // walk the source file's direct statements. This avoids descending into
  // import declarations (whose child nodes can surface as undefined children
  // under a Program-based parse).
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        found = evalLiteral(declaration.initializer, sourceFile)
        break
      }
    }
    if (found !== undefined) break
  }

  if (found !== undefined) return found
  fail(`Cannot resolve identifier "${name}" used in a decorator at ${positionText(atNode, sourceFile)}. Use a literal or a locally-declared constant.`)
}

// === Name / position helpers =============================================

/** Read a member's declared name, or undefined when not statically known. */
function propertyNameFrom(name: ts.PropertyName, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  if (ts.isComputedPropertyName(name)) {
    try {
      const value = evalLiteral(name.expression, sourceFile)
      return value === null || value === undefined ? undefined : String(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Whether a class member is declared `static`. */
function isStatic(member: ts.ClassElement): boolean {
  if (!ts.canHaveModifiers(member)) return false
  return ts.getModifiers(member)?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false
}

/** Human-readable "file:line:col" location for a node, used in diagnostics. */
function positionText(node: ts.Node, sourceFile: ts.SourceFile): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`
}

// === Resolution helpers ==================================================

/** Log and throw a parse diagnostic. */
function fail(message: string): never {
  logger.error(message)
  throw new Error(message)
}

/**
 * Validate and normalise the declared route paths.
 *
 * At least one path is required: a route without one would have to fall back to
 * a controller-level base path, which no longer exists. A single string and an
 * array of strings are both accepted; every path is normalised into the form the
 * router matches against, and repeated paths are collapsed.
 */
function resolvePaths(value: unknown, context: string): string[] {
  if (value === undefined) {
    fail(`Missing required path for ${context}. Every @ApiRoute must declare at least one path.`)
  }

  const declared = Array.isArray(value) ? value : [value]
  if (declared.length === 0) {
    fail(`Invalid path for ${context}: at least one path is required.`)
  }

  const paths = declared.map((entry) => {
    if (typeof entry !== 'string') {
      fail(`Invalid path for ${context}: expected a string, but got type "${typeof entry}".`)
    }
    return normalizeApiPath(entry)
  })

  return [...new Set(paths)]
}

/** The injectable type names, for diagnostics. */
const PARAMETER_TYPE_NAMES = Object.keys(PARAMETER_SOURCES)

/**
 * Resolve the parameters injected into a route handler, in declaration order.
 *
 * The signature is read statically, because types are erased at runtime: each
 * parameter is injected according to its declared type (see
 * {@link PARAMETER_SOURCES}), so the order and the number of parameters are
 * free. A parameter whose type is not injectable is rejected instead of being
 * silently left `undefined`.
 */
function resolveParameters(
  member: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  context: string,
): ApiRouteParameter[] {
  const position = positionText(member, sourceFile)

  return member.parameters.map((parameter) => {
    if (parameter.dotDotDotToken) {
      fail(`Invalid handler signature for ${context} at ${position}: a @ApiRoute handler cannot declare a rest parameter.`)
    }

    const source = parameter.type ? resolveParameterSource(parameter.type) : undefined
    if (!source) {
      fail(`Invalid handler signature for ${context} at ${position}: every parameter must be typed as ${PARAMETER_TYPE_NAMES.join(', ')}.`)
    }

    return { name: parameterName(parameter.name), source }
  })
}

/** Read the injected source from a parameter type annotation. */
function resolveParameterSource(node: ts.TypeNode): ApiParameterSource | undefined {
  if (!ts.isTypeReferenceNode(node)) return undefined

  const name = ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text
  return Object.hasOwn(PARAMETER_SOURCES, name) ? PARAMETER_SOURCES[name] : undefined
}

/** Read a parameter's declared name; a destructuring pattern has none. */
function parameterName(name: ts.BindingName): string {
  return ts.isIdentifier(name) ? name.text : '<destructured>'
}

/** Resolve an optional description; undefined defaults to the empty string. */
function resolveDescription(value: unknown, context: string): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') {
    fail(`Invalid description for ${context}: expected a string, but got type "${typeof value}".`)
  }
  return value
}
