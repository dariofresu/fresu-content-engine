var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var PLATFORMS = ["linkedin", "youtube", "meta", "tiktok", "x"];
var html = /* @__PURE__ */ __name((body) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect \u2014 Fresu Content Engine</title>
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
  { headers: { "content-type": "text/html; charset=utf-8" } }
), "html");
var rnd = /* @__PURE__ */ __name(() => crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""), "rnd");
async function sha256b64url(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(sha256b64url, "sha256b64url");
var form = /* @__PURE__ */ __name((o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"), "form");
async function getTok(env, p) {
  const v = await env.TOKENS.get("tok:" + p);
  return v ? JSON.parse(v) : null;
}
__name(getTok, "getTok");
async function putTok(env, p, t) {
  await env.TOKENS.put("tok:" + p, JSON.stringify(t));
}
__name(putTok, "putTok");
function providers(env) {
  const cb = /* @__PURE__ */ __name((p) => `${env.BASE_URL}/auth/${p}/callback`, "cb");
  return {
    linkedin: {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      params: {
        response_type: "code",
        client_id: env.LINKEDIN_CLIENT_ID,
        redirect_uri: cb("linkedin"),
        scope: "openid profile w_member_social"
      },
      async exchange(code) {
        const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({
            grant_type: "authorization_code",
            code,
            redirect_uri: cb("linkedin"),
            client_id: env.LINKEDIN_CLIENT_ID,
            client_secret: env.LINKEDIN_CLIENT_SECRET
          })
        });
        const j = await r.json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        const me = await (await fetch(
          "https://api.linkedin.com/v2/userinfo",
          { headers: { authorization: "Bearer " + j.access_token } }
        )).json();
        return {
          access: j.access_token,
          expires: Date.now() + (j.expires_in || 5184e3) * 1e3,
          extra: { author_urn: "urn:li:person:" + me.sub, name: me.name }
        };
      }
    },
    youtube: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      params: {
        response_type: "code",
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: cb("youtube"),
        scope: "https://www.googleapis.com/auth/youtube.upload",
        access_type: "offline",
        prompt: "consent"
      },
      async exchange(code) {
        const j = await (await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({
            grant_type: "authorization_code",
            code,
            redirect_uri: cb("youtube"),
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET
          })
        })).json();
        if (!j.refresh_token) throw new Error(JSON.stringify(j));
        return {
          access: j.access_token,
          refresh: j.refresh_token,
          expires: Date.now() + (j.expires_in || 3600) * 1e3,
          extra: {}
        };
      },
      async refresh(t) {
        const j = await (await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({
            grant_type: "refresh_token",
            refresh_token: t.refresh,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET
          })
        })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return { ...t, access: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1e3 };
      }
    },
    meta: {
      authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      params: {
        response_type: "code",
        client_id: env.META_APP_ID,
        redirect_uri: cb("meta"),
        scope: "pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,business_management"
      },
      async exchange(code) {
        const G = "https://graph.facebook.com/v21.0";
        const j = await (await fetch(`${G}/oauth/access_token?` + form({
          client_id: env.META_APP_ID,
          client_secret: env.META_APP_SECRET,
          redirect_uri: cb("meta"),
          code
        }))).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        const ll = await (await fetch(`${G}/oauth/access_token?` + form({
          grant_type: "fb_exchange_token",
          client_id: env.META_APP_ID,
          client_secret: env.META_APP_SECRET,
          fb_exchange_token: j.access_token
        }))).json();
        const pages = (await (await fetch(`${G}/me/accounts?access_token=${ll.access_token}`)).json()).data || [];
        if (!pages.length) throw new Error("No Facebook Pages on this account");
        const page = pages[0];
        const ig = await (await fetch(`${G}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`)).json();
        return {
          access: page.access_token,
          expires: null,
          // page tokens don't expire
          extra: {
            page_id: page.id,
            page_name: page.name,
            ig_user_id: ig.instagram_business_account?.id || null
          }
        };
      }
    },
    tiktok: {
      authUrl: "https://www.tiktok.com/v2/auth/authorize/",
      params: {
        response_type: "code",
        client_key: env.TIKTOK_CLIENT_KEY,
        redirect_uri: cb("tiktok"),
        scope: "user.info.basic,video.publish,video.upload"
      },
      async exchange(code) {
        const j = await (await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            grant_type: "authorization_code",
            code,
            redirect_uri: cb("tiktok")
          })
        })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return {
          access: j.access_token,
          refresh: j.refresh_token,
          expires: Date.now() + (j.expires_in || 86400) * 1e3,
          extra: {}
        };
      },
      async refresh(t) {
        const j = await (await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: t.refresh
          })
        })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return {
          ...t,
          access: j.access_token,
          refresh: j.refresh_token || t.refresh,
          expires: Date.now() + (j.expires_in || 86400) * 1e3
        };
      }
    },
    x: {
      authUrl: "https://x.com/i/oauth2/authorize",
      pkce: true,
      params: {
        response_type: "code",
        client_id: env.X_CLIENT_ID,
        redirect_uri: cb("x"),
        scope: "tweet.read tweet.write users.read media.write offline.access"
      },
      async exchange(code, verifier) {
        const j = await (await fetch("https://api.x.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: "Basic " + btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)
          },
          body: form({
            grant_type: "authorization_code",
            code,
            redirect_uri: cb("x"),
            code_verifier: verifier,
            client_id: env.X_CLIENT_ID
          })
        })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return {
          access: j.access_token,
          refresh: j.refresh_token,
          expires: Date.now() + (j.expires_in || 7200) * 1e3,
          extra: {}
        };
      },
      async refresh(t) {
        const j = await (await fetch("https://api.x.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: "Basic " + btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`)
          },
          body: form({
            grant_type: "refresh_token",
            refresh_token: t.refresh,
            client_id: env.X_CLIENT_ID
          })
        })).json();
        if (!j.access_token) throw new Error(JSON.stringify(j));
        return {
          ...t,
          access: j.access_token,
          refresh: j.refresh_token || t.refresh,
          expires: Date.now() + (j.expires_in || 7200) * 1e3
        };
      }
    }
  };
}
__name(providers, "providers");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const [, seg1, seg2, seg3] = url.pathname.split("/");
    const provs = providers(env);
    if (url.pathname === "/" || url.pathname === "/connect") {
      const rows = [];
      for (const p of PLATFORMS) {
        const t = await getTok(env, p);
        const label = p === "meta" ? "facebook + instagram" : p;
        rows.push(`<div class="row"><b>${label}</b>
          <span class="st ${t ? "on" : ""}">${t ? "\u2713 connected" + (t.extra?.page_name ? " \xB7 " + t.extra.page_name : t.extra?.name ? " \xB7 " + t.extra.name : "") : "not connected"}</span>
          ${t ? `<a class="btn ghost" href="/auth/${p}/disconnect">disconnect</a>` : `<a class="btn" href="/auth/${p}/start">Connect</a>`}</div>`);
      }
      return html(`<h1>Fresu <span>Content Engine</span></h1>
        <p>Connect each account once \u2014 a window opens, you approve, done.</p>
        ${rows.join("")}
        <p style="margin-top:1rem"><a class="back" href="${env.PLANNER_URL}">\u2190 back to the planner</a></p>`);
    }
    if (seg1 === "auth" && PLATFORMS.includes(seg2)) {
      const prov = provs[seg2];
      if (seg3 === "start") {
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
        if (!saved) return html(`<h1>Hmm</h1><p>Login session expired \u2014 <a class="back" href="/auth/${seg2}/start">try again</a>.</p>`);
        const err = url.searchParams.get("error") || url.searchParams.get("error_description");
        if (err) return html(`<h1>Not connected</h1><p>${err}</p><p><a class="back" href="/connect">\u2190 back</a></p>`);
        try {
          const tok = await prov.exchange(url.searchParams.get("code"), JSON.parse(saved).verifier);
          await putTok(env, seg2, tok);
          return Response.redirect(env.BASE_URL + "/connect", 302);
        } catch (e) {
          return html(`<h1>Connection failed</h1><p style="word-break:break-all">${String(e.message).slice(0, 400)}</p>
            <p><a class="back" href="/connect">\u2190 back</a></p>`);
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
          if (t.expires && t.expires < Date.now() + 5 * 60 * 1e3 && provs[p].refresh) {
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
  }
};

// ../../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-XIyGNe/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-XIyGNe/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
