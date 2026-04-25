import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, ChevronDown, X, Sun, Moon, RefreshCw } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "./utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] shadow-sm",
        secondary: "bg-[var(--panel-strong)] text-[var(--fg)] border border-[var(--line-strong)] hover:bg-[var(--line)]",
        ghost: "bg-transparent text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-strong)]",
        destructive: "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20",
        outline: "border border-[var(--accent)] bg-transparent text-[var(--accent)] hover:bg-[var(--accent)]/5",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-9 w-9",
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
  const [theme, setTheme] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") || "system";
    }
    return "system";
  });

  const applyTheme = React.useCallback((newTheme) => {
    const root = document.documentElement;
    const isDark = 
      newTheme === "dark" || 
      (newTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, []);

  React.useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") {
      localStorage.setItem("theme", theme);
    } else {
      localStorage.removeItem("theme");
    }
  }, [theme, applyTheme]);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, applyTheme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === "system") return "dark";
      if (prev === "dark") return "light";
      return "system";
    });
  };

  const Icon = theme === "dark" ? Sun : theme === "light" ? Moon : RefreshCw;
  const iconClass = theme === "dark" ? "text-amber-400" : theme === "light" ? "text-slate-500" : "text-[var(--accent)]";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full"
      title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (Click to toggle)`}
    >
      <Icon className={cn("size-5", iconClass)} />
    </Button>
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm transition-shadow hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-lg font-bold tracking-tight text-[var(--fg)]", className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-[var(--muted)]", className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]",
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
        "flex min-h-[120px] w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]",
        className
      )}
      {...props}
    />
  );
}

const badgeVariants = cva("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold border uppercase tracking-wider", {
  variants: {
    variant: {
      slate: "border-slate-500/20 bg-slate-500/10 text-slate-500",
      emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
      amber: "border-amber-500/20 bg-amber-500/10 text-amber-500",
      rose: "border-rose-500/20 bg-rose-500/10 text-rose-500",
      accent: "border-[var(--accent)]/20 bg-[var(--accent)]/5 text-[var(--accent)]",
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
    ok: "border-emerald-500/20 bg-emerald-500/5 text-emerald-500",
    error: "border-rose-500/20 bg-rose-500/5 text-rose-500",
    warn: "border-amber-500/20 bg-amber-500/5 text-amber-500",
    muted: "border-[var(--line)] bg-[var(--panel-strong)] text-[var(--fg)]",
  };
  return <div className={cn("rounded-lg border px-4 py-3 text-sm font-medium", tones[tone], className)} {...props} />;
}

export const Dialog = DialogPrimitive.Root;
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-strong)] transition-colors">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn("text-xl font-bold tracking-tight text-[var(--fg)]", className)} {...props} />;
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm text-[var(--muted)]", className)} {...props} />;
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex items-center rounded-lg bg-[var(--panel-strong)] p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center justify-center rounded-md px-4 py-1.5 text-sm font-semibold text-[var(--muted)] transition-all data-[state=active]:bg-[var(--panel)] data-[state=active]:text-[var(--fg)] data-[state=active]:shadow-sm", className)} {...props} />;
}

export const Select = SelectPrimitive.Root;
export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-11 w-full items-center justify-between rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-4 text-sm text-[var(--fg)] transition-colors focus:border-[var(--accent)] outline-none",
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
      <SelectPrimitive.Content className={cn("z-50 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-lg animate-in fade-in-0 zoom-in-95", className)} {...props}>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn("relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-4 text-sm outline-none data-[highlighted]:bg-[var(--panel-strong)] data-[highlighted]:text-[var(--fg)]", className)} {...props}>
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
  return <thead className={cn("border-b border-[var(--line)] bg-[var(--panel-strong)]/50", className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }) {
  return <tr className={cn("border-b border-[var(--line)] transition-colors hover:bg-[var(--panel-strong)]/30", className)} {...props} />;
}
export function TableHead({ className, ...props }) {
  return <th className={cn("h-10 px-4 text-left align-middle font-bold text-[var(--muted)] uppercase text-[10px] tracking-widest", className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn("p-4 align-middle text-[var(--fg)]", className)} {...props} />;
}
