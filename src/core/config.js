// ============================================================================
//  config.js — copia LITERAL do config.js da extensao (e 100% livre de chrome).
//  Mantenha os dois em sincronia. No futuro (monorepo) isto vira packages/core.
//  As constantes de OAuth (clientId/workerUrl) sao as MESMAS; so o mecanismo de
//  redirect muda (web redirect em vez de chrome.identity) — ver core/oauth-web.js.
// ============================================================================

export const SECRETS = {
  GITHUB_TOKEN: "",
  GITHUB_OAUTH_CLIENT_ID: "Ov23liCWvqDjlKLTKN9KD",

  ANTHROPIC_API_KEY: "",
  GEMINI_API_KEY: "",
  GROQ_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  MISTRAL_API_KEY: "",
  OPENROUTER_API_KEY: "",
  XAI_API_KEY: "",

  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  VERCEL_TOKEN: ""
};

export const GITHUB_OAUTH = {
  clientId: "Ov23liBToovJjfxTGpmJ",
  workerUrl: "https://copilot-oauth.victor-faridoff.workers.dev",
  scope: "repo"
};

export const SUPABASE_OAUTH = {
  clientId: "8436c2fb-c2aa-4468-adc0-a01f3193c05b",
  workerUrl: "https://copilot-oauth.victor-faridoff.workers.dev",
  authorizeUrl: "https://api.supabase.com/v1/oauth/authorize",
  scope: ""
};

export const CATALOG_VERSION = 12;

// tier: "free" entra no rodizio automatico primeiro; "paid" so e usado no
// automatico depois que TODAS as gratis se esgotarem (protege o saldo do cliente).
// keyUrl: link "Obter chave" mostrado no card do provedor.
export const PROVIDER_CATALOG = [
  // ---- GRATIS (rodizio automatico, nesta ordem de prioridade) --------------
  {
    id: "gemini",
    tier: "free",
    contextBudget: 900000,
    vision: true,
    label: "Google Gemini",
    kind: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    listEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    secretKey: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash"],
    note: "Gratis. Contexto enorme, le o projeto inteiro e enxerga imagem."
  },
  {
    id: "openrouter",
    tier: "free",
    contextBudget: 55000,
    vision: false,
    label: "OpenRouter",
    kind: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    listEndpoint: "https://openrouter.ai/api/v1/models",
    secretKey: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    defaultModel: "qwen/qwen3-coder:free",
    models: ["qwen/qwen3-coder:free"],
    note: "Gratis. Rede de reserva com modelos de codigo (sufixo :free)."
  },
  {
    id: "mistral",
    tier: "free",
    maxOutput: 16000,
    contextBudget: 100000,
    vision: false,
    label: "Mistral",
    kind: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    listEndpoint: "https://api.mistral.ai/v1/models",
    secretKey: "MISTRAL_API_KEY",
    keyUrl: "https://console.mistral.ai",
    defaultModel: "codestral-latest",
    models: ["codestral-latest"],
    note: "Gratis. Codestral e forte em edicao de codigo."
  },
  {
    id: "groq",
    tier: "free",
    maxOutput: 8000,
    contextBudget: 6500,
    vision: false,
    label: "Groq",
    kind: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    listEndpoint: "https://api.groq.com/openai/v1/models",
    secretKey: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
    defaultModel: "openai/gpt-oss-20b",
    models: ["openai/gpt-oss-20b"],
    note: "Gratis e rapidissimo, mas com limite baixo de tokens/min. Fica por ultimo no rodizio."
  },

  // ---- PAGAS (seletor manual; no automatico so entram apos as gratis) ------
  {
    id: "anthropic",
    tier: "paid",
    contextBudget: 180000,
    vision: true,
    label: "Claude",
    kind: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    listEndpoint: "https://api.anthropic.com/v1/models",
    secretKey: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com",
    defaultModel: "claude-sonnet-5",
    models: ["claude-sonnet-5"],
    note: "Paga. Melhor qualidade de codigo e enxerga imagem."
  },
  {
    id: "deepseek",
    tier: "paid",
    contextBudget: 120000,
    vision: false,
    label: "DeepSeek",
    kind: "openai",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    listEndpoint: "https://api.deepseek.com/v1/models",
    secretKey: "DEEPSEEK_API_KEY",
    keyUrl: "https://platform.deepseek.com",
    defaultModel: "deepseek-v4-pro",
    models: ["deepseek-v4-pro"],
    note: "Paga. Forte em codigo. Para imagem, use Gemini ou Claude."
  },
  {
    id: "xai",
    tier: "paid",
    contextBudget: 120000,
    vision: false,
    label: "xAI Grok",
    kind: "openai",
    endpoint: "https://api.x.ai/v1/chat/completions",
    listEndpoint: "https://api.x.ai/v1/models",
    secretKey: "XAI_API_KEY",
    keyUrl: "https://console.x.ai",
    defaultModel: "grok-code-fast-1",
    models: ["grok-code-fast-1"],
    note: "Paga. Grok focado em codigo, rapido."
  }
];

export const PROVIDER_PRICES = {
  gemini:     { in: 0,    out: 0 },
  openrouter: { in: 0,    out: 0 },
  mistral:    { in: 0,    out: 0 },
  groq:       { in: 0,    out: 0 },
  anthropic:  { in: 3.00, out: 15.00 },
  deepseek:   { in: 0.28, out: 1.10 },
  xai:        { in: 0.20, out: 1.50 }
};

export const COOLDOWN_MS = {
  rate_limit: 60 * 1000,
  quota: 6 * 60 * 60 * 1000,
  auth: 24 * 60 * 60 * 1000,
  server: 30 * 1000
};

export const AGENT_LIMITS = {
  maxSteps: 24,
  maxFileBytes: 120_000,
  maxTreeEntries: 500,
  initialTreeEntries: 180,
  ignorar: /^(node_modules|dist|build|\.git|coverage|\.next)\/|\.(lock|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|mp4|pdf|zip)$|package-lock\.json|bun\.lockb|yarn\.lock/i,
  gerado: /\.gen\.(t|j)sx?$|(^|\/)routeTree\.gen\.|(^|\/)(package-lock\.json|yarn\.lock|bun\.lockb|pnpm-lock\.yaml)$/i
};
