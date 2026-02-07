import { useEffect } from "react";

const useRealtimeInvalidate = (onInvalidate) => {
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return undefined;
    }

    let closed = false;
    const source = new EventSource("/api/events/", { withCredentials: true });

    const handler = () => {
      if (!closed && typeof onInvalidate === "function") {
        onInvalidate();
      }
    };

    source.addEventListener("invalidate", handler);

    return () => {
      closed = true;
      source.removeEventListener("invalidate", handler);
      source.close();
    };
  }, [onInvalidate]);
};

export default useRealtimeInvalidate;
