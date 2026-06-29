/**
 * Read an SSE endpoint over fetch() (so query-string auth works) and invoke
 * `onEvent(eventType, data)` for each `event:`/`data:` pair.
 *
 * Returns an AbortController so callers can cancel the read.
 */
export function readSse(
  url: string,
  onEvent: (eventType: string, data: any) => void,
  onError?: (err: any) => void,
): AbortController {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 100)}`);
      }
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "";
          let dataStr = "";
          for (const line of part.trim().split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!eventType || !dataStr) continue;
          let data: any = {};
          try { data = JSON.parse(dataStr); } catch { /* noop */ }
          onEvent(eventType, data);
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") onError?.(err);
    }
  })();
  return controller;
}
