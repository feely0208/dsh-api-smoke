# 上线前接口冒烟（dsh-api-smoke）

**什么时候用**：发版前把关键接口过一遍——健康检查、首页、关键 API。
用户会说：「上线前帮我把这些接口打一遍」「这个接口怎么变慢了」。

## 怎么用

```bash
<cli 路径> --config endpoints.json [--json] [--html r.html] [--timeout 15000]
<cli 路径> --demo          # 内置临时服务器自证（不碰你的真实接口）
```

配置：`{ "endpoints": [{ "name", "url", "method?", "headers?", "body?", "expect_status?", "expect_contains?", "max_ms?" }] }`

## 检查项

状态码 / 关键内容 / 耗时上限 / 安全基线（https 明文提示、HSTS 头提示）。
退出码：有失败 → 1，可直接挂 CI。

## 边界

**只请求配置里写的地址**；不做扫描、不猜测路径。https 站点的 HSTS 是提示项不判失败。
