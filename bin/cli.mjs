#!/usr/bin/env node
/**
 * dsh-api-smoke —— 上线前接口冒烟
 * 用法：
 *   dsh-api-smoke --config endpoints.json [--json] [--html r.html] [--timeout 15000]
 *   dsh-api-smoke --demo        # 内置样例（临时起本地服务器自证）
 * 退出码：有失败 → 1
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runSmoke, textReport, htmlReport, startDemoServer } from '../lib/index.js';

const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);
const val = (k, d = '') => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

if (has('help') || (!has('config') && !has('demo'))) {
  console.log(`dsh-api-smoke —— 上线前接口冒烟

用法：
  dsh-api-smoke --config endpoints.json [--json] [--html r.html] [--timeout 15000]
  dsh-api-smoke --demo

配置示例（JSON）：
{ "endpoints": [
  { "name": "健康检查", "url": "https://api.example.com/health", "expect_status": 200, "max_ms": 800 },
  { "name": "首页", "url": "https://example.com/", "expect_contains": "<title>" }
] }
只请求配置里写的地址；https 站点顺带提示 HSTS 头。`);
  process.exit(0);
}

let serverRef = null;
let config;
if (has('demo')) {
  serverRef = await startDemoServer();
  config = { endpoints: [
    { name: '示例-健康检查', url: `http://127.0.0.1:${serverRef.port}/ok`, expect_status: 200, expect_contains: 'deepwhale', max_ms: 2000 },
    { name: '示例-慢接口', url: `http://127.0.0.1:${serverRef.port}/slow`, expect_status: 200, max_ms: 100 },
    { name: '示例-404 探测', url: `http://127.0.0.1:${serverRef.port}/missing`, expect_status: 404 },
  ] };
} else {
  config = JSON.parse(readFileSync(val('config'), 'utf-8'));
}

try {
  const { results, stats } = await runSmoke(config, { timeoutMs: Number(val('timeout', 15000)) });
  if (has('json')) console.log(JSON.stringify({ stats, results }, null, 2));
  else { if (has('demo')) console.log('\n  【演示模式】临时本地服务器，不是你的真实接口。\n'); console.log(textReport({ results, stats })); }
  if (has('html')) { writeFileSync(val('html'), htmlReport({ results, stats }), 'utf-8'); console.log(`HTML 报告已写入：${val('html')}`); }
  process.exit(stats.fail > 0 ? 1 : 0);
} finally {
  if (serverRef) serverRef.server.close();
}
