/**
 * Provider catalog for opencode-mcp.
 *
 * Every entry was verified against the provider's official docs on 2026-09-30
 * (see `docs` + `sources`). Logos are transparent-background SVGs stored in
 * `assets/providers/` so the WebUI works offline:
 *   - simple-icons (jsdelivr, transparent monochrome): openai, claude
 *     (anthropic), google (gemini), mistral, openrouter, ollama, perplexity
 *   - lobe-icons static SVG (transparent): xai (grok), deepseek, groq, cohere,
 *     opencode / opencode-go mark
 *   - opencode-official-favicon.svg is the only non-transparent file (official
 *     favicon with dark background, kept for reference).
 *
 * OpenCode provider IDs (`id`) match the `provider/model` prefix used by
 * `assign_task` / `models_list` (e.g. `opencode-go/kimi-k3`).
 */

export interface ProviderInfo {
  /** OpenCode provider ID, i.e. the prefix of `provider/model`. */
  id: string;
  /** Human label shown in the WebUI. */
  label: string;
  /** Kind of endpoint. */
  kind: "cloud" | "local" | "gateway" | "custom";
  /** Base URL (no trailing slash). For `custom`, a template with {baseURL}. */
  baseUrl: string;
  /** Key REST endpoints (relative or absolute). */
  endpoints: {
    chat?: string;
    responses?: string;
    messages?: string;
    models?: string;
    extra?: string[];
  };
  /** Env var holding the API key (`null` when none is needed, e.g. local Ollama). */
  envKey: string | null;
  /** Secondary env aliases accepted. */
  envAliases?: string[];
  /** Official docs URL for keys / endpoints. */
  docs: string;
  /** Transparent logo shipped in the repo. */
  logo: string;
  /** Remote transparent source the logo was fetched from. */
  logoSource: string;
  /** Short note (auth, compat, plan). */
  note: string;
}

/** WebUI form field for provider credentials / options. */
export interface ProviderInputField {
  id: string;
  label: string;
  envVar?: string;
  inputType: "secret" | "url" | "text";
  required: boolean;
  placeholder?: string;
  hint?: string;
}

/** Required vs optional inputs shown after the user picks a provider. */
export function providerInputFields(p: ProviderInfo): ProviderInputField[] {
  const fields: ProviderInputField[] = [];
  if (p.kind === "custom") {
    fields.push({
      id: "baseUrl",
      label: "Base URL",
      inputType: "url",
      required: true,
      placeholder: "http://127.0.0.1:1234/v1",
      hint: "OpenAI-compatible API root (include /v1 when the server expects it).",
    });
    fields.push({
      id: "apiKey",
      label: "API key",
      inputType: "secret",
      required: false,
      placeholder: "optional",
      hint: "Only if your local or proxy server requires authentication.",
    });
    return fields;
  }
  if (p.envKey) {
    fields.push({
      id: "apiKey",
      label: "API key",
      envVar: p.envKey,
      inputType: "secret",
      required: true,
      placeholder: "sk-…",
      hint: `Saved locally; use as ${p.envKey} when running OpenCode.`,
    });
  }
  if (p.envAliases?.length) {
    for (const alias of p.envAliases) {
      fields.push({
        id: `env_${alias}`,
        label: alias,
        envVar: alias,
        inputType: "secret",
        required: false,
        placeholder: "optional",
        hint: "Alternate credential accepted by this provider.",
      });
    }
  }
  return fields;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "cloud",
    baseUrl: "https://api.openai.com/v1",
    endpoints: {
      chat: "https://api.openai.com/v1/chat/completions",
      responses: "https://api.openai.com/v1/responses",
      models: "https://api.openai.com/v1/models",
    },
    envKey: "OPENAI_API_KEY",
    docs: "https://platform.openai.com/docs/api-reference",
    logo: "assets/providers/openai.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/openai.svg (transparent)",
    note: "Chat Completions + Responses API. Source: platform.openai.com.",
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    kind: "cloud",
    baseUrl: "https://api.anthropic.com",
    endpoints: {
      messages: "https://api.anthropic.com/v1/messages",
      models: "https://api.anthropic.com/v1/models",
    },
    envKey: "ANTHROPIC_API_KEY",
    docs: "https://docs.anthropic.com/claude/reference/getting-started-with-the-api",
    logo: "assets/providers/claude.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/anthropic.svg (transparent)",
    note: "Messages API with x-api-key + anthropic-version headers.",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    kind: "cloud",
    baseUrl: "https://generativelanguage.googleapis.com",
    endpoints: {
      chat: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      models: "https://generativelanguage.googleapis.com/v1beta/models",
      extra: [
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      ],
    },
    envKey: "GEMINI_API_KEY",
    envAliases: ["GOOGLE_API_KEY"],
    docs: "https://ai.google.dev/gemini-api/docs",
    logo: "assets/providers/google.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/googlegemini.svg (transparent)",
    note: "Native generateContent + OpenAI-compatible /v1beta/openai/ endpoint.",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    kind: "cloud",
    baseUrl: "https://api.mistral.ai/v1",
    endpoints: {
      chat: "https://api.mistral.ai/v1/chat/completions",
      models: "https://api.mistral.ai/v1/models",
      extra: [
        "https://api.mistral.ai/v1/embeddings",
        "https://api.mistral.ai/v1/fim/completions",
        "https://api.mistral.ai/v1/agents/completions",
      ],
    },
    envKey: "MISTRAL_API_KEY",
    docs: "https://docs.mistral.ai/api",
    logo: "assets/providers/mistral.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/mistralai.svg (transparent)",
    note: "OpenAI-compatible chat + FIM + agents endpoints.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "gateway",
    baseUrl: "https://openrouter.ai/api/v1",
    endpoints: {
      chat: "https://openrouter.ai/api/v1/chat/completions",
      responses: "https://openrouter.ai/api/v1/responses",
      messages: "https://openrouter.ai/api/v1/messages",
      models: "https://openrouter.ai/api/v1/models",
    },
    envKey: "OPENROUTER_API_KEY",
    docs: "https://openrouter.ai/docs/quickstart",
    logo: "assets/providers/openrouter.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/openrouter.svg (transparent)",
    note: "One OpenAI-compatible key for 500+ models. Optional HTTP-Referer / X-Title headers.",
  },
  {
    id: "opencode",
    label: "OpenCode Zen",
    kind: "gateway",
    baseUrl: "https://opencode.ai/zen/v1",
    endpoints: {
      chat: "https://opencode.ai/zen/v1/chat/completions",
      responses: "https://opencode.ai/zen/v1/responses",
      messages: "https://opencode.ai/zen/v1/messages",
      models: "https://opencode.ai/zen/v1/models",
    },
    envKey: "OPENCODE_API_KEY",
    envAliases: ["OPENCODE_ZEN_API_KEY"],
    docs: "https://opencode.ai/docs/zen",
    logo: "assets/providers/opencode.svg",
    logoSource: "lobe-icons opencode mark (transparent); official brand: https://opencode.ai/brand",
    note: "Curated gateway, pay-as-you-go. Config model: opencode/<model-id>. Formerly provider id `opencode`.",
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    kind: "gateway",
    baseUrl: "https://opencode.ai/zen/go/v1",
    endpoints: {
      chat: "https://opencode.ai/zen/go/v1/chat/completions",
      responses: "https://opencode.ai/zen/go/v1/responses",
      messages: "https://opencode.ai/zen/go/v1/messages",
      models: "https://opencode.ai/zen/go/v1/models",
    },
    envKey: "OPENCODE_API_KEY",
    docs: "https://opencode.ai/docs/go",
    logo: "assets/providers/opencode-go.svg",
    logoSource: "lobe-icons opencode mark (transparent); official brand: https://opencode.ai/brand",
    note: "$10/$40 monthly plans for open coding models. Config model: opencode-go/<model-id>.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "local",
    baseUrl: "http://localhost:11434",
    endpoints: {
      chat: "http://localhost:11434/api/chat",
      models: "http://localhost:11434/api/tags",
      extra: [
        "http://localhost:11434/api/generate",
        "http://localhost:11434/v1/chat/completions (OpenAI-compatible)",
        "https://ollama.com/api (Ollama Cloud)",
      ],
    },
    envKey: null,
    envAliases: ["OLLAMA_API_KEY"],
    docs: "https://docs.ollama.com/api/introduction",
    logo: "assets/providers/ollama.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/ollama.svg (transparent)",
    note: "Local server, no key by default. OpenCode discovers models via the native API.",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-Compatible (custom)",
    kind: "custom",
    baseUrl: "{baseURL} (e.g. http://127.0.0.1:1234/v1)",
    endpoints: {
      chat: "{baseURL}/chat/completions",
      models: "{baseURL}/models",
    },
    envKey: null,
    docs: "https://opencode.ai/docs/providers#custom-provider",
    logo: "assets/providers/openai-compatible.svg",
    logoSource: "derived from simple-icons openai mark (transparent); endpoint is user-supplied",
    note: "Any OpenAI-compatible server (LM Studio, Atomic Chat :1337, proxies). Set provider.options.baseURL.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    kind: "cloud",
    baseUrl: "https://api.x.ai/v1",
    endpoints: {
      chat: "https://api.x.ai/v1/chat/completions",
      models: "https://api.x.ai/v1/models",
    },
    envKey: "XAI_API_KEY",
    docs: "https://docs.x.ai",
    logo: "assets/providers/xai.svg",
    logoSource: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/grok.svg (transparent)",
    note: "OpenAI-compatible. Console: console.x.ai.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "cloud",
    baseUrl: "https://api.deepseek.com",
    endpoints: {
      chat: "https://api.deepseek.com/chat/completions",
      models: "https://api.deepseek.com/models",
      extra: ["https://api.deepseek.com/anthropic (Anthropic-compatible)"],
    },
    envKey: "DEEPSEEK_API_KEY",
    docs: "https://api-docs.deepseek.com",
    logo: "assets/providers/deepseek.svg",
    logoSource: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek.svg (transparent)",
    note: "OpenAI- + Anthropic-compatible base URLs.",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "cloud",
    baseUrl: "https://api.groq.com/openai/v1",
    endpoints: {
      chat: "https://api.groq.com/openai/v1/chat/completions",
      responses: "https://api.groq.com/openai/v1/responses",
      models: "https://api.groq.com/openai/v1/models",
    },
    envKey: "GROQ_API_KEY",
    docs: "https://console.groq.com/docs/overview",
    logo: "assets/providers/groq.svg",
    logoSource: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/groq.svg (transparent)",
    note: "Fast LPU inference, OpenAI-compatible.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    kind: "cloud",
    baseUrl: "https://api.perplexity.ai",
    endpoints: {
      chat: "https://api.perplexity.ai/chat/completions",
      models: "https://api.perplexity.ai/models",
    },
    envKey: "PERPLEXITY_API_KEY",
    docs: "https://docs.perplexity.ai",
    logo: "assets/providers/perplexity.svg",
    logoSource: "https://cdn.jsdelivr.net/npm/simple-icons@v15/icons/perplexity.svg (transparent)",
    note: "Search-grounded chat models, OpenAI-compatible.",
  },
  {
    id: "cohere",
    label: "Cohere",
    kind: "cloud",
    baseUrl: "https://api.cohere.com/v2",
    endpoints: {
      chat: "https://api.cohere.com/v2/chat",
      models: "https://api.cohere.com/v2/models",
    },
    envKey: "COHERE_API_KEY",
    docs: "https://docs.cohere.com",
    logo: "assets/providers/cohere.svg",
    logoSource: "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cohere.svg (transparent)",
    note: "Command R/R+ family, RAG-oriented.",
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** IDs only, for validation / tool descriptions. */
export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);
