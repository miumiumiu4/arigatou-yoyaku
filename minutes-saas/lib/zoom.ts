import crypto from "crypto";

export function verifySignature(body: string, timestamp: string, signature: string) {
  const expected =
    "v0=" +
    crypto
      .createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN!)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function urlValidationResponse(plainToken: string) {
  const encryptedToken = crypto
    .createHmac("sha256", process.env.ZOOM_WEBHOOK_SECRET_TOKEN!)
    .update(plainToken)
    .digest("hex");
  return { plainToken, encryptedToken };
}

export async function downloadTranscript(url: string, token?: string) {
  const res = await fetch(token ? `${url}?access_token=${token}` : url);
  if (!res.ok) throw new Error(`Zoom transcript download failed: ${res.status}`);
  return res.text();
}

/** VTT -> "話者: 発言" の行に変換し、話者名の一覧も返す */
export function parseVtt(vtt: string) {
  const lines: string[] = [];
  const speakers = new Set<string>();
  for (const raw of vtt.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l === "WEBVTT" || /^\d+$/.test(l) || l.includes("-->")) continue;
    lines.push(l);
    const m = l.match(/^([^:：]{1,40})[:：]/);
    if (m) speakers.add(m[1].trim());
  }
  return { text: lines.join("\n"), speakers: [...speakers] };
}
