// ============================================================================
// auth.js — contas de usuario DO PROPRIO Prumo Code
// ----------------------------------------------------------------------------
// CUIDADO PARA NAO CONFUNDIR COM O OUTRO SUPABASE. Existem dois aqui:
//
//   1. O Supabase que a PESSOA conecta (core/supabase-mgmt.js, chave em
//      SECRETS.SUPABASE_URL): e o banco dos PROJETOS QUE ELA CRIA.
//   2. Este: o Supabase do NOSSO app, onde ficam as contas de quem entra no
//      Prumo Code. Os dois nunca se misturam.
//
// A URL e a chave "anon" sao PUBLICAS por natureza — elas vao no navegador de
// qualquer jeito e a seguranca real fica nas politicas (RLS) do Supabase. Por
// isso podem viver em variavel de ambiente do Vercel, sem segredo nenhum.
//
// NADA QUEBRA ANTES DE CONFIGURAR: sem URL/chave, authConfigurada() devolve
// false e o app roda exatamente como hoje, sem tela de login.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const URL_APP = (import.meta.env?.VITE_SUPABASE_APP_URL || "").trim();
const CHAVE_APP = (import.meta.env?.VITE_SUPABASE_APP_ANON_KEY || "").trim();

export function authConfigurada() {
  return Boolean(URL_APP && CHAVE_APP);
}

let cliente = null;
function sb() {
  if (!authConfigurada()) return null;
  if (!cliente) {
    cliente = createClient(URL_APP, CHAVE_APP, {
      auth: {
        persistSession: true,      // continua logado ao fechar e abrir de novo
        autoRefreshToken: true,
        detectSessionInUrl: true   // volta do Google com a sessao pronta
      }
    });
  }
  return cliente;
}

/**
 * O cliente do Supabase das CONTAS, para quem precisa consultar as tabelas
 * perfis/cotas (ver core/plano.js). Devolve null quando o login nao esta
 * configurado — quem chama tem que aguentar esse null sem quebrar.
 */
export function clienteContas() {
  return sb();
}

/** Sessao atual (ou null). */
export async function sessaoAtual() {
  const c = sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data?.session || null;
}

/** Avisa a cada entrada/saida. Devolve uma funcao para parar de ouvir. */
export function aoMudarSessao(cb) {
  const c = sb();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_evento, sessao) => cb(sessao || null));
  return () => data?.subscription?.unsubscribe?.();
}

/**
 * Entrar com a conta Google. Sai da pagina e volta ja logado.
 * redirectTo precisa estar na lista de URLs permitidas do Supabase, senao a
 * volta cai na pagina errada — e o erro so aparece depois do login, confuso.
 */
export async function entrarComGoogle() {
  const c = sb();
  if (!c) throw new Error("Login ainda nao configurado.");
  const { error } = await c.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
  if (error) throw new Error(traduzir(error.message));
}

/**
 * Manda o e-mail de entrada. Serve para entrar E para criar conta:
 * shouldCreateUser cria quem ainda nao existe, que e como as ferramentas
 * modernas funcionam (nao ha "cadastro" separado).
 *
 * O QUE CHEGA NO E-MAIL, E POR QUE A TELA FALA EM LINK
 * O Supabase decide isso pelo MODELO DE E-MAIL, nao por esta chamada: se o
 * modelo tem {{ .ConfirmationURL }}, vai um link; se tem {{ .Token }}, vai um
 * codigo de 6 numeros. O modelo padrao e o do link.
 *
 * A tela pedia o codigo e o e-mail entregava o link — ou seja, a pessoa ficava
 * olhando para um campo que nao tinha como preencher. Em vez de exigir que
 * todo mundo edite o modelo no painel do Supabase, a tela passou a falar a
 * mesma lingua do e-mail que realmente chega: clique no link.
 *
 * emailRedirectTo traz a pessoa de volta para ca ja logada.
 */
export async function enviarEmailDeEntrada(email) {
  const c = sb();
  if (!c) throw new Error("Login ainda nao configurado.");
  const { error } = await c.auth.signInWithOtp({
    email: String(email || "").trim(),
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin }
  });
  if (error) throw new Error(traduzir(error.message));
}

/**
 * Confere um codigo de 6 numeros e abre a sessao.
 *
 * NAO E USADO PELA TELA DE LOGIN hoje — ela manda o link. Fica aqui porque e a
 * outra metade do mesmo recurso do Supabase: basta trocar o modelo de e-mail
 * para {{ .Token }} e esta funcao volta a servir, sem reescrever nada.
 */
export async function confirmarCodigo(email, codigo) {
  const c = sb();
  if (!c) throw new Error("Login ainda nao configurado.");
  const { data, error } = await c.auth.verifyOtp({
    email: String(email || "").trim(),
    token: String(codigo || "").replace(/\D/g, ""),
    type: "email"
  });
  if (error) throw new Error(traduzir(error.message));
  return data?.session || null;
}

export async function sair() {
  const c = sb();
  if (c) await c.auth.signOut();
}

/** Nome/foto para mostrar no canto, qualquer que seja a forma de entrada. */
export function dadosDoUsuario(sessao) {
  const u = sessao?.user;
  if (!u) return null;
  const m = u.user_metadata || {};
  return {
    email: u.email || "",
    nome: m.full_name || m.name || (u.email || "").split("@")[0],
    foto: m.avatar_url || m.picture || ""
  };
}

// As mensagens do Supabase vem em ingles e tecnicas. Quem usa o app nao tem por
// que decifrar "Token has expired or is invalid".
function traduzir(msg) {
  const m = String(msg || "");
  if (/expired|invalid/i.test(m) && /token|otp|code/i.test(m)) {
    return "Código inválido ou vencido. Peça um novo e tente de novo.";
  }
  if (/rate limit|too many/i.test(m)) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  if (/provider is not enabled|not enabled/i.test(m)) {
    return "Esse jeito de entrar ainda não foi ligado no Supabase.";
  }
  if (/redirect/i.test(m) && /url|allow/i.test(m)) {
    return "O endereço de retorno não está liberado no Supabase (Redirect URLs).";
  }
  if (/signups? not allowed|disabled/i.test(m)) {
    return "O cadastro de novas contas está desligado no Supabase.";
  }
  if (/email.*invalid|invalid.*email/i.test(m)) return "Esse e-mail não parece válido.";
  if (/network|fetch/i.test(m)) return "Não consegui falar com o servidor. Confira sua internet.";
  return m;
}
