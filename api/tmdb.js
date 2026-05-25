module.exports = async function handler(req, res) {
  // Vercel parses all query parameters into req.query automatically
  const targetPath = req.query.targetPath || '';
  
  // Forward all query parameters except 'targetPath' to TMDB
  const queryParams = { ...req.query };
  delete queryParams.targetPath;
  
  const queryString = new URLSearchParams(queryParams).toString();
  const tmdbUrl = `https://api.themoviedb.org/3/${targetPath}${queryString ? '?' + queryString : ''}`;

  const options = {
    method: req.method || 'GET',
    headers: {
      'Accept': 'application/json',
    }
  };

  if (process.env.TMDB_TOKEN) {
    options.headers['Authorization'] = `Bearer ${process.env.TMDB_TOKEN}`;
  }

  try {
    const response = await fetch(tmdbUrl, options);
    
    // Parse the JSON data from TMDB
    const data = await response.json();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=3600');
    
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('TMDB Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
