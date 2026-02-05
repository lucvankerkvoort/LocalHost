import type { NextAuthConfig, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

type AuthHostEnv = Partial<
  Record<"AUTH_TRUST_HOST" | "AUTH_URL" | "NEXTAUTH_URL" | "NETLIFY" | "NODE_ENV", string | undefined>
>;

type SessionWithUserId = Session & {
  user?: Session["user"] & { id?: string };
};

type TokenWithUserId = JWT & { id?: string };

export function shouldTrustAuthHost(env: AuthHostEnv = process.env as AuthHostEnv): boolean {
  return (
    env.AUTH_TRUST_HOST === "true" ||
    typeof env.AUTH_URL === "string" ||
    typeof env.NEXTAUTH_URL === "string" ||
    env.NETLIFY === "true" ||
    env.NODE_ENV === "development" ||
    env.NODE_ENV === "test"
  );
}

export const authConfig = {
  pages: {
    signIn: "/auth/signin",
  },
  trustHost: shouldTrustAuthHost(),
  callbacks: {
    async jwt({ token, user }) {
      const nextToken = token as TokenWithUserId;

      if (user && typeof user.id === "string") {
        nextToken.id = user.id;
      }

      return nextToken;
    },
    async session({ session, token }) {
      const nextSession = session as SessionWithUserId;
      const tokenWithUserId = token as TokenWithUserId;

      if (nextSession.user && tokenWithUserId.id) {
        nextSession.user.id = tokenWithUserId.id;
      }

      return nextSession;
    },
  },
  session: {
    strategy: "jwt" as const,
  },
  providers: [],
} satisfies NextAuthConfig;
