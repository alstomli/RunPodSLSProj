import { downloadFileName } from "@/lib/download-name";
import { imageFileUrl, type ImageView } from "@/lib/image-view";

export function DownloadLink({ image }: { image: ImageView }) {
  return (
    <a className="button" href={imageFileUrl(image.id, { download: true })} download={downloadFileName(image.prompt, image.seed)}>
      Download
    </a>
  );
}
