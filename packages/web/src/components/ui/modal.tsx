import { useEffect, useCallback } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-[28rem] max-h-[85vh] flex flex-col border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-base font-semibold dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="size-7 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 text-xs transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-3">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-2 bg-neutral-50/50 dark:bg-neutral-950/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
