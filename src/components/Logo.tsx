import logoNavy from "@/assets/logo-navy.png.asset.json";
import logoWhite from "@/assets/logo-white.png.asset.json";
import logoTeal from "@/assets/logo-teal.png.asset.json";
import iconNavy from "@/assets/logo-icon-navy.png.asset.json";
import iconWhite from "@/assets/logo-icon-white.png.asset.json";
import iconTeal from "@/assets/logo-icon-teal.png.asset.json";

const WORDMARKS = {
  navy: logoNavy.url,
  white: logoWhite.url,
  teal: logoTeal.url,
} as const;

const ICONS = {
  navy: iconNavy.url,
  white: iconWhite.url,
  teal: iconTeal.url,
} as const;

type Variant = keyof typeof WORDMARKS;

export function Logo({
  variant = "navy",
  className = "h-7 w-auto",
}: {
  variant?: Variant;
  className?: string;
}) {
  return (
    <img
      src={WORDMARKS[variant]}
      alt="Harmonious"
      className={className}
      loading="lazy"
    />
  );
}

export function LogoIcon({
  variant = "navy",
  className = "h-8 w-auto",
}: {
  variant?: Variant;
  className?: string;
}) {
  return (
    <img
      src={ICONS[variant]}
      alt="Harmonious lighthouse logo"
      className={className}
      loading="lazy"
    />
  );
}
