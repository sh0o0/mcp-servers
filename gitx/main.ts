import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "Demo",
  version: "1.0.0"
});

server.tool(
  "pr_context",
  {
    gitDir: z.string()
  },
  async ({ gitDir }) => {
    // Get default branch name
    const branchProc = new Deno.Command("git", { args: ["symbolic-ref", "refs/remotes/origin/HEAD"], cwd: gitDir, stdout: "piped", stderr: "piped" });
    const branchOut = await branchProc.output();
    const branchRef = new TextDecoder().decode(branchOut.stdout).trim();
    const defaultBranch = branchRef.replace("refs/remotes/origin/", "");

    // Get current branch name
    const curBranchProc = new Deno.Command("git", { args: ["rev-parse", "--abbrev-ref", "HEAD"], cwd: gitDir, stdout: "piped", stderr: "piped" });
    const curBranchOut = await curBranchProc.output();
    const currentBranch = new TextDecoder().decode(curBranchOut.stdout).trim();

    // Get git diff (current branch vs default branch)
    const diffCmd = ["git", "diff", `${defaultBranch}...${currentBranch}`];
    const diffProc = new Deno.Command(diffCmd[0], { args: diffCmd.slice(1), cwd: gitDir, stdout: "piped", stderr: "piped" });
    const diffOut = await diffProc.output();
    const diff = new TextDecoder().decode(diffOut.stdout);

    // Get git log (commits in current branch not in default branch)
    const logCmd = ["git", "log", `${defaultBranch}..${currentBranch}`, "--oneline"];
    const logProc = new Deno.Command(logCmd[0], { args: logCmd.slice(1), cwd: gitDir, stdout: "piped", stderr: "piped" });
    const logOut = await logProc.output();
    const log = new TextDecoder().decode(logOut.stdout);

    // Get PR template
    let prTemplate = "";
    try {
      prTemplate = await Deno.readTextFile(`${gitDir}/.github/pull_request_template.md`);
    } catch {
      prTemplate = "No pull request template found.";
    }
    return {
      content: [
        { type: "text", text: `---GIT DIFF---\n${diff}` },
        { type: "text", text: `---GIT LOG---\n${log}` },
        { type: "text", text: `---PR TEMPLATE---\n${prTemplate}` }
      ]
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

