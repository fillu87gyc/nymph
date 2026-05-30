import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState('');

  useEffect(() => {
    if (!message) return;
    setCurrent(message);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div id="toast" className={visible ? 'show' : ''}>
      {current}
    </div>
  );
}
