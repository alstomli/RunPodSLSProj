import { NextResponse, type NextRequest } from "next/server";
import { IMAGES_TABLE, toImageView, type ImageRow } from "@/lib/images";
import { notSignedIn, requestSession } from "@/lib/session";

/**
 * GET → the Gallery: `{ images: ImageView[] }`, the User's Images newest first, unfinished Jobs
 * included. Read as the User, so row-level security keeps other Users' Images out.
 */
export async function GET(request: NextRequest) {
  const session = await requestSession(request);
  if (!session.user) return session.respond(notSignedIn());

  const { data, error } = await session.supabase
    .from(IMAGES_TABLE)
    .select()
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .overrideTypes<ImageRow[], { merge: false }>();
  if (error) {
    console.error(`Couldn't list the Gallery: ${error.message}`);
    return session.respond(NextResponse.json({ error: "Couldn't load your Gallery. Try again." }, { status: 500 }));
  }
  const now = Date.now();
  return session.respond(NextResponse.json({ images: data.map((row) => toImageView(row, now)) }));
}
