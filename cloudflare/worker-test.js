// 最小化测试 Worker - 不涉及 D1 数据库
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查
    if (path === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        env: 'cloudflare-workers',
        version: 'test-1.0.0',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 登录测试 (硬编码)
    if (path === '/api/login' && request.method === 'POST') {
      return new Response(JSON.stringify({
        token: 'test-token-12345',
        user: { id: 1, email: 'admin@demo.com', name: '测试管理员', role: 'admin' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 首页
    if (path === '/' || path === '/dashboard') {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>测试页面</title></head>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>✅ Worker 部署成功！</h1>
          <p>这是最小化测试 Worker，证明部署管道工作正常。</p>
          <p>当前时间：${new Date().toISOString()}</p>
          <hr>
          <a href="/api/health">健康检查 API</a> |
          <a href="/api/login">登录 API</a>
        </body>
        </html>
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return new Response('404 Not Found', { status: 404 });
  }
};
