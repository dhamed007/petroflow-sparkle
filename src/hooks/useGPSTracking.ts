import { useEffect, useRef, useState, useCallback } from 'react';
import { checkRateLimit } from '@/utils/rateLimiter';

interface GPSPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface GPSTrackingOptions {
  /** Called with batched positions to persist (e.g., to Supabase) */
  onPositionUpdate: (position: GPSPosition) => Promise<void>;
  /** Interval in ms between Supabase updates (default: 10000) */
  updateInterval?: number;
  /** Enable high accuracy GPS (default: true) */
  highAccuracy?: boolean;
}

interface GPSTrackingState {
  isTracking: boolean;
  currentPosition: GPSPosition | null;
  error: string | null;
  isOffline: boolean;
  queuedUpdates: number;
}

const OFFLINE_QUEUE_KEY = 'gps_offline_queue';

function getOfflineQueue(): GPSPosition[] {
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function setOfflineQueue(queue: GPSPosition[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function useGPSTracking(options: GPSTrackingOptions): GPSTrackingState & {
  startTracking: () => void;
  stopTracking: () => void;
} {
  const { onPositionUpdate, updateInterval = 10000, highAccuracy = true } = options;

  const [state, setState] = useState<GPSTrackingState>({
    isTracking: false,
    currentPosition: null,
    error: null,
    isOffline: !navigator.onLine,
    queuedUpdates: getOfflineQueue().length,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const latestPositionRef = useRef<GPSPosition | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  onPositionUpdateRef.current = onPositionUpdate;

  // Flush offline queue when back online
  const flushOfflineQueue = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const remaining: GPSPosition[] = [];
    for (const position of queue) {
      try {
        await onPositionUpdateRef.current(position);
      } catch {
        remaining.push(position);
      }
    }
    setOfflineQueue(remaining);
    setState(prev => ({ ...prev, queuedUpdates: remaining.length }));
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOffline: false }));
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setState(prev => ({ ...prev, isOffline: true }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushOfflineQueue]);

  const sendPosition = useCallback(async (position: GPSPosition) => {
    // Rate limit GPS updates
    const rateCheck = checkRateLimit('gps');
    if (!rateCheck.allowed) return;

    if (!navigator.onLine) {
      // Queue for later
      const queue = getOfflineQueue();
      queue.push(position);
      // Keep max 100 queued positions
      if (queue.length > 100) queue.shift();
      setOfflineQueue(queue);
      setState(prev => ({ ...prev, queuedUpdates: queue.length }));
      return;
    }

    try {
      await onPositionUpdateRef.current(position);
    } catch {
      // Queue on failure
      const queue = getOfflineQueue();
      queue.push(position);
      setOfflineQueue(queue);
      setState(prev => ({ ...prev, queuedUpdates: queue.length }));
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'Geolocation is not supported by this browser' }));
      return;
    }

    setState(prev => ({ ...prev, isTracking: true, error: null }));

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const gpsPos: GPSPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        latestPositionRef.current = gpsPos;
        setState(prev => ({ ...prev, currentPosition: gpsPos, error: null }));
      },
      (err) => {
        let errorMsg: string;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMsg = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable. Please check your GPS.';
            break;
          case err.TIMEOUT:
            errorMsg = 'Location request timed out. Retrying...';
            break;
          default:
            errorMsg = 'An unknown error occurred while getting location.';
        }
        setState(prev => ({ ...prev, error: errorMsg }));
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    // Send batched updates at interval
    intervalRef.current = setInterval(() => {
      const pos = latestPositionRef.current;
      if (pos && Date.now() - lastSentRef.current >= updateInterval) {
        lastSentRef.current = Date.now();
        sendPosition(pos);
      }
    }, updateInterval);

    // Flush any queued offline updates
    flushOfflineQueue();
  }, [highAccuracy, updateInterval, sendPosition, flushOfflineQueue]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isTracking: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
  };
}
