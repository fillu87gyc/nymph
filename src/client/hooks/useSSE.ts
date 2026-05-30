import { useEffect, useRef } from 'react';

export function useSSE(onFileChange: (file: string) => void) {
  const cbRef = useRef(onFileChange);
  cbRef.current = onFileChange;

  useEffect(() => {
    const sse = new EventSource('/watch');
    sse.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.file) cbRef.current(msg.file);
      } catch { /* ignore */ }
    };
    return () => sse.close();
  }, []);
}
