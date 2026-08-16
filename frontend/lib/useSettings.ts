"use client";

import { useEffect, useState } from "react";
import type { StoreSettings } from "./types";

let cache: StoreSettings | null = null;
let inflight: Promise<StoreSettings | null> | null = null;

async function load(): Promise<StoreSettings | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/settings")
      .then((r) => r.json())
      .then((data: StoreSettings) => {
        cache = data;
        return data;
      })
      .catch(() => null);
  }
  return inflight;
}

export function useSettings(): { settings: StoreSettings | null; loading: boolean } {
  const [settings, setSettings] = useState<StoreSettings | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let mounted = true;
    load().then((data) => {
      if (mounted) {
        setSettings(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { settings, loading };
}
