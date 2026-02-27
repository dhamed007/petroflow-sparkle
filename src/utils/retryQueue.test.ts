import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enqueueRetry,
  processRetryQueue,
  getRetryCounts,
  getDeadLetterItems,
  getPendingRetries,
  dismissDeadLetter,
  retryDeadLetter,
} from './retryQueue';

describe('enqueueRetry', () => {
  it('adds an item to the pending queue', () => {
    enqueueRetry('order.completed', { orderId: '1' });
    const counts = getRetryCounts();
    expect(counts.pending).toBe(1);
    expect(counts.deadLetter).toBe(0);
  });

  it('stores action and payload correctly', () => {
    enqueueRetry('erp.sync', { ref: 'abc' }, 'timeout');
    const items = getPendingRetries();
    const item = items.find(i => i.action === 'erp.sync');
    expect(item).toBeDefined();
    expect(item!.payload).toEqual({ ref: 'abc' });
    expect(item!.errorMessage).toBe('timeout');
    expect(item!.retryCount).toBe(0);
  });
});

describe('processRetryQueue', () => {
  it('processes and removes successful items', async () => {
    enqueueRetry('order.created', { id: 'x' });
    const executor = vi.fn().mockResolvedValue(undefined);

    // Set lastAttemptAt far in the past so backoff is satisfied
    const items = getPendingRetries();
    items.forEach(i => { i.lastAttemptAt = 0; });
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));

    const result = await processRetryQueue(executor);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(getRetryCounts().pending).toBe(0);
  });

  it('increments retryCount on failure', async () => {
    enqueueRetry('erp.sync', { id: 'fail' });
    const items = getPendingRetries();
    items.forEach(i => { i.lastAttemptAt = 0; });
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));

    const executor = vi.fn().mockRejectedValue(new Error('ERP down'));
    await processRetryQueue(executor);

    const remaining = getPendingRetries();
    const item = remaining.find(i => i.action === 'erp.sync');
    expect(item?.retryCount).toBe(1);
    expect(item?.errorMessage).toBe('ERP down');
  });

  it('moves to dead-letter after MAX_RETRIES (3) failures', async () => {
    enqueueRetry('erp.sync', { id: 'deadletter' });

    // Pre-set retryCount to 3 so next failure sends it to dead-letter
    const items = getPendingRetries();
    items.forEach(i => { i.retryCount = 3; i.lastAttemptAt = 0; });
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));

    const executor = vi.fn().mockResolvedValue(undefined); // won't even get called
    await processRetryQueue(executor);

    expect(getRetryCounts().deadLetter).toBeGreaterThanOrEqual(1);
    expect(getRetryCounts().pending).toBe(0);
  });

  it('moves expired items to dead-letter', async () => {
    enqueueRetry('erp.sync', { id: 'expired' });
    // Set createdAt to 25 hours ago
    const items = getPendingRetries();
    items.forEach(i => { i.createdAt = Date.now() - 25 * 60 * 60 * 1000; i.lastAttemptAt = 0; });
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));

    const executor = vi.fn();
    await processRetryQueue(executor);

    expect(getRetryCounts().deadLetter).toBeGreaterThanOrEqual(1);
    expect(executor).not.toHaveBeenCalled();
  });

  it('respects backoff — does not retry before delay expires', async () => {
    enqueueRetry('erp.sync', { id: 'backoff' });
    // retryCount=1 → backoff = 2^1 * 1000 = 2000ms
    const items = getPendingRetries();
    items.forEach(i => { i.retryCount = 1; i.lastAttemptAt = Date.now(); }); // just now
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));

    const executor = vi.fn();
    const result = await processRetryQueue(executor);
    expect(executor).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
    // Item stays pending
    expect(getRetryCounts().pending).toBe(1);
  });
});

describe('dismissDeadLetter', () => {
  it('removes the item from dead-letter queue', async () => {
    enqueueRetry('erp.sync', { id: 'toDismiss' });
    const items = getPendingRetries();
    items.forEach(i => { i.retryCount = 3; i.lastAttemptAt = 0; });
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));
    await processRetryQueue(vi.fn());

    const deadItems = getDeadLetterItems();
    expect(deadItems.length).toBeGreaterThan(0);
    dismissDeadLetter(deadItems[0].id);
    expect(getDeadLetterItems().length).toBe(0);
  });
});

describe('retryDeadLetter', () => {
  it('moves item back to pending queue with reset retryCount', async () => {
    enqueueRetry('erp.sync', { id: 'toRetry' });
    const items = getPendingRetries();
    items.forEach(i => { i.retryCount = 3; i.lastAttemptAt = 0; });
    localStorage.setItem('erp_retry_queue', JSON.stringify(items));
    await processRetryQueue(vi.fn());

    const deadItems = getDeadLetterItems();
    retryDeadLetter(deadItems[0].id);

    expect(getDeadLetterItems().length).toBe(0);
    const pending = getPendingRetries();
    expect(pending.some(i => i.retryCount === 0)).toBe(true);
  });
});
