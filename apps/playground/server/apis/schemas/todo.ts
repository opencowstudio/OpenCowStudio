import { z } from 'zod'

// Schema module: every exported schema is registered under its export name, so a
// handler parameter (or a handler return type) declaring that name receives the
// request JSON parsed by it. The paired `type` export is what the handler
// signature uses, which keeps the validation and the TypeScript type in sync.
//
// This file lives in `<dir>/schemas`, the schema directory of the module
// (`dir` being the controller directory), so it is scanned without any option.

export const CreateTodoInput = z
  .strictObject({
    // The issue path prefixes the message, so messages must not repeat the field
    // name: the client answers `Invalid request body: title must not be blank`.
    title: z.string().trim().min(1, 'must not be blank').max(64).describe('Todo title, 1-64 characters'),
    tags: z.array(z.string().min(1).max(24)).max(5).optional().describe('Optional labels, at most 5'),
  })
  .meta({ id: 'CreateTodoInput', description: 'Payload to create a todo' })

export type CreateTodoInput = z.infer<typeof CreateTodoInput>

export const TodoOutput = z
  .strictObject({
    id: z.string().describe('Todo id'),
    title: z.string().describe('Todo title'),
    done: z.boolean().describe('Whether the todo is completed'),
    createdAt: z.string().describe('ISO 8601 timestamp'),
  })
  .meta({ id: 'TodoOutput', description: 'One todo' })

export type TodoOutput = z.infer<typeof TodoOutput>
