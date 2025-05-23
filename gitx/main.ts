import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create an MCP server
const server = new McpServer({
  name: "gitx",
  version: "1.0.0"
});

// Get gitRootDir, defaultBranch from Deno.args
const gitRootDir = Deno.args[0];
const defaultBranch = Deno.args[1];

// Check for required arguments
if (!gitRootDir || !defaultBranch) {
  console.error("Usage: deno run --allow-run=git --allow-read=<repo> main.ts <gitRootDir> <defaultBranch>");
  Deno.exit(1);
}

// Helper to run git commands
function gitCommand(args: string[], cwd: string) {
  return new Deno.Command("git", { args, cwd, stdout: "piped", stderr: "piped" });
}

// Helper to run git command and decode stdout or stderr
async function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = gitCommand(args, cwd);
  const out = await proc.output();
  return {
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
    code: out.code
  };
}

server.tool(
  "get_pull_request_context",
  "Get pull request context for the current branch",
  async () => {
    const targetBranch = defaultBranch;

    const currentBranch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], gitRootDir)).stdout.trim();

    if (currentBranch === targetBranch) {
      return {
        content: [
          { type: "text", text: "Error: Current branch and target branch are the same. Cannot create a pull request from the target branch to itself." },
          { type: "text", text: `Current branch: ${currentBranch}` }
        ],
        isError: true
      };
    }

    const branchCheck = await runGit(["rev-parse", "--verify", targetBranch], gitRootDir);
    if (branchCheck.code !== 0) {
      return {
        content: [
          { type: "text", text: `Error: Target branch '${targetBranch}' does not exist.` },
          { type: "text", text: `Current branch: ${currentBranch}` }
        ],
        isError: true
      };
    }

    const baseCommit = (await runGit(["merge-base", targetBranch, currentBranch], gitRootDir)).stdout.trim();
    const log = (await runGit(["log", `${baseCommit}..${currentBranch}`, "--oneline"], gitRootDir)).stdout;
    const remote = (await runGit(["remote", "-v"], gitRootDir)).stdout;

    let prTemplate = "";
    try {
      prTemplate = await Deno.readTextFile(`${gitRootDir}/.github/pull_request_template.md`);
    } catch {
      prTemplate = "No pull request template found.";
    }

    return {
      content: [
        { type: "text", text: `---CURRENT BRANCH---\n${currentBranch}` },
        { type: "text", text: `---TARGET BRANCH---\n${targetBranch}` },
        { type: "text", text: `---GIT REMOTE---\n${remote}` },
        { type: "text", text: `---GIT LOG---\n${log}` },
        { type: "text", text: `---PR TEMPLATE---\n${prTemplate}` }
      ],
      isError: false
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);

