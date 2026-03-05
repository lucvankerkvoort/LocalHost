import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnProtectedRoute = req.nextUrl.pathname.startsWith("/profile") ||
    req.nextUrl.pathname.startsWith("/trips") ||
    req.nextUrl.pathname.startsWith("/become-host") ||
    req.nextUrl.pathname.startsWith("/bookings") ||
    req.nextUrl.pathname.startsWith("/host/dashboard") ||
    req.nextUrl.pathname.startsWith("/messages");

  if (isOnProtectedRoute && !isLoggedIn) {
    const signInUrl = new URL("/auth/signin", req.url);
    const callbackUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    signInUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
