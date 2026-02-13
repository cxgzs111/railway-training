// Vercel Serverless Function - 代理 Moonshot API
export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/moonshot', '');
  
  const targetUrl = `https://api.moonshot.cn/v1${path}`;
  
  const headers = new Headers(request.headers);
  // 使用环境变量中的 API Key（在 Vercel 控制台设置）
  headers.set('Authorization', `Bearer ${process.env.MOONSHOT_API_KEY}`);
  
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' ? await request.text() : undefined,
  });
  
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
