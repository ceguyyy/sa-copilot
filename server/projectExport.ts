// Loads a project and renders it as one Markdown document (used by "Download MD" and "Send to Notion").
import { projectMarkdown, type ProjectDoc, type ProjectInfo, type ProjectPoc, type ProjectQuestion } from '../shared/projectMarkdown.ts'
import { query, queryOne } from './db.ts'
import { notFound } from './http.ts'

export async function loadProjectMarkdown(projectId: string): Promise<{ project: ProjectInfo & { notion_page_id: string | null }; markdown: string }> {
  const project = notFound(
    await queryOne<ProjectInfo & { notion_page_id: string | null }>(
      'select name, client_name, industry, package, status, language, description, notion_page_id from projects where id = $1',
      [projectId],
    ),
    'Project',
  )
  const [docs, questions, pocs] = await Promise.all([
    query<ProjectDoc>(
      `select d.type, d.title, v.version_no as version, d.updated_at::text as updated_at, v.content
       from documents d
       join lateral (select version_no, content from document_versions where document_id = d.id order by version_no desc limit 1) v on true
       where d.project_id = $1`,
      [projectId],
    ),
    query<ProjectQuestion>('select question, status, answer from open_questions where project_id = $1 order by created_at', [projectId]),
    query<ProjectPoc>('select name, config from pocs where project_id = $1 order by created_at', [projectId]),
  ])
  return { project, markdown: projectMarkdown(project, docs, questions, pocs) }
}
