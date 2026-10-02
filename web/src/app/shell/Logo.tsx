/** Brand files from the legacy app (legacy/<module>/strandply-*.png), cropped into web/public/brand. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return <img src="/brand/strandply-mark.png" width={size} height={size} alt="" aria-hidden className="shrink-0 object-contain" />;
}

/** Full lockup: mark + STRANDPLY + "OUT DO THE NEW". `height` is in px; the width follows the image's aspect ratio. */
export function Logo({ height = 26 }: { height?: number }) {
  return <img src="/brand/strandply-lockup.png" alt="Strandply" style={{ height }} className="block w-auto max-w-max self-start object-contain" />;
}
