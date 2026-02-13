import type { NextAuthConfig, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

type ExtendedJWT = JWT & { id?: string };

export const authConfig = {
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }: { token: ExtendedJWT; user?: User | null }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: ExtendedJWT }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt" as const,
  },
  providers: [],
} satisfies NextAuthConfig;
