/*
 * LLM Client Integration & Feature Flag Management
 * Supports Cloudflare Pages Function endpoint (/api/chat) with Cohere or custom backend.
 * Works both in browser and Node.js test environments.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LLM = factory();
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Resolves whether the LLM feature flag is currently active.
   * Priority:
   *  1. URL Query Parameter: ?llm=1|true or ?llm=0|false
   *  2. LocalStorage: 'feature:llm' === 'true'
   *  3. Profile configuration: PROFILE.features.llm
   */
  function isLLMEnabled(profile) {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlFlag = params.get("llm");
        if (urlFlag === "1" || urlFlag === "true") return true;
        if (urlFlag === "0" || urlFlag === "false") return false;

        const stored = localStorage.getItem("feature:llm");
        if (stored === "true") return true;
        if (stored === "false") return false;
      } catch (e) {
        // Fall through to profile config on storage/URL error
      }
    }
    return Boolean(profile?.features?.llm);
  }

  /**
   * Sets the local developer toggle in localStorage.
   */
  function setLLMFeature(enabled) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("feature:llm", enabled ? "true" : "false");
    }
  }

  /**
   * Queries the backend LLM endpoint (/api/chat) with strict timeout and fallback handling.
   * Returns:
   *   { ok: true, reply, model, citations } on success
   *   { ok: false, fallback: true, error } on failure/timeout
   */
  async function queryChatAPI(message, options = {}) {
    const endpoint = options.endpoint || "/api/chat";
    const timeoutMs = options.timeoutMs || 8000;
    const fetchImpl = options.fetch || (typeof fetch !== "undefined" ? fetch : null);

    if (!fetchImpl) {
      return { ok: false, fallback: true, error: "Fetch is not available in environment" };
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: String(message || "").trim() }),
        signal: controller ? controller.signal : undefined,
      });

      if (timer) clearTimeout(timer);

      if (!res.ok) {
        return {
          ok: false,
          fallback: true,
          status: res.status,
          error: `Endpoint responded with status ${res.status}`,
        };
      }

      const data = await res.json();
      if (data.fallback || !data.reply) {
        return {
          ok: false,
          fallback: true,
          error: data.error || "Server signaled fallback",
        };
      }

      return {
        ok: true,
        reply: data.reply,
        model: data.model || "command-r7b",
        provider: data.provider || "cohere",
        citations: data.citations || [],
        fallback: false,
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      const isAbort = err.name === "AbortError";
      return {
        ok: false,
        fallback: true,
        error: isAbort ? "LLM request timed out" : err.message,
      };
    }
  }

  return {
    isLLMEnabled,
    setLLMFeature,
    queryChatAPI,
  };
});
