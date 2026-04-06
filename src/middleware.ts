import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const path = nextUrl.pathname;

  const isPublic =
    path === "/login" || path === "/" || path.startsWith("/api/auth");
  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const role = (req.auth?.user as any)?.role;

  if (path.startsWith("/admins") && role !== "superadmin") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (role === "client" && !path.startsWith("/my")) {
    return NextResponse.redirect(new URL("/my", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
