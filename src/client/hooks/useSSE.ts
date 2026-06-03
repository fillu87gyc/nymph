import { useEffect, useRef } from 'react';

export function useSSE(
  onEvent: (file: string | null, dictUpdated?: boolean) => void,
) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const sse = new EventSource('/watch');
    sse.onmessage = (e) => {
      window.dispatchEvent(new Event('sse:heartbeat'));
      try {
        const msg = JSON.parse(e.data);
        if (msg.dictUpdated) {
          cbRef.current(null, true);
        } else if (msg.file) {
          cbRef.current(msg.file);
        }
      } catch {
        /* ignore */
      }
    };
    return () => sse.close();
  }, []);
}
