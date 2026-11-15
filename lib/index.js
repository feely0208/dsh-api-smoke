/**
 * dsh-api-smoke —— 上线前接口冒烟 · 内核
 * 配置 JSON：{ endpoints: [{ name, url, method?, headers?, body?, expect_status?, expect_contains?, max_ms? }] }
 * 只请求配置里写的地址；不扫描、不猜测。
 */
const SECURITY_HEADERS = ['strict-transport-security', 'content-security-policy', 'x-content-type-options'];

export async function smokeEndpoint(ep, { timeoutMs = 15000 } = {}) {
  const r = { name: ep.name || ep.url, url: ep.url, ok: false, checks: [] };
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ep.url, {
      method: ep.method || 'GET',
      headers: ep.headers || {},
      body: ep.body !== undefined ? (typeof ep.body === 'string' ? ep.body : JSON.stringify(ep.body)) : undefined,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    r.status = res.status;
    r.latency_ms = Date.now() - t0;
    const text = await res.text().catch(() => '');
    // 状态码
    const expect = ep.expect_status || (ep.expect_status = 200);
    r.checks.push({ name: `状态码 ${expect}`, ok: res.status === expect, actual: String(res.status) });
    // 关键内容
    if (ep.expect_contains) {
      r.checks.push({ name: `包含「${ep.expect_contains}」`, ok: text.includes(ep.expect_contains), actual: `前 80 字符：${text.slice(0, 80).replace(/\s+/g, ' ')}` });
    }
    // 耗时
    if (ep.max_ms) {
      r.checks.push({ name: `耗时 ≤${ep.max_ms}ms`, ok: r.latency_ms <= ep.max_ms, actual: `${r.latency_ms}ms` });
    }
    // 安全基线（仅提示）
    const url = new URL(ep.url);
    if (url.protocol === 'https:') {
      const hsts = res.headers.get('strict-transport-security');
      r.checks.push({ name: 'HSTS 头', ok: !!hsts, actual: hsts || '未设置（提示项，不判失败）', warn: !hsts });
    } else if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      r.checks.push({ name: '传输加密', ok: false, actual: '明文 http（localhost 除外判失败）', warn: false });
    }
    r.ok = r.checks.filter((c) => !c.warn).every((c) => c.ok);
  } catch (e) {
    r.latency_ms = Date.now() - t0;
    r.checks.push({ name: '可连通', ok: false, actual: e.name === 'AbortError' ? `超时（>${timeoutMs}ms）` : String(e.message || e) });
    r.ok = false;
  } finally {
    clearTimeout(timer);
  }
  return r;
}

export async function runSmoke(config, opts = {}) {
  const endpoints = Array.isArray(config) ? config : (config.endpoints || []);
  if (!endpoints.length) throw new Error('配置里没有任何 endpoints');
  const results = [];
  for (const ep of endpoints) results.push(await smokeEndpoint(ep, opts));
  return { results, stats: { total: results.length, ok: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length } };
}

export function textReport({ results, stats }) {
  const L = ['', '  深鲸 · 上线前接口冒烟', '  ' + '─'.repeat(60)];
  for (const r of results) {
    console.log('');
    L.push(`${r.ok ? '✅' : '❌'} ${r.name}  ${r.url}`);
    if (r.status) L.push(`    HTTP ${r.status} · ${r.latency_ms}ms`);
    for (const c of r.checks) L.push(`    ${c.ok ? '✓' : c.warn ? '⚠' : '✗'} ${c.name} —— ${c.actual}`);
  }
  L.push('', `  ${stats.total} 个接口 · ${stats.ok} 通过 ${stats.fail} 失败`, '');
  return L.join('\n');
}

export function htmlReport({ results, stats }) {
  const rows = results.map((r) => `<tr><td>${r.ok ? '✅' : '❌'} ${esc(r.name)}</td><td><code>${esc(r.url)}</code></td><td>${r.status ?? '-'} / ${r.latency_ms ?? '-'}ms</td><td>${r.checks.map((c) => `${c.ok ? '✓' : c.warn ? '⚠' : '✗'} ${esc(c.name)}：${esc(c.actual)}`).join('<br>')}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>接口冒烟报告</title>
<style>body{font:14px/1.6 -apple-system,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f5f5f5}code{font-size:12px}</style>
<h1>接口冒烟报告</h1><p>${stats.total} 个接口 · ${stats.ok} 通过 ${stats.fail} 失败 · 生成于 ${new Date().toLocaleString()}</p>
<table><tr><th>接口</th><th>地址</th><th>状态/耗时</th><th>检查项</th></tr>${rows}</table>`;
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export const DEMO_CONFIG = { endpoints: [
  { name: '示例-健康检查', url: 'http://127.0.0.1:0/replace-in-demo', expect_status: 200 },
] };

/** demo 用：起一个临时本地服务器再冒烟，跑完即关 */
export async function startDemoServer() {
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hello deepwhale'); }
    else if (req.url === '/slow') { setTimeout(() => { res.writeHead(200); res.end('slow'); }, 400); }
    else { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { server, port };
}

// ── DSH 插件接入（方案 A 薄壳：注册 skill 与 CLI 入口；业务逻辑仍在 lib/bin，不在此处）──
import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';

export const { name, inject, apply } = createPlugin({
  name: 'api-smoke',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/api-smoke.md',
  binFile: 'bin/cli.mjs',
  description: "按配置清单把要上线的接口请求一遍：状态码、关键字段、耗时、安全响应头，出报告",
  whenToUse: "发版前把关键接口请求一遍做冒烟检查。用户会说：上线前把这些接口打一遍。",
});
