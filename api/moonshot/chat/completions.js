// Vercel Serverless Function - 代理 Moonshot API
export const config = { runtime: 'edge' };

export default async function handler(request) {
  const targetUrl = 'https://api.moonshot.cn/v1/chat/completions';
  
  try {
    const body = await request.text();
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MOONSHOT_API_KEY}`,
      },
      body: body,
    });
    
    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
