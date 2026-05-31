import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  version: number;
}

export function Toast({ message, version }: ToastProps) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    setCurrent(message);
    const t = setTimeout(() => setCurrent(null), 2400);
    return () => clearTimeout(t);
  }, [message, version]);

  if (!current) return null;

  return <div id="toast">{current}</div>;
}
