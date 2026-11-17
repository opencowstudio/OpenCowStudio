import type { ApiParameterSource, ApiRequestContext } from '../shared/types.ts'

// ---------------------------------------------------------------------------
// Handler argument injection
//
// The parser records, per route, which request value each declared parameter
// receives. This module turns those sources into the actual argument list, so
// the router and the HTTP adapters inject the same values in the same order.
//
// `ApiRequestContext` is the only injectable type today; supporting another one
// means adding a source (see `ApiParameterSource`), a parser mapping and a case
// below — the switch is exhaustive, so TypeScript points at what is missing.
// ---------------------------------------------------------------------------

/**
 * Build the arguments of a route handler, in declaration order.
 *
 * Each declared parameter receives the request value its type selected at build
 * time, so a handler may declare any number of them, in any order, including
 * none at all.
 *
 * @param context The request context built for the matched request.
 * @param sources The injected source of every parameter, in declaration order.
 */
export function toApiArguments(
  context: ApiRequestContext,
  sources: readonly ApiParameterSource[],
): unknown[] {
  return sources.map((source) => {
    switch (source) {
      case 'context':
        return context
    }
  })
}
