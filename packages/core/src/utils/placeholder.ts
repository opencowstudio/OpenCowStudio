// Resolve `${name:defaultValue}` placeholders from environment variables.
//
// Supported syntax:
//   - `${name:defaultValue}` -> uses `process.env[name]` when set, otherwise `defaultValue`.
//   - `${name}`              -> required variable; throws when `process.env[name]` is unset.
//
// The default value may be empty (`${name:}`), which is still treated as having a
// default (an empty string) and therefore is not required.

const PLACEHOLDER_REGEX = /\$\{([^:}]+)(?::([^}]*))?\}/g

export interface PlaceholderOptions {
  // Source of variable values. Defaults to `process.env` when omitted.
  env?: NodeJS.ProcessEnv
}

export class Placeholder {
  private readonly env: NodeJS.ProcessEnv

  constructor(options: PlaceholderOptions = {}) {
    this.env = options.env ?? process.env
  }

  /**
   * Replace every `${name:defaultValue}` / `${name}` occurrence in `text`.
   *
   * @throws Error when a required variable (no default value) is not present in the env.
   */
  resolve(text: string): string {
    const missing: string[] = []

    const result = text.replace(
      PLACEHOLDER_REGEX,
      (match, name: string, defaultValue: string | undefined) => {
        const value = this.env[name]

        // A variable is "configured" only when it is defined in the env.
        // An explicitly empty string (`''`) counts as configured.
        if (value !== undefined) {
          return value
        }

        // A default was provided (possibly empty, e.g. `${name:}`).
        if (defaultValue !== undefined) {
          return defaultValue
        }

        // Required variable with no default and no env value.
        missing.push(name)
        return match
      },
    )

    if (missing.length > 0) {
      throw new Error(
        `Failed to resolve placeholder(s): missing required variable(s) not found in environment: ${missing.join(', ')}`,
      )
    }

    return result
  }
}

/**
 * Convenience helper that resolves placeholders against `process.env` (or a custom env).
 *
 * @see Placeholder for the full behavior.
 */
export function resolvePlaceholders(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return new Placeholder({ env }).resolve(text)
}
