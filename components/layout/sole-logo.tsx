import Image from "next/image";
import { cn } from "@/lib/utils";

export function SoleLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/sole-logo.svg"
      alt="Sole"
      width={90}
      height={36}
      priority
      unoptimized
      className={cn("h-8 w-auto dark:invert dark:hue-rotate-180", className)}
    />
  );
}
