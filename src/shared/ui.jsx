import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "./utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white shadow-[0_0_20px_var(--accent-glow)] hover:bg-[var(--accent-strong)] hover:shadow-[0_0_30px_var(--accent-glow)]",
        secondary: "bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20",
        ghost: "bg-transparent text-[var(--muted)] hover:text-white hover:bg-white/5",
        destructive: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30",
        outline: "border border-[var(--line-strong)] bg-transparent text-white hover:bg-white/5 hover:border-white/20",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        lg: "h-14 px-8 text-base",
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
        "rounded-2xl border border-[var(--line)] bg-[var(--panel)] backdrop-blur-xl shadow-[var(--shadow)] transition-all duration-500 hover:border-[var(--line-strong)] hover:bg-[var(--panel-strong)]",
        className
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-xl font-semibold tracking-tight text-[var(--fg)]", className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-[var(--muted)] leading-relaxed", className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--fg)] outline-none transition-all placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10",
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
        "flex min-h-32 w-full rounded-xl border border-[var(--line)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--fg)] outline-none transition-all placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10",
        className
      )}
      {...props}
    />
  );
}

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors", {
  variants: {
    variant: {
      slate: "border-slate-500/20 bg-slate-500/10 text-slate-400",
      emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
      amber: "border-amber-500/20 bg-amber-500/10 text-amber-400",
      rose: "border-rose-500/20 bg-rose-500/10 text-rose-400",
      accent: "border-[var(--accent)]/20 bg-[var(--accent)]/10 text-[var(--accent)]",
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
  const tones = {
    ok: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    error: "border-rose-500/20 bg-rose-500/5 text-rose-400",
    warn: "border-amber-500/20 bg-amber-500/5 text-amber-400",
    muted: "border-[var(--line)] bg-white/5 text-[var(--muted)]",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm flex items-start gap-3", tones[tone], className)} {...props} />;
}

export const Dialog = DialogPrimitive.Root;
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-[fadeIn_200ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-gray-900/90 p-6 shadow-2xl backdrop-blur-2xl data-[state=open]:animate-[panelIn_300ms_cubic-bezier(0.16,1,0.3,1)]",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-[var(--muted)] hover:text-white hover:bg-white/5 transition-colors">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }) {
  return <div className={cn("mb-6 flex flex-col gap-1.5", className)} {...props} />;
}
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn("text-2xl font-semibold tracking-tight", className)} {...props} />;
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm text-[var(--muted)]", className)} {...props} />;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex items-center rounded-xl bg-white/5 p-1 border border-white/5", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-[var(--muted)] transition-all data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white data-[state=active]:shadow-lg", className)} {...props} />;
}

export const Select = SelectPrimitive.Root;
export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-12 w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--input)] px-4 text-sm text-[var(--fg)] transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/10",
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
      <SelectPrimitive.Content className={cn("z-50 overflow-hidden rounded-xl border border-white/10 bg-gray-900 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200", className)} {...props}>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-default select-none items-center rounded-lg py-2.5 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-white/5 data-[highlighted]:text-white transition-colors", className)} {...props}>
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
  return <thead className={cn("border-b border-[var(--line)]", className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }) {
  return <tr className={cn("border-b border-[var(--line)] transition-colors hover:bg-white/[0.02] data-[state=selected]:bg-white/[0.04]", className)} {...props} />;
}
export function TableHead({ className, ...props }) {
  return <th className={cn("h-12 px-4 text-left align-middle font-medium text-[var(--muted)]", className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn("p-4 align-middle", className)} {...props} />;
}
