import { useId, type ReactNode } from "react";

type FieldProps = {
  label: string;
  description?: string;
  children: (id: string, descriptionId: string | undefined) => ReactNode;
};

export function Field({ label, description, children }: FieldProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {description && (
        <p id={descriptionId} className="text-sm text-ink/70">
          {description}
        </p>
      )}
      {children(id, descriptionId)}
    </div>
  );
}
