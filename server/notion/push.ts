// "Send to Notion": writes the project Markdown as one Notion page under NOTION_PARENT_PAGE. Re-sending
// replaces the previous page (the new one is built first, then the old one goes to Notion's trash).
import { APIResponseError, Client } from '@notionhq/client'
import { config } from '../config.ts'
import { query } from '../db.ts'
import { HttpError } from '../http.ts'
import { loadProjectMarkdown } from '../projectExport.ts'
import { batches, markdownToBlocks } from './blocks.ts'

/** A Notion page id from a raw id (with or without dashes) or a page URL; null when there is none. */
export function notionPageId(input: string): string | null {
  const hex = input.trim().split(/[?#]/)[0].replace(/-/g, '').match(/[0-9a-f]{32}$/i)?.[0]
  return hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase() : null
}

export const notionPageUrl = (pageId: string) => `https://www.notion.so/${pageId.replace(/-/g, '')}`

function explain(e: unknown): never {
  if (e instanceof APIResponseError) {
    if (e.code === 'unauthorized') throw new HttpError(400, 'Notion rejected NOTION_TOKEN — check the Internal Integration Secret in .env.')
    if (e.code === 'object_not_found') throw new HttpError(400, 'Notion cannot see the parent page — open it in Notion → ⋯ → Connections and add your integration.')
    if (e.code === 'rate_limited') throw new HttpError(429, 'Notion is rate-limiting requests — try again in a minute.')
    throw new HttpError(502, `Notion: ${e.message}`)
  }
  throw e
}

export async function pushProjectToNotion(projectId: string): Promise<{ url: string; blocks: number }> {
  const { token, parentPage } = config.notion
  if (!token) throw new HttpError(400, 'Notion is not connected — set NOTION_TOKEN in .env and restart SA Copilot.')
  const parentId = notionPageId(parentPage)
  if (!parentId) throw new HttpError(400, 'Set NOTION_PARENT_PAGE in .env to the Notion page (link or id) the projects go under.')

  const { project, markdown } = await loadProjectMarkdown(projectId)
  // The page title is the project name, so the Markdown's own "# <name>" line is dropped.
  const blocks = markdownToBlocks(markdown.replace(/^# .*\n+/, ''))
  const [first = [], ...rest] = batches(blocks)
  const notion = new Client({ auth: token })

  const page = await notion.pages
    .create({
      parent: { page_id: parentId },
      properties: { title: { title: [{ text: { content: project.name } }] } },
      children: first as never,
    })
    .catch(explain)
  try {
    for (const batch of rest) await notion.blocks.children.append({ block_id: page.id, children: batch as never })
  } catch (e) {
    // Never leave a half-written page behind.
    await notion.pages.update({ page_id: page.id, in_trash: true }).catch(() => {})
    explain(e)
  }

  if (project.notion_page_id && project.notion_page_id !== page.id) {
    await notion.pages.update({ page_id: project.notion_page_id, in_trash: true }).catch((e) => console.error('Could not trash the previous Notion page:', e instanceof Error ? e.message : e))
  }
  await query('update projects set notion_page_id = $2 where id = $1', [projectId, page.id])
  return { url: 'url' in page && typeof page.url === 'string' ? page.url : notionPageUrl(page.id), blocks: blocks.length }
}
