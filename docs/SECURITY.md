# SECURITY.md

## 防护

- **路径穿越**：`server.mjs` `safeStaticPath` 做 URI 解码 + null 字节剥离 + 路径分隔符边界检查。
- **代理转发面**：`/corec-api/*` 反代到启动参数固定的 CoreC 目标（`process.argv[4] || 'http://127.0.0.1:9090'`），不接受客户端指定 host；`/corec-proxy/*`（`X-CoreC-Target` 头）与 `/corec-ws`（`target` 查询参数）转发到客户端指定的 http/https 目标。`parseTarget` 校验协议（http/https）与 hostname。
- **无 XSS sink**：无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`。
- **密钥存储**：API 密钥与实例元数据存 localStorage（`corec_instances` + `corec_instance_secrets`），保存前 UI 明示明文存储；导出默认脱敏、含密钥需显式 opt-in。服务端 `GET /configs/raw` 返回明文配置，暴露面由 Bearer secret 约束。
- **Provider 密钥**：存 localStorage `corec_ai_providers`，明文、不经服务端；设置页文案写明可被本机脚本读取。不入 CoreC 配置文件、不进 `GET /configs`、不写日志。
- **出站请求**：对话层对用户填写的 `baseUrl` + `/chat/completions` 发 `fetch`，`Authorization: Bearer <key>` 仅在有 key 时发送。CSP 为 `connect-src * ws: wss:`。
- **工具面**：写类工具（`write_tag`/`pause_driver`/`resume_driver`/`ack_alert`）在"允许写操作"关闭时不注册；解析层在 `toolClass === 'write'` 时强制走人工确认。
- **写开关**：`allowWrite` 初始 `false`，不持久化，刷新回落 `false`。
- **拒绝回真**：人工拒绝以 `{"refused":true,"reason":"the operator declined this write"}` 回给模型并带 `toolError`；引擎侧拒绝（`is read-only (protect: read-only)`、`429` + `Retry-After`）原样透出。
- **助手权限面**：助手只经既有 REST，权限边界为调用方持有的 CoreC API secret。
- **依赖完整性**：`package-lock.json` 锁定官方 registry 完整性哈希；`npm audit` 需 `--registry=https://registry.npmjs.org`。
- **安全响应头**：`server.mjs` `serveStatic` 加 `X-Content-Type-Options: nosniff` / `Referrer-Policy: strict-origin-when-cross-origin` / `X-Frame-Options: DENY` / `Permissions-Policy`。HSTS 未加。
- **dompurify**：`package.json` `overrides.dompurify ^3.4.16` 把经 `monaco-editor` 传递的 dompurify 解析到已修复版本；Monaco 资源自托管。
- **ErrorBoundary**：仅 DEV 输出完整 error 对象与 componentStack，生产日志脱敏（`src/components/ErrorBoundary.tsx`）。
- **公网无鉴权**：仪表盘无登录，能访问 URL 者可操作仪表盘。

## 报告

安全问题请开私有 advisory（GitHub Security Advisories）或直接联系维护者，勿在公开 issue 描述可利用细节。
