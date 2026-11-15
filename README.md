# @deepwhale-cn/dsh-api-smoke

> **技能型插件 · 无面板**：安装后由 DSH 智能体按 skill 说明调用 CLI；无独立面板界面。

安装到 DSH：

```bash
dsh plugin --profile web add @deepwhale-cn/dsh-api-smoke
```

上线前接口冒烟：按配置清单把关键接口请求一遍——状态码、关键字段、耗时、安全响应头，出 文本/JSON/HTML 报告。只请求配置里的地址。

```bash
npx @deepwhale-cn/dsh-api-smoke --config endpoints.json
npx @deepwhale-cn/dsh-api-smoke --demo
```

退出码：有失败 → 1（CI 门禁可用）。零依赖（Node 18+ 内置 fetch）。
