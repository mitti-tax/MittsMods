import { useState } from "react";

interface Props {
  src: string | null;
  alt: string;
  className?: string;
  /** Skips lazy loading for covers that are visible immediately. */
  eager?: boolean;
}

/**
 * A cover with a placeholder for missing art and for URLs that 404 — the Steam
 * CDN does not have a portrait cover for every app.
 */
export default function CoverImage({ src, alt, className, eager = false }: Props) {
  // Tracking which src failed (rather than a boolean plus a reset effect)
  // means a new cover is retried automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && src === failedSrc;

  if (!src || failed) {
    return (
      <div
        className={`cover-placeholder${className ? ` ${className}` : ""}`}
        role="img"
        aria-label={alt}
      >
        <span aria-hidden="true">🎮</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
