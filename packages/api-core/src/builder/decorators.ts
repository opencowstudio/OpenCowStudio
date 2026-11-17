// ---------------------------------------------------------------------------
// API decorators + their option types
//
// `@ApiController` / `@ApiRoute` are *static markers*. They carry no behaviour
// at runtime: all configuration is read by the build-time parser
// (`builder/parser.ts`) straight from the decorator *source*, so no controller
// class is ever instantiated while scanning.
//
// This module owns the decorator *option* types and has no runtime dependency,
// so the package entry can safely re-export the markers for controller classes
// to use at runtime.
// ---------------------------------------------------------------------------

/**
 * Options for @ApiController decorator.
 *
 * A controller carries no path or name of its own: every route declares its
 * full path through `@ApiRoute`, and the class name identifies the controller.
 */
export interface ApiControllerOptions {
  /** controller description, default '' */
  description?: string
}

/**
 * Options for @ApiRoute decorator.
 *
 * A route declares neither a method nor a name: it always answers `POST`, its
 * name is `${className}.${handler}`, and only the path(s) and the
 * description are configurable. Declaring several paths yields one route entry
 * per path.
 */
export interface ApiRouteOptions {
  /** full path(s) of the route, relative to the mount prefix; required */
  path: string | string[]
  /** route description, default '' */
  description?: string
}

// === @ApiController — marks a class as an API controller (static marker) ====

export function ApiController(_options: ApiControllerOptions = {}): <C extends abstract new (...args: unknown[]) => unknown>(
  value: C,
  context: ClassDecoratorContext<C>,
) => C | void {
  return function (_value: Function, _context: ClassDecoratorContext): void {
    // Marker only — raw options are read statically by the builder parser.
  }
}

// === @ApiRoute — marks a method as a route handler (static marker) =========

// The parameter list is `any[]` on purpose: a handler may declare any signature
// (e.g. `todos(context: ApiRequestContext)`), and `ClassMethodDecoratorContext`
// itself constrains its `Value` parameter to `(this: C, ...args: any) => any`.
// A stricter list would reject every handler that takes arguments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ApiRoute(_options: ApiRouteOptions): <C, V extends (this: C, ...args: any[]) => unknown>(
  value: V,
  context: ClassMethodDecoratorContext<C, V>,
) => void {
  return function <C, V extends (this: C, ...args: any[]) => unknown>(
    _value: V,
    _context: ClassMethodDecoratorContext<C, V>,
  ): void {
    // Marker only — raw options are read statically by the builder parser.
  }
}
