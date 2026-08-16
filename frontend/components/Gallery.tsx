"use client";

import Image from "next/image";
import { useState, useRef } from "react";

export default function Gallery({
  images,
  alt,
  activeIndex,
  onIndexChange,
}: {
  images: string[];
  alt: string;
  activeIndex: number;
  onIndexChange: (i: number) => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const safe = images.length ? images : ["/brand/product-flatlay.jpg"];
  const index = Math.min(activeIndex, safe.length - 1);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && index < safe.length - 1) onIndexChange(index + 1);
      if (dx > 0 && index > 0) onIndexChange(index - 1);
    }
    touchStartX.current = null;
  }

  return (
    <div>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={() => setZoomed((z) => !z)}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--surface)",
          cursor: "zoom-in",
        }}
      >
        <Image
          src={safe[index]}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 560px"
          priority
          style={{ objectFit: "cover", transform: zoomed ? "scale(1.6)" : "scale(1)", transition: "transform 0.3s ease" }}
        />
      </div>
      {safe.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {safe.map((_, i) => (
            <button
              key={i}
              aria-label={`View image ${i + 1}`}
              aria-current={i === index}
              onClick={() => onIndexChange(i)}
              style={{
                width: i === index ? 20 : 7,
                height: 7,
                borderRadius: 999,
                border: "none",
                background: i === index ? "var(--gold-700)" : "var(--line)",
                transition: "width 0.2s",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
