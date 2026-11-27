import { NextResponse, type NextRequest } from "next/server";
import { downloadFileName } from "@/lib/download-name";
import { findOwnImage, IMAGES_BUCKET } from "@/lib/images";
import { notSignedIn, requestSession } from "@/lib/session";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/images/[id]/file">) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());
  const { id } = await ctx.params;
  const notFound = () => session.respond(NextResponse.json({ error: "There's no such Image." }, { status: 404 }));

  const row = await findOwnImage(session, id);
  if (!row || row.status !== "completed" || !row.file_path) return notFound();

  const { data: file, error } = await session.supabase.storage.from(IMAGES_BUCKET).download(row.file_path);
  if (error || !file) {
    console.error(`Couldn't read the PNG of Image ${id}: ${error?.message}`);
    return notFound();
  }
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Content-Length": String(file.size),
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (request.nextUrl.searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename="${downloadFileName(row.prompt, Number(row.seed))}"`;
  }
  return session.respond(new NextResponse(file.stream(), { headers }));
}
