import { useEffect, useRef, useState } from 'react';

export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(Date.now());

  useEffect(() => {
    const handleHeartbeat = () => {
      lastHeartbeatRef.current = Date.now();
      setLastHeartbeat(Date.now());
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

  return { isConnected, lastHeartbeat };
}
