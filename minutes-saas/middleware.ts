import { NextRequest, NextResponse } from "next/server";

// 相手用(/r/*)とZoomウェブフックは公開。それ以外は自分用なのでBasic認証
export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p.startsWith("/r/") || p === "/api/zoom/webhook") return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, cred] = auth.split(" ");
  if (scheme === "Basic" && cred && process.env.ADMIN_PASSWORD) {
    const [u, ...rest] = atob(cred).split(":");
    if (u === process.env.ADMIN_USER && rest.join(":") === process.env.ADMIN_PASSWORD) return NextResponse.next();
  }
  return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="minutes"' } });
}
