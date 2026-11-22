# Pages 前端通过 Service Binding 调用后端

公开浏览器入口保持为 Cloudflare Pages：

```text
浏览器 → https://你的-Pages-域名/api/... → Pages Functions → BACKEND → 后端 Worker
WebDAV → https://你的-Pages-域名/dav/... → Pages Functions → BACKEND → 后端 Worker
```

后端代码和管理员登录、API Key 权限、分享密码保持原有行为；前端不添加 Access。后端公网域名的 Cloudflare Access 由部署者自行配置。Service Binding 是内部调用，不需要在浏览器里添加 Access 服务令牌，也不需要给 Pages 保存管理员账号或 API Key。

**Pages API 仍是公开入口。** 其他人可以直接请求 Pages 的 `/api/*` 和 `/dav/*`，请求仍会到达后端并接受 CloudPaste 自身鉴权。不能靠 Service Binding、CORS、Origin 或 Referer 证明请求“来自自己的前端”。原来就允许公开读取的分享仍然公开。

## 配置与部署

`frontend/wrangler.toml` 已配置：

| 项目 | 当前值 |
| --- | --- |
| Pages 项目 | `cloudpaste-frontend` |
| 静态构建目录 | `./dist` |
| Service Binding 名称 | `BACKEND` |
| 目标 Worker 服务名 | `cloudpaste-backend` |
| 生产分支（现有 Actions） | `production` |
| 预览部署绑定 | 无，避免访问生产数据 |

目标服务名必须等于你账户中实际部署的 Worker 名称，不能填 Worker 的 URL。若名称不同，修改 `services` 中的 `service`。Pages 与 Worker 应位于同一个 Cloudflare 账户。

合并到 `main` 后，现有 `deploy-frontend-cloudflare.yml` 会构建并部署生产 Pages。它使用 Node 22，执行代理测试、生产构建和 Functions 编译，再以固定版本 Wrangler 部署。Functions 从 `frontend/functions` 自动编译，不再复制到公开的 `dist/functions`。原有 GitHub Secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 继续使用。

Wrangler 配置文件将作为 Pages 配置来源。已有其他绑定或自定义配置时，应先合并进此文件再部署。`VITE_BACKEND_URL` 不再用于 Pages：`/config.js` 返回当前 Pages origin，Actions 构建设置 `VITE_BACKEND_PROXY=true`，防止配置文件加载失败后回退到浏览器保存的旧 Worker URL。直接在 Pages 控制台构建时也请设置这个构建变量。Docker/Vercel 保留原有配置方式。

预览部署默认没有生产 Service Binding，API 返回 503。需要预览 API 时，在 `[env.preview]` 中配置独立测试 Worker：

```toml
[env.preview]
services = [{ binding = "BACKEND", service = "cloudpaste-backend-test" }]
```

## 访问方式和兼容性

- 前端页面、分享页面和静态资源仍由 Pages 提供。
- API、原始文本、文件下载/预览统一走 Pages 的 `/api/...`。保留查询参数、请求体、认证头和后端状态码，响应流不进行整体缓冲。
- WebDAV 地址改用 `https://你的-Pages-域名/dav`。保留 `PROPFIND`、`COPY`、`MOVE`、`LOCK` 等方法及 `Destination`、`Depth`、`If`、`Lock-Token` 等头。客户端每次操作必须携带原有 Basic/Bearer 凭据；代理不使用后端按 IP/User-Agent 缓存的身份放行无认证请求。`OPTIONS` 继续由后端处理。
- 后端收到的 Request URL 仍是 Pages URL，因此动态生成的代理下载/预览地址使用 Pages 域名。原有已复制的 Worker 链接不会自动迁移；请重新从前端复制，或将其中的旧域名替换为 Pages 域名。
- 原有 S3 预签名直传和直链仍直接访问存储端。这不属于浏览器直连 Worker。
- 上传 HTML/SVG 等主动内容现在和应用共享域名。代理响应增加 CSP 沙盒与 `nosniff`，不允许这些预览页面运行脚本或访问应用登录信息；普通文档、图片、音视频仍保留其 Content-Type。需要执行脚本的 HTML 预览会受到限制。
- 代理不跟随后端重定向，不自动把认证头发送到另一个目标；后端返回的 `Location` 原样交给客户端。API/文件响应设置为 `private, no-store`，避免共享缓存混用登录状态或密码分享。
- 未绑定 `BACKEND` 返回 503，调用失败返回通用 502，不回退到公网 Worker URL，也不会让 API 错误返回 SPA 页面。

代理会保留 Range 和条件请求头，但具体端点是否支持断点续传取决于现有后端。文件大小等平台限制也仍适用。

## 后端 Access 由部署者处理

本变更不修改后端 Wrangler、不设置或关闭任何 Cloudflare 公网入口，也不配置 Access。你可以自行为后端公网域名添加 Access；Pages 仍通过 Service Binding 内部调用 Worker。

Access 保护范围应覆盖你打算保护的实际入口；自定义域名、`workers.dev` 和预览 URL 是否仍能直连，需要分别检查。若以后选择完全关闭公网入口，可谨慎评估 `workers_dev = false`、`preview_urls = false` 以及自定义路由/域名配置，但先确认 Pages、WebDAV 和第三方客户端已迁移，不要直接关闭仍在使用的入口。

## 验证

本地执行：

```sh
cd frontend
npm ci
npm run test:pages
# 设置 VITE_BACKEND_PROXY=true 后执行生产构建
npm run build
npm run check:pages
```

PR 检查自动执行同样的测试和构建，不部署、不读取生产凭据。代理测试覆盖认证透传、无绑定失败、WebDAV、文件流/Range、重定向与同源配置。

部署后还需在实际账户检查：浏览器网络面板中的应用 API 请求使用 Pages 域名；管理员登录与未登录拒绝正常；原始文本和密码分享正常；WebDAV 带凭据可用、无凭据拒绝；前端生成的代理下载链接使用 Pages 域名。随后再按自己的计划为后端公网入口配置 Access，并确认前端内部调用仍然可用。
