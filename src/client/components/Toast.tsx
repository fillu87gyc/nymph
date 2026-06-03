import { useEffect, useState } from 'react';
import styles from './Toast.module.css';

interface ToastProps {
  message: string;
  version: number;
}

export function Toast({ message, version }: ToastProps) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    setCurrent(message);
    const timeoutId = setTimeout(() => setCurrent(null), 2400);
    return () => clearTimeout(timeoutId);
  }, [message, version]);

  if (!current) return null;

  return (
    <div id="toast" className={styles.toast}>
      {current}
    </div>
  );
}
