// Copy generated visuals (diagrams, CRM boards, slide visuals, the POC Flow canvas) to the clipboard as PNG, so they
// paste straight into Slack, Docs or slides.
import { toBlob } from 'html-to-image'

/** Retina-sharp output without huge files. */
const PIXEL_RATIO = 2

/** The app's page colour, so a dark-theme diagram stays readable after pasting. */
export const appBackground = (): string => getComputedStyle(document.body).backgroundColor || '#ffffff'

/** PNG of a rendered DOM element (its own size). */
export async function elementToPng(el: HTMLElement, options: { backgroundColor?: string; width?: number; height?: number; style?: Partial<CSSStyleDeclaration> } = {}): Promise<Blob> {
  const blob = await toBlob(el, { pixelRatio: PIXEL_RATIO, backgroundColor: options.backgroundColor ?? appBackground(), width: options.width, height: options.height, style: options.style })
  if (!blob) throw new Error('Could not render the image')
  return blob
}

/** PNG of an SVG string (rendered off-screen at its natural size). */
export async function svgToPng(svg: string, backgroundColor = '#ffffff'): Promise<Blob> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;display:inline-block'
  // Only our own SVG builders and Mermaid's sanitized output reach here.
  host.innerHTML = svg
  document.body.append(host)
  try {
    const el = host.firstElementChild as HTMLElement | null
    if (!el) throw new Error('Nothing to copy')
    // Mermaid sizes its SVG as width="100%"; give it the size of its viewBox so it renders at natural size.
    const box = el.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
    if (box?.length === 4 && box[2] > 0 && box[3] > 0) {
      el.setAttribute('width', String(box[2]))
      el.setAttribute('height', String(box[3]))
      el.style.maxWidth = 'none'
    }
    return await elementToPng(el, { backgroundColor })
  } finally {
    host.remove()
  }
}

/** Puts a PNG on the clipboard. The promise form keeps the user gesture alive while the image renders. */
export async function copyPng(image: Promise<Blob>): Promise<void> {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) throw new Error('This browser cannot copy images')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
}
