import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "recipient_session";
const MAX_AGE = 60 * 60 * 24 * 7;

const mac = (data: string) => crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(data).digest("base64url");

export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export function sessionCookie(contactId: string) {
  const payload = Buffer.from(JSON.stringify({ c: contactId, e: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return {
    name: COOKIE,
    value: `${payload}.${mac(payload)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

export const clearedCookie = { name: COOKIE, value: "", path: "/", maxAge: 0 };

/** ログイン中の相手(名簿の1件)を返す。未ログイン・改ざん・期限切れは null */
export async function currentContact() {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { c, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof c !== "string" || typeof e !== "number" || e < Date.now()) return null;
    const { data } = await db.from("contacts").select("id, name, email").eq("id", c).maybeSingle();
    return data;
  } catch {
    return null;
  }
}
