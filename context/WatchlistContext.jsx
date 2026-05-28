'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db } from '@/lib/firebase-client';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { applyFlowMode } from '@/lib/flowmode';

const WatchlistContext = createContext(null);

export function WatchlistProvider({ children }) {
  const [user, setUser] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentFilter, setCurrentFilter] = useState('list'); // list, watching, watched
  const [currentSort, setCurrentSort] = useState('added');
  const [currentSortOrder, setCurrentSortOrder] = useState('desc');
  const [flowModeActive, setFlowModeActive] = useState(false);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setWatchlist([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to Firestore Watchlist Document
  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    const docRef = doc(db, 'cineq_watchlists', user.uid);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWatchlist(data.items || []);
      } else {
        setWatchlist([]);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error fetching watchlist:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Save changes to Firestore
  const saveWatchlist = useCallback(async (newItems) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'cineq_watchlists', user.uid);
      await setDoc(docRef, { items: newItems }, { merge: true });
    } catch (err) {
      console.error('Failed to save watchlist:', err);
    }
  }, [user]);

  // Add Item
  const addItem = useCallback(async (itemData, type) => {
    if (watchlist.some(w => w.id === itemData.id && w.media_type === type)) return;
    
    const newItem = {
      id: itemData.id,
      media_type: type,
      title: itemData.title || itemData.name || itemData.original_name,
      poster: itemData.poster_path ? `https://image.tmdb.org/t/p/w500${itemData.poster_path}` : null,
      year: parseInt((itemData.release_date || itemData.first_air_date || '').split('-')[0]) || null,
      score: itemData.vote_average || null,
      episodes: type === 'tv' ? (itemData.number_of_episodes || null) : null,
      watched: false,
      episodesWatched: 0,
      addedAt: Date.now(),
      _genres: (itemData.genre_ids || []).map(String), // Simplified for now
      _aniScore: (itemData.vote_average || 0) * 10
    };

    const newWatchlist = [...watchlist, newItem];
    setWatchlist(newWatchlist);
    await saveWatchlist(newWatchlist);
  }, [watchlist, saveWatchlist]);

  // Remove Item
  const removeItem = useCallback(async (id, type) => {
    const newWatchlist = watchlist.filter(w => !(w.id === id && w.media_type === type));
    setWatchlist(newWatchlist);
    await saveWatchlist(newWatchlist);
  }, [watchlist, saveWatchlist]);

  // Update Item
  const updateItem = useCallback(async (id, type, updates) => {
    const newWatchlist = watchlist.map(w => {
      if (w.id === id && w.media_type === type) {
        return { ...w, ...updates };
      }
      return w;
    });
    setWatchlist(newWatchlist);
    await saveWatchlist(newWatchlist);
  }, [watchlist, saveWatchlist]);

  // Get Sorted and Filtered Items
  const getProcessedWatchlist = useCallback(() => {
    let filtered = [...watchlist];

    // Basic Filtering
    if (currentFilter === 'watching') {
      filtered = filtered.filter(w => w.episodesWatched > 0 && !w.watched);
    } else if (currentFilter === 'watched') {
      filtered = filtered.filter(w => w.watched);
    }

    // Sorting
    if (flowModeActive) {
      return applyFlowMode(filtered, watchlist);
    }

    filtered.sort((a, b) => {
      let valA = a[currentSort];
      let valB = b[currentSort];

      if (currentSort === 'added') {
        valA = a.addedAt || 0;
        valB = b.addedAt || 0;
      }

      if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [watchlist, currentFilter, currentSort, currentSortOrder, flowModeActive]);

  const value = {
    user,
    watchlist,
    processedWatchlist: getProcessedWatchlist(),
    loading,
    currentFilter,
    setCurrentFilter,
    currentSort,
    setCurrentSort,
    currentSortOrder,
    setCurrentSortOrder,
    flowModeActive,
    setFlowModeActive,
    addItem,
    removeItem,
    updateItem
  };

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
