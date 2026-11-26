import { useEffect, useState } from "react";

// Re-render every minute so times like "2m" become "3m"
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
}
