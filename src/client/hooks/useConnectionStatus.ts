import { useEffect, useRef, useState } from 'react';

export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true);
  // heartbeat は 1 秒ごとに届く。時刻は ref だけで保持し、state には載せない。
  // state にすると毎秒アプリ全体が再レンダリングされてしまう（isConnected の
  // 変化は接続/切断の遷移時だけで十分）。
  const lastHeartbeatRef = useRef<number>(Date.now());

  useEffect(() => {
    const handleHeartbeat = () => {
      lastHeartbeatRef.current = Date.now();
      setIsConnected(true);
    };

    window.addEventListener('sse:heartbeat', handleHeartbeat);

    const checkConnectionInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - lastHeartbeatRef.current;
      if (timeSinceLastHeartbeat > 2000) {
        setIsConnected(false);
      }
    }, 500);

    return () => {
      window.removeEventListener('sse:heartbeat', handleHeartbeat);
      clearInterval(checkConnectionInterval);
    };
  }, []);

  return { isConnected };
}
