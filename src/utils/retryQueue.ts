/**
 * ERP Sync Retry Queue with Dead-Letter Support
 *
 * - Exponential backoff: 1s, 2s, 4s (max 3 attempts)
 * - Stores failed syncs in localStorage
 * - Background processor retries every 60s
 * - Items older than 24h are marked as dead-letter
 */

const RETRY_QUEUE_KEY = 'erp_retry_queue';
const DEAD_LETTER_KEY = 'erp_dead_letter';
const MAX_RETRIES = 3;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROCESS_INTERVAL = 60000; // 60 seconds

export interface RetryItem {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: number;
  lastAttemptAt: number;
  errorMessage?: string;
}

type SyncExecutor = (action: string, payload: Record<string, unknown>) => Promise<void>;

function getQueue(key: string): RetryItem[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function setQueue(key: string, items: RetryItem[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

/**
 * Add a failed sync to the retry queue
 */
export function enqueueRetry(action: string, payload: Record<string, unknown>, errorMessage?: string): void {
  const queue = getQueue(RETRY_QUEUE_KEY);
  const item: RetryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    action,
    payload,
    retryCount: 0,
    createdAt: Date.now(),
    lastAttemptAt: Date.now(),
    errorMessage,
  };
  queue.push(item);
  setQueue(RETRY_QUEUE_KEY, queue);
}

/**
 * Get counts for UI display
 */
export function getRetryCounts(): { pending: number; deadLetter: number } {
  return {
    pending: getQueue(RETRY_QUEUE_KEY).length,
    deadLetter: getQueue(DEAD_LETTER_KEY).length,
  };
}

/**
 * Get all dead-letter items
 */
export function getDeadLetterItems(): RetryItem[] {
  return getQueue(DEAD_LETTER_KEY);
}

/**
 * Get all pending retry items
 */
export function getPendingRetries(): RetryItem[] {
  return getQueue(RETRY_QUEUE_KEY);
}

/**
 * Dismiss a dead-letter item
 */
export function dismissDeadLetter(id: string): void {
  const items = getQueue(DEAD_LETTER_KEY).filter(item => item.id !== id);
  setQueue(DEAD_LETTER_KEY, items);
}

/**
 * Move a dead-letter item back to retry queue
 */
export function retryDeadLetter(id: string): void {
  const deadLetters = getQueue(DEAD_LETTER_KEY);
  const item = deadLetters.find(i => i.id === id);
  if (!item) return;

  // Remove from dead letter
  setQueue(DEAD_LETTER_KEY, deadLetters.filter(i => i.id !== id));

  // Add back to retry queue with reset count
  item.retryCount = 0;
  item.lastAttemptAt = Date.now();
  const queue = getQueue(RETRY_QUEUE_KEY);
  queue.push(item);
  setQueue(RETRY_QUEUE_KEY, queue);
}

/**
 * Process the retry queue - call this periodically or on app load
 */
export async function processRetryQueue(executor: SyncExecutor): Promise<{ processed: number; failed: number; deadLettered: number }> {
  const queue = getQueue(RETRY_QUEUE_KEY);
  if (queue.length === 0) return { processed: 0, failed: 0, deadLettered: 0 };

  const remaining: RetryItem[] = [];
  const deadLetters = getQueue(DEAD_LETTER_KEY);
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const item of queue) {
    // Check if too old — move to dead letter
    if (Date.now() - item.createdAt > MAX_AGE_MS) {
      deadLetters.push(item);
      deadLettered++;
      continue;
    }

    // Check if max retries exceeded — move to dead letter
    if (item.retryCount >= MAX_RETRIES) {
      deadLetters.push(item);
      deadLettered++;
      continue;
    }

    // Calculate exponential backoff delay
    const backoffMs = Math.pow(2, item.retryCount) * 1000;
    if (Date.now() - item.lastAttemptAt < backoffMs) {
      remaining.push(item); // Not ready yet
      continue;
    }

    try {
      await executor(item.action, item.payload);
      processed++;
    } catch (error) {
      item.retryCount++;
      item.lastAttemptAt = Date.now();
      item.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (item.retryCount >= MAX_RETRIES) {
        deadLetters.push(item);
        deadLettered++;
      } else {
        remaining.push(item);
        failed++;
      }
    }
  }

  setQueue(RETRY_QUEUE_KEY, remaining);
  setQueue(DEAD_LETTER_KEY, deadLetters);

  return { processed, failed, deadLettered };
}

/**
 * Start the background retry processor
 * Returns a cleanup function to stop the processor
 */
export function startRetryProcessor(executor: SyncExecutor): () => void {
  // Process immediately on start
  processRetryQueue(executor);

  const intervalId = setInterval(() => {
    processRetryQueue(executor);
  }, PROCESS_INTERVAL);

  return () => clearInterval(intervalId);
}
