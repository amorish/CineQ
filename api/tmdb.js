export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace('/api/tmdb', '');
  const tmdbUrl = `https://api.themoviedb.org/3${path}${url.search}`;

  const options = {
    method: req.method,
    headers: {
      'Accept': 'application/json',
    }
  };

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    options.headers['Authorization'] = authHeader;
  }

  try {
    const response = await fetch(tmdbUrl, options);
    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=3600'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
