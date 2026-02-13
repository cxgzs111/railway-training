// Vercel Serverless Function - 代理 Moonshot API
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/moonshot', '') || '/chat/completions';
  
  const targetUrl = `https://api.moonshot.cn/v1${path}`;
  
  // 从原始请求复制必要的 headers
  const newHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}`,
  };
  
  try {
    const body = request.method !== 'GET' ? await request.text() : undefined;
    
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: body,
    });
    
    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
