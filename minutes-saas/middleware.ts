import { NextRequest, NextResponse } from "next/server";

// 相手用(/login,/my,ログインAPI)とZoomウェブフックは公開(相手側は独自セッションで保護)。それ以外は自分用なのでBasic認証
const PUBLIC = ["/login", "/my", "/api/login", "/api/logout"];
export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p === "/api/zoom/webhook" || PUBLIC.some((x) => p === x || p.startsWith(x + "/"))) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, cred] = auth.split(" ");
  if (scheme === "Basic" && cred && process.env.ADMIN_PASSWORD) {
    const [u, ...rest] = atob(cred).split(":");
    if (u === process.env.ADMIN_USER && rest.join(":") === process.env.ADMIN_PASSWORD) return NextResponse.next();
  }
  return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="minutes"' } });
}
