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

  test('disconnect 後に heartbeat が来ると再接続し、その後も切断判定が出ない', () => {
    const { result } = renderHook(() => useConnectionStatus());

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.isConnected).toBe(false);

    // 切断後の heartbeat で ref の時刻が更新され、再接続する
    act(() => {
      window.dispatchEvent(new Event('sse:heartbeat'));
    });
    expect(result.current.isConnected).toBe(true);

    // 直近の heartbeat から 2 秒以内は接続を維持する
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.isConnected).toBe(true);
  });
});
