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
  NVIDIA_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  CEREBRAS_API_KEY: "",
  MISTRAL_API_KEY: "",
  OPENROUTER_API_KEY: "",
  OPENAI_API_KEY: "",

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

export const CATALOG_VERSION = 11;

export const PROVIDER_CATALOG = [
  {
    id: "nvidia",
    contextBudget: 120000,
    vision: true,
    label: "NVIDIA NIM",
    kind: "openai",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    listEndpoint: "https://integrate.api.nvidia.com/v1/models",
    secretKey: "NVIDIA_API_KEY",
    defaultModel: "meta/llama-3.3-70b-instruct",
    models: [
      "meta/llama-3.3-70b-instruct",
      "qwen/qwen3-coder-480b-a35b-instruct",
      "zai-org/glm-4.6",
      "moonshotai/kimi-k2-instruct"
    ],
    note: "Gratis, sem cartao. Se der 404, use buscar modelos e escolha um da lista real. Deixe em primeiro."
  },
  {
    id: "gemini",
    contextBudget: 900000,
    vision: true,
    label: "Google Gemini",
    kind: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    listEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    secretKey: "GEMINI_API_KEY",
    defaultModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash"],
    note: "Contexto enorme, bom para ler projeto inteiro. Sofre com pico de demanda."
  },
  {
    id: "deepseek",
    contextBudget: 120000,
    // DeepSeek NAO tem visao confiavel: o modelo de visao (v4-flash-vision-exp)
    // TRAVA/da timeout. Deixando vision:false, um print roteia automaticamente
    // para um provedor de visao que funciona (Gemini/NVIDIA/OpenRouter/Claude/
    // OpenAI). DeepSeek segue excelente como modelo de CODIGO.
    vision: false,
    label: "DeepSeek",
    kind: "openai",
    endpoint: "https://api.deepseek.com/chat/completions",
    listEndpoint: "https://api.deepseek.com/models",
    secretKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    note: "Forte em codigo. Para imagem, ligue tambem Gemini, NVIDIA, OpenRouter ou Claude. Precisa de credito."
  },
  {
    id: "mistral",
    maxOutput: 16000,
    contextBudget: 100000,
    label: "Mistral",
    kind: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    listEndpoint: "https://api.mistral.ai/v1/models",
    secretKey: "MISTRAL_API_KEY",
    defaultModel: "codestral-latest",
    models: ["codestral-latest", "mistral-large-latest", "devstral-medium-latest"],
    note: "Codestral e devstral sao fortes em edicao de codigo. Ja funcionou bem para voce."
  },
  {
    id: "cerebras",
    maxOutput: 16000,
    contextBudget: 55000,
    label: "Cerebras",
    kind: "openai",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    listEndpoint: "https://api.cerebras.ai/v1/models",
    secretKey: "CEREBRAS_API_KEY",
    defaultModel: "qwen-3-coder-480b",
    models: ["qwen-3-coder-480b", "gpt-oss-120b"],
    note: "Cota diaria de 1M tokens. qwen-3-coder e o modelo de codigo dele."
  },
  {
    id: "openrouter",
    contextBudget: 55000,
    vision: true,
    label: "OpenRouter",
    kind: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    listEndpoint: "https://openrouter.ai/api/v1/models",
    secretKey: "OPENROUTER_API_KEY",
    defaultModel: "qwen/qwen3-coder:free",
    models: [
      "qwen/qwen3-coder:free",
      "deepseek/deepseek-chat-v3.1:free",
      "z-ai/glm-4.5-air:free"
    ],
    note: "Rede de reserva. Use modelos de codigo com sufixo :free."
  },
  {
    id: "anthropic",
    contextBudget: 180000,
    vision: true,
    label: "Claude",
    kind: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    listEndpoint: "https://api.anthropic.com/v1/models",
    secretKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-5",
    models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    note: "Nao tem free tier: e sempre pago. Melhor qualidade de codigo. Use so em tarefa dificil."
  },
  {
    id: "groq",
    maxOutput: 8000,
    contextBudget: 6500,
    label: "Groq",
    kind: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    listEndpoint: "https://api.groq.com/openai/v1/models",
    secretKey: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-120b",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"],
    note: "Rapidissimo, mas so 8 mil tokens/min no gratis — pequeno demais para ler codigo. Fica por ultimo."
  },
  {
    id: "openai",
    contextBudget: 128000,
    vision: true,
    label: "OpenAI",
    kind: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    listEndpoint: "https://api.openai.com/v1/models",
    secretKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini", "gpt-4.1-nano"],
    note: "Sem free tier: sempre pago. gpt-4o forte em codigo e visao. Use gpt-4o para melhor qualidade."
  }
];

export const PROVIDER_PRICES = {
  nvidia:     { in: 0,    out: 0 },
  gemini:     { in: 0.10, out: 0.40 },
  deepseek:   { in: 0.28, out: 1.10 },
  mistral:    { in: 0.20, out: 0.60 },
  cerebras:   { in: 0,    out: 0 },
  openrouter: { in: 0,    out: 0 },
  anthropic:  { in: 3.00, out: 15.00 },
  groq:       { in: 0.15, out: 0.75 },
  openai:     { in: 2.50, out: 10.00 }
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
