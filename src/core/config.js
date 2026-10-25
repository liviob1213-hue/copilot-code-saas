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
  TEAMSOCLO_API_KEY: "",

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
  clientId: "dce24e54-b5b5-4327-a0b8-ba26d0f3d728",
  workerUrl: "https://copilot-oauth.victor-faridoff.workers.dev",
  authorizeUrl: "https://api.supabase.com/v1/oauth/authorize",
  scope: ""
};

// Integracao da Vercel — substitui o token colado a mao por um botao "Conectar".
//
// O "slug" e o que manda aqui: ele monta o endereco por onde a pessoa instala,
// https://vercel.com/integrations/<slug>/new. O clientId fica guardado por
// coerencia com os outros provedores e para o app saber que esta configurado —
// quem de fato o usa e o Worker, na hora de trocar o code pelo token.
//
// O client_secret NAO mora aqui: ele vive so no Worker, como VERCEL_CLIENT_SECRET.
// O que esta neste arquivo vai inteiro para o navegador de quem abre o site.
export const VERCEL_OAUTH = {
  clientId: "oac_FIfOIWmmwB5oKSCnRw8QFPlI",
  workerUrl: "https://copilot-oauth.victor-faridoff.workers.dev",
  slug: "copilot-code"
};

// A versao que aparece na tela, para o usuario. Mude SO AQUI: a barra lateral e
// a tela de login leem desta constante, entao nunca ficam uma diferente da outra.
export const VERSAO = "beta 1.1";

// Suba este numero SEMPRE que mudar modelo/provedor no catalogo: a migracao em
// storage.js so roda quando ele muda, e e ela que troca um modelo salvo que nao
// existe mais (ex.: "claude-sonnet-5" antigo, que fazia a Anthropic dar 400).
export const CATALOG_VERSION = 16;

// tier: "free" entra no rodizio automatico primeiro; "paid" so e usado no
// automatico depois que TODAS as gratis se esgotarem (protege o saldo do cliente).
// keyUrl: link "Obter chave" mostrado no card do provedor.
export const PROVIDER_CATALOG = [
  // ---- GRATIS (rodizio automatico, NESTA ORDEM) ----------------------------
  //
  // A ordem aqui vira a prioridade do rodizio, e ela foi escolhida com motivo:
  //
  //   1. Cerebras  -> roda em hardware proprio e responde MUITO mais rapido.
  //                   No plano gratis velocidade e conversao: quem ve o site
  //                   nascer em 1 minuto fica, quem espera 4 minutos fecha a aba.
  //   2. Mistral   -> o unico que ja gerou site de verdade neste projeto. E a
  //                   rede de seguranca com historico comprovado.
  //   3. OpenRouter-> por ultimo entre os gratis: os modelos ":free" sao fila
  //                   compartilhada do mundo inteiro e vivem devolvendo 503.
  //   4. Gemini / Groq -> reservas extras.
  //
  // As PAGAS entram so depois de todas as gratis (ver tierRank em providers.js).

  // ---- PAGAS (seletor manual; no automatico so entram apos as gratis) ------
  {
    id: "cerebras",
    tier: "free",
    contextBudget: 55000,
    vision: false,
    label: "Cerebras",
    kind: "openai",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    listEndpoint: "https://api.cerebras.ai/v1/models",
    secretKey: "CEREBRAS_API_KEY",
    keyUrl: "https://cloud.cerebras.ai",
    defaultModel: "gpt-oss-120b",
    models: ["gpt-oss-120b", "qwen-3.8-27b"],
    note: "Gratis e MUITO rapida (hardware proprio). Boa primeira escolha."
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
    defaultModel: "cohere/north-mini-code:free",
    models: ["cohere/north-mini-code:free", "nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"],
    note: "Gratis. Os modelos :free mudam de nome; se der 404, clique em Buscar e escolha um da lista."
  },
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
    defaultModel: "gemini-flash-latest",
    models: ["gemini-flash-latest", "gemini-flash-lite-latest"],
    note: "Gratis. Contexto enorme, le o projeto inteiro e enxerga imagem."
  },
  {
    id: "groq",
    tier: "free",
    maxOutput: 8000,
    // Antes era 6500 (teto do TPM antigo) — pequeno demais pra gerar codigo, entao
    // o rodizio SEMPRE pulava o Groq ("pedido grande demais"). Subimos pra ele ao
    // menos ser tentado; se estourar o limite por minuto, o rodizio passa adiante.
    contextBudget: 28000,
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
    // Os IDs da Anthropic sao exatos: "claude-sonnet-5" NAO existe e a API
    // responde 400. Os validos da familia Claude 5 sao os de baixo.
    defaultModel: "claude-sonnet-5-5",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    // Os modelos Claude 5 aceitam ate 128 mil tokens de saida. Pediamos 16 mil:
    // um projeto inteiro nao cabia, a resposta vinha CORTADA e o app gastava
    // rodadas de "continue de onde parou" — a parte lenta e que mais travava a
    // tela. Agora que a Claude transmite ao vivo (streamComplete entende o
    // formato da Anthropic), pedir uma resposta longa nao arrisca mais estourar
    // o tempo da requisicao: cada pedaco que chega ja e sinal de vida.
    maxOutput: 64000,
    note: "Paga. Melhor qualidade de codigo e enxerga imagem."
  },
  {
    id: "deepseek",
    tier: "paid",
    contextBudget: 120000,
    // O DeepSeek SO enxerga imagem no modelo separado abaixo, e ele e lento
    // (ja travou/deu timeout aqui). Por isso fica marcado como visao de ULTIMO
    // RECURSO (visaoLenta): com um print, o rodizio tenta Gemini/Claude antes,
    // e so usa o DeepSeek se nao houver outro. Assim anexar imagem funciona
    // mesmo para quem so tem a chave do DeepSeek, sem atrasar os demais.
    vision: true,
    visaoLenta: true,
    visionModel: "deepseek-v4-flash-vision-exp",
    label: "DeepSeek",
    kind: "openai",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    listEndpoint: "https://api.deepseek.com/v1/models",
    secretKey: "DEEPSEEK_API_KEY",
    keyUrl: "https://platform.deepseek.com",
    defaultModel: "deepseek-v4-pro",
    models: ["deepseek-v4-pro", "deepseek-v4-flash-vision-exp"],
    note: "Paga. Forte em codigo. Enxerga imagem no modelo de visao (mais lento)."
  },
  {
    id: "teamsoclo",
    tier: "paid",
    // A documentacao nao informa janela de contexto nem teto de saida. Comecamos
    // em 32 mil por prudencia (o gateway cobra entrada + saida + raciocinio),
    // mas na pratica a resposta vinha CORTADA o tempo todo — ate tres pedidos de
    // "continue de onde parou" num projeto so, cada um recomecando com o texto
    // inteiro de volta. Cortar e MAIS caro do que pedir uma resposta longa de
    // uma vez, entao 64 mil, igual a Claude direta.
    contextBudget: 120000,
    maxOutput: 64000,
    vision: true,
    label: "TeamSocLo (Claude)",
    // PROTOCOLO DA ANTHROPIC, que e o que a documentacao configura: a pagina
    // manda apontar ANTHROPIC_BASE_URL para https://gpt.teamsoclo.site, ou seja,
    // POST /v1/messages com o corpo da Anthropic. O gateway tambem aceita o
    // formato da OpenAI, mas aqui queremos a API do Claude de verdade.
    kind: "anthropic",
    // A doc usa ANTHROPIC_AUTH_TOKEN (Bearer), nao ANTHROPIC_API_KEY: todos os
    // exemplos, inclusive o do /v1/messages, mandam "Authorization: Bearer".
    // Sem este sinal o adaptador mandaria x-api-key e tomaria 401.
    authBearer: true,
    endpoint: "https://gpt.teamsoclo.site/v1/messages",
    // GET /v1/models com a mesma chave devolve SO os modelos que o pacote dela
    // permite: o botao "buscar modelos" resolve o problema de cada chave ter um
    // pacote diferente (chave GPT nao chama modelo claude e vice-versa).
    listEndpoint: "https://gpt.teamsoclo.site/v1/models",
    secretKey: "TEAMSOCLO_API_KEY",
    keyUrl: "https://redeem.teamsoclo.site",
    defaultModel: "claude-sonnet-5",
    // SO MODELOS CLAUDE. O gateway tambem vende pacotes GPT (gpt-5.6-sol,
    // gpt-astra), mas eles ficam fora da lista de proposito: quem escolhe este
    // provedor aqui quer Claude. Se a chave for de um pacote GPT, o botao
    // "buscar modelos" mostra o que ela permite.
    models: [
      "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5", "claude-sonnet-4-6",
      "claude-haiku-4-5", "claude-fable-5-1", "claude-fable-5"
    ],
    note: "Paga (creditos). Modelos Claude. Clique em buscar modelos: a chave so acessa os do pacote dela."
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
  xai:        { in: 0.20, out: 1.50 },
  // Creditos pre-pagos por CDK, nao dolar por token: nao da para estimar custo aqui.
  teamsoclo:  { in: 0,    out: 0 }
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
