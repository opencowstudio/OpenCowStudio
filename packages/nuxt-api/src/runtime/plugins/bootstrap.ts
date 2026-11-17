import { consola } from 'consola'
import { defineNitroPlugin } from 'nitropack/runtime'
import { ApiRouter } from '@opencowstudio/api-core'
import { apiControllersMetadata, apiControllersTypeMap } from '#api-manifest'
import { setApiRouter } from '../utils/router'

const logger = consola.withTag('nuxt-api')

export default defineNitroPlugin(() => {
  // The manifest carries the scanned controller metadata and the classes keyed
  // by class name. Constructing the router instantiates every controller and
  // compiles its routes, so a missing class or handler fails startup loudly
  // instead of leaving an unreachable route behind.
  const router = new ApiRouter(apiControllersMetadata, apiControllersTypeMap)

  // Inject the read-side service the server code consumes: it resolves a
  // controller instance or matches a request, and is reachable through
  // `useApiRouter()` once the router above is registered.
  setApiRouter(router)

  logger.success(
    `ApiRouter initialized (controllers: ${router.controllers.length}, routes: ${router.routes.length})`,
  )
})
