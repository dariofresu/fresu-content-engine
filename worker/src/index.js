/**
 * Fresu Content Engine — OAuth broker.
 *
 * Routes:
 *   GET  /connect                     buttons page + connection status
 *   GET  /auth/:platform/start        redirect to provider consent
 *   GET  /auth/:platform/callback     exchange code, store tokens in KV
 *   GET  /auth/:platform/disconnect   remove stored tokens
 *   GET  /api/tokens                  (Bearer ENGINE_KEY) fresh access tokens
 *
 * Tokens live in the TOKENS KV namespace, one key per platform.
 * Client secrets live in Worker secrets — never in the browser, never in git.
 */

const PLATFORMS = ["linkedin", "youtube", "meta", "tiktok", "x"];

// the Worker secret that must exist before each platform's Connect can work
const NEEDS = { linkedin: "LINKEDIN_CLIENT_ID", youtube: "GOOGLE_CLIENT_ID",
                meta: "META_APP_ID", tiktok: "TIKTOK_CLIENT_KEY", x: "X_CLIENT_ID" };

const html = (body) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect — Fresu Content Engine</title>
  <style>
    body{background:#0d1520;color:#e8eef6;font:16px/1.6 "Segoe UI",system-ui,sans-serif;
         display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}
    .card{background:#16202e;border:1px solid #24344a;border-radius:14px;padding:2rem;max-width:460px;width:100%}
    h1{font-size:1.3rem;margin:0 0 .3rem}h1 span{color:#4fd1a5}
    p{color:#8fa3bb;font-size:.9rem;margin:.4rem 0 1.2rem}
    .row{display:flex;align-items:center;gap:.8rem;border:1px solid #24344a;border-radius:10px;
         padding:.7rem 1rem;margin-bottom:.6rem}
    .row b{text-transform:capitalize}
    .row .st{margin-left:auto;font-size:.8rem;color:#8fa3bb}
    .row .st.on{color:#4fd1a5}
    a.btn{background:#4fd1a5;color:#08281d;text-decoration:none;border-radius:8px;
          padding:.35rem .9rem;font-size:.85rem;font-weight:600}
    a.btn.ghost{background:transparent;color:#8fa3bb;border:1px solid #24344a}
    a.back{color:#4fd1a5;font-size:.85rem}
  </style><body><div class="card">${body}</div></body>`,
  { headers: { "content-type": "text/html; charset=utf-8" } });

const rnd = () => crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");

async function sha256b64url(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const form = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

async function getTok(env, p) { const v = await env.TOKENS.get("tok:" + p); return v ? JSON.parse(v) : null; }
async function putTok(env, p, t) { await env.TOKENS.put("tok:" + p, JSON.stringify(t)); }

/* ---------------- provider configs ---------------- */

function providers(env) {
  const cb = (p) => `${env.BASE_URL}/auth/${p}/callback`;
  return {
    linkedin: {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      params: { response_type: "code", client_id: env.LINKEDIN_CLIENT_ID,
                redirect_uri: cb("linkedin"), scope: "openid profile w_member_social" },
      async exchange(code) {
        const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({ grant_type: "authorization_code", code, redirect_uri: cb("linkedin"),
                       client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET }) });
        const j = await r.json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        const me = await (await fetch("https://api.linkedin.com/v2/userinfo",
          { headers: { authorization: "Bearer " + j.access_token } })).json();
        return { access: j.access_token, expires: Date.now() + (j.expires_in || 5184000) * 1000,
                 extra: { author_urn: "urn:li:person:" + me.sub, name: me.name } };
      },
    },

    youtube: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      params: { response_type: "code", client_id: env.GOOGLE_CLIENT_ID, redirect_uri: cb("youtube"),
                scope: "https://www.googleapis.com/auth/youtube.upload", access_type: "offline", prompt: "consent" },
      async exchange(code) {
        const j = await (await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({ grant_type: "authorization_code", code, redirect_uri: cb("youtube"),
                       client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }) })).json();
        if (!j.refresh_token) throw new Error(JSON.stringify(j));
        return { access: j.access_token, refresh: j.refresh_token,
                 expires: Date.now() + (j.expires_in || 3600) * 1000, extra: {} };
      },
      async refresh(t) {
        const j = await (await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({ grant_type: "refresh_token", refresh_token: t.refresh,
                       client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }) })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return { ...t, access: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 };
      },
    },

    meta: {
      authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      params: { response_type: "code", client_id: env.META_APP_ID, redirect_uri: cb("meta"),
                scope: "pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,business_management" },
      async exchange(code) {
        const G = "https://graph.facebook.com/v21.0";
        const j = await (await fetch(`${G}/oauth/access_token?` + form({
          client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET,
          redirect_uri: cb("meta"), code }))).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        const ll = await (await fetch(`${G}/oauth/access_token?` + form({
          grant_type: "fb_exchange_token", client_id: env.META_APP_ID,
          client_secret: env.META_APP_SECRET, fb_exchange_token: j.access_token }))).json();
        const pages = (await (await fetch(`${G}/me/accounts?access_token=${ll.access_token}`)).json()).data || [];
        if (!pages.length) throw new Error("No Facebook Pages on this account");
        const page = pages[0];
        const ig = await (await fetch(`${G}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`)).json();
        return { access: page.access_token, expires: null,   // page tokens don't expire
                 extra: { page_id: page.id, page_name: page.name,
                          ig_user_id: ig.instagram_business_account?.id || null } };
      },
    },

    tiktok: {
      authUrl: "https://www.tiktok.com/v2/auth/authorize/",
      params: { response_type: "code", client_key: env.TIKTOK_CLIENT_KEY,
                redirect_uri: cb("tiktok"), scope: "user.info.basic,video.publish,video.upload" },
      async exchange(code) {
        const j = await (await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET,
                       grant_type: "authorization_code", code, redirect_uri: cb("tiktok") }) })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return { access: j.access_token, refresh: j.refresh_token,
                 expires: Date.now() + (j.expires_in || 86400) * 1000, extra: {} };
      },
      async refresh(t) {
        const j = await (await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET,
                       grant_type: "refresh_token", refresh_token: t.refresh }) })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return { ...t, access: j.access_token, refresh: j.refresh_token || t.refresh,
                 expires: Date.now() + (j.expires_in || 86400) * 1000 };
      },
    },

    x: {
      authUrl: "https://x.com/i/oauth2/authorize",
      pkce: true,
      params: { response_type: "code", client_id: env.X_CLIENT_ID, redirect_uri: cb("x"),
                scope: "tweet.read tweet.write users.read media.write offline.access" },
      async exchange(code, verifier) {
        const j = await (await fetch("https://api.x.com/2/oauth2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded",
                     authorization: "Basic " + btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`) },
          body: form({ grant_type: "authorization_code", code, redirect_uri: cb("x"),
                       code_verifier: verifier, client_id: env.X_CLIENT_ID }) })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return { access: j.access_token, refresh: j.refresh_token,
                 expires: Date.now() + (j.expires_in || 7200) * 1000, extra: {} };
      },
      async refresh(t) {
        const j = await (await fetch("https://api.x.com/2/oauth2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded",
                     authorization: "Basic " + btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`) },
          body: form({ grant_type: "refresh_token", refresh_token: t.refresh,
                       client_id: env.X_CLIENT_ID }) })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return { ...t, access: j.access_token, refresh: j.refresh_token || t.refresh,
                 expires: Date.now() + (j.expires_in || 7200) * 1000 };
      },
    },
  };
}

/* ---------------- routes ---------------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const [, seg1, seg2, seg3] = url.pathname.split("/");
    const provs = providers(env);

    if (url.pathname === "/" || url.pathname === "/connect") {
      const rows = [];
      for (const p of PLATFORMS) {
        const t = await getTok(env, p);
        const ready = !!env[NEEDS[p]];
        const label = p === "meta" ? "facebook + instagram" : p;
        rows.push(`<div class="row"><b>${label}</b>
          <span class="st ${t ? "on" : ""}">${t ? "✓ connected" + (t.extra?.page_name ? " · " + t.extra.page_name : t.extra?.name ? " · " + t.extra.name : "")
                                              : ready ? "ready to connect" : "app keys missing"}</span>
          ${t ? `<a class="btn ghost" href="/auth/${p}/disconnect">disconnect</a>`
              : ready ? `<a class="btn" href="/auth/${p}/start">Connect</a>`
                      : `<a class="btn ghost" href="${env.PLANNER_URL}connect.html">setup guide</a>`}</div>`);
      }
      return html(`<h1>Fresu <span>Content Engine</span></h1>
        <p>Connect each account once — a window opens, you approve, done.<br>
        Rows saying <b>app keys missing</b> need their one-time developer app first —
        follow the <a class="back" href="${env.PLANNER_URL}connect.html">setup guide</a>, steps ① and ②.</p>
        ${rows.join("")}
        <p style="margin-top:1rem"><a class="back" href="${env.PLANNER_URL}">← back to the planner</a></p>`);
    }

    if (seg1 === "auth" && PLATFORMS.includes(seg2)) {
      const prov = provs[seg2];

      if (seg3 === "start") {
        if (!env[NEEDS[seg2]])
          return html(`<h1>Not set up yet</h1>
            <p>The <b>${seg2}</b> developer app keys are not in Cloudflare yet.
            Follow steps ① and ② in the
            <a class="back" href="${env.PLANNER_URL}connect.html">setup guide</a>, then come back.</p>
            <p><a class="back" href="/connect">← back</a></p>`);
        const state = rnd();
        const extra = { state };
        const params = { ...prov.params, state };
        if (prov.pkce) {
          extra.verifier = rnd() + rnd();
          params.code_challenge = await sha256b64url(extra.verifier);
          params.code_challenge_method = "S256";
        }
        await env.TOKENS.put("state:" + state, JSON.stringify(extra), { expirationTtl: 600 });
        return Response.redirect(prov.authUrl + "?" + form(params), 302);
      }

      if (seg3 === "callback") {
        const state = url.searchParams.get("state");
        const saved = state && await env.TOKENS.get("state:" + state);
        if (!saved) return html(`<h1>Hmm</h1><p>Login session expired — <a class="back" href="/auth/${seg2}/start">try again</a>.</p>`);
        const err = url.searchParams.get("error") || url.searchParams.get("error_description");
        if (err) return html(`<h1>Not connected</h1><p>${err}</p><p><a class="back" href="/connect">← back</a></p>`);
        try {
          const tok = await prov.exchange(url.searchParams.get("code"), JSON.parse(saved).verifier);
          await putTok(env, seg2, tok);
          return Response.redirect(env.BASE_URL + "/connect", 302);
        } catch (e) {
          return html(`<h1>Connection failed</h1><p style="word-break:break-all">${String(e.message).slice(0, 400)}</p>
            <p><a class="back" href="/connect">← back</a></p>`);
        }
      }

      if (seg3 === "disconnect") {
        await env.TOKENS.delete("tok:" + seg2);
        return Response.redirect(env.BASE_URL + "/connect", 302);
      }
    }

    if (url.pathname === "/api/tokens") {
      if (req.headers.get("authorization") !== "Bearer " + env.ENGINE_KEY)
        return new Response("unauthorized", { status: 401 });
      const out = {};
      for (const p of PLATFORMS) {
        let t = await getTok(env, p);
        if (!t) continue;
        try {
          if (t.expires && t.expires < Date.now() + 5 * 60 * 1000 && provs[p].refresh) {
            t = await provs[p].refresh(t);
            await putTok(env, p, t);
          }
          out[p] = { access: t.access, ...t.extra };
        } catch (e) {
          out[p] = { error: "refresh failed: " + String(e.message).slice(0, 200) };
        }
      }
      return Response.json(out);
    }

    return new Response("not found", { status: 404 });
  },
};
