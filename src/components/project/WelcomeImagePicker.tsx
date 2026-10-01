import { Download, ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, ErrorNote, Field, Input } from '../ui'
import { MAX_WELCOME_IMAGE_BYTES, WELCOME_IMAGE_TYPES, isEmbeddedImage, isValidWelcomeImage, welcomeImageFileName } from '../../../shared/pocImage.ts'

type Props = {
  value: string | null
  pocName: string
  onChange: (value: string | null) => void
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })

/** Welcome image picked from disk (embedded in the POC) or given as a link, with a preview. */
export function WelcomeImagePicker({ value, pocName, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const image = value ?? ''
  const isEmbedded = isEmbeddedImage(image)
  const canPreview = !!image && isValidWelcomeImage(image)

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    if (!(WELCOME_IMAGE_TYPES as readonly string[]).includes(file.type)) return setError('Choose a PNG, JPG, GIF or WebP image')
    if (file.size > MAX_WELCOME_IMAGE_BYTES) return setError('The image is larger than 2 MB — compress it first')
    try {
      onChange(await readAsDataUrl(file))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file')
    }
  }

  return (
    <Field label="Welcome Image">
      <div className="space-y-3">
        <input ref={input} type="file" hidden accept={WELCOME_IMAGE_TYPES.join(',')} onChange={(e) => void pick(e.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
            {image ? 'Change image…' : 'Choose image…'}
          </Button>
          {isEmbedded && (
            <a
              href={image}
              download={welcomeImageFileName(pocName, image)}
              className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-forest"
            >
              <Download className="size-4" /> Download
            </a>
          )}
          {image && (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
          <span className="text-xs text-muted">PNG, JPG, GIF or WebP, max 2 MB. Saved inside the POC.</span>
        </div>
        {canPreview && <img src={image} alt="Welcome image preview" className="max-h-48 rounded-lg border border-line bg-panel object-contain" />}
        {!isEmbedded && (
          <Input value={image} onChange={(e) => onChange(e.target.value || null)} placeholder="…or paste an image link: https://…/image.png" />
        )}
        {error && <ErrorNote error={error} />}
      </div>
    </Field>
  )
}
