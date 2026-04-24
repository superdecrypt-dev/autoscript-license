import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "./utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full border text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-[var(--bg)]",
  {
    variants: {
      variant: {
        default: "border-[var(--accent-strong)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_16px_32px_rgba(15,19,40,0.24)] hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(15,19,40,0.28)] focus-visible:ring-[var(--accent)]",
        secondary: "border-[var(--line-strong)] bg-[var(--panel-strong)] text-[var(--fg)] hover:-translate-y-0.5 hover:bg-[var(--panel)] focus-visible:ring-[var(--accent)]",
        ghost: "border-transparent bg-transparent text-[var(--fg)] hover:border-[var(--line)] hover:bg-[var(--panel-strong)] focus-visible:ring-[var(--accent)]",
        destructive: "border-[#8f2732] bg-[linear-gradient(135deg,#d34758,#8f2732)] text-white hover:-translate-y-0.5 focus-visible:ring-[#d34758]",
        outline: "border-[var(--line-strong)] bg-transparent text-[var(--fg)] hover:bg-[var(--panel-strong)] focus-visible:ring-[var(--accent)]",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)] backdrop-blur-xl transition duration-300 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-strong)]",
        className
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-2 p-6 md:p-7", className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-lg font-semibold tracking-[-0.03em] text-[var(--fg)] md:text-xl", className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm leading-6 text-[var(--muted)]", className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0 md:p-7 md:pt-0", className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/18",
        className
      )}
      {...props}
    />
  );
}
export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "flex min-h-32 w-full rounded-2xl border border-[var(--line)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/18",
        className
      )}
      {...props}
    />
  );
}

const badgeVariants = cva("inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]", {
  variants: {
    variant: {
      slate: "border-slate-500/20 bg-slate-500/10 text-slate-700",
      emerald: "border-emerald-500/20 bg-emerald-500/12 text-emerald-700",
      amber: "border-amber-500/22 bg-amber-500/12 text-amber-800",
      rose: "border-rose-500/18 bg-rose-500/12 text-rose-700",
      accent: "border-[var(--accent)]/25 bg-[var(--accent)]/12 text-[var(--accent-strong)]",
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
    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-900"
    : tone === "error"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-900"
      : tone === "warn"
        ? "border-amber-400/30 bg-amber-500/12 text-amber-950"
        : "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--muted)]";
  return <div className={cn("rounded-[1.4rem] border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]", toneClass, className)} {...props} />;
}

export const Dialog = DialogPrimitive.Root;
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(10,14,28,0.58)] backdrop-blur-md data-[state=open]:animate-[fadeIn_180ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-[1.9rem] border border-[var(--line)] bg-[var(--panel-strong)] p-6 shadow-[0_38px_120px_rgba(10,14,28,0.32)] data-[state=open]:animate-[panelIn_220ms_cubic-bezier(0.22,1,0.36,1)]",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full border border-[var(--line)] bg-white/70 p-2 text-[var(--muted)] hover:bg-white">
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
  return <DialogPrimitive.Title className={cn("text-xl font-semibold tracking-[-0.03em]", className)} {...props} />;
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm leading-6 text-[var(--muted)]", className)} {...props} />;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex h-12 items-center rounded-full border border-[var(--line)] bg-[var(--panel-strong)] p-1.5", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-[var(--muted)] transition data-[state=active]:bg-[var(--fg)] data-[state=active]:text-white", className)} {...props} />;
}

export const Select = SelectPrimitive.Root;
export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-12 w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] outline-none focus:ring-2 focus:ring-[var(--accent)]/18",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-4 text-[var(--muted)]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export const SelectValue = SelectPrimitive.Value;
export function SelectContent({ className, children, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className={cn("z-50 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel-strong)] shadow-[0_20px_60px_rgba(10,14,28,0.2)]", className)} {...props}>
        <SelectPrimitive.Viewport className="p-2">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-default select-none items-center rounded-2xl py-2.5 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-[var(--accent)]/10", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
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
  return <th className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]", className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn("px-4 py-3 align-top", className)} {...props} />;
}
