# A User's Images reach the browser only through the owner-checked file route

Every Image is private to the User who made it, so its PNG is served only by `/api/images/<id>/file`, which reads the row and the file as the signed-in User (row-level security and the Storage policy decide), answers 401 to visitors who aren't signed in and 404 to every other User, and returns the original bytes. Next's image optimizer (`/_next/image`) is switched off and the page uses a plain `<img>` instead of `next/image`, because the optimizer fetches without the visitor's cookies and caches what it gets for everyone, which would hand one User's Image to strangers; it would also recompress the PNG the User asked for.

## Consequences

- `images.unoptimized` stays on in `next.config.ts`; turning it back on for speed reopens the leak.
- The `@next/next/no-img-element` lint rule is disabled in the one component that renders an Image.
- The proxy turns away visitors who aren't signed in, but every route handler checks the User again itself, so a gap in the proxy's matcher doesn't expose anything.
