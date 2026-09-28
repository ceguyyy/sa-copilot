// How to start the Outline MCP server: the copy bundled with the desktop app (run by the app's own
// runtime as Node), or `npx` in a plain dev checkout.

export function outlineStdio(entry: string, execPath: string): { command: string; args: string[]; env: Record<string, string> } {
  if (entry) return { command: execPath, args: [entry], env: { ELECTRON_RUN_AS_NODE: '1' } }
  return { command: 'npx', args: ['-y', '--package=outline-mcp-server@latest', '-c', 'outline-mcp-server-stdio'], env: {} }
}
