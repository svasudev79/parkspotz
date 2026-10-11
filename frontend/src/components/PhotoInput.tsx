"use client";

import { useId } from "react";

// "Take a photo" control. On a phone it opens the rear camera; on a computer
// it opens a file picker. The chosen file is handed to `onChange`.
export function PhotoInput({
  file,
  label,
  disabled,
  onChange,
}: {
  file: File | null;
  label: string;
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={`inline-flex min-h-14 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-400 bg-white px-4 text-center text-base font-medium text-slate-800 ${
          disabled ? "opacity-60" : "hover:bg-slate-50"
        }`}
      >
        {file ? "Photo ready — tap to retake" : label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {file && <span className="text-sm break-all text-slate-500">{file.name}</span>}
    </div>
  );
}
