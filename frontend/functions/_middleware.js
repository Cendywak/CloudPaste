// Pages is public. Authentication and permissions remain the backend's responsibility.
const isBackendPath = (path) => path === "/api" || path.startsWith("/api/") || path === "/dav" || path.startsWith("/dav/");

function errorResponse(status, message, headers = {}) {
  return new Response(JSON.stringify({ code: status, success: false, message, data: null }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/config.js") {
    // Serialize data instead of injecting an environment variable into executable JS.
    const config = JSON.stringify({ backendUrl: url.origin, backendProxy: true });
    return new Response(request.method === "HEAD" ? null : `window.appConfig = ${config};\n`, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (!isBackendPath(url.pathname)) {
    return next();
  }

  // Never fall back to a public Worker URL or the SPA when the binding is missing.
  if (!env.BACKEND || typeof env.BACKEND.fetch !== "function") {
    return errorResponse(503, "Backend service binding is unavailable");
  }

  // The legacy backend caches Windows WebDAV credentials by IP/User-Agent.
  // A proxy must not grant access based on that shared, non-secret identity.
  const isWebdav = url.pathname === "/dav" || url.pathname.startsWith("/dav/");
  if (isWebdav && request.method !== "OPTIONS" && !request.headers.get("Authorization")?.trim()) {
    return errorResponse(401, "WebDAV authentication is required", {
      "WWW-Authenticate": 'Basic realm="WebDAV", Bearer realm="WebDAV"',
    });
  }

  try {
    // Keep the public URL for generated download links and WebDAV Destination.
    // Preserve methods, credentials, query strings, bodies and streaming responses.
    // Do not follow a redirect with the caller's Authorization header.
    const response = await env.BACKEND.fetch(new Request(request, { redirect: "manual" }));
    const headers = new Headers(response.headers);
    // Authenticated data and password-protected shares must not enter a shared cache.
    headers.set("Cache-Control", "private, no-store");
    // Uploaded HTML/SVG now shares the application's origin. Keep document
    // previews in an opaque sandbox so they cannot read the admin's localStorage.
    headers.set("Content-Security-Policy", "sandbox allow-downloads; base-uri 'none'; form-action 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    // Do not expose exception details, credentials or internal service configuration.
    return errorResponse(502, "Backend service is unavailable");
  }
}
