import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useConnectionStatus } from '../../src/client/hooks/useConnectionStatus.ts';

describe('useConnectionStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test('should start connected', () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.isConnected).toBe(true);
  });

  test('should remain connected when receiving heartbeats', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      window.dispatchEvent(new Event('sse:heartbeat'));
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isConnected).toBe(true);
  });

  test('should disconnect when no heartbeat received for 2 seconds', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(result.current.isConnected).toBe(false);
  });

  test('should reconnect when heartbeat is received after disconnect', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.isConnected).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('sse:heartbeat'));
    });

    expect(result.current.isConnected).toBe(true);
  });

  test('should update lastHeartbeat on heartbeat event', () => {
    const { result } = renderHook(() => useConnectionStatus());
    const initialHeartbeat = result.current.lastHeartbeat;

    act(() => {
      vi.advanceTimersByTime(500);
      window.dispatchEvent(new Event('sse:heartbeat'));
    });

    expect(result.current.lastHeartbeat).toBeGreaterThan(initialHeartbeat);
  });
});
