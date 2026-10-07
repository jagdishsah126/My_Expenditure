import { useEffect, useRef, type ReactNode } from "react";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(90vw,26rem)] rounded-3xl border-0 bg-white p-6 text-ink shadow-2xl backdrop:bg-forest/50"
    >
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
      <button
        type="button"
        onClick={onClose}
        className="mt-6 min-h-11 w-full rounded-xl bg-forest px-4 font-semibold text-white"
      >
        Close
      </button>
    </dialog>
  );
}
