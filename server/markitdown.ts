// Converts uploaded files to compact Markdown with Microsoft's markitdown (Python), so the AI reads
// headings/tables instead of raw extracted text — fewer tokens, better structure.
// https://github.com/microsoft/markitdown — install with: pip install "markitdown[all]"
import { spawn } from 'node:child_process'
import { config } from './config.ts'

const TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024

/** Images have no text for markitdown without an LLM; they are sent to the AI natively instead. */
export function shouldConvert(mimeType: string, fileName: string): boolean {
  return !mimeType.startsWith('image/') && !/\.(png|jpe?g|gif|webp)$/i.test(fileName)
}

/**
 * Returns the Markdown, or null if markitdown is missing or fails (the caller then falls back to the
 * text the browser extracted). Never throws.
 */
export function convertToMarkdown(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = Buffer.alloc(0)
    let settled = false
    const finish = (value: string | null, reason?: string) => {
      if (settled) return
      settled = true
      if (reason) console.error(`markitdown skipped (${reason}); using browser-extracted text`)
      resolve(value)
    }

    const child = spawn(config.markitdown.python, ['-m', 'markitdown', filePath], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore' },
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      child.kill()
      finish(null, 'timed out')
    }, TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      out = Buffer.concat([out, chunk])
      if (out.length > MAX_OUTPUT_BYTES) {
        child.kill()
        finish(null, 'output too large')
      }
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      finish(null, e.message)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const text = out.toString('utf8').trim()
      finish(code === 0 && text ? text : null, code === 0 ? 'empty output' : `exit code ${code}`)
    })
  })
}
