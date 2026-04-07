import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "./utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-[var(--bg)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--accent-strong)] focus-visible:ring-[var(--accent)]",
        secondary: "bg-white/80 text-[var(--fg)] border border-[var(--line)] hover:bg-white focus-visible:ring-[var(--accent)]",
        ghost: "text-[var(--fg)] hover:bg-white/70 focus-visible:ring-[var(--accent)]",
        destructive: "bg-[var(--danger)] text-white hover:opacity-95 focus-visible:ring-[var(--danger)]",
        outline: "border border-[var(--line)] bg-transparent text-[var(--fg)] hover:bg-white/60 focus-visible:ring-[var(--accent)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), "transform-gpu duration-200 hover:-translate-y-0.5 active:translate-y-0", className)} {...props} />;
}

export function Card({ className, ...props }) {
  return <div className={cn("rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_32px_80px_rgba(53,33,18,0.14)]", className)} {...props} />;
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-2 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-lg font-semibold tracking-tight text-[var(--fg)]", className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-[var(--muted)]", className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function Input({ className, ...props }) {
  return <input className={cn("flex h-11 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20", className)} {...props} />;
}
export function Textarea({ className, ...props }) {
  return <textarea className={cn("flex min-h-28 w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em]", {
  variants: {
    variant: {
      slate: "bg-slate-500/10 text-slate-700",
      emerald: "bg-emerald-500/12 text-emerald-700",
      amber: "bg-amber-500/15 text-amber-700",
      rose: "bg-rose-500/12 text-rose-700",
      accent: "bg-[var(--accent)]/10 text-[var(--accent-strong)]",
    },
  },
  defaultVariants: {
    variant: "slate",
  },
});
export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Alert({ className, tone = "muted", ...props }) {
  const toneClass = tone === "ok"
    ? "border-emerald-300/70 bg-emerald-500/10 text-emerald-800"
    : tone === "error"
      ? "border-rose-300/70 bg-rose-500/10 text-rose-800"
      : tone === "warn"
        ? "border-amber-300/70 bg-amber-500/10 text-amber-900"
        : "border-[var(--line)] bg-white/70 text-[var(--muted)]";
  return <div className={cn("rounded-2xl border px-4 py-3 text-sm", toneClass, className)} {...props} />;
}

export const Dialog = DialogPrimitive.Root;
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm data-[state=open]:animate-[fadeIn_180ms_ease-out]" />
      <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl data-[state=open]:animate-[panelIn_220ms_cubic-bezier(0.22,1,0.36,1)]", className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-2 text-[var(--muted)] hover:bg-black/5">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }) {
  return <div className={cn("mb-4 flex flex-col gap-2", className)} {...props} />;
}
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn("text-xl font-semibold", className)} {...props} />;
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm text-[var(--muted)]", className)} {...props} />;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex h-11 items-center rounded-2xl border border-[var(--line)] bg-white/70 p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted)] transition data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white", className)} {...props} />;
}

export const Select = SelectPrimitive.Root;
export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger className={cn("flex h-11 w-full items-center justify-between rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--fg)] shadow-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/20", className)} {...props}>
      {children}
      <SelectPrimitive.Icon><ChevronDown className="size-4 text-[var(--muted)]" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export const SelectValue = SelectPrimitive.Value;
export function SelectContent({ className, children, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className={cn("z-50 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-xl", className)} {...props}>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-default select-none items-center rounded-xl py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-[var(--accent)]/10", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function Table({ className, ...props }) {
  return <table className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}
export function TableHeader({ className, ...props }) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-[var(--line)]", className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }) {
  return <tr className={cn("border-b border-[var(--line)] transition hover:bg-black/[0.02]", className)} {...props} />;
}
export function TableHead({ className, ...props }) {
  return <th className={cn("px-4 py-3 text-left font-medium text-[var(--muted)]", className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn("px-4 py-3 align-top", className)} {...props} />;
}
