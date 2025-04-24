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

server.tool(
  "pr_context",
  "PR context for current branch",
  async () => {
    const targetBranch = defaultBranch;

    const curBranchProc = gitCommand(["rev-parse", "--abbrev-ref", "HEAD"], gitRootDir);
    const curBranchOut = await curBranchProc.output();
    const currentBranch = new TextDecoder().decode(curBranchOut.stdout).trim();

    if (currentBranch === targetBranch) {
      return {
        content: [
          { type: "text", text: "Error: Current branch and target branch are the same. Cannot create a pull request from the target branch to itself." },
          { type: "text", text: `Current branch: ${currentBranch}` }
        ],
        isError: true
      };
    }

    const branchCheckProc = gitCommand(["rev-parse", "--verify", targetBranch], gitRootDir);
    const branchCheckOut = await branchCheckProc.output();
    if (branchCheckOut.code !== 0) {
      return {
        content: [
          { type: "text", text: `Error: Target branch '${targetBranch}' does not exist.` },
          { type: "text", text: `Current branch: ${currentBranch}` }
        ],
        isError: true
      };
    }

    const diffCmd = ["diff", `${targetBranch}...${currentBranch}`];
    const diffProc = gitCommand(diffCmd, gitRootDir);
    const diffOut = await diffProc.output();
    const diff = new TextDecoder().decode(diffOut.stdout);

    const logCmd = ["log", `${targetBranch}..${currentBranch}`, "--oneline"];
    const logProc = gitCommand(logCmd, gitRootDir);
    const logOut = await logProc.output();
    const log = new TextDecoder().decode(logOut.stdout);

    const remoteCmd = ["remote", "-v"];
    const remoteProc = gitCommand(remoteCmd, gitRootDir);
    const remoteOut = await remoteProc.output();
    const remote = new TextDecoder().decode(remoteOut.stdout);

    let prTemplate = "";
    try {
      prTemplate = await Deno.readTextFile(`${gitRootDir}/.github/pull_request_template.md`);
    } catch {
      prTemplate = "No pull request template found.";
    }

    return {
      content: [
        { type: "text", text: `Current branch: ${currentBranch}` },
        { type: "text", text: `Target branch: ${targetBranch}` },
        { type: "text", text: `---GIT REMOTE---\n${remote}` },
        { type: "text", text: `---GIT DIFF---\n${diff}` },
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

