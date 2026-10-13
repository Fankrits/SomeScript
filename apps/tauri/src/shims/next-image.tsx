import type { ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  priority?: boolean;
};

/** Vite stand-in for next/image: a plain <img> (the one call site is a bundled SVG). */
export default function Image({ priority: _priority, alt = "", ...rest }: Props) {
  return <img alt={alt} {...rest} />;
}
