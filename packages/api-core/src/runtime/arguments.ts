import type {
  ApiRequest,
  ApiRouteParameter,
  ApiSchemaRegistry,
} from '../shared/types.ts'
import { resolveApiInput } from './schema.ts'

// ---------------------------------------------------------------------------
// Handler argument injection
//
// The parser records, per route, which protocol value each declared parameter
// receives. This module turns those parameters into the actual argument list, so
// the router and the HTTP adapters inject the same values in the same order.
//
// Two sources exist today — they are the protocol layer, not the implementation:
//   * `'request'` — the whole `ApiRequest` (path, params, query, headers, body),
//     selected by declaring that type;
//   * `'input'`   — the request JSON (`ApiRequest.body`) parsed by the schema
//     named after the parameter's declared type. Any number of input parameters
//     may be declared, and each one receives its own parsed copy.
//
// Adding a source means adding a member to `ApiParameterSource`, a parser
// mapping and a case below — the switch is exhaustive, so TypeScript points at
// what is missing.
// ---------------------------------------------------------------------------

/**
 * Build the arguments of a route handler, in declaration order.
 *
 * Each declared parameter receives the value its type selected at build time, so
 * a handler may declare any number of them, in any order, including none at all.
 *
 * @param request The request built for the matched route.
 * @param parameters The injected parameters, in declaration order.
 * @param schemas The generated schema registry, keyed by type name.
 *
 * @throws An `ApiError` (`{ code, message }`) when the request JSON does not
 *         match an input schema, so the pipeline answers a `400` before the
 *         handler runs.
 */
export function toApiArguments(
  request: ApiRequest,
  parameters: readonly ApiRouteParameter[],
  schemas: ApiSchemaRegistry = {},
): unknown[] {
  return parameters.map(parameter => toApiArgument(request, parameter, schemas))
}

/** Resolve one declared parameter into the value injected into the handler. */
function toApiArgument(
  request: ApiRequest,
  parameter: ApiRouteParameter,
  schemas: ApiSchemaRegistry,
): unknown {
  switch (parameter.source) {
    case 'request':
      return request
    case 'input': {
      if (!parameter.inputTypeName) {
        throw {
          code: 500,
          message: `Route parameter "${parameter.name}" is an input without a recorded type name.`,
        }
      }
      return resolveApiInput(schemas, parameter.inputTypeName, request.body)
    }
  }
}
