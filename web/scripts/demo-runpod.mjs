import http from "node:http";
import zlib from "node:zlib";

const QUEUE_MS = 3000;
const RUN_MS = 8000;
const COLD_START_MS = 30000;
const PNG_BIT_DEPTH_8 = 8;
const PNG_COLOR_TYPE_RGB = 2;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function makePng(width, height, seed) {
  const tint = [seed & 0xff, (seed >>> 8) & 0xff, (seed >>> 16) & 0xff];
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      rows[i] = (tint[0] + (x * 255) / width) & 0xff;
      rows[i + 1] = (tint[1] + (y * 255) / height) & 0xff;
      rows[i + 2] = tint[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = PNG_BIT_DEPTH_8;
  header[9] = PNG_COLOR_TYPE_RGB;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function startDemoRunpod(port = 0, { unknownJobStatus = 404 } = {}) {
  const jobs = new Map();
  let counter = 0;

  function reply(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  function statusOf(id) {
    const job = jobs.get(id);
    if (job.cancelled) return { id, status: "CANCELLED" };
    const age = Date.now() - job.started - (/cold/i.test(job.input.prompt ?? "") ? COLD_START_MS : 0);
    if (age < QUEUE_MS) return { id, status: "IN_QUEUE" };
    if (age < RUN_MS) return { id, status: "IN_PROGRESS" };
    if (/fail/i.test(job.input.prompt ?? "")) return { id, status: "FAILED", error: "The demo Worker was told to fail." };
    if (/error/i.test(job.input.prompt ?? "")) return { id, status: "COMPLETED", output: { error: "The demo Worker returned an error." } };
    const { width = 1024, height = 1024, seed = 0 } = job.input;
    job.png ??= makePng(width, height, seed).toString("base64");
    return { id, status: "COMPLETED", output: { image_base64: job.png, ...job.input } };
  }

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const path = new URL(req.url ?? "/", "http://x").pathname;
    let match;
    if (req.method === "POST" && path === "/run") {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const id = `demo-${Date.now()}-${++counter}`;
      jobs.set(id, { input: body.input ?? {}, started: Date.now(), cancelled: false });
      return reply(res, 200, { id, status: "IN_QUEUE" });
    }
    if ((match = path.match(/^\/(status|cancel)\/([^/]+)$/)) && jobs.has(match[2])) {
      if (match[1] === "cancel" && req.method === "POST") jobs.get(match[2]).cancelled = true;
      return reply(res, 200, statusOf(match[2]));
    }
    reply(res, unknownJobStatus, { error: "job not found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}
