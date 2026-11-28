import type { ImgHTMLAttributes } from "react";
import { imageFileUrl, type ImageView } from "@/lib/image-view";

type Props = { image: ImageView } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "width" | "height">;

export function ImageFile({ image, ...rest }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- docs/adr/0002
    <img src={imageFileUrl(image.id)} alt={image.prompt} width={image.width} height={image.height} {...rest} />
  );
}
