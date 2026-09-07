import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export const startLogin = () => {
  const githubClientId =
    import.meta.env.VITE_GITHUB_CLIENT_ID || import.meta.env.VITE_APP_ID;
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const nonce = crypto.randomUUID();
  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  if (import.meta.env.VITE_GITHUB_CLIENT_ID) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", import.meta.env.VITE_GITHUB_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);
    window.location.href = url.toString();
    return;
  }

  if (oauthPortalUrl) {
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", githubClientId || "");
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    window.location.href = url.toString();
    return;
  }

  window.location.href = "/api/oauth/login";
};
