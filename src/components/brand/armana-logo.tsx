import logo from "@/assets/armana-logo.png";
import { cn } from "@/lib/utils";

/**
 * Official Armana Group mark. Rendered at its natural 1:1 aspect ratio inside a
 * light clear-space plate so it keeps contrast on dark surfaces too.
 */
export function ArmanaLogo({
  size = 36,
  plate = true,
  className,
}: {
  size?: number;
  plate?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        plate && "rounded-md bg-white p-1.5 ring-1 ring-black/5",
        className,
      )}
    >
      <img
        src={logo}
        alt="Armana Group"
        width={size}
        height={size}
        className="block h-auto w-auto object-contain"
        style={{ width: size, height: size }}
      />
    </span>
  );
}
