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
  return (
    <div role="img" aria-label={alt} className={cn("relative aspect-[1000/1100] w-full", className)}>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: hex, maskImage: mask, WebkitMaskImage: mask, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- blend-mode layers, not content images */}
      <img src={mockup.shadeUrl} alt="" aria-hidden className="absolute inset-0 size-full mix-blend-multiply" loading={priority ? "eager" : "lazy"} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mockup.highlightUrl} alt="" aria-hidden className="absolute inset-0 size-full mix-blend-screen" loading={priority ? "eager" : "lazy"} />
    </div>
  );
}
