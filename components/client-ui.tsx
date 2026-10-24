"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

const STYLES = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700",
  ghost: "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  danger: "text-zinc-400 hover:text-red-600",
};

/** Button that disables itself and dims while its form's action is running, so a slow network can't double-log. */
export function Button({ children, variant = "primary", disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof STYLES }) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${STYLES[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/**
 * A form that saves itself whenever a field is committed (select/checkbox change,
 * or leaving a text field). Calls the server action directly rather than through
 * <form action>, so React doesn't reset the fields afterwards.
 */
export function AutoSave({ action, children, className = "" }: { action: (fd: FormData) => Promise<void>; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, start] = useTransition();

  useEffect(() => {
    const form = ref.current!;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      setStatus("saving");
      start(async () => {
        await action(new FormData(form));
        setStatus("saved");
        clearTimeout(timer);
        timer = setTimeout(() => setStatus("idle"), 1500);
      });
    };
    form.addEventListener("change", save);
    return () => { form.removeEventListener("change", save); clearTimeout(timer); };
  }, [action]);

  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); ref.current?.dispatchEvent(new Event("change")); }} className={`relative ${className}`}>
      {children}
      <span
        role="status"
        className={`pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium shadow transition-opacity sm:bottom-6 ${status === "idle" ? "opacity-0" : "opacity-100"} ${status === "saved" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-100"}`}
      >
        {status === "saving" ? "Saving…" : "Saved ✓"}
      </span>
    </form>
  );
}

/**
 * Checkbox group where some options stand alone (e.g. "Full gym" vs specific items):
 * checking a standalone one clears the rest, checking any other clears the standalones.
 * A native listener on the group runs before the form's AutoSave sees the change.
 */
export function ExclusiveChecks({ exclusive, children, className = "" }: { exclusive: string[]; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const group = ref.current!;
    const onChange = (e: Event) => {
      const box = e.target as HTMLInputElement;
      if (box.type !== "checkbox" || !box.checked) return;
      const alone = exclusive.includes(box.value);
      for (const other of group.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${box.name}"]`)) {
        if (other !== box && (alone || exclusive.includes(other.value))) other.checked = false;
      }
    };
    group.addEventListener("change", onChange);
    return () => group.removeEventListener("change", onChange);
  }, [exclusive]);
  return <div ref={ref} className={className}>{children}</div>;
}

/** Tap-to-open (i) popover for explanations that would otherwise clutter the page. Works on touch. */
export function Info({ children, label = "More info" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  // Centered under the icon unless that would run off the screen edge.
  const [align, setAlign] = useState<"center" | "left" | "right">("center");
  const ref = useRef<HTMLSpanElement>(null);
  function toggle() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAlign(r.left < 140 ? "left" : window.innerWidth - r.right < 140 ? "right" : "center");
    setOpen((o) => !o);
  }
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-400 text-[10px] font-semibold leading-none text-zinc-500 hover:border-emerald-600 hover:text-emerald-600"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-6 z-20 w-64 max-w-[80vw] rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 ${align === "left" ? "-left-2" : align === "right" ? "-right-2" : "left-1/2 -translate-x-1/2"}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * A row with a × button. Tapping it hides the row and offers Undo for a few
 * seconds; the delete only runs if Undo isn't tapped. No confirm dialogs.
 */
export function Removable({ action, fields, children, className = "", label = "Removed" }: {
  action: (fd: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<"shown" | "undo" | "gone">("shown");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, startTransition] = useTransition();

  useEffect(() => () => clearTimeout(timer.current), []);

  function remove() {
    setState("undo");
    timer.current = setTimeout(() => {
      setState("gone");
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
      startTransition(() => action(fd));
    }, 4000);
  }

  if (state === "gone") return null;
  if (state === "undo") {
    return (
      <span className={`inline-flex items-center gap-2 text-xs text-zinc-500 ${className}`}>
        {label}.
        <button type="button" onClick={() => { clearTimeout(timer.current); setState("shown"); }} className="font-medium text-emerald-600 underline">Undo</button>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <button type="button" onClick={remove} className="px-1 text-zinc-400 hover:text-red-600" aria-label="Remove">×</button>
    </span>
  );
}
