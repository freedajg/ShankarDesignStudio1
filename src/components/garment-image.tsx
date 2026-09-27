import { cn } from "@/lib/cn";

/**
 * Static garment preview in any colour, composed with CSS only (mask + multiply +
 * screen) so catalogue pages need no JavaScript. Uses the same layers as the
 * studio and the server renderer.
 */
export function GarmentImage({
  mockup,
  hex,
  alt,
  className,
  priority,
}: {
  mockup: { maskUrl: string; shadeUrl: string; highlightUrl: string };
  hex: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const mask = `url(${mockup.maskUrl})`;
  // every layer is clipped to the garment, so shading never tints the page behind it (matters in dark mode)
  const clip = { maskImage: mask, WebkitMaskImage: mask, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" } as const;
  return (
    <div role="img" aria-label={alt} className={cn("relative isolate aspect-[1000/1100] w-full", className)}>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: hex, ...clip }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- blend-mode layers, not content images */}
      <img src={mockup.shadeUrl} alt="" aria-hidden className="absolute inset-0 size-full mix-blend-multiply" style={clip} loading={priority ? "eager" : "lazy"} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mockup.highlightUrl} alt="" aria-hidden className="absolute inset-0 size-full mix-blend-screen" style={clip} loading={priority ? "eager" : "lazy"} />
    </div>
  );
}
