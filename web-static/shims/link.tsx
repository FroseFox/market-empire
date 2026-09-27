import type { AnchorHTMLAttributes } from "react";
import { navigate } from "./router";

export default function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a {...rest} href={href === "/" ? "#" : `#${href.slice(1)}`}
      onClick={(e) => { onClick?.(e); if (e.defaultPrevented) return; e.preventDefault(); navigate(href); }} />
  );
}
