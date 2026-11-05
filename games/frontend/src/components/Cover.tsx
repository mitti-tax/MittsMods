import { useState } from "react";

// A cover image that falls back to the placeholder if the URL is missing or fails to load
export default function Cover({ src, className, lazy = true }: { src: string | null; className: string; lazy?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div className={`${className} cover-placeholder`} aria-hidden="true">
        🎮
      </div>
    );
  return (
    <img
      src={src}
      className={className}
      alt=""
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
