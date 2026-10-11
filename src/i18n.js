// ============================================================================
// i18n.js — idiomas da interface (pt / en / es), estilo gettext.
// ----------------------------------------------------------------------------
// A CHAVE e o proprio texto em portugues: t("Nova conversa") devolve
// "New chat" em ingles. Assim o codigo continua legivel e um texto sem
// traducao cai de volta no portugues (nunca aparece uma chave crua).
// Variaveis: t("Chave do {nome} salva.", { nome: "Groq" }).
//
// Tambem decide o idioma do que a IA ESCREVE (textos do site gerado e as
// respostas no chat) — ver instrucaoIdiomaIA().
// ============================================================================
import { useSyncExternalStore } from "react";
import { DICIONARIO } from "./i18n-dict.js";

export const IDIOMAS = [
  { id: "pt", label: "Português", curto: "PT", locale: "pt-BR", nomeIA: "portugues do Brasil (pt-BR)", moeda: "BRL (R$)" },
  { id: "en", label: "English", curto: "EN", locale: "en-US", nomeIA: "English (en-US)", moeda: "USD ($)" },
  { id: "es", label: "Español", curto: "ES", locale: "es-ES", nomeIA: "Spanish (es)", moeda: "EUR (€) or the local currency the person mentions" }
];
const CHAVE = "copilot:lang";   // mesmo prefixo do storage.js (store.get("lang") tambem le)

function detectar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (IDIOMAS.some(i => i.id === salvo)) return salvo;
  } catch { /* sem storage (node/teste) */ }
  try {
    const nav = String(navigator.language || "").slice(0, 2).toLowerCase();
    if (IDIOMAS.some(i => i.id === nav)) return nav;
    return "en";   // fora de pt/es: ingles e o padrao internacional
  } catch { return "pt"; }
}

let atual = detectar();
const ouvintes = new Set();

export function idioma() { return atual; }
export function infoIdioma(id = atual) { return IDIOMAS.find(i => i.id === id) || IDIOMAS[0]; }
export function locale() { return infoIdioma().locale; }

export function setIdioma(id) {
  if (!IDIOMAS.some(i => i.id === id) || id === atual) return;
  atual = id;
  try { localStorage.setItem(CHAVE, JSON.stringify(id)); } catch { /* ok */ }
  try { document.documentElement.lang = infoIdioma().locale; } catch { /* ok */ }
  ouvintes.forEach(fn => fn());
}

/** Traduz um texto (a chave e o texto em pt). */
export function t(texto, vars) {
  let s = atual === "pt" ? texto : (DICIONARIO[atual]?.[texto] ?? texto);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

/** Hook: re-renderiza o componente quando o idioma muda. */
export function useIdioma() {
  return useSyncExternalStore(
    fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    () => atual,
    () => atual
  );
}

/**
 * Instrucao de idioma para a IA. Em pt devolve "" (os prompts ja sao em pt).
 * Nos outros idiomas, manda escrever TODO texto visivel do projeto e as
 * respostas no idioma escolhido — mesmo com blueprints/regras em portugues.
 */
export function instrucaoIdiomaIA() {
  if (atual === "pt") return "";
  const i = infoIdioma();
  return `\n\nIDIOMA (OBRIGATORIO): a pessoa usa a interface em ${i.nomeIA}. Escreva TODO texto visivel do projeto (menus, botoes, titulos, textos, dados de exemplo, mensagens, <title> e meta tags, <html lang="${i.locale}">) em ${i.nomeIA}, mesmo que estas instrucoes e os blueprints estejam em portugues. Formate datas/numeros em ${i.locale} e use ${i.moeda} como moeda, salvo se a pessoa pedir outra. Nomes de arquivos, variaveis e codigo continuam em ingles/como de costume. Quando falar com a pessoa (resumos, perguntas, explicacoes), responda em ${i.nomeIA}.`;
}

try { document.documentElement.lang = infoIdioma().locale; } catch { /* node */ }
