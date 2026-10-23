import { type JsonSchema, JsonSchemaSchema } from "@the-delegation/shared/llm-messages"
import { z } from "zod"
import { type ArgsResult, fail, type ToolSpec } from "./types"

/** A tool's arguments: a closed object, so providers can enforce it strictly and extra keys fail. */
export type ToolArgsSchema<A> = z.ZodType<A>

/** A required string argument: trimmed, non-empty and length-capped. */
export function requiredText(maxLength: number) {
  return z
    .string({ error: "must be a non-empty string" })
    .trim()
    .min(1, { error: "must be a non-empty string" })
    .max(maxLength, { error: `is too long (max ${maxLength} characters)` })
}

/**
 * An optional integer argument. Missing, null and empty values are absent; a string of digits is
 * accepted because non-strict providers sometimes quote numbers; anything else, booleans included,
 * fails rather than being coerced.
 */
export function optionalInteger() {
  return z.preprocess((value) => {
    if (value === null || value === "") return undefined
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value)
    return value
  }, z.number({ error: "must be an integer" }).int({ error: "must be an integer" }).optional())
}

/** An optional true/false argument. */
export function optionalFlag() {
  return z.boolean({ error: "must be true or false" }).optional()
}

/**
 * Keeps only the keywords strict tool use accepts on both providers. Length and number bounds are
 * not supported in strict schemas, so they are enforced when the arguments are parsed instead.
 */
function toStrictSubset(schema: JsonSchema): JsonSchema {
  return {
    ...(schema.type !== undefined ? { type: schema.type } : {}),
    ...(schema.description !== undefined ? { description: schema.description } : {}),
    ...(schema.enum !== undefined ? { enum: schema.enum } : {}),
    ...(schema.properties !== undefined
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, toStrictSubset(value)]),
          ),
        }
      : {}),
    ...(schema.required !== undefined ? { required: schema.required } : {}),
    ...(schema.additionalProperties !== undefined
      ? { additionalProperties: schema.additionalProperties }
      : {}),
    ...(schema.items !== undefined ? { items: toStrictSubset(schema.items) } : {}),
  }
}

/** The JSON Schema sent to the model for a tool, derived from the same schema that parses its arguments. */
export function toToolInputSchema(schema: ToolArgsSchema<unknown>): JsonSchema {
  return toStrictSubset(JsonSchemaSchema.parse(z.toJSONSchema(schema)))
}

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return `Unknown argument${issue.keys.length > 1 ? "s" : ""}: ${issue.keys.map((key) => `"${key}"`).join(", ")}.`
  }
  const subject = issue.path.length > 0 ? `"${issue.path.join(".")}" ` : "The arguments "
  return `${subject}${issue.message}.`
}

/** Parses a tool call's arguments, returning failures as text the model can act on. */
export function parseToolArgs<A>(
  schema: ToolArgsSchema<A>,
  raw: Record<string, unknown>,
): ArgsResult<A> {
  const parsed = schema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : fail(parsed.error.issues.map(describeIssue).join(" "))
}

/** Builds a tool whose model-facing input schema comes from the same zod schema that parses its calls. */
export function defineTool<A>(spec: {
  name: string
  description: string
  args: ToolArgsSchema<A>
  isOffered: ToolSpec<A>["isOffered"]
  run: ToolSpec<A>["run"]
}): ToolSpec<A> {
  return {
    definition: {
      name: spec.name,
      description: spec.description,
      inputSchema: toToolInputSchema(spec.args),
    },
    args: spec.args,
    isOffered: spec.isOffered,
    run: spec.run,
  }
}
