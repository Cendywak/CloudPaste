import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import { onRequest } from "../functions/_middleware.js";

const origin = "https://paste.example";
const request = (path, init) => new Request(`${origin}${path}`, init);
const noNext = () => { throw new Error("Unexpected static asset fallback"); };

test("runtime config uses Pages origin and ignores legacy URL or executable env values", async () => {
  const response = await onRequest({
    request: request("/config.js?t=123"),
    env: { VITE_BACKEND_URL: 'https://old-worker.example/"; throw new Error("injected") //' },
    next: noNext,
  });
  const window = {};
  vm.runInNewContext(await response.text(), { window });
  assert.equal(window.appConfig.backendUrl, origin);
  assert.equal(window.appConfig.backendProxy, true);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.match(response.headers.get("Content-Type"), /javascript/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("HEAD config response has no body", async () => {
  const response = await onRequest({ request: request("/config.js", { method: "HEAD" }), env: {}, next: noNext });
  assert.equal(await response.text(), "");
});

test("SPA, shares, assets and similarly named paths stay on Pages", async () => {
  for (const path of ["/", "/admin", "/paste/demo", "/file/demo", "/assets/app.js", "/apiary", "/davinci"]) {
    const response = await onRequest({ request: request(path), env: {}, next: () => new Response("static") });
    assert.equal(await response.text(), "static", path);
  }
});

test("API and DAV fail closed without a binding; no external fetch fallback", async () => {
  for (const path of ["/api", "/api/health", "/dav", "/dav/folder"]) {
    const response = await onRequest({
      request: request(path), env: { VITE_BACKEND_URL: "https://public-worker.example" }, next: noNext,
    });
    assert.equal(response.status, 503, path);
    assert.equal((await response.json()).success, false);
  }
});

test("request preserves public URL, password query, credentials and upload body", async () => {
  const upload = new Uint8Array([0, 255, 42, 13, 10]);
  const incoming = request("/api/upload?password=a%2Bb&part=2", {
    method: "PUT",
    body: upload,
    headers: { Authorization: "Bearer user-token", "X-API-KEY": "user-key", "Content-Type": "application/octet-stream" },
  });
  let calls = 0;
  const response = await onRequest({
    request: incoming, next: noNext,
    env: { BACKEND: { fetch: async (forwarded) => {
      calls++;
      assert.equal(forwarded.url, incoming.url);
      assert.equal(forwarded.method, "PUT");
      assert.equal(forwarded.redirect, "manual");
      assert.equal(forwarded.headers.get("Authorization"), "Bearer user-token");
      assert.equal(forwarded.headers.get("X-API-KEY"), "user-key");
      assert.deepEqual(new Uint8Array(await forwarded.arrayBuffer()), upload);
      return new Response("uploaded", { status: 201 });
    } } },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 201);
});

test("unauthenticated API requests reach backend without injected admin credentials", async () => {
  const response = await onRequest({
    request: request("/api/admin/files"), next: noNext,
    env: { BACKEND: { fetch: async (forwarded) => {
      assert.equal(forwarded.headers.get("Authorization"), null);
      assert.equal(forwarded.headers.get("X-API-KEY"), null);
      return new Response('{"message":"unauthorized"}', { status: 401, headers: { "Content-Type": "application/json" } });
    } } },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).message, "unauthorized");
});

test("WebDAV never uses cached IP identity when Authorization is absent", async () => {
  for (const method of ["GET", "HEAD", "PROPFIND", "PROPPATCH", "PUT", "COPY", "MOVE", "DELETE", "LOCK", "UNLOCK", "MKCOL"]) {
    const response = await onRequest({
      request: request("/dav/file", { method, headers: { "User-Agent": "Microsoft-WebDAV-MiniRedir/10.0" } }),
      next: noNext,
      env: { BACKEND: { fetch: () => { throw new Error("Must not use backend cache"); } } },
    });
    assert.equal(response.status, 401, method);
    assert.match(response.headers.get("WWW-Authenticate"), /Basic.*Bearer/);
  }
});

test("WebDAV preserves methods, Destination, lock headers, auth and XML", async () => {
  for (const method of ["PROPFIND", "PROPPATCH", "COPY", "MOVE", "LOCK", "UNLOCK", "MKCOL", "DELETE"]) {
    const incoming = request("/dav/folder/a%20b.txt", {
      method, body: "<xml/>",
      headers: {
        Authorization: "Basic dXNlcjpwYXNz", Destination: `${origin}/dav/folder/c.txt`, Depth: "infinity",
        "Lock-Token": "<opaquelocktoken:test>", If: "(<opaquelocktoken:test>)", Overwrite: "F",
      },
    });
    const response = await onRequest({
      request: incoming, next: noNext,
      env: { BACKEND: { fetch: async (forwarded) => {
        assert.equal(forwarded.method, method);
        assert.equal(forwarded.url, incoming.url);
        for (const name of ["Authorization", "Destination", "Depth", "Lock-Token", "If", "Overwrite"]) {
          assert.equal(forwarded.headers.get(name), incoming.headers.get(name));
        }
        assert.equal(await forwarded.text(), "<xml/>");
        return new Response("<multistatus/>", { status: 207, headers: { DAV: "1,2", "Content-Type": "application/xml" } });
      } } },
    });
    assert.equal(response.status, 207);
    assert.equal(response.headers.get("DAV"), "1,2");
    assert.equal(await response.text(), "<multistatus/>");
  }
});

test("OPTIONS and HEAD keep backend semantics", async () => {
  for (const method of ["OPTIONS", "HEAD"]) {
    const response = await onRequest({
      request: request("/dav", { method, headers: method === "HEAD" ? { Authorization: "Bearer token" } : {} }),
      next: noNext,
      env: { BACKEND: { fetch: async (forwarded) => {
        assert.equal(forwarded.method, method);
        return new Response(null, { status: 204, headers: { Allow: "PROPFIND,PUT,GET" } });
      } } },
    });
    assert.equal(response.status, 204);
    assert.equal(response.body, null);
    assert.equal(response.headers.get("Allow"), "PROPFIND,PUT,GET");
  }
});

test("download and raw routes retain Range and conditional headers with streaming responses", async () => {
  for (const path of ["/api/file-view/demo", "/api/file-download/demo", "/api/raw/demo", "/api/admin/fs/download?path=%2Fx"]) {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([65, 66])); controller.close(); } });
    const response = await onRequest({
      request: request(path, { headers: { Range: "bytes=0-1", "If-Range": '"abc"', "If-None-Match": '"old"' } }),
      next: noNext,
      env: { BACKEND: { fetch: async (forwarded) => {
        assert.equal(forwarded.headers.get("Range"), "bytes=0-1");
        assert.equal(forwarded.headers.get("If-Range"), '"abc"');
        assert.equal(forwarded.headers.get("If-None-Match"), '"old"');
        return new Response(body, {
          status: 206,
          headers: { "Content-Range": "bytes 0-1/20", ETag: '"abc"', "Content-Disposition": 'attachment; filename="x.txt"' },
        });
      } } },
    });
    assert.equal(response.body, body, "must not buffer the upstream stream");
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), "bytes 0-1/20");
    assert.equal(response.headers.get("ETag"), '"abc"');
    assert.match(response.headers.get("Content-Disposition"), /attachment/);
    assert.equal(await response.text(), "AB");
  }
});

test("backend redirects are returned without following or forwarding credentials elsewhere", async () => {
  let calls = 0;
  const response = await onRequest({
    request: request("/api/file-download/demo", { headers: { Authorization: "Bearer secret" } }), next: noNext,
    env: { BACKEND: { fetch: async (forwarded) => {
      calls++;
      assert.equal(forwarded.redirect, "manual");
      return new Response(null, { status: 302, headers: { Location: "https://storage.example/signed" } });
    } } },
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://storage.example/signed");
});

test("untrusted HTML and SVG previews cannot run with the app's origin", async () => {
  for (const type of ["text/html", "image/svg+xml", "application/pdf"]) {
    const response = await onRequest({
      request: request("/api/file-view/demo"), next: noNext,
      env: { BACKEND: { fetch: async () => new Response("<script>bad()</script>", {
        headers: { "Content-Type": type, "Cache-Control": "public,max-age=3600", "Content-Security-Policy": "sandbox allow-same-origin allow-scripts" },
      }) } },
    });
    assert.equal(response.headers.get("Content-Type"), type);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const policy = response.headers.get("Content-Security-Policy");
    assert.match(policy, /^sandbox allow-downloads;/);
    assert.doesNotMatch(policy, /allow-same-origin|allow-scripts/);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  }
});

test("binding failures return a generic error without internal details", async () => {
  const response = await onRequest({
    request: request("/api/health"), next: noNext,
    env: { BACKEND: { fetch: async () => { throw new Error("SECRET credentials backend-internal.example"); } } },
  });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /SECRET|backend-internal/);
});

test("Pages frontend chooses same origin ahead of stale localStorage, env, and missing config.js", async () => {
  const source = await readFile(new URL("../src/api/config.js", import.meta.url), "utf8");
  for (const runtime of [undefined, { backendUrl: "https://legacy.example" }]) {
    const code = source.replaceAll("import.meta.env", JSON.stringify({ VITE_BACKEND_PROXY: "true", VITE_BACKEND_URL: "https://old.example" })).replaceAll("export ", "");
    const result = vm.runInNewContext(`${code}\nAPI_BASE_URL`, {
      window: { location: { origin }, appConfig: runtime },
      localStorage: { getItem: () => { throw new Error("must not read stale localStorage"); } },
    });
    assert.equal(result, origin);
  }
});

test("runtime proxy mode also works with dashboard builds; Docker keeps its runtime config", async () => {
  const source = await readFile(new URL("../src/api/config.js", import.meta.url), "utf8");
  for (const [env, appConfig, expected] of [
    [{}, { backendProxy: true, backendUrl: origin }, origin],
    [{ VITE_IS_DOCKER: "true" }, { backendUrl: "https://docker-api.example" }, "https://docker-api.example"],
  ]) {
    const code = source.replaceAll("import.meta.env", JSON.stringify(env)).replaceAll("export ", "");
    const result = vm.runInNewContext(`${code}\nAPI_BASE_URL`, {
      window: { location: { origin }, appConfig }, console: { log() {} },
    });
    assert.equal(result, expected);
  }
});

test("Pages routing covers API, DAV and config only", async () => {
  const routes = JSON.parse(await readFile(new URL("../public/_routes.json", import.meta.url), "utf8"));
  assert.deepEqual(routes, {
    version: 1, include: ["/config.js", "/api", "/api/*", "/dav", "/dav/*"], exclude: [],
  });
});
