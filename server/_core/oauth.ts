import {
  COOKIE_NAME,
  ONE_YEAR_MS,
  OAUTH_STATE_COOKIE,
  decodeOAuthState,
  encodeOAuthState,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const githubClientId =
      process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID;

    if (!githubClientId) {
      res
        .status(500)
        .send(
          "GitHub OAuth is not configured. Run 'pnpm wizard' or set GITHUB_CLIENT_ID in .env."
        );
      return;
    }

    const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/callback`;
    const nonce = crypto.randomUUID();
    res.cookie(OAUTH_STATE_COOKIE, nonce, {
      path: "/",
      maxAge: 600 * 1000,
      sameSite: "none",
      secure: true,
    });
    const state = encodeOAuthState({ redirectUri, nonce });

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", githubClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);

    res.redirect(url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[
      OAUTH_STATE_COOKIE
    ];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });

    try {
      const githubClientId =
        process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID;
      const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

      let openId: string;
      let name: string | null = null;
      let email: string | null = null;
      let loginMethod = "github";

      if (githubClientId && githubClientSecret) {
        // Direct GitHub OAuth exchange
        const tokenResponse = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              client_id: githubClientId,
              client_secret: githubClientSecret,
              code,
            }),
          }
        );

        if (!tokenResponse.ok) {
          throw new Error(
            `GitHub token exchange failed (${tokenResponse.status}): ${await tokenResponse.text()}`
          );
        }

        const tokenData = (await tokenResponse.json()) as {
          access_token?: string;
          error?: string;
          error_description?: string;
        };

        if (!tokenData.access_token) {
          throw new Error(
            tokenData.error_description ||
              tokenData.error ||
              "GitHub did not return an access token"
          );
        }

        const userResponse = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "QuoteFlow",
          },
        });

        if (!userResponse.ok) {
          throw new Error(
            `Failed to fetch GitHub user (${userResponse.status})`
          );
        }

        const userData = (await userResponse.json()) as {
          id: number;
          login: string;
          name: string | null;
          email: string | null;
        };

        openId = `github:${userData.id}`;
        name = userData.name || userData.login;
        email = userData.email;

        if (!email) {
          try {
            const emailsResponse = await fetch(
              "https://api.github.com/user/emails",
              {
                headers: {
                  Authorization: `Bearer ${tokenData.access_token}`,
                  "User-Agent": "QuoteFlow",
                },
              }
            );
            if (emailsResponse.ok) {
              const emails = (await emailsResponse.json()) as Array<{
                email: string;
                primary: boolean;
                verified: boolean;
              }>;
              const primary =
                emails.find(e => e.primary && e.verified) || emails[0];
              if (primary) email = primary.email;
            }
          } catch {
            // Ignore email secondary lookup error
          }
        }
      } else {
        // Fallback to platform SDK
        const tokenResponse = await sdk.exchangeCodeForToken(code, state);
        const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

        if (!userInfo.openId) {
          res.status(400).json({ error: "openId missing from user info" });
          return;
        }

        openId = userInfo.openId;
        name = userInfo.name || null;
        email = userInfo.email ?? null;
        loginMethod = userInfo.loginMethod ?? userInfo.platform ?? "oauth";
      }

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
