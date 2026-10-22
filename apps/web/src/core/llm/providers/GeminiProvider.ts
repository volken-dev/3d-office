import { FunctionDeclaration, GoogleGenAI, Tool, Type } from '@google/genai';
import { LLMMessage, LLMProvider, LLMResponse, LLMToolCall, LLMToolDefinition } from '../types';
import { DEFAULT_MODEL } from '../constants';

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateCompletion(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName: string = DEFAULT_MODEL
  ): Promise<LLMResponse> {
    const contents = this.mapMessagesToGemini(messages);

    const systemTools: Tool[] | undefined = tools ? [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: this.mapToGeminiSchema(t.function.parameters)
      } as FunctionDeclaration))
    }] : undefined;

    const result = await this.client.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemInstruction,
        tools: systemTools,
      }
    });
    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let contentStr: string | null = null;
    let toolCalls: LLMToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        contentStr = (contentStr || '') + part.text;
      }
    }

    // Pull tool calls from both candidates and root (some SDK versions vary)
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: Math.random().toString(36).substring(7),
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          });
        }
      }
    }

    if (result.functionCalls && toolCalls.length === 0) {
      for (const call of result.functionCalls) {
        toolCalls.push({
          id: Math.random().toString(36).substring(7),
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.args)
          }
        });
      }
    }

    const usage = result.usageMetadata ? {
      promptTokens: result.usageMetadata.promptTokenCount || 0,
      completionTokens: (result.usageMetadata.candidatesTokenCount || 0) + (result.usageMetadata.thoughtsTokenCount || 0),
      totalTokens: result.usageMetadata.totalTokenCount || 0
    } : undefined;

    return {
      content: contentStr,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason: candidate?.finishReason as string,
      raw: result, // Return the original SDK result for technical logging
      request: {
        contents,
        systemInstruction,
        tools: systemTools
      }
    };
  }

  private mapMessagesToGemini(messages: LLMMessage[]): any[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts: any[] = [];

        if (m.content) {
          parts.push({ text: m.content });
        }

        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            });
          }
        }

        if (m.role === 'tool' && m.name) {
          parts.push({
            functionResponse: {
              name: m.name,
              response: JSON.parse(m.content)
            }
          });
        }

        return { role, parts };
      });
  }

  private mapToGeminiSchema(schema: any): any {
    if (!schema) return undefined;

    const typeStr = (schema.type || 'string').toUpperCase();
    const mappedType = Type[typeStr as keyof typeof Type] || Type.STRING;

    const result: any = {
      type: mappedType,
      description: schema.description,
      nullable: schema.nullable,
      minItems: schema.minItems,
      maxItems: schema.maxItems,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
    };

    if (schema.properties) {
      result.properties = Object.keys(schema.properties).reduce((acc, key) => {
        acc[key] = this.mapToGeminiSchema(schema.properties[key]);
        return acc;
      }, {} as Record<string, any>);
    }

    if (schema.required) {
      result.required = schema.required;
    }

    if (schema.items) {
      result.items = this.mapToGeminiSchema(schema.items);
    }

    if (schema.enum) {
      result.enum = schema.enum;
    }

    return result;
  }
}
