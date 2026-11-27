import { downloadFileName } from "@/lib/download-name";
import { imageFileUrl, type ImageView } from "@/lib/image-view";

/**
 * Download for a completed Image: the original PNG from the file route's download option,
 * which names the file after the prompt and seed. `download` gives the browser the same name.
 */
export function DownloadLink({ image }: { image: ImageView }) {
  return (
    <a className="button" href={imageFileUrl(image.id, { download: true })} download={downloadFileName(image.prompt, image.seed)}>
      Download
    </a>
  );
}
