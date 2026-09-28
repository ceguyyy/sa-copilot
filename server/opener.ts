// The OS command that opens a folder, or a file with its default app, on the machine running the server.

export function openCommand(platform: NodeJS.Platform, target: string): { command: string; args: string[] } | null {
  if (platform === 'win32') return { command: 'explorer.exe', args: [target] }
  if (platform === 'darwin') return { command: 'open', args: [target] }
  return null
}
