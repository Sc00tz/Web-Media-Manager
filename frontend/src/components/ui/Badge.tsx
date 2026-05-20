import { clsx } from "clsx";

type Variant = "default" | "green" | "yellow" | "red" | "blue";

const variants: Record<Variant, string> = {
  default: "bg-white/10 text-gray-300",
  green: "bg-green-500/20 text-green-400",
  yellow: "bg-yellow-500/20 text-yellow-400",
  red: "bg-red-500/20 text-red-400",
  blue: "bg-blue-500/20 text-blue-400",
};

interface Props {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: Props) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}
