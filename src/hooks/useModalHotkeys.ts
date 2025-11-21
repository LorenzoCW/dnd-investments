import { useEffect } from "react";

export function useModalHotkeys({
  onConfirm,
  onCancel,
  enabled = true,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    }

    window.addEventListener("keydown", handler);

    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [enabled, onConfirm, onCancel]);
}