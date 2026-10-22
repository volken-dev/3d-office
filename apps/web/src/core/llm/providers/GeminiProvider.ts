import type { Content, FunctionDeclaration, GoogleGenAI, Part, Schema, Type } from "@google/genai"
import { DEFAULT_MODEL } from "../constants"
import { LLMError } from "../errors"
import type {
  JsonSchema,
  LLMCallOptions,
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition,
} from "../types"

const DEFAULT_TIMEOUT_MS = 60_000

type GeminiSdk = typeof import("@google/genai")
type JsonSchemaType = NonNullable<JsonSchema["type"]>

let sdkPromise: Promise<GeminiSdk> | null = null

/** The SDK is ~100 kB gzipped and only needed once an agent actually calls the model, so it loads lazily, once. */
function loadSdk(): Promise<GeminiSdk> {
  if (!sdkPromise) sdkPromise = import("@google/genai")
  return sdkPromise
}

function makeToolCallId(): string {
  return `call_${Math.random().toString(36).slice(2, 10)}`
}

function parseArgs(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json)
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Combines the caller's signal with a timeout; `TimeoutError` marks the latter so it can be retried. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** `geminiTypes` is the SDK's runtime `Type` enum, passed in so the SDK stays lazily loaded. */
function toGeminiType(type: JsonSchemaType, geminiTypes: typeof Type): Type {
  const byJsonType: Record<JsonSchemaType, Type> = {
    string: geminiTypes.STRING,
    number: geminiTypes.NUMBER,
    integer: geminiTypes.INTEGER,
    boolean: geminiTypes.BOOLEAN,
    array: geminiTypes.ARRAY,
    object: geminiTypes.OBJECT,
    null: geminiTypes.NULL,
  }
  return byJsonType[type]
}

function toGeminiSchema(schema: JsonSchema, geminiTypes: typeof Type): Schema {
  return {
    type: toGeminiType(schema.type ?? "string", geminiTypes),
    description: schema.description,
    nullable: schema.nullable,
    enum: schema.enum?.map(String),
    minimum: schema.minimum,
    maximum: schema.maximum,
    minLength: schema.minLength?.toString(),
    maxLength: schema.maxLength?.toString(),
    minItems: schema.minItems?.toString(),
    maxItems: schema.maxItems?.toString(),
    required: schema.required,
    items: schema.items ? toGeminiSchema(schema.items, geminiTypes) : undefined,
    properties: schema.properties
      ? Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            toGeminiSchema(value, geminiTypes),
          ]),
        )
      : undefined,
  }
}

function toGeminiContents(messages: LLMMessage[]): Content[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      const parts: Part[] = []
      if (message.content) parts.push({ text: message.content })
      for (const toolCall of message.tool_calls ?? []) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: parseArgs(toolCall.function.arguments),
          },
          thoughtSignature: toolCall.thought_signature,
        })
      }
      return { role: message.role === "assistant" ? "model" : "user", parts }
    })
    .filter((content) => content.parts.length > 0)
}

/** Calls Gemini straight from the browser with the user's own key (BYOK). */
export class GeminiProvider implements LLMClient {
  private client: Promise<GoogleGenAI> | null = null

  constructor(private readonly apiKey: string) {}

  private getClient(): Promise<GoogleGenAI> {
    if (!this.client)
      this.client = loadSdk().then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: this.apiKey }))
    return this.client
  }

  async generateCompletion(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName: string = DEFAULT_MODEL,
    options: LLMCallOptions = {},
  ): Promise<LLMResponse> {
    if (options.signal?.aborted) throw new LLMError("aborted", "Request cancelled")

    const { Type: geminiTypes } = await loadSdk()
    const functionDeclarations: FunctionDeclaration[] | undefined = tools?.length
      ? tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
            ? toGeminiSchema(tool.function.parameters, geminiTypes)
            : undefined,
        }))
      : undefined

    const client = await this.getClient()
    let result: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>
    try {
      result = await client.models.generateContent({
        model: modelName,
        contents: toGeminiContents(messages),
        config: {
          systemInstruction,
          tools: functionDeclarations ? [{ functionDeclarations }] : undefined,
          abortSignal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        },
      })
    } catch (error) {
      if (options.signal?.aborted)
        throw new LLMError("aborted", "Request cancelled", { cause: error })
      throw error
    }

    const candidate = result.candidates?.[0]
    let content: string | null = null
    const toolCalls: LLMToolCall[] = []

    for (const part of candidate?.content?.parts ?? []) {
      if (part.text && !part.thought) content = (content ?? "") + part.text
      if (part.functionCall?.name) {
        toolCalls.push({
          id: part.functionCall.id ?? makeToolCallId(),
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
          thought_signature: part.thoughtSignature,
        })
      }
    }

    const usageMetadata = result.usageMetadata
    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: usageMetadata
        ? {
            promptTokens: usageMetadata.promptTokenCount ?? 0,
            completionTokens:
              (usageMetadata.candidatesTokenCount ?? 0) + (usageMetadata.thoughtsTokenCount ?? 0),
            totalTokens: usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
      finishReason: candidate?.finishReason,
      modelVersion: result.modelVersion,
      responseId: result.responseId,
    }
  }
}
