/*
 * LLM client & feature-flag check for the optional /api/chat backend.
 * Pure (no hard dependency on window) so it can be unit-tested in Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LLM = factory();
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Resolves whether the LLM feature flag is active.
   * Priority: 1) URL ?llm=1|true|0|false  2) localStorage['feature:llm']  3) profile.features.llm
   */
  function isLLMEnabled(profile, env = {}) {
    const search = env.search ?? (typeof window !== "undefined" ? window.location?.search : "");
    const storage = env.storage ?? (typeof window !== "undefined" ? window.localStorage : null);

    try {
      const urlFlag = new URLSearchParams(search || "").get("llm");
      if (urlFlag === "1" || urlFlag === "true") return true;
      if (urlFlag === "0" || urlFlag === "false") return false;

      const stored = storage?.getItem?.("feature:llm");
      if (stored === "true" || stored === "1") return true;
      if (stored === "false" || stored === "0") return false;
    } catch {
      // Ignore storage / URL access errors (e.g. private browsing restrictions) and fall back to profile config.
    }
    return Boolean(profile?.features?.llm);
  }

  /**
   * Reads an SSE stream of `data: {"delta": "..."}\n\n` events, invoking `onToken(delta, full)` on each token.
   * Resolves to { reply, truncated } — truncated is true when the server reports the reply hit max_tokens.
   */
  async function readSSEStream(stream, onToken) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";
    let truncated = false;

    // Returns true on the [DONE] terminator.
    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return false;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") return true;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.truncated) truncated = true;
        if (parsed.delta) {
          reply += parsed.delta;
          if (typeof onToken === "function") onToken(parsed.delta, reply);
        }
      } catch {
        // ignore malformed SSE line
      }
      return false;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (handleLine(line)) return { reply, truncated };
      }
    }

    buffer += decoder.decode();
    handleLine(buffer);
    return { reply, truncated };
  }

  /**
   * Calls POST /api/chat with optional streaming or JSON response.
   * If `options.onToken` or `options.stream` is supplied, streams tokens.
   * Aborts if no token arrives within `timeoutMs` (default 8s), or a stream goes quiet for `idleMs` (default 5s).
   * Never throws; returns { ok, reply, truncated, ... } or { ok: false, fallback: true, error }.
   */
  async function queryChatAPI(message, options = {}) {
    const endpoint = options.endpoint || "/api/chat";
    const timeoutMs = options.timeoutMs || 8000;
    const idleMs = options.idleMs || 5000;
    const fetchImpl = options.fetch || (typeof fetch !== "undefined" ? fetch : null);
    const onToken = options.onToken;
    const wantStream = Boolean(options.stream ?? onToken);

    if (!fetchImpl) {
      return { ok: false, fallback: true, error: "Fetch is not available" };
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    const arm = (ms) => {
      if (!controller) return;
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), ms);
    };
    arm(timeoutMs);

    try {
      const payload = { message: String(message || "").trim() };
      if (wantStream) payload.stream = true;

      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });

      if (!res.ok) {
        return { ok: false, fallback: true, status: res.status, error: `HTTP ${res.status}` };
      }

      const contentType = res.headers?.get?.("content-type") || "";
      const isStream = contentType.includes("text/event-stream") || (wantStream && res.body && typeof res.body.getReader === "function");

      if (isStream && res.body) {
        // Each token resets the idle timer, so only a stalled stream is aborted.
        const { reply, truncated } = await readSSEStream(res.body, (delta, full) => {
          arm(idleMs);
          if (typeof onToken === "function") onToken(delta, full);
        });
        if (!reply.trim()) {
          return { ok: false, fallback: true, error: "Empty stream response" };
        }
        return { ok: true, reply: reply.trim(), truncated, fallback: false };
      }

      const data = await res.json();
      if (data.fallback || !data.reply) {
        return { ok: false, fallback: true, error: data.error || "Server signaled fallback" };
      }

      return {
        ok: true,
        reply: data.reply,
        truncated: Boolean(data.truncated),
        fallback: false,
      };
    } catch (err) {
      return {
        ok: false,
        fallback: true,
        error: err.name === "AbortError" ? "LLM request timed out" : err.message,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { isLLMEnabled, queryChatAPI, readSSEStream };
});
