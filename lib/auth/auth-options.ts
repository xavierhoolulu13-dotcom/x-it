import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { store } from "@/lib/db/store";
import { getAuthSecret } from "@/lib/auth/secret";
import { normalizeEmail, verifyPassword } from "@/lib/auth/passwords";
import { rateLimit } from "@/lib/util/rate-limit";

export interface XitSessionUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  image?: string | null;
}

export interface XitSession extends Session {
  user: XitSessionUser;
}

export function oauthProviders() {
  const providers = [];

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })
    );
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  return providers;
}

export function enabledOAuthProviderIds(): string[] {
  const ids: string[] = [];
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) ids.push("github");
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ids.push("google");
  return ids;
}

export const authOptions: NextAuthOptions = {
  secret: getAuthSecret(),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  pages: {
    signIn: "/login",
    newUser: "/register",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = normalizeEmail(credentials?.email || "");
        const password = credentials?.password || "";

        if (!email || !password) return null;

        const forwarded = req?.headers?.["x-forwarded-for"];
        const ip =
          (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
          "local";

        const limit = rateLimit(`login:${email}:${ip}`, 10, 60);
        if (!limit.allowed) {
          throw new Error(`Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`);
        }

        const user = store.getUserByEmail(email);
        if (!user || !user.hashedPassword) return null;

        const valid = await verifyPassword(password, user.hashedPassword);
        if (!valid) {
          store.addAuditLog({
            userId: user.id,
            action: "auth.login_failed",
            resource: "user",
            resourceId: user.id,
            details: { email },
            ipAddress: ip,
          });
          return null;
        }

        store.updateUser(user.id, { provider: "credentials" });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.image ?? null,
        } as XitSessionUser & { role: string };
      },
    }),
    ...oauthProviders(),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      if (account && account.provider !== "credentials") {
        // Persist OAuth users into the store on first sign-in.
        const existing = store.getUserByEmail(user.email);
        if (existing) {
          store.updateUser(existing.id, {
            name: user.name || existing.name,
            image: user.image ?? existing.image,
            provider: account.provider as "github" | "google",
          });
          user.id = existing.id;
        } else {
          const created = store.createUser({
            email: user.email,
            name: user.name || user.email.split("@")[0],
            image: user.image ?? undefined,
            provider: account.provider as "github" | "google",
          });
          user.id = created.id;
        }
      }
      return true;
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = (user as { id: string }).id;
        token.role = (user as { role?: string }).role || "USER";
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image ?? null;
      }
      if (trigger === "update" && session?.name) {
        token.name = session.name as string;
      }
      return token;
    },

    async session({ session, token }) {
      const typed = session as XitSession;
      const uid = (token.uid as string) || "";
      const stored = uid ? store.getUserById(uid) : undefined;
      typed.user = {
        id: uid,
        email: (token.email as string) || stored?.email || "",
        name: (token.name as string) || stored?.name || "",
        role: ((token.role as string) === "ADMIN" ? "ADMIN" : "USER") as "USER" | "ADMIN",
        image: (token.picture as string) || stored?.image || null,
      };
      return typed;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user?.id) return;
      store.addAuditLog({
        userId: user.id,
        action: "auth.login",
        resource: "user",
        resourceId: user.id,
        details: { provider: account?.provider || "credentials", isNewUser: Boolean(isNewUser) },
      });
    },
    async signOut({ token }) {
      const uid = (token as JWT | null)?.uid as string | undefined;
      if (uid) {
        store.addAuditLog({
          userId: uid,
          action: "auth.logout",
          resource: "user",
          resourceId: uid,
          details: {},
        });
      }
    },
  },
  debug: process.env.NEXTAUTH_DEBUG === "true",
};
