import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown, X, Sun, Moon, RefreshCw } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "./utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.96] cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20 hover:shadow-blue-600/30",
        secondary: "bg-[var(--panel-strong)] text-[var(--fg)] border border-[var(--line-strong)] hover:bg-[var(--line)]",
        ghost: "bg-transparent text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-strong)]",
        destructive: "bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-900/20",
        outline: "border-2 border-[var(--line-strong)] bg-transparent text-[var(--fg)] hover:bg-[var(--panel-strong)]",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        lg: "h-13 px-8 text-base",
        icon: "h-10 w-10",
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

export function ThemeToggle() {
  // Theme toggle is hidden as requested for Full Dark Mode, but keeping logic for internal state
  return null;
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm transition-all duration-300 hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1.5 p-6 border-b border-[var(--line)] bg-[var(--panel-strong)]/20", className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-lg font-bold tracking-tight text-[var(--fg)]", className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-[var(--muted)] leading-relaxed opacity-80", className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--panel-strong)]/50 px-4 py-2 text-sm text-[var(--fg)] outline-none transition-all placeholder:text-[var(--muted)] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10",
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
        "flex min-h-[120px] w-full rounded-xl border border-[var(--line-strong)] bg-[var(--panel-strong)]/50 px-4 py-2 text-sm text-[var(--fg)] outline-none transition-all placeholder:text-[var(--muted)] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 resize-none",
        className
      )}
      {...props}
    />
  );
}

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border uppercase tracking-wider", {
  variants: {
    variant: {
      slate: "border-slate-500/20 bg-slate-500/10 text-slate-400",
      emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
      amber: "border-amber-500/20 bg-amber-500/10 text-amber-400",
      rose: "border-rose-500/20 bg-rose-500/10 text-rose-400",
      accent: "border-blue-500/20 bg-blue-500/10 text-blue-400",
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
    ok: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    error: "border-rose-500/20 bg-rose-500/10 text-rose-400",
    warn: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    muted: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--fg)]",
  };
  return <div className={cn("rounded-xl border px-5 py-3.5 text-sm font-bold shadow-sm", tones[tone], className)} {...props} />;
}

export const Dialog = DialogPrimitive.Root;
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 transition-all duration-300" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-0 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] overflow-hidden",
          className
        )}
        {...props}
      >
        <div className="p-8">
           {children}
        </div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-strong)] transition-all active:scale-90">
          <X className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }) {
  return <div className={cn("mb-6 flex flex-col gap-1.5", className)} {...props} />;
}
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn("text-2xl font-extrabold tracking-tight text-[var(--fg)]", className)} {...props} />;
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm text-[var(--muted)] leading-relaxed opacity-80", className)} {...props} />;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex items-center rounded-xl bg-[var(--panel-strong)] p-1.5", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center justify-center rounded-lg px-5 py-2 text-sm font-bold text-[var(--muted)] transition-all data-[state=active]:bg-[var(--panel)] data-[state=active]:text-[var(--fg)] data-[state=active]:shadow-md", className)} {...props} />;
}

export const Select = SelectPrimitive.Root;
export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-11 w-full items-center justify-between rounded-xl border border-[var(--line-strong)] bg-[var(--panel-strong)]/50 px-4 text-sm text-[var(--fg)] font-bold transition-all focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none",
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
      <SelectPrimitive.Content className={cn("z-50 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl animate-in fade-in-0 zoom-in-95", className)} {...props}>
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-pointer select-none items-center rounded-lg py-2.5 pl-9 pr-4 text-sm font-bold outline-none data-[highlighted]:bg-blue-600 data-[highlighted]:text-white transition-colors", className)} {...props}>
      <span className="absolute left-3 flex size-4 items-center justify-center">
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
  return <thead className={cn("border-b border-[var(--line)] bg-[var(--panel-strong)]/40", className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }) {
  return <tr className={cn("border-b border-[var(--line)] transition-all hover:bg-[var(--panel-strong)]/20", className)} {...props} />;
}
export function TableHead({ className, ...props }) {
  return <th className={cn("h-12 px-4 text-left align-middle font-black text-[var(--muted)] uppercase text-[10px] tracking-[0.2em]", className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn("p-4 align-middle text-[var(--fg)]", className)} {...props} />;
}
