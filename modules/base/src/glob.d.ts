// Ambient declarations for Vite's import.meta.glob, used by the Nuxt module
// setup to scan entity files. Vite provides this at build time; this keeps
// tsc --noEmit happy in the module's standalone type-check.
interface ImportMeta {
  glob(pattern: string, options?: { eager?: boolean }): Record<string, unknown>
}
