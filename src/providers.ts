/**
 * Provider catalog for opencode-mcp.
 *
 * Every entry was verified against the provider's official docs on 2026-10-04
 * (see `docs` + `sources`). Logos are transparent-background SVGs stored in
 * `assets/providers/` so the WebUI works offline.
 *
 * The catalog is intentionally limited to: OpenCode Go, OpenCode Zen,
 * OpenRouter and OpenAI-Compatible (custom).
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
    envKey: "OPENCODE_GO_API_KEY",
    envAliases: ["OPENCODE_API_KEY"],
    docs: "https://opencode.ai/v2/docs/console/go",
    logo: "assets/providers/opencode-go.svg",
    logoSource: "lobe-icons opencode mark (transparent); official brand: https://opencode.ai/brand",
    note:
      "Go ($10/mo) or Go Plus ($40/mo) via OpenCode Console; /connect in the TUI. " +
      "OpenAI-compatible at zen/go/v1. Model id opencode-go/<slug>. " +
      "Send x-opencode-session per conversation (see Go docs).",
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
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** IDs only, for validation / tool descriptions. */
export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);
