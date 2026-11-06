/** Prints the input schemas of the PayPal MCP invoice tools Handshake uses. */
import { createMCPClient } from "@ai-sdk/mcp";

const NAMES = ["create_invoice", "send_invoice", "record_payment_for_invoice", "get_invoice"];

async function main(): Promise<void> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${process.env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const token = ((await res.json()) as { access_token: string }).access_token;
  const client = await createMCPClient({
    transport: { type: "sse", url: "https://mcp.sandbox.paypal.com/sse", headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    const listed = await client.listTools();
    for (const tool of listed.tools.filter((t) => NAMES.includes(t.name))) {
      console.log(`=== ${tool.name}\n${tool.description}\n${JSON.stringify(tool.inputSchema, null, 1)}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
