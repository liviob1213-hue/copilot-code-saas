// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
import { PROVIDER_CATALOG, COOLDOWN_MS } from "./config.js";
import * as store from "./storage.js";

/**
 * Formato neutro de conversa usado internamente. E ele que permite trocar de
 * provedor no meio de uma tarefa sem perder o historico:
 *
 *   { role: "user",      text }
 *   { role: "assistant", text, toolCalls: [{ id, name, args }] }
 *   { role: "tool",      toolCallId, name, result }
 */

// --- normalizacao do historico -----------------------------------------------

/**
 * Deixa a conversa num formato que TODO provedor aceita, corrigindo os dois
 * erros classicos de 400:
 *   - "role 'tool' deve responder a um 'tool_calls'" (OpenAI/DeepSeek)
 *   - "tool_result sem tool_use correspondente" (Anthropic)
 *
 * Regras garantidas na saida:
 *   1. Nenhuma resposta de ferramenta solta: toda mensagem 'tool' vem logo
 *      depois do assistant que a chamou, e com id casado.
 *   2. Toda chamada de ferramenta do assistant tem a resposta correspondente
 *      logo em seguida (as sem resposta sao removidas, junto com a mensagem
 *      'tool' orfa) — assim as duas pontas ficam sempre consistentes.
 *   3. A conversa nunca comeca com uma resposta de ferramenta.
 */
export function normalizeConversation(messages) {
  if (!Array.isArray(messages) || !messages.length) return [];
  const out = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (!m) { i++; continue; }

    if (m.role === "assistant" && m.toolCalls?.length) {
      // Junta as respostas de ferramenta que vem imediatamente depois.
      const responses = new Map();
      let j = i + 1;
      while (j < messages.length && messages[j]?.role === "tool") {
        const tm = messages[j];
        if (tm.toolCallId != null && !responses.has(tm.toolCallId)) responses.set(tm.toolCallId, tm);
        j++;
      }
      // Mantem so as chamadas que tem resposta.
      const keptCalls = m.toolCalls.filter(c => c.id != null && responses.has(c.id));
      if (keptCalls.length || (m.text && m.text.trim())) {
        out.push({ ...m, toolCalls: keptCalls });
        for (const c of keptCalls) out.push(responses.get(c.id));
      }
      i = j;
      continue;
    }

    // Resposta de ferramenta sem a chamada logo antes: descarta (orfa).
    if (m.role === "tool") { i++; continue; }

    // Assistant vazio (sem texto e sem chamadas) so atrapalha.
    if (m.role === "assistant" && !(m.text && m.text.trim())) { i++; continue; }

    out.push(m);
    i++;
  }
  return out;
}

// --- conversao para cada dialeto ---------------------------------------------

function toAnthropic(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "user") {
      const content = [];
      for (const img of m.images || []) {
        const [, mediaType, data] = img.match(/^data:(.+?);base64,(.+)$/) || [];
        if (data) content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
      }
      content.push({ type: "text", text: m.text });
      out.push({ role: "user", content });
    } else if (m.role === "assistant") {
      const content = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const c of m.toolCalls || []) {
        content.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      }
      if (content.length) out.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      const block = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: String(m.result)
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && last.content[0]?.type === "tool_result") {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

function toOpenAI(messages, system) {
  // System vazio NAO entra: varios provedores (OpenRouter, etc.) devolvem 400
  // para uma mensagem de sistema com content "" — era o que fazia o health check
  // (que manda um "ping" sem system) reprovar chaves validas.
  const out = (system && system.trim()) ? [{ role: "system", content: system }] : [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.images?.length) {
        const content = m.images.map(url => ({ type: "image_url", image_url: { url } }));
        content.push({ type: "text", text: m.text });
        out.push({ role: "user", content });
      } else {
        out.push({ role: "user", content: m.text });
      }
    } else if (m.role === "assistant") {
      const msg = { role: "assistant", content: m.text || "" };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map(c => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) }
        }));
      }
      out.push(msg);
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: String(m.result)
      });
    }
  }
  return out;
}

function toGemini(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "user") {
      const parts = [];
      for (const img of m.images || []) {
        const [, mimeType, data] = img.match(/^data:(.+?);base64,(.+)$/) || [];
        if (data) parts.push({ inlineData: { mimeType, data } });
      }
      parts.push({ text: m.text });
      out.push({ role: "user", parts });
    } else if (m.role === "assistant") {
      const parts = [];
      if (m.text) parts.push({ text: m.text });
      for (const c of m.toolCalls || []) {
        parts.push({ functionCall: { name: c.name, args: c.args ?? {} } });
      }
      if (parts.length) out.push({ role: "model", parts });
    } else if (m.role === "tool") {
      const part = {
        functionResponse: { name: m.name, response: { result: String(m.result) } }
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && last.parts[0]?.functionResponse) {
        last.parts.push(part);
      } else {
        out.push({ role: "user", parts: [part] });
      }
    }
  }
  return out;
}

// --- montagem da requisicao ---------------------------------------------------

function buildRequest(provider, cfg, apiKey, { system, messages, tools, model }) {
  tools = Array.isArray(tools) ? tools : [];
  model = model || cfg.model || provider.defaultModel;

  if (provider.kind === "anthropic") {
    const msgs = toAnthropic(messages);
    const body = {
      model,
      max_tokens: tools.length ? 8000 : (provider.maxOutput || 32000),
      // O prompt de sistema e igual em todos os ~24 passos do agente. Marcado
      // como cacheavel, a Anthropic cobra 10% dele no reuso (cache de 5 min).
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: msgs
    };
    if (tools.length) {
      body.tools = tools.map(t => ({
        name: t.name, description: t.description, input_schema: t.parameters
      }));
      // Fecha o bloco estatico system+ferramentas no cache.
      body.tools[body.tools.length - 1].cache_control = { type: "ephemeral" };
    }
    // Cacheia tambem o historico ate aqui: a cada passo o prefixo cresce e se
    // repete, entao marcamos o ultimo bloco para o proximo passo reaproveitar.
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && Array.isArray(lastMsg.content) && lastMsg.content.length) {
      const lastBlock = lastMsg.content[lastMsg.content.length - 1];
      if (lastBlock && typeof lastBlock === "object") {
        lastBlock.cache_control = { type: "ephemeral" };
      }
    }
    return {
      url: provider.endpoint,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body
    };
  }

  if (provider.kind === "gemini") {
    return {
      url: `${provider.endpoint}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { "content-type": "application/json" },
      body: {
        // systemInstruction vazio tambem faz o Gemini responder 400 — so inclui
        // quando ha texto (ex.: no ping do health check o system vem vazio).
        ...(system && system.trim() ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: toGemini(messages),
        ...(tools.length ? { tools: [{
          functionDeclarations: tools.map(t => ({
            name: t.name, description: t.description, parameters: t.parameters
          }))
        }] } : {}),
        generationConfig: { temperature: 0.2, maxOutputTokens: tools.length ? 8000 : (provider.maxOutput || 32000) }
      }
    };
  }

  // openai-compativel: openai, groq, cerebras, mistral, openrouter, deepseek
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  };
  // OBS: NAO enviar headers X-Title / HTTP-Referer no OpenRouter. Eles sao so
  // atribuicao (opcional) e, como a chamada passa pelo Worker /proxy, o header
  // custom "x-title" faz o preflight CORS falhar ("not allowed by
  // Access-Control-Allow-Headers"). Sem eles, so vao content-type e authorization,
  // que o proxy ja libera.
  // Modelos de raciocinio (o1..o9, gpt-5*) nao aceitam temperature e usam
  // max_completion_tokens no lugar de max_tokens.
  const isReasoning = /^o[1-9]|^gpt-5/i.test(model);
  const tempObj = isReasoning ? {} : { temperature: 0.2 };
  // Limite de SAIDA. Em chamadas com ferramenta, respeita o teto real do
  // provedor (maxOutput) — 8000 so quando ele nao informou —, senao a IA nao
  // consegue reescrever arquivos maiores e a resposta vem cortada/vazia.
  const limiteSaida = tools.length ? (isReasoning ? 16000 : (provider.maxOutput || 8000)) : (provider.maxOutput || 32000);
  // A OpenAI aceita max_completion_tokens; os demais usam max_tokens.
  const tokenLimit = provider.id === "openai"
    ? { max_completion_tokens: limiteSaida }
    : { max_tokens: limiteSaida };

  return {
    url: provider.endpoint,
    headers,
    body: {
      model,
      ...tempObj,
      ...tokenLimit,
      messages: toOpenAI(messages, system),
      ...(tools.length ? {
        tools: tools.map(t => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters }
        })),
        tool_choice: "auto"
      } : {})
    }
  };
}

// --- leitura da resposta ------------------------------------------------------

function parseResponse(provider, json) {
  if (provider.kind === "anthropic") {
    const text = (json.content || [])
      .filter(b => b.type === "text").map(b => b.text).join("\n");
    const toolCalls = (json.content || [])
      .filter(b => b.type === "tool_use")
      .map(b => ({ id: b.id, name: b.name, args: b.input || {} }));
    return {
      text, toolCalls,
      usage: {
        in: json.usage?.input_tokens || 0,
        out: json.usage?.output_tokens || 0,
        total: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0)
      }
    };
  }

  if (provider.kind === "gemini") {
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p => p.text).map(p => p.text).join("\n");
    const toolCalls = parts.filter(p => p.functionCall).map((p, i) => ({
      id: `gem_${Date.now()}_${i}`,
      name: p.functionCall.name,
      args: p.functionCall.args || {}
    }));
    const u = json.usageMetadata || {};
    return {
      text, toolCalls,
      usage: {
        in: u.promptTokenCount || 0,
        out: u.candidatesTokenCount || 0,
        total: u.totalTokenCount || 0
      }
    };
  }

  // OpenAI Chat Completions (openai, groq, cerebras, mistral, openrouter, deepseek)
  const msg = json.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map(c => {
    let args = {};
    try { args = JSON.parse(c.function?.arguments || "{}"); } catch { args = {}; }
    return { id: c.id, name: c.function?.name, args };
  });
  return {
    text: msg.content || "",
    toolCalls,
    usage: {
      in: json.usage?.prompt_tokens || 0,
      out: json.usage?.completion_tokens || 0,
      total: json.usage?.total_tokens || 0
    }
  };
}

// --- classificacao de falha ---------------------------------------------------

function classify(status, bodyText) {
  const t = (bodyText || "").toLowerCase();
  // Limite POR MINUTO (TPM/RPM) — e transitorio (a conta e de tier baixo), NAO um
  // limite de contexto. Precisa vir ANTES do "too large", porque o erro de TPM da
  // OpenAI tambem diz "request too large". Se tratassemos como "size", a extensao
  // aprenderia um teto minusculo e travaria o provedor para sempre.
  if (t.includes("per min") || t.includes("tokens per min") || t.includes("(tpm)") ||
      t.includes("requests per min") || t.includes("(rpm)") || t.includes("rate limit")) {
    if (t.includes("per day") || t.includes("quota")) return "quota";
    return "rate_limit";
  }
  if (status === 413 || t.includes("too large") || t.includes("context length") ||
      t.includes("maximum context")) {
    return "size";
  }
  if (status === 404 || t.includes("does not exist") || t.includes("is not found") ||
      t.includes("decommissioned") || t.includes("model_not_found")) {
    return "model";
  }
  if (status === 400 && (t.includes("multiturn") || t.includes("not enabled") ||
      t.includes("not supported"))) {
    return "model";
  }
  if (status === 401 || status === 403) {
    if (t.includes("quota") || t.includes("exceeded")) return "quota";
    return "auth";
  }
  if (status === 429) {
    if (t.includes("quota") || t.includes("daily") || t.includes("per day")) return "quota";
    return "rate_limit";
  }
  if (status === 402 || t.includes("insufficient") || t.includes("credit balance")) return "quota";
  if (status >= 500) return "server";
  return "fatal";
}

/** Puxa o texto do erro de dentro do JSON, qualquer que seja o formato do servico. */
function errorDetail(bodyText) {
  try {
    const j = JSON.parse(bodyText);
    const m = j.error?.message || j.error?.code || j.message || j.detail;
    if (m) return String(m).replace(/\s+/g, " ").slice(0, 220);
  } catch {}
  return (bodyText || "").replace(/\s+/g, " ").slice(0, 220);
}

const REASON_LABEL = {
  rate_limit: "limite por minuto atingido",
  quota: "cota acabou",
  auth: "chave recusada",
  server: "instabilidade do provedor",
  model: "esse modelo nao aceita este tipo de conversa ou nao existe mais",
  size: "o pedido passou do limite de tamanho deste servico",
  fatal: "erro na requisicao"
};

// --- orcamento de contexto ----------------------------------------------------

/**
 * Estimativa de tamanho. Usamos ~3 caracteres por token, nao 4: codigo,
 * JSON e nomes de arquivo tem muita pontuacao e quebram em mais tokens que
 * texto corrido. Errar para baixo aqui significa levar 413 do servico.
 */
function estimateTokens(system, messages, tools) {
  let chars = (system || "").length + JSON.stringify(tools || []).length;
  for (const m of messages) {
    chars += (m.text || "").length + String(m.result || "").length;
    chars += JSON.stringify(m.toolCalls || []).length;
  }
  return Math.ceil(chars / 3);
}

/** Le o limite real que o servico informou no erro, para aprender com ele. */
function limiteInformado(bodyText) {
  const m = (bodyText || "").match(/limit[:\s]+(\d{3,7})/i);
  return m ? Number(m[1]) : null;
}

/**
 * Encolhe o historico para caber no orcamento do servico, cortando os
 * resultados de ferramenta mais antigos primeiro. Os ultimos passos e as
 * mensagens da pessoa ficam intactos, porque sao o que a IA precisa agora.
 */
function compact(messages, budgetTokens, system, tools) {
  const clone = messages.map(m => ({ ...m }));
  const indicesDeFerramenta = clone
    .map((m, i) => (m.role === "tool" ? i : -1))
    .filter(i => i >= 0);

  // Preserva os dois ultimos resultados: sao o contexto imediato do raciocinio.
  const cortaveis = indicesDeFerramenta.slice(0, -2);

  for (const i of cortaveis) {
    if (estimateTokens(system, clone, tools) <= budgetTokens) break;
    let original = String(clone[i].result || "");
    while (original.length > 400 && estimateTokens(system, clone, tools) > budgetTokens) {
      const nextLength = Math.max(400, Math.floor(original.length * 0.6));
      original = original.slice(0, nextLength);
      clone[i].result =
        original +
        `\n\n[... resultado de ${clone[i].name} encurtado para caber no limite deste servico. Se precisar do conteudo completo, chame a ferramenta de novo.]`;
    }
  }

  return { messages: clone, tokens: estimateTokens(system, clone, tools) };
}

export async function resolveQueue() {
  const cfgs = await store.get("providers");
  const secrets = await store.get("secrets");
  const runtime = await store.get("runtime");
  const limites = await store.get("limites");
  const now = Date.now();

  return cfgs
    .map(cfg => {
      const provider = PROVIDER_CATALOG.find(p => p.id === cfg.id);
      if (!provider) return null;
      const apiKey = (secrets[provider.secretKey] || "").trim();
      const rt = runtime[cfg.id] || {};
      return {
        provider, cfg, apiKey,
        limiteAprendido: limites[cfg.id] || null,
        hasKey: Boolean(apiKey),
        cooling: (rt.cooldownUntil || 0) > now,
        cooldownUntil: rt.cooldownUntil || 0,
        lastError: rt.lastError || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.cfg.priority - b.cfg.priority);
}

/**
 * Pergunta ao proprio servico quais modelos existem hoje, usando a sua chave.
 * E o antidoto para nome de modelo desatualizado: catalogos mudam sem aviso e
 * a resposta a um modelo aposentado e sempre 404.
 */
export async function listModels(providerId) {
  const provider = PROVIDER_CATALOG.find(p => p.id === providerId);
  if (!provider?.listEndpoint) throw new Error("Servico sem lista de modelos.");

  const secrets = await store.get("secrets");
  const apiKey = (secrets[provider.secretKey] || "").trim();
  if (!apiKey) throw new Error("Cole a chave deste servico antes de buscar os modelos.");

  let url = provider.listEndpoint;
  const headers = { accept: "application/json" };

  if (provider.kind === "gemini") {
    url += `?key=${encodeURIComponent(apiKey)}&pageSize=200`;
  } else if (provider.kind === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  const res = await fetch(url, { headers, signal: ctrl.signal });
  clearTimeout(timer);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${errorDetail(text)}`);

  const json = JSON.parse(text);
  let ids = [];

  if (provider.kind === "gemini") {
    ids = (json.models || [])
      // So interessam os que sabem gerar conteudo; ha modelos de embedding na lista.
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => (m.name || "").replace(/^models\//, ""));
  } else {
    ids = (json.data || json.models || []).map(m => m.id || m.name).filter(Boolean);
  }

  // Fora o que nao serve para conversa com ferramentas: audio, imagem, embedding,
  // e tambem os de preview/experimental, que costumam recusar multiplos turnos.
  // Tambem excluimos modelos antigos como codex que foram depreciados.
  ids = ids.filter(id =>
    !/whisper|tts|embed|guard|vision-only|image|veo|imagen|aqa|antigravity|learnlm/i.test(id) &&
    !/preview|experimental|-exp\b|-exp-/i.test(id) &&
    !/codex|code-davinci|code-cushman|text-davinci|babbage|davinci-\d|ft:\/|:\/ft\//i.test(id)
  );

  // Os estaveis de uso geral primeiro, para o padrao escolhido ser um bom padrao.
  const rank = id => {
    if (/flash|sonnet|instant|small/i.test(id)) return 0;
    if (/pro|large|opus|coder|codestral/i.test(id)) return 1;
    return 2;
  };
  ids.sort((a, b) => rank(a) - rank(b));

  if (provider.id === "openrouter") {
    // Sem o sufixo :free o OpenRouter cobra. Deixa os gratuitos na frente.
    ids.sort((a, b) => (b.endsWith(":free") ? 1 : 0) - (a.endsWith(":free") ? 1 : 0));
  }

  return [...new Set(ids)].slice(0, 120);
}

export async function statusReport() {
  const queue = await resolveQueue();
  return queue.map(q => ({
    id: q.provider.id,
    label: q.provider.label,
    model: q.cfg.model || q.provider.defaultModel,
    enabled: q.cfg.enabled,
    hasKey: q.hasKey,
    cooling: q.cooling,
    cooldownUntil: q.cooldownUntil,
    lastError: q.lastError,
    ready: q.cfg.enabled && q.hasKey && !q.cooling
  }));
}

/**
 * HEALTH CHECK — testa se uma chave+modelo realmente responde, com um "ping"
 * minimo (max_tokens=5). Classifica o resultado para a UI poder liberar so os
 * modelos que funcionam, sem a pessoa testar um por um.
 *   ok    = respondeu (200) OU 429/cota (a chave vale, so esta limitada agora)
 *   fail  = 401/403 (chave invalida/sem acesso) ou 404 (modelo nao existe)
 *   retry = timeout ou 5xx (instavel agora; vale testar de novo)
 */
export async function pingModel(providerId, model) {
  const provider = PROVIDER_CATALOG.find(p => p.id === providerId);
  if (!provider) return { status: "fail", detail: "provedor desconhecido" };
  const secrets = await store.get("secrets");
  const apiKey = (secrets[provider.secretKey] || "").trim();
  if (!apiKey) return { status: "fail", detail: "sem chave" };

  const req = buildRequest({ ...provider, maxOutput: 5 }, { model }, apiKey, {
    system: "", messages: [{ role: "user", text: "ping" }], tools: [], model
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(req.url, {
      method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) return { status: "ok" };
    const body = await res.text();
    const reason = classify(res.status, body);
    if (reason === "rate_limit" || reason === "quota") return { status: "ok", detail: "chave ok (limitada agora)" };
    if (reason === "auth")  return { status: "fail", detail: "chave invalida ou sem acesso" };
    if (reason === "model") return { status: "fail", detail: "modelo indisponivel" };
    if (reason === "server") return { status: "retry", detail: "instavel agora" };
    return { status: "fail", detail: errorDetail(body) || `erro ${res.status}` };
  } catch (e) {
    clearTimeout(timeout);
    return { status: "retry", detail: e.name === "AbortError" ? "timeout" : "rede indisponivel" };
  }
}

/** Testa EM PARALELO todos os modelos de um provedor e grava o resultado. */
export async function healthCheck(providerId) {
  const provider = PROVIDER_CATALOG.find(p => p.id === providerId);
  if (!provider) return {};
  const models = (provider.models?.length ? provider.models : [provider.defaultModel]);
  const pares = await Promise.all(models.map(async m => [m, { ...(await pingModel(providerId, m)), at: Date.now() }]));
  const mapa = Object.fromEntries(pares);
  const health = await store.get("modelHealth");
  health[providerId] = mapa;
  await store.set("modelHealth", health);
  return mapa;
}

// Grátis (0) sempre antes de paga (1). É o que impede o automático de gastar o
// saldo do cliente enquanto houver uma API gratuita disponível na fila.
function tierRank(provider) { return provider.tier === "paid" ? 1 : 0; }

// Quando uma geração troca de provedor no meio (o anterior estourou o limite),
// o próximo recebe o histórico inteiro e esta instrução: continue de onde parou.
const NOTA_CONTINUIDADE =
  "\n\nCONTINUIDADE: outra IA comecou esta tarefa e parou por limite/erro. " +
  "Use o historico acima, continue de onde parou SEM recomecar nem repetir o que ja foi feito, e conclua.";

/**
 * Pede uma resposta ao primeiro provedor disponivel. Se ele recusar por cota,
 * limite ou instabilidade, passa para o proximo da fila automaticamente.
 * onEvent recebe avisos de troca para a interface mostrar em tempo real.
 */
export async function complete({ system, messages, tools, preferredProviderId = "" }, onEvent = () => {}) {
  tools = Array.isArray(tools) ? tools : [];
  // Blindagem final: nao importa como o historico chegou, o que vai para a API
  // sempre tem chamadas e respostas de ferramenta casadas. Evita os 400 de
  // "tool sem tool_calls" e "tool_result sem tool_use".
  messages = normalizeConversation(messages);
  const queue = await resolveQueue();   // ja ordenado por prioridade (gratis < pagas)

  // MANUAL (a pessoa escolheu um provedor no seletor) = so aquele, SEM rodizio.
  // AUTOMATICO = todas as ativas, as GRATIS antes das PAGAS. Regra critica: nunca
  // gastar uma API paga enquanto houver uma gratis disponivel na fila.
  let usable;
  if (preferredProviderId) {
    usable = queue.filter(q => q.provider.id === preferredProviderId && q.cfg.enabled && q.hasKey);
    if (!usable.length) {
      throw new Error("O provedor escolhido (modo manual) nao esta ativo ou esta sem chave. Escolha outro no seletor ou volte para Automatico.");
    }
  } else {
    usable = queue
      .filter(q => q.cfg.enabled && q.hasKey)
      .sort((a, b) => tierRank(a.provider) - tierRank(b.provider) || a.cfg.priority - b.cfg.priority);
  }

  // Se a conversa tem imagem, so provedores que enxergam imagem servem.
  const temImagem = messages.some(m => m.images?.length);
  if (temImagem) {
    const comVisao = usable.filter(q => q.provider.vision);
    if (!comVisao.length) {
      throw new Error(
        "Voce anexou uma imagem, mas nenhum provedor com visao esta ativo. Ligue e coloque a chave do Gemini ou do Claude (os que enxergam imagem)."
      );
    }
    usable = comVisao;
    onEvent({ type: "vision_note", provedores: comVisao.map(q => q.provider.label) });
  }

  if (!usable.length) {
    throw new Error(
      "Nenhuma API de IA ativa. Abra Conexoes e ligue ao menos uma (comece pelas gratis: Gemini, OpenRouter, Mistral, Groq)."
    );
  }

  const skipped = usable.filter(q => q.cooling);
  let attempts = usable.filter(q => !q.cooling);
  // Se todos estiverem descansando, tenta o que sai do descanso mais cedo.
  if (!attempts.length) {
    attempts = [skipped.sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0]];
  }

  const errors = [];
  let houveTransitorio = false;   // 429, 503 e rede: vale esperar e insistir
  let houvePermanente = false;    // chave ou modelo errado: insistir nao resolve
  let jaTentou = 0;               // quantos provedores ja tentaram antes deste

  for (const entry of attempts) {
    const { provider, cfg, apiKey } = entry;
    let model = cfg.model || provider.defaultModel;
    // A partir do 2o provedor, pede para CONTINUAR a tarefa (nao recomecar).
    const systemUsado = jaTentou === 0 ? system : system + NOTA_CONTINUIDADE;
    jaTentou++;

    // Alguns servicos tem um modelo separado que enxerga imagem (o DeepSeek e
    // assim). Se o pedido tem imagem e o modelo escolhido nao le, trocamos so
    // nesta chamada, sem alterar a preferencia da pessoa.
    if (temImagem && provider.visionModel && model !== provider.visionModel) {
      model = provider.visionModel;
      onEvent({ type: "modelo_visao", provider: provider.label, model });
    }

    // Se o servico ja nos disse o limite real dele num 413 anterior, esse valor
    // vale mais que o do catalogo. Guardamos 85% como margem, porque a nossa
    // contagem de tokens e aproximada.
    // Um "limite aprendido" muito baixo (< 16k) quase sempre veio de um erro de
    // TPM (tokens por minuto), nao do tamanho real do contexto — nesse caso
    // ignoramos e usamos o do catalogo, senao o provedor fica travado num teto
    // minusculo para sempre.
    const aprendido = entry.limiteAprendido;
    const orcamento = (aprendido && aprendido >= 16000)
      ? Math.floor(aprendido * 0.85)
      : (provider.contextBudget || 60000);

    // Compacta o historico para o limite deste servico. Se nem assim couber,
    // pula sem marcar falha: o servico nao esta com problema, o pedido e que
    // e grande demais para ele.
    const { messages: msgs, tokens } = compact(messages, orcamento, systemUsado, tools);
    if (tokens > orcamento) {
      errors.push(`${provider.label}: pedido de ~${tokens} tokens, limite ${orcamento}`);
      onEvent({
        type: "provider_skip", provider: provider.label,
        reason: `pedido grande demais (~${tokens} tokens, cabe ${orcamento})`
      });
      continue;
    }

    onEvent({ type: "provider_try", provider: provider.label, model });

    // Modelos de raciocinio da OpenAI (gpt-5, o-series) "pensam" bastante e
    // geram devagar; damos ate 6 min. Os demais provedores, 90s.
    const ehRaciocinioOpenAI = provider.id === "openai" && /^o[1-9]|^gpt-5/i.test(model);
    // DeepSeek gera devagar e, no SaaS, ainda passa pela ponte (Worker) — um
    // projeto inteiro estoura os 90s. Damos mais fôlego a ele.
    const timeoutMs = provider.id === "openai"
      ? (ehRaciocinioOpenAI ? 360_000 : 240_000)
      : (provider.id === "deepseek" ? 180_000 : 90_000);
    let res, bodyText;
    try {
      const req = buildRequest(provider, cfg, apiKey, { system: systemUsado, messages: msgs, tools, model });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: controller.signal
      });
      clearTimeout(timeout);
      bodyText = await res.text();
    } catch (networkError) {
      houveTransitorio = true;
      const msg = networkError.name === "AbortError"
        ? `timeout: a API nao respondeu em ${Math.round(timeoutMs / 1000)}s`
        : "rede indisponivel";
      await store.markProviderFailure(provider.id, msg, COOLDOWN_MS.server);
      errors.push(`${provider.label}: ${msg}`);
      onEvent({ type: "provider_switch", provider: provider.label, reason: msg });
      continue;
    }

    if (!res.ok) {
      const reason = classify(res.status, bodyText);
      const label = REASON_LABEL[reason];
      const detail = errorDetail(bodyText);
      if (reason === "rate_limit" || reason === "server") houveTransitorio = true;
      else houvePermanente = true;

      if (reason === "fatal") {
        errors.push(`${provider.label} (${res.status}): ${detail}`);
        onEvent({
          type: "provider_switch", provider: provider.label,
          reason: label, status: res.status, detail
        });
        continue;
      }

      // Modelo inexistente/depreciado: se o modelo nao e o padrao, tenta o
      // defaultModel do provedor antes de desistir completamente.
      if (reason === "model" && model !== provider.defaultModel) {
        onEvent({
          type: "provider_switch", provider: provider.label,
          reason: `${model} indisponivel, tentando ${provider.defaultModel}`
        });
        model = provider.defaultModel;
        try {
          const retryReq = buildRequest(provider, cfg, apiKey, { system: systemUsado, messages: msgs, tools, model });
          const retryCtrl = new AbortController();
          const retryTimeout = setTimeout(() => retryCtrl.abort(), 90_000);
          const retryRes = await fetch(retryReq.url, {
            method: "POST",
            headers: retryReq.headers,
            body: JSON.stringify(retryReq.body),
            signal: retryCtrl.signal
          });
          clearTimeout(retryTimeout);
          const retryBody = await retryRes.text();
          if (retryRes.ok) {
            const retryJson = JSON.parse(retryBody);
            const retryParsed = parseResponse(provider, retryJson);
            await store.markProviderSuccess(provider.id, retryParsed.usage);
            // Salva o modelo padrao como o correto para proximas vezes
            const provs = await store.get("providers");
            const provCfg = provs.find(p => p.id === provider.id);
            if (provCfg) { provCfg.model = provider.defaultModel; await store.set("providers", provs); }
            onEvent({ type: "provider_ok", provider: provider.label, model, usage: retryParsed.usage });
            return { ...retryParsed, providerId: provider.id, providerLabel: provider.label, model };
          }
          // Retry falhou — mostra o erro REAL da API (auth, quota, etc)
          const retryReason = classify(retryRes.status, retryBody);
          const retryDetail = errorDetail(retryBody);
          const retryLabel = REASON_LABEL[retryReason] || retryDetail;
          const errMsg = `${provider.label}: ${model} indisponivel (${detail}), ${provider.defaultModel} falhou (${retryRes.status}: ${retryLabel})`;
          // Se o erro do retry e auth/quota, nao marca cooldown longo — so pula
          const retryCooldown = (retryReason === "auth" || retryReason === "quota")
            ? 0 : COOLDOWN_MS.server;
          await store.markProviderFailure(provider.id, retryLabel, retryCooldown);
          errors.push(errMsg);
          onEvent({ type: "provider_switch", provider: provider.label, reason: errMsg });
          continue;
        } catch (retryErr) {
          const retryMsg = retryErr.name === "AbortError" ? "timeout" : "rede indisponivel";
          errors.push(`${provider.label}: ${model} indisponivel, ${provider.defaultModel} falhou (${retryMsg})`);
          continue;
        }
      }

      const retryAfter = Number(res.headers.get("retry-after"));
      const cooldown = (reason === "model" || reason === "size")
        ? COOLDOWN_MS.server
        : (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : COOLDOWN_MS[reason]);

      // Aprendemos o limite verdadeiro: da proxima vez pulamos antes de gastar
      // a chamada, em vez de descobrir de novo pelo erro.
      if (reason === "size") {
        const lim = limiteInformado(bodyText);
        if (lim) await store.set("limites", { ...(await store.get("limites")), [provider.id]: lim });
      }

      await store.markProviderFailure(provider.id, label, cooldown);
      errors.push(`${provider.label} (${res.status}): ${label} — ${detail}`);
      onEvent({
        type: "provider_switch", provider: provider.label,
        reason: label, status: res.status, detail,
        fix: reason === "model" ? "abra ajustes, clique em buscar modelos e escolha um modelo estavel"
           : reason === "size" ? "o proximo servico da fila tem limite maior e vai assumir"
           : null
      });
      continue;
    }

    let json;
    try { json = JSON.parse(bodyText); }
    catch {
      errors.push(`${provider.label}: resposta ilegivel`);
      continue;
    }



    const parsed = parseResponse(provider, json);
    await store.markProviderSuccess(provider.id, parsed.usage);
    onEvent({ type: "provider_ok", provider: provider.label, model, usage: parsed.usage });

    return { ...parsed, providerId: provider.id, providerLabel: provider.label, model };
  }

  const err = new Error(
    preferredProviderId
      ? "O provedor escolhido no modo manual recusou o pedido. Troque de modelo, volte para Automatico ou tente mais tarde."
      : "Todas as APIs ativas atingiram o limite ou falharam agora. Ative outra API em Conexoes ou tente de novo em alguns minutos."
  );
  err.transitorio = houveTransitorio && !houvePermanente;
  err.detalhes = errors;
  throw err;
}

/**
 * Envolve o revezamento com paciencia. Quando as recusas foram todas
 * temporarias — pico de demanda ou limite por minuto — esperar alguns segundos
 * resolve, e desistir na hora obrigaria a pessoa a refazer o pedido inteiro.
 */
export async function completeComEspera(args, onEvent = () => {}) {
  const esperas = [12000, 25000, 45000];

  for (let tentativa = 0; tentativa <= esperas.length; tentativa++) {
    try {
      return await complete(args, onEvent);
    } catch (err) {
      const ultima = tentativa === esperas.length;
      if (!err.transitorio || ultima) throw err;

      const espera = esperas[tentativa];
      onEvent({
        type: "aguardando",
        segundos: Math.round(espera / 1000),
        tentativa: tentativa + 1,
        total: esperas.length
      });

      // Os servicos foram marcados como em descanso. Como a recusa foi
      // temporaria, liberamos todos para a proxima rodada.
      await new Promise(r => setTimeout(r, espera));
      const runtime = await store.get("runtime");
      for (const id of Object.keys(runtime)) {
        if (["limite por minuto atingido", "instabilidade do provedor", "rede indisponivel"]
            .includes(runtime[id].lastError)) {
          runtime[id].cooldownUntil = 0;
        }
      }
      await store.set("runtime", runtime);
    }
  }
}
