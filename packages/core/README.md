# @opencowstudio/core

Shared, framework-agnostic core helpers for [`opencowstudio`](../../README.md).

This package has **no** dependency on Nuxt, a database driver, or any
framework, so it can be consumed from any Node.js environment.

- Id generation utilities (`generateGuid`, `generateId`) under `utils/`: a
  time-ordered UUID v7 and a shorter base-55 encoded variant.

## Usage

```ts
import { generateGuid, generateId } from '@opencowstudio/core'

const guid = generateGuid()
const id = generateId()
```
