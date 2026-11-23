import { toBlob } from 'html-to-image'

export async function renderPng(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' })
  if (!blob) throw new Error('Could not render the image')
  return blob
}

export function fileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session'
  return `paddl-${slug}.png`
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function canShareFile(blob: Blob, name: string): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] })
  } catch {
    return false
  }
}

/** Opens the native share sheet with the image. Returns false if the user dismissed it. */
export async function shareImage(blob: Blob, name: string, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], title })
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false
    throw e
  }
}
