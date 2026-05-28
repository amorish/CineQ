import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

const fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    error.info = await res.json();
    error.status = res.status;
    throw error;
  }
  return res.json();
};

/**
 * Hook to search TMDB (Single Page)
 */
export function useTMDBSearch(query, adult = false) {
  const adultStr = adult ? 'true' : 'false';
  const shouldFetch = query && query.length >= 2;
  
  const { data, error, isLoading } = useSWR(
    shouldFetch 
      ? `/api/tmdb?targetPath=search/multi&query=${encodeURIComponent(query)}&include_adult=${adultStr}&language=en-US&page=1` 
      : null,
    fetcher
  );

  return {
    results: data?.results || [],
    isLoading,
    isError: error
  };
}

/**
 * Infinite Scroll Hook for TMDB Search/Explore
 */
export function useTMDBSearchInfinite(query, adult = false) {
  const adultStr = adult ? 'true' : 'false';
  const shouldFetch = query && query.length >= 2;

  const getKey = (pageIndex, previousPageData) => {
    if (!shouldFetch) return null; // don't fetch if no query
    if (previousPageData && !previousPageData.results.length) return null; // reached the end
    
    // TMDB pages are 1-indexed
    return `/api/tmdb?targetPath=search/multi&query=${encodeURIComponent(query)}&include_adult=${adultStr}&language=en-US&page=${pageIndex + 1}`;
  };

  const { data, error, size, setSize, isValidating } = useSWRInfinite(getKey, fetcher);

  const results = data ? data.flatMap(page => page.results) : [];
  const isLoadingInitialData = !data && !error;
  const isLoadingMore = isLoadingInitialData || (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.results.length === 0;
  const isReachingEnd = isEmpty || (data && data[data.length - 1]?.results.length < 20);

  return {
    results,
    error,
    isLoadingMore,
    size,
    setSize,
    isReachingEnd
  };
}
