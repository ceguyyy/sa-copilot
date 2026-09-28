// Human-readable outline of a document's JSON schema: the fields and table columns the app fixes for a deliverable.
// Shown in Settings → Deliverables and given to the skill assistant, so format changes stay within what renders.

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; enum?: unknown[] }

const join = (path: string, key: string) => (path ? `${path}.${key}` : key)

/** One line per object level, e.g. ["title, persona", "sheets[]: name", "sheets[].sections[]: title", …]. */
export function schemaOutline(schema: Schema, path = ''): string[] {
  const scalars: string[] = []
  const nested: string[] = []
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    if (value.type === 'array' && value.items?.type === 'object') nested.push(...schemaOutline(value.items, join(path, `${key}[]`)))
    else if (value.type === 'object') nested.push(...schemaOutline(value, join(path, key)))
    else scalars.push(value.enum ? `${key} (${value.enum.join('/')})` : value.type === 'array' ? `${key}[]` : key)
  }
  return [...(scalars.length ? [`${path ? `${path}: ` : ''}${scalars.join(', ')}`] : []), ...nested]
}
