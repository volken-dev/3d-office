import validator from "gltf-validator"
import { z } from "zod"

/** Severities the Khronos validator reports as errors (0) and warnings (1). */
const WARNING_SEVERITY = 1

const ValidationReportSchema = z.looseObject({
  issues: z.looseObject({
    numErrors: z.number(),
    numWarnings: z.number(),
    numInfos: z.number(),
    messages: z.array(
      z.looseObject({
        severity: z.number(),
        code: z.string(),
        message: z.string(),
        pointer: z.string().optional(),
      }),
    ),
  }),
  info: z
    .looseObject({
      animationCount: z.number().optional(),
      materialCount: z.number().optional(),
      drawCallCount: z.number().optional(),
      totalVertexCount: z.number().optional(),
      totalTriangleCount: z.number().optional(),
    })
    .optional(),
})

/** The validator's verdict on one file: counts, and the errors and warnings worth reading. */
export type ModelValidation = z.infer<typeof ValidationReportSchema>

/**
 * Runs the Khronos glTF validator over a file's bytes. Expect 0 errors everywhere; the robots
 * carry two harmless NODE_SKINNED_MESH_NON_ROOT warnings.
 */
export async function validateModel(bytes: Uint8Array): Promise<ModelValidation> {
  return ValidationReportSchema.parse(await validator.validateBytes(bytes))
}

/** The errors and warnings in a validation, without the informational messages. */
export function seriousMessages(
  validation: ModelValidation,
): ModelValidation["issues"]["messages"] {
  return validation.issues.messages.filter((message) => message.severity <= WARNING_SEVERITY)
}
