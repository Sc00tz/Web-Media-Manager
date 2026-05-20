import { useEffect } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: string;
  children: React.ReactNode;
}

export function SlidePanel({ open, onClose, title, width = "w-[640px]", children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/50 z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={clsx(
          "fixed top-0 right-0 h-full bg-gray-900 border-l border-white/10 z-50 flex flex-col transition-transform duration-300",
          width,
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
            <h2 className="font-semibold text-lg truncate">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white ml-4">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
