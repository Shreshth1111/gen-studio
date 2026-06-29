import openai
import json
import os
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


def _build_providers() -> list[dict]:
    """Build the ordered provider list from env vars at startup."""
    providers = []

    # ── 1. Groq (primary, free tier) ──────────────────────────────────────────
    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        providers.append({
            "name": "groq",
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": groq_key,
            "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "extra_headers": {},
        })

    # ── 1b. Groq secondary model (auto-fallback when the primary model hits its
    #        per-model daily token cap). Groq's free tier meters tokens-per-day
    #        SEPARATELY per model, so a smaller model has its own fresh budget —
    #        keeps generation working all day for free when the 70B is exhausted.
    groq_fallback_model = os.getenv("GROQ_FALLBACK_MODEL", "llama-3.1-8b-instant")
    if groq_key and groq_fallback_model:
        providers.append({
            "name": "groq-fallback",
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": groq_key,
            "model": groq_fallback_model,
            "extra_headers": {},
        })

    # ── 2. ZSapiens (fallback) ─────────────────────────────────────────────────
    zsapiens_key = os.getenv("ZSAPIENS_API_KEY", "")
    if zsapiens_key:
        providers.append({
            "name": "zsapiens",
            # base_url must NOT have trailing slash — SDK appends /chat/completions
            "base_url": os.getenv("ZSAPIENS_BASE_URL", "https://ai.zsapiens.com/v1/32b"),
            "api_key": zsapiens_key,
            "model": os.getenv("ZSAPIENS_MODEL", "llama-3.1-70b"),
            "extra_headers": {
                "X-API-Key": os.getenv("ZSAPIENS_X_API_KEY", ""),
            },
        })

    # ── 3. OpenAI / ChatGPT (final fallback) ──────────────────────────────────
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if openai_key:
        providers.append({
            "name": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": openai_key,
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            "extra_headers": {},
        })

    # ── Legacy single-provider fallback (Ollama / any custom base_url) ────────
    if not providers:
        providers.append({
            "name": "legacy",
            "base_url": os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
            "api_key": os.getenv("LLM_API_KEY", "ollama"),
            "model": os.getenv("LLM_MODEL", "llama3.2"),
            "extra_headers": {},
        })

    return providers


def _make_client(provider: dict) -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(
        base_url=provider["base_url"],
        api_key=provider["api_key"],
        default_headers=provider["extra_headers"] or {},
    )


class LLMClient:
    def __init__(self):
        self._providers = _build_providers()
        self._max_tokens = int(os.getenv("LLM_MAX_TOKENS", "4096"))
        names = [p["name"] for p in self._providers]
        logger.info("LLM provider chain: %s", " → ".join(names))

    async def generate_structured(self, system_prompt: str, user_prompt: str) -> dict:
        """Generate JSON-structured output, trying providers in order."""
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                result = await self._call_structured(provider, system_prompt, user_prompt)
                return result
            except Exception as exc:
                logger.warning("LLM provider '%s' failed: %s", provider["name"], exc)
                last_error = exc
        raise RuntimeError(f"All LLM providers failed. Last error: {last_error}") from last_error

    async def stream_text(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        """Stream raw text tokens, trying providers in order.

        Falls back to the next provider only if the initial connection fails.
        Mid-stream errors propagate as-is.
        """
        last_error: Exception | None = None
        for provider in self._providers:
            try:
                client = _make_client(provider)
                stream = await client.chat.completions.create(
                    model=provider["model"],
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    stream=True,
                    temperature=0.7,
                    max_tokens=self._max_tokens,
                )
                async for chunk in stream:
                    token = chunk.choices[0].delta.content or ""
                    if token:
                        yield token
                return  # success — stop after first working provider
            except Exception as exc:
                logger.warning("LLM stream provider '%s' failed: %s", provider["name"], exc)
                last_error = exc
        raise RuntimeError(f"All LLM providers failed. Last error: {last_error}") from last_error

    # ── private ───────────────────────────────────────────────────────────────

    async def _call_structured(self, provider: dict, system_prompt: str, user_prompt: str) -> dict:
        client = _make_client(provider)
        response = await client.chat.completions.create(
            model=provider["model"],
            messages=[
                {
                    "role": "system",
                    "content": system_prompt + "\n\nRespond ONLY with valid JSON. No markdown, no explanation.",
                },
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=self._max_tokens,
        )
        content = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            raise ValueError(f"LLM did not return valid JSON: {content[:200]}")


llm_client = LLMClient()
