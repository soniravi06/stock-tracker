import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const path = nextUrl.pathname;

  const isPublic = path === "/login" || path === "/" || path.startsWith("/api/auth");
  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const role = req.auth?.user?.role;

  // Superadmin-only areas
  if (path.startsWith("/superadmin") && role !== "superadmin") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Client logins can only see their own scoped view
  if (role === "client" && !path.startsWith("/my")) {
    return NextResponse.redirect(new URL("/my", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
