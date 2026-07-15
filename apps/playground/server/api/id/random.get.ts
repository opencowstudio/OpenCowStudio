import { generateId } from '@opencowstudio/pg-core'

export default defineEventHandler(() => {
  return {
    id: generateId(),
  }
})
