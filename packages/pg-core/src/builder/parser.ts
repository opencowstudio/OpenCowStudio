import ts from 'typescript'
import { normalize } from 'node:path'
import { consola } from 'consola'
import type {
  PgColumnOptions,
  PgEntityOptions,
  PgIndexOptions,
  PgKeyOptions,
} from '../decorators.ts'
import type {
  PgColumnRaw,
  PgEntityRaw,
  PgIndexRaw,
  PgKeyRaw,
} from '../types.ts'

// Tagged logger so the core stays framework-agnostic (no Nuxt dep).
const logger = consola.withTag('pg-parser')

// ---------------------------------------------------------------------------
// Static decorator parser (builder)
//
// This module parses entity decorator *source* with the TypeScript compiler
// API — no module import, no class instantiation. The flow mirrors the
// requested steps:
//
//   1. createProgram            — build a ts.Program over the entity source files
//   2. findEntityClasses        — locate every @PgEntity class declaration
//   3. parseClassDecorator      — read the @PgEntity(...) options
//   4. parsePropertyDecorators  — read @PgKey / @PgColumn on each property
//   5. parsePgKey               — extract a single @PgKey's options
//   6. parsePgColumn            — extract a single @PgColumn's options
//   7. parseIndexDecorators     — read every @PgIndex(...) on the class
//   8. parsePgEntityRaw         — assemble the PgEntityRaw for one class
//
// A literal evaluator turns the decorator call arguments (object / array /
// string / number / boolean / null / simple identifier references) into plain
// JavaScript values.
// ---------------------------------------------------------------------------

/** Options controlling program creation and parsing behaviour. */
export interface ParseProgramOptions {
  /** Override the default compiler options used to build the Program. */
  compilerOptions?: ts.CompilerOptions
  /**
   * When true, a class that fails to parse is skipped (with a logged warning)
   * instead of aborting the whole scan. Default false.
   */
  skipInvalid?: boolean
}

// === Step 1 — create a TypeScript Program ================================

/**
 * Build a `ts.Program` over the given entity source files.
 *
 * Defaults target ESNext / Bundler resolution so native decorators
 * (`@PgEntity`, `@PgKey`, `@PgColumn`, `@PgIndex`) are parsed as decorator
 * nodes. Module resolution failures only surface as diagnostics and never
 * prevent the AST from being walked, so a project's imports need not resolve
 * for parsing to succeed.
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

/** A `@PgEntity`-decorated class together with the source file it lives in. */
export interface EntityClassNode {
  /** the class declaration */
  node: ts.ClassDeclaration
  /** the source file the class is declared in (needed because a Program does
   * not set parent pointers, so `node.getSourceFile()` is unavailable) */
  sourceFile: ts.SourceFile
}

/**
 * Find every `@PgEntity`-decorated class declaration declared in the root
 * source files of `program`. Declaration files and non-root files (e.g.
 * dependencies pulled in by imports) are skipped so only scanned entities are
 * returned.
 */
export function findEntityClassDeclarations(
  program: ts.Program,
  rootNames: string[],
): EntityClassNode[] {
  const rootSet = new Set(rootNames.map(name => normalize(name)))
  const result: EntityClassNode[] = []

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue
    if (!rootSet.has(normalize(sourceFile.fileName))) continue

    walkForEntityClasses(sourceFile, sourceFile, result)
  }
  return result
}

function walkForEntityClasses(node: ts.Node, sourceFile: ts.SourceFile, out: EntityClassNode[]): void {
  if (ts.isClassDeclaration(node) && node.name && getDecorator(node, 'PgEntity')) {
    out.push({ node, sourceFile })
  }
  ts.forEachChild(node, child => walkForEntityClasses(child, sourceFile, out))
}

// === Step 3 — parse class decorator (@PgEntity) =========================

/**
 * Parse the `@PgEntity(...)` decorator into its `PgEntityOptions`.
 *
 * Returns an empty object when the decorator is supplied without arguments.
 */
export function parseClassDecorator(
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile,
): PgEntityOptions {
  return parseOptionsArgument<PgEntityOptions>(decorator, sourceFile, 'PgEntity')
}

// === Step 4 — parse property decorators (@PgKey / @PgColumn) ============

/** Result of parsing a class's property decorators. */
export interface ParsedPropertyDecorators {
  /** the single @PgKey field (exactly one allowed) */
  key?: PgKeyRaw
  /** every @PgColumn field */
  columns: PgColumnRaw[]
}

/**
 * Walk a class's member list and parse every `@PgKey` / `@PgColumn` property
 * decorator into its raw form. Throws when more than one `@PgKey` is declared,
 * because an entity must have exactly one key.
 */
export function parsePropertyDecorators(
  members: ts.NodeArray<ts.ClassElement>,
  sourceFile: ts.SourceFile,
): ParsedPropertyDecorators {
  const result: ParsedPropertyDecorators = { columns: [] }
  const keyPropertyNames: string[] = []

  for (const member of members) {
    if (!ts.isPropertyDeclaration(member)) continue
    const propertyKey = propertyName(member)
    if (!propertyKey) continue

    const keyDecorator = getDecorator(member, 'PgKey')
    const columnDecorator = getDecorator(member, 'PgColumn')

    if (keyDecorator) {
      keyPropertyNames.push(propertyKey)
      result.key = parsePgKey(keyDecorator, propertyKey, sourceFile) // Step 5
    } else if (columnDecorator) {
      result.columns.push(parsePgColumn(columnDecorator, propertyKey, sourceFile)) // Step 6
    }
  }

  if (keyPropertyNames.length > 1) {
    const message = `Entity declares multiple @PgKey fields (${keyPropertyNames.join(', ')}); an entity must declare exactly one @PgKey.`
    logger.error(message)
    throw new Error(message)
  }

  return result
}

// === Step 5 — parse PgKey ===============================================

/**
 * Parse a single `@PgKey(...)` decorator into a `PgKeyRaw`.
 */
export function parsePgKey(
  decorator: ts.Decorator,
  propertyKey: string,
  sourceFile: ts.SourceFile,
): PgKeyRaw {
  const options = parseOptionsArgument<PgKeyOptions>(decorator, sourceFile, 'PgKey')
  return { propertyKey, options }
}

// === Step 6 — parse PgColumn ============================================

/**
 * Parse a single `@PgColumn(...)` decorator into a `PgColumnRaw`.
 */
export function parsePgColumn(
  decorator: ts.Decorator,
  propertyKey: string,
  sourceFile: ts.SourceFile,
): PgColumnRaw {
  const options = parseOptionsArgument<PgColumnOptions>(decorator, sourceFile, 'PgColumn')
  return { propertyKey, options }
}

// === Step 7 — parse @PgIndex decorators ==================================

/**
 * Parse every `@PgIndex(...)` decorator declared on a class into a `PgIndexRaw`.
 *
 * Multiple `@PgIndex` decorators may be applied to the same class; each becomes
 * one entry in the returned array (in declaration order).
 */
export function parseIndexDecorators(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): PgIndexRaw[] {
  const decorators = getDecorators(node, 'PgIndex')
  return decorators.map(decorator => ({
    options: parseOptionsArgument<PgIndexOptions>(decorator, sourceFile, 'PgIndex'),
  }))
}

// === Step 8 — assemble PgEntityRaw =======================================

/**
 * Build the unmodified `PgEntityRaw` for a single `@PgEntity` class declaration.
 *
 * Returns `undefined` when the class is not decorated with `@PgEntity` (so it
 * can be called defensively while walking the tree). Throws when the class
 * declares no `@PgKey` field, because an entity must declare exactly one.
 *
 * This performs NO transformation: defaults are not applied, identifiers are
 * not validated, and BooleanLike strings are not coerced — that all lives in
 * `runtime/repository.ts`.
 */
export function parsePgEntityRaw(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): PgEntityRaw | undefined {
  const entityDecorator = getDecorator(node, 'PgEntity')
  if (!node.name || !entityDecorator) return undefined

  const className = node.name.text
  const options = parseClassDecorator(entityDecorator, sourceFile) // Step 3
  const { key, columns } = parsePropertyDecorators(node.members, sourceFile) // Step 4
  const indexes = parseIndexDecorators(node, sourceFile) // Step 7

  if (!key) {
    const message = `Entity "${className}" declares no @PgKey field; an entity must declare exactly one @PgKey.`
    logger.error(message)
    throw new Error(message)
  }

  return { className, options, key, columns, indexes }
}

// === Top-level orchestrator ============================================

/**
 * Build a Program from `rootNames`, find every `@PgEntity` class, and return
 * their `PgEntityRaw` in declaration order.
 */
export function parsePgEntities(
  rootNames: string[],
  options: ParseProgramOptions = {},
): PgEntityRaw[] {
  const program = createProgram(rootNames, options) // Step 1
  const classes = findEntityClassDeclarations(program, rootNames) // Step 2

  const result: PgEntityRaw[] = []
  for (const { node, sourceFile } of classes) {
    if (options.skipInvalid) {
      try {
        const raw = parsePgEntityRaw(node, sourceFile) // Steps 3–8
        if (raw) result.push(raw)
      } catch (err) {
        logger.warn(`Skipping entity "${node.name?.text ?? 'anonymous'}": ${String(err)}`)
      }
    } else {
      const raw = parsePgEntityRaw(node, sourceFile) // Steps 3–8
      if (raw) result.push(raw)
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
  return decorators.find((decorator) => isDecoratorNamed(decorator, name))
}

/** Return every `@<name>` decorator on `node` (call or bare form). */
function getDecorators(node: ts.Node, name: string): ts.Decorator[] {
  if (!ts.canHaveDecorators(node)) return []
  const decorators = ts.getDecorators(node)
  if (!decorators) return []
  return decorators.filter((decorator) => isDecoratorNamed(decorator, name))
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
    const message = `@${decoratorName} expects an object-literal argument at ${positionText(arg, sourceFile)}.`
    logger.error(message)
    throw new Error(message)
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
 * identifiers that resolve to a `const` declared in the same source file
 * (including `true` / `false` / `null` / `undefined` keywords). Anything else
 * (e.g. a function call, a cross-file import, a computed expression we cannot
 * statically reduce) throws with a position-aware message.
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
      const message = `Cannot evaluate unary expression at ${positionText(node, sourceFile)}; operand must be numeric.`
      logger.error(message)
      throw new Error(message)
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

  const message = `Cannot evaluate decorator expression of kind ${ts.SyntaxKind[node.kind]} at ${positionText(node, sourceFile)}.`
  logger.error(message)
  throw new Error(message)
}

/**
 * Resolve an identifier used inside a decorator to a literal value.
 *
 * Keywords `true` / `false` / `null` / `undefined` map to their values. Any
 * other identifier is looked up as a local `const`/`let`/`var` declaration in
 * the same source file and its initializer is evaluated recursively.
 */
function resolveIdentifier(name: string, sourceFile: ts.SourceFile, atNode: ts.Node): LiteralValue {
  if (name === 'true') return true
  if (name === 'false') return false
  if (name === 'null') return null
  if (name === 'undefined') return undefined

  let found: LiteralValue | undefined
  // Only top-level variable statements can be referenced from a decorator, so
  // walk the source file's direct statements. This avoids descending into
  // import declarations (whose child nodes would otherwise be visited and can
  // surface as undefined children under a Program-based parse).
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
  const message = `Cannot resolve identifier "${name}" used in a decorator at ${positionText(atNode, sourceFile)}. Use a literal or a locally-declared constant.`
  logger.error(message)
  throw new Error(message)
}

// === Name / position helpers =============================================

/** Read a class property's declared name, or undefined when not statically known. */
function propertyName(member: ts.PropertyDeclaration): string | undefined {
  const name = member.name
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  if (ts.isComputedPropertyName(name)) {
    try {
      const value = evalLiteral(name.expression, member.getSourceFile())
      return value === null || value === undefined ? undefined : String(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Read an object-literal property name, or undefined when not statically known. */
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

/** Human-readable "file:line:col" location for a node, used in diagnostics. */
function positionText(node: ts.Node, sourceFile: ts.SourceFile): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`
}
