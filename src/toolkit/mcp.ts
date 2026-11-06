import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolkitClient } from "./receipt";

/**
 * The PayPal Agent Toolkit, reached through PayPal's hosted MCP server with the
 * app's own OAuth token. The sandbox server speaks the SSE transport.
 */

export const PAYPAL_MCP_SANDBOX_URL = "https://mcp.sandbox.paypal.com/sse";

export class ToolkitError extends Error {}

/** Opens one MCP session, runs `work` with a tool caller, and always closes the session. */
export async function withPayPalToolkit<T>(
  options: { accessToken: string; url?: string },
  work: (toolkit: ToolkitClient) => Promise<T>,
): Promise<T> {
  const client = await createMCPClient({
    transport: {
      type: "sse",
      url: options.url ?? PAYPAL_MCP_SANDBOX_URL,
      headers: { Authorization: `Bearer ${options.accessToken}` },
    },
  });
  try {
    return await work({
      async call(name, args) {
        const result = await client.callTool({ name, arguments: args });
        const text = readText(result.content);
        const parsed = parseJson(text);
        if (result.isError || isFailure(parsed)) {
          throw new ToolkitError(`PayPal Toolkit ${name} failed: ${text.slice(0, 300)}`);
        }
        return parsed;
      },
    });
  } finally {
    await client.close();
  }
}

function readText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** The Toolkit reports PayPal API errors as `{ ok: false, ... }` in an otherwise successful tool result. */
export function isFailure(parsed: unknown): boolean {
  return typeof parsed === "object" && parsed !== null && (parsed as { ok?: unknown }).ok === false;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
