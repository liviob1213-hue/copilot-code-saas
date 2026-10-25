// ============================================================================
// servicos-externos.js — quando o projeto criado precisa de uma IA de fora
// ----------------------------------------------------------------------------
// Um "gerador de vídeo" publicado sem chave é um app que abre bonito e não faz
// nada. A pessoa não descobre o porquê sozinha, e desiste achando que a
// ferramenta é ruim. Este arquivo é o que permite o app CONDUZIR ela:
//
//   1. percebe que o projeto precisa de IA de fora (vídeo, imagem, voz…);
//   2. pergunta QUAL serviço ela quer usar;
//   3. diz onde pegar a chave e qual o nome da variável;
//   4. guarda a chave NO SERVIDOR quando ela cola.
//
// ----------------------------------------------------------------------------
// POR QUE A CHAVE NÃO PODE IR PRO NAVEGADOR
//
// Tudo que começa com VITE_ é assado dentro do site e fica legível para
// QUALQUER visitante — basta abrir o código-fonte da página. Uma chave da
// OpenAI ou da Replicate exposta assim é dinheiro do cliente indo embora.
//
// Chave de mapa é exceção conhecida: ela é feita para o navegador e se protege
// por domínio autorizado. Por isso o campo `noNavegador` existe aqui.
//
// As demais vão para os SEGREDOS do Supabase e são usadas por uma Edge
// Function — que é como este projeto já faz lógica de servidor.
// ============================================================================

/**
 * Serviços GRATUITOS que não pedem chave. Se o projeto usa um destes, está
 * resolvido — não existe nada a perguntar.
 *
 * O pollinations entra aqui porque o próprio gerador o usa para as imagens de
 * exemplo. Foi ele que causou o primeiro defeito desta funcionalidade: o
 * padrão de imagem incluía a palavra "flux" (o modelo que o pollinations usa),
 * então TODO projeto com imagem de exemplo passava a pedir uma chave de IA que
 * nunca foi necessária.
 */
const SEM_CHAVE = /pollinations\.ai|unsplash\.com|picsum\.photos|placehold|via\.placeholder/i;

/**
 * O que o projeto precisa saber fazer, e com quem.
 *
 * `padrao` olha CHAMADA DE API DE VERDADE (endereço do serviço ou nome da
 * variável de chave), e nunca palavra solta em português. Comentário e texto
 * de tela falam de "gerar imagem" o tempo todo sem que isso signifique nada —
 * foi assim que a primeira versão passou a interromper quem só queria um link
 * na bio.
 */
export const CAPACIDADES = [
  {
    id: "video",
    titulo: "gerar vídeo com IA",
    padrao: /api\.replicate\.com|fal\.run|api\.runwayml\.com|api\.lumalabs\.ai|REPLICATE_API_TOKEN|FAL_KEY/i,
    opcoes: [
      {
        id: "replicate", label: "Replicate",
        segredo: "REPLICATE_API_TOKEN", prefixo: "r8_",
        onde: "https://replicate.com/account/api-tokens",
        resumo: "vários modelos de vídeo num lugar só; paga por uso"
      },
      {
        id: "fal", label: "fal.ai",
        segredo: "FAL_KEY", prefixo: "",
        onde: "https://fal.ai/dashboard/keys",
        resumo: "rápido e barato; bom para teste"
      }
    ]
  },
  {
    id: "imagem",
    titulo: "gerar imagem com IA",
    padrao: /api\.openai\.com\/v1\/images|api\.stability\.ai|api\.replicate\.com|fal\.run|STABILITY_API_KEY/i,
    opcoes: [
      {
        id: "openai", label: "OpenAI",
        segredo: "OPENAI_API_KEY", prefixo: "sk-",
        onde: "https://platform.openai.com/api-keys",
        resumo: "a mais conhecida; resultado consistente"
      },
      {
        id: "replicate", label: "Replicate",
        segredo: "REPLICATE_API_TOKEN", prefixo: "r8_",
        onde: "https://replicate.com/account/api-tokens",
        resumo: "muitos modelos abertos; costuma sair mais barato"
      },
      {
        id: "fal", label: "fal.ai",
        segredo: "FAL_KEY", prefixo: "",
        onde: "https://fal.ai/dashboard/keys",
        resumo: "muito rápido, bom para galeria e rascunho"
      }
    ]
  },
  {
    id: "voz",
    titulo: "gerar voz ou narração",
    padrao: /api\.elevenlabs\.io|api\.openai\.com\/v1\/audio|ELEVENLABS_API_KEY/i,
    opcoes: [
      {
        id: "elevenlabs", label: "ElevenLabs",
        segredo: "ELEVENLABS_API_KEY", prefixo: "",
        onde: "https://elevenlabs.io/app/settings/api-keys",
        resumo: "a melhor voz em português"
      },
      {
        id: "openai", label: "OpenAI",
        segredo: "OPENAI_API_KEY", prefixo: "sk-",
        onde: "https://platform.openai.com/api-keys",
        resumo: "mais barata; já serve se você usa OpenAI pra outra coisa"
      }
    ]
  },
  {
    id: "texto",
    titulo: "escrever ou responder com IA",
    padrao: /api\.openai\.com\/v1\/chat|api\.anthropic\.com|generativelanguage\.googleapis\.com|OPENAI_API_KEY|ANTHROPIC_API_KEY/i,
    opcoes: [
      {
        id: "openai", label: "OpenAI",
        segredo: "OPENAI_API_KEY", prefixo: "sk-",
        onde: "https://platform.openai.com/api-keys",
        resumo: "padrão de mercado"
      },
      {
        id: "gemini", label: "Google Gemini",
        segredo: "GEMINI_API_KEY", prefixo: "AIza",
        onde: "https://aistudio.google.com/apikey",
        resumo: "tem camada gratuita"
      },
      {
        id: "anthropic", label: "Claude (Anthropic)",
        segredo: "ANTHROPIC_API_KEY", prefixo: "sk-ant-",
        onde: "https://console.anthropic.com/settings/keys",
        resumo: "forte em texto longo e código"
      }
    ]
  },
  {
    id: "mapa",
    titulo: "mostrar mapa",
    // Mapa é a exceção: a chave é feita para o navegador e se protege por
    // domínio autorizado, então vai para o app mesmo (VITE_).
    noNavegador: true,
    padrao: /mapboxgl|api\.mapbox\.com|maps\.googleapis\.com|VITE_GOOGLE_MAPS_API_KEY|VITE_MAPBOX_TOKEN/i,
    opcoes: [
      {
        id: "gmaps", label: "Google Maps",
        segredo: "GOOGLE_MAPS_API_KEY", envFront: "VITE_GOOGLE_MAPS_API_KEY",
        prefixo: "AIza", onde: "https://console.cloud.google.com/google/maps-apis/credentials",
        resumo: "o mapa que todo mundo reconhece"
      },
      {
        id: "mapbox", label: "Mapbox",
        segredo: "MAPBOX_TOKEN", envFront: "VITE_MAPBOX_TOKEN",
        prefixo: "pk.", onde: "https://account.mapbox.com/access-tokens/",
        resumo: "visual mais bonito, camada gratuita maior"
      }
    ]
  }
];

/** Acha a capacidade pelo id. */
export function capacidadePorId(id) {
  return CAPACIDADES.find((c) => c.id === id) || null;
}

/** Acha a opção dentro de uma capacidade. */
export function opcaoPorId(capacidadeId, opcaoId) {
  const c = capacidadePorId(capacidadeId);
  return c ? (c.opcoes.find((o) => o.id === opcaoId) || null) : null;
}

/**
 * O que este projeto precisa de fora?
 *
 * Olha o código gerado e devolve a PRIMEIRA capacidade que aparece sem chave
 * configurada. Uma de cada vez, de propósito: perguntar três coisas juntas
 * trava quem não é técnico.
 */
export function detectarCapacidade(files, jaResolvidas = []) {
  const codigo = Object.values(files || {}).join("\n");
  if (!codigo.trim()) return null;

  // Usa servico gratuito (pollinations, unsplash…)? Entao nao ha chave a pedir.
  const soGratis = SEM_CHAVE.test(codigo);

  for (const cap of CAPACIDADES) {
    if (jaResolvidas.includes(cap.id)) continue;
    // O MESMO servico atende mais de uma capacidade (a Replicate faz video e
    // imagem). Se a chave dele ja foi dada, nao ha o que perguntar de novo —
    // senao a pessoa e interrompida duas vezes pela mesma chave.
    if (cap.opcoes.some((o) => jaResolvidas.includes(o.segredo))) continue;
    if (cap.id === "imagem" && soGratis) continue;
    if (!cap.padrao.test(codigo)) continue;

    // Já tem chave de verdade no código? Então não precisa perguntar nada.
    const jaTem = cap.opcoes.some((o) => {
      if (!o.prefixo) return false;
      const esc = o.prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(esc + "[A-Za-z0-9_\\-]{12,}").test(codigo);
    });
    if (jaTem) continue;

    return cap;
  }
  return null;
}

/** A pergunta que o chat faz, já numerada pra pessoa só responder "1". */
export function perguntaDeEscolha(cap) {
  const linhas = cap.opcoes.map((o, i) => `**${i + 1}. ${o.label}** — ${o.resumo}`);
  return [
    `Esse projeto precisa de uma IA de fora pra **${cap.titulo}**. Sem ela, o app abre mas não gera nada.`,
    "",
    "Qual você quer usar?",
    "",
    ...linhas,
    "",
    'Responda só o número (ex.: **1**). Se não souber qual, escolha a **1** — dá pra trocar depois.'
  ].join("\n");
}

/** Interpreta "1", "replicate", "a primeira"… e devolve a opção escolhida. */
export function lerEscolha(cap, texto) {
  const t = String(texto || "").trim().toLowerCase();
  if (!t) return null;

  // Nome do serviço dito por extenso sempre vale ("quero replicate").
  for (const o of cap.opcoes) {
    if (t.includes(o.id) || t.includes(o.label.toLowerCase())) return o;
  }

  // NÚMERO SÓ CONTA SE ESTIVER SOZINHO, ou acompanhado de palavra de escolha.
  //
  // Aceitar qualquer dígito solto no texto parecia esperto e era uma armadilha:
  // "muda a cor do botão 2" e "põe 1 banner no topo" viravam escolha de
  // fornecedor, e a pessoa era levada a colar uma chave que nunca pediu.
  const soNumero = t.match(/^([1-9])\s*[.)]?$/);
  const comPalavra = t.match(
    /^(?:a|o|op[çc][ãa]o|numero|n[úu]mero|item|quero(?:\s+(?:a|o|op[çc][ãa]o))?)\s*([1-9])\s*[.)]?$/
  );
  const n = soNumero || comPalavra;
  if (n) {
    const i = Number(n[1]) - 1;
    if (cap.opcoes[i]) return cap.opcoes[i];
  }

  // "a primeira", "segunda"… só quando é a frase inteira, pela mesma razão.
  if (/^(?:a\s+)?primeir[ao]$/.test(t)) return cap.opcoes[0] || null;
  if (/^(?:a\s+)?segund[ao]$/.test(t)) return cap.opcoes[1] || null;
  if (/^(?:a\s+)?terceir[ao]$/.test(t)) return cap.opcoes[2] || null;

  return null;
}

/** O pedido da chave, já dizendo onde pegar e onde ela vai parar. */
export function pedidoDaChave(cap, opcao) {
  const ondeFica = cap.noNavegador
    ? `Ela vai no app, na variável \`${opcao.envFront}\` — chave de mapa é feita pra isso e se protege pelo domínio autorizado.`
    : `Ela vai ficar **guardada no servidor** (nos segredos do seu Supabase), nunca dentro do site. Chave de IA no navegador fica visível pra qualquer visitante — e aí é a sua conta que paga.`;

  return [
    `Boa, vamos de **${opcao.label}**.`,
    "",
    `Pegue sua chave aqui: ${opcao.onde}`,
    opcao.prefixo ? `Ela começa com \`${opcao.prefixo}\`.` : "",
    "",
    "Cole a chave aqui no chat que eu cuido do resto.",
    ondeFica
  ].filter(Boolean).join("\n");
}
