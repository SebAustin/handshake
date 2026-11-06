/** Lists the tools the PayPal sandbox MCP server exposes to this app's credentials. */
import { createMCPClient } from "@ai-sdk/mcp";

async function token(): Promise<string> {
  const base = process.env.PAYPAL_API_BASE ?? "";
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://mcp.sandbox.paypal.com/http";
  const accessToken = await token();
  const client = await createMCPClient({
    transport: { type: url.endsWith("/sse") ? "sse" : "http", url, headers: { Authorization: `Bearer ${accessToken}` } },
  });
  try {
    const tools = await client.tools();
    console.log(Object.keys(tools).sort().join("\n"));
  } finally {
    await client.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exitCode = 1;
});
