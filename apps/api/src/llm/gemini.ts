import {
  type Content,
  type FunctionDeclaration,
  ApiError as GenAiApiError,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
} from "@google/genai"
import {
  LLM_LIMITS,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmMessage,
  type LlmToolCall,
} from "@the-delegation/shared/llm"
import { ApiHttpError } from "../errors"

let cachedClient: { apiKey: string; client: GoogleGenAI } | undefined

/** Reuses one SDK client per key so repeated calls with the server key don't rebuild it. */
function clientFor(apiKey: string): GoogleGenAI {
  if (cachedClient?.apiKey !== apiKey) {
    cachedClient = { apiKey, client: new GoogleGenAI({ apiKey }) }
  }
  return cachedClient.client
}

function isJsonObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Parses a string the shared schema has already checked is a JSON object; throws if that contract is ever broken
 * rather than passing a non-object to the SDK.
 */
function parseObject(json: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json)
  if (!isJsonObjectValue(parsed)) throw new Error("Expected a JSON object string")
  return parsed
}

/** Maps a shared-contract message onto Gemini content; tool results go back as a user-role function response. */
function toContent(message: LlmMessage): Content {
  if (message.role === "tool") {
    return {
      role: "user",
      parts: [{ functionResponse: { name: message.name, response: parseObject(message.content) } }],
    }
  }

  const parts: Part[] = []
  if (message.content) parts.push({ text: message.content })
  for (const call of message.tool_calls ?? []) {
    parts.push({
      functionCall: {
        id: call.id,
        name: call.function.name,
        args: parseObject(call.function.arguments),
      },
      thoughtSignature: call.thought_signature,
    })
  }
  return { role: message.role === "assistant" ? "model" : "user", parts }
}

/**
 * Normalises the SDK response into the shared contract, dropping thought text. Thinking tokens are billed as
 * output, so they are counted toward completion tokens.
 */
function toResponse(result: GenerateContentResponse): LlmCompletionResponse {
  const candidate = result.candidates?.[0]
  const parts = candidate?.content?.parts ?? []

  let content: string | null = null
  const toolCalls: LlmToolCall[] = []
  for (const part of parts) {
    if (part.text && !part.thought) content = (content ?? "") + part.text
    if (part.functionCall?.name) {
      toolCalls.push({
        id: part.functionCall.id ?? crypto.randomUUID(),
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        },
        thought_signature: part.thoughtSignature,
      })
    }
  }

  const usage = result.usageMetadata
  return {
    content,
    tool_calls: toolCalls,
    usage: usage
      ? {
          promptTokens: usage.promptTokenCount ?? 0,
          completionTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
          totalTokens: usage.totalTokenCount ?? 0,
        }
      : null,
    finishReason: candidate?.finishReason ?? null,
    modelVersion: result.modelVersion ?? null,
  }
}

/**
 * Calls Gemini with a server-held key and returns only normalized fields (no raw SDK object, no upstream headers).
 * Upstream error messages can quote request details, so only the upstream status is surfaced.
 */
export async function generateCompletion(
  apiKey: string,
  request: LlmCompletionRequest,
): Promise<LlmCompletionResponse> {
  const functionDeclarations: FunctionDeclaration[] | undefined = request.tools?.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    parametersJsonSchema: tool.function.parameters,
  }))

  try {
    const result = await clientFor(apiKey).models.generateContent({
      model: request.model,
      contents: request.messages.map(toContent),
      config: {
        systemInstruction: request.systemInstruction,
        tools: functionDeclarations?.length ? [{ functionDeclarations }] : undefined,
        maxOutputTokens: request.maxOutputTokens ?? LLM_LIMITS.maxOutputTokens,
      },
    })
    return toResponse(result)
  } catch (error) {
    if (error instanceof GenAiApiError) {
      if (error.status === 429) {
        throw new ApiHttpError(429, "rate_limited", "Upstream model is rate limited")
      }
      throw new ApiHttpError(
        502,
        "upstream_error",
        `Model provider returned status ${error.status}`,
      )
    }
    throw error
  }
}
