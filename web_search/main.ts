import { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'npm:zod';

const server = new McpServer({ name: "codex-search", version: "1.0.0" });

server.registerTool(
  "web_search",
  {
    title: "Web Search",
    description: "Search the web with gpt-5. Pass { query: string }.",
    inputSchema: {
      query: z.string().min(1, "query is required").describe("Search query"),
    },
  },
  async ({ query }) => {
    const codex = new Deno.Command("codex", {
      args: [
        "--search",
        "--model",
        "gpt-5",
        'exec',
        "--json",
        `必ずweb検索機能を使ってください。\n${query}`,
      ],
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const jq = new Deno.Command("jq", {
      args: [
        '-Rr',
        'fromjson? | select(.msg?.type=="agent_message") | .msg.message'
      ],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();

    try {
      await codex.stdout.pipeTo(jq.stdin);
      const out = await jq.output();
      const stdout = new TextDecoder().decode(out.stdout).trim();
      const stderr = new TextDecoder().decode(out.stderr).trim();

      if (out.code !== 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error running codex (${out.code}): ${stderr || stdout}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: stdout || "No results." }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text:
              `Failed to execute codex: ${e instanceof Error ? e.message : String(e)
              }`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
