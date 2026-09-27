// Browser-side text extraction for uploaded requirement/knowledge files. The server converts uploads with
// markitdown (compact Markdown) and uses this text only as a fallback. Images and scanned PDFs are sent to the AI natively.

const MAX_FILE_BYTES = 50 * 1024 * 1024

export const ACCEPTED_FILES =
  '.pdf,.docx,.doc,.pptx,.xlsx,.xls,.csv,.txt,.md,.json,.html,.htm,.xml,.epub,.msg,.zip,.png,.jpg,.jpeg,.webp,.gif'

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 50 MB`)
  const name = file.name.toLowerCase()

  if (file.type.startsWith('image/')) return ''
  if (name.endsWith('.pdf')) return extractPdf(file)
  if (name.endsWith('.docx')) return extractDocx(file)
  if (name.endsWith('.xlsx')) return extractXlsx(file)
  if (/\.(txt|md|csv|json)$/.test(name)) return file.text()
  // Other formats (pptx, xls, html, epub, msg…) are only readable by markitdown on the server.
  return ''
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ')
    pages.push(`--- page ${i} ---\n${text}`)
  }
  return pages.join('\n\n')
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

async function extractXlsx(file: File): Promise<string> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const out: string[] = []
  wb.eachSheet((sheet) => {
    out.push(`## Sheet: ${sheet.name}`)
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map(cellToText)
      if (values.some((v) => v)) out.push(values.join(' | '))
    })
  })
  return out.join('\n')
}

function cellToText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('richText' in o && Array.isArray(o.richText)) return o.richText.map((r: { text: string }) => r.text).join('')
    if ('result' in o) return String(o.result ?? '')
    if ('text' in o) return String(o.text)
    if (v instanceof Date) return v.toISOString().slice(0, 10)
  }
  return String(v).replace(/\n/g, ' ')
}
