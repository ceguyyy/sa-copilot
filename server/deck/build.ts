// Builds the .pptx: renders the deck visuals to PNG (resvg) and lets build_deck.py put them and the texts
// into the configured template, leaving every other slide untouched.
import { Resvg } from '@resvg/resvg-js'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deckProblems, deckVisuals, type DeckContent } from '../../shared/deck/index.ts'
import type { TimelineContent } from '../../shared/schemas.ts'
import { config } from '../config.ts'
import { queryOne } from '../db.ts'
import { HttpError } from '../http.ts'
import { templateEdits } from './template.ts'

const SCRIPT = path.join(import.meta.dirname, 'build_deck.py')
const TIMEOUT_MS = 180_000
/** Raster width per visual: sharp on a projector without bloating the file. */
const RASTER_WIDTH: Record<string, number> = { mockup1: 700, mockup2: 700, mockup3: 700 }
const DEFAULT_RASTER_WIDTH = 2400

function toPng(svg: string, width: number): Buffer {
  return new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' }, fitTo: { mode: 'width', value: width } }).render().asPng()
}

function runPython(specPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.markitdown.python, [SCRIPT, specPath], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new HttpError(500, `Cannot run Python for the deck (${e.message}). Install Python with python-pptx: pip install python-pptx`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new HttpError(500, `Building the deck failed: ${stderr.trim().split('\n').pop() || `exit code ${code}`}`))
    })
  })
}

/** The project's Timeline document (latest version), which drives slide 40. */
export async function projectTimeline(projectId: string): Promise<TimelineContent | null> {
  const row = await queryOne<{ content: TimelineContent }>(
    `select v.content from documents d
     join lateral (select content from document_versions where document_id = d.id order by version_no desc limit 1) v on true
     where d.project_id = $1 and d.type = 'timeline' order by d.updated_at desc limit 1`,
    [projectId],
  )
  return row?.content ?? null
}

export async function buildDeckPptx(deck: DeckContent, projectId: string): Promise<Buffer> {
  const problem = deckProblems(deck)
  if (problem) throw new HttpError(400, `Deck content is incomplete: ${problem}`)
  if (!existsSync(config.deckTemplate)) {
    throw new HttpError(500, `Deck template not found at ${config.deckTemplate} — set DECK_TEMPLATE in .env`)
  }

  const visuals = deckVisuals(deck, await projectTimeline(projectId))
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sa-deck-'))
  try {
    const pngs = new Map<string, string>()
    for (const v of visuals) {
      const file = path.join(dir, `${v.key}.png`)
      await writeFile(file, toPng(v.svg, RASTER_WIDTH[v.key] ?? DEFAULT_RASTER_WIDTH))
      pngs.set(v.key, file)
    }
    const slides = templateEdits(deck, visuals).map((e) => ({
      index: e.index,
      texts: e.texts,
      images: Object.fromEntries(Object.entries(e.images).map(([name, img]) => [name, { path: pngs.get(img.visual), box: img.box ?? null }])),
    }))
    const output = path.join(dir, 'deck.pptx')
    const spec = path.join(dir, 'spec.json')
    await writeFile(spec, JSON.stringify({ template: config.deckTemplate, output, slides }), 'utf8')
    await runPython(spec)
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
