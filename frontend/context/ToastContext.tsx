"use client";

// pushToast(message, linkLabel?, onLink?) — one toast at a time, 2800ms,
// aria-live="polite". Ported from the prototype's pushToast/toast state.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface ToastState {
  message: string;
  linkLabel?: string | null;
  onLink?: (() => void) | null;
}

interface ToastContextValue {
  toast: ToastState | null;
  pushToast: (message: string, linkLabel?: string | null, onLink?: (() => void) | null) => void;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const pushToast = useCallback((message: string, linkLabel?: string | null, onLink?: (() => void) | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, linkLabel: linkLabel ?? null, onLink: onLink ?? null });
    timerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const value = useMemo(() => ({ toast, pushToast, dismissToast }), [toast, pushToast, dismissToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
