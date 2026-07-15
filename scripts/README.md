# scripts

Repository automation scripts for the [`opencowstudio`](../README.md) monorepo.

This directory is the home for **dev, build, release, and CI/CD** tooling
(e.g. release tagging, changelog generation, publish orchestration, CI helpers).

Day-to-day commands are exposed as pnpm scripts in the root `package.json`
(`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm playground:dev`, ...), so
thin wrappers are intentionally not duplicated here.
