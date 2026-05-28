/**
 * applyFlowMode
 * Intelligent algorithm that organizes a watchlist based on user preferences,
 * balancing ratings, genres, and watch progress.
 * 
 * @param {Array} items - The items to be sorted.
 * @param {Array} fullWatchlist - The user's entire watchlist to calculate genre affinities.
 * @returns {Array} - The smartly ordered items.
 */
export function applyFlowMode(items, fullWatchlist = []) {
  if (!items || !items.length) return [];

  const droppedItems = fullWatchlist.filter(w => w.archived);
  const watchedItems = fullWatchlist.filter(w => w.watched);

  // Calculate Genre Affinities
  let droppedGenres = {};
  droppedItems.forEach(a => { 
    if (a._genres) {
      a._genres.forEach(g => {
        droppedGenres[g] = (droppedGenres[g] || 0) + 1;
      });
    }
  });

  let watchedGenres = {};
  watchedItems.forEach(a => { 
    if (a._genres) {
      a._genres.forEach(g => {
        watchedGenres[g] = (watchedGenres[g] || 0) + 1;
      });
    }
  });

  const now = Date.now();

  // Score each item
  const withPriority = items.map(a => {
    let _score = (a._aniScore || (a.score ? a.score * 10 : 0));
    
    const addedAtTime = a.addedAt || now;
    const ageDays = (now - addedAtTime) / (1000 * 60 * 60 * 24);
    _score += Math.min(ageDays * 0.1, 15);
    
    const _inProgress = (a.episodesWatched || 0) > 0 ? 1 : 0;
    if (_inProgress) _score += 30;

    if (a._genres) {
      a._genres.forEach(g => {
        if (watchedGenres[g]) _score += Math.min(watchedGenres[g] * 2, 20);
        if (droppedGenres[g]) _score -= Math.min(droppedGenres[g] * 5, 40);
      });
    }

    return { ...a, _score, _inProgress };
  });

  // Categorize items
  const movies = withPriority.filter(a => a.media_type === 'movie')
    .sort((a, b) => b._score - a._score);
    
  const short = withPriority.filter(a => a.media_type === 'tv' && (a.episodes || 999) <= 20)
    .sort((a, b) => b._inProgress - a._inProgress || b._score - a._score);
    
  const medium = withPriority.filter(a => a.media_type === 'tv' && (a.episodes || 999) > 20 && (a.episodes || 999) <= 100)
    .sort((a, b) => b._inProgress - a._inProgress || b._score - a._score);
    
  const long = withPriority.filter(a => a.media_type === 'tv' && (a.episodes || 999) > 100)
    .sort((a, b) => b._inProgress - a._inProgress || b._score - a._score);

  // Interleave categories
  const result = [];
  let mi = 0;
  const maxLen = Math.max(short.length, medium.length, long.length);
  
  for (let i = 0; i < maxLen; i++) {
    if (short[i]) result.push(short[i]);
    if (medium[i]) result.push(medium[i]);
    if (i % 2 === 1 && movies[mi]) { result.push(movies[mi++]); }
    if (long[i]) result.push(long[i]);
  }
  
  while (mi < movies.length) {
    result.push(movies[mi++]);
  }

  // Deduplicate
  const seen = new Set();
  return result.filter(a => seen.has(a.id) ? false : seen.add(a.id));
}
