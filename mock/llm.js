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
   * Calls POST /api/chat with a timeout. Never throws; returns { ok, reply, ... } or { ok: false, fallback: true, error }.
   */
  async function queryChatAPI(message, options = {}) {
    const endpoint = options.endpoint || "/api/chat";
    const timeoutMs = options.timeoutMs || 8000;
    const fetchImpl = options.fetch || (typeof fetch !== "undefined" ? fetch : null);

    if (!fetchImpl) {
      return { ok: false, fallback: true, error: "Fetch is not available" };
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: String(message || "").trim() }),
        signal: controller?.signal,
      });

      if (!res.ok) {
        return { ok: false, fallback: true, status: res.status, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      if (data.fallback || !data.reply) {
        return { ok: false, fallback: true, error: data.error || "Server signaled fallback" };
      }

      return {
        ok: true,
        reply: data.reply,
        model: data.model || "command-r7b",
        provider: data.provider || "cohere",
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

  return { isLLMEnabled, queryChatAPI };
});
