import { Img } from '@react-email/components'

/**
 * Invisible tracking pixel. Renders nothing when no URL is supplied, so
 * previews and tests stay clean. Opens are only recorded when the recipient's
 * email client loads remote images.
 */
export function OpenPixel({ url }: { url?: string | undefined }) {
  if (!url) return null
  return (
    <Img
      src={url}
      alt=""
      width={1}
      height={1}
      style={{ border: 0, display: 'block', height: '1px', width: '1px' }}
    />
  )
}
