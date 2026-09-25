import { useEffect, useState } from "react";

const tickMs = 30 * 1000;

// The time an age is measured against, advanced often enough that "min ago" stays true.
export function useNow(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
}
