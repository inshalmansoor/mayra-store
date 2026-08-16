"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { adminDeleteImage, adminUploadImage } from "@/lib/admin-api";
import type { AdminImage } from "@/lib/admin-types";
import { ApiError } from "@/lib/api";

export default function ImagesEditor({ productId, images, onChange }: { productId: string; images: AdminImage[]; onChange: () => void }) {
  const [colourKey, setColourKey] = useState("default");
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await adminUploadImage(productId, file, colourKey || "default", alt);
      if (fileRef.current) fileRef.current.value = "";
      setAlt("");
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message2 : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this image? This also removes the file from storage.")) return;
    await adminDeleteImage(id);
    onChange();
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 10, marginBottom: 16 }}>
        {images.map((img) => (
          <div key={img.id} style={{ position: "relative" }}>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 6, overflow: "hidden", background: "#f4f5f7" }}>
              <Image src={img.url} alt={img.alt || "Product image"} fill sizes="90px" style={{ objectFit: "cover" }} />
            </div>
            <div style={{ fontSize: 10, color: "#8a8f99", marginTop: 2 }}>{img.colourKey}</div>
            <button
              onClick={() => remove(img.id)}
              style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, cursor: "pointer" }}
              aria-label="Delete image"
            >
              ✕
            </button>
          </div>
        ))}
        {images.length === 0 && <p style={{ color: "#8a8f99", fontSize: 13 }}>No images yet.</p>}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#8a8f99" }}>Colour key</label>
          <input value={colourKey} onChange={(e) => setColourKey(e.target.value)} placeholder="default" style={{ padding: "7px 9px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 13, width: 100 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#8a8f99" }}>Alt text</label>
          <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the piece" style={{ padding: "7px 9px", borderRadius: 4, border: "1px solid #d0d3d9", fontSize: 13, width: 200 }} />
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" />
        <button onClick={handleUpload} disabled={uploading} style={{ background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: uploading ? "wait" : "pointer" }}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 8 }}>{error}</p>}
      <p style={{ fontSize: 11, color: "#8a8f99", marginTop: 8 }}>JPEG, PNG or WEBP, 5MB max. First image (position 0) is the listing thumbnail.</p>
    </div>
  );
}
