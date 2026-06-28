import { generateId } from '@opencowstudio/base/src/utils/id'

export default defineEventHandler(() => {
  return {
    id: generateId(),
  }
})
