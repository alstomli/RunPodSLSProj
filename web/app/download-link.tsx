import { downloadFileName } from "@/lib/download-name";
import type { ImageView } from "@/lib/image-view";

/**
 * Download for a completed Image: the original PNG from the file route's download option,
 * which names the file after the prompt and seed. `download` gives the browser the same name.
 */
export function DownloadLink({ image }: { image: ImageView }) {
  return (
    <a className="button" href={`/api/images/${image.id}/file?download=1`} download={downloadFileName(image.prompt, image.seed)}>
      Download
    </a>
  );
}
