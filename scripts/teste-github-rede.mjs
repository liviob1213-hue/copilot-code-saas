// ===========================================================================
// Teste: o GitHub tenta de novo quando a rede falha
//   node scripts/teste-github-rede.mjs
//
// O QUE ACONTECEU E MOTIVOU ISTO
// Apertar "Trocar fotos" devolveu "Nao consegui falar com o GitHub (Failed to
// fetch)". "Failed to fetch" nao e resposta do GitHub: e o navegador dizendo
// que o pedido NAO SAIU. Uma piscada de conexao, um bloqueador de anuncios
// cortando api.github.com, uma VPN. Quase sempre passa na segunda tentativa.
//
// AS DUAS REGRAS QUE ESTE TESTE PROTEGE
//   1. LEITURA repete.  Pedir duas vezes a mesma informacao nao causa dano.
//   2. ESCRITA NAO repete. Um erro de rede pode acontecer DEPOIS de o GitHub
//      ter aceitado o pedido. Repetir criaria o repositorio duas vezes ou
//      gravaria o mesmo commit de novo, e nao ha como saber qual das duas
//      valeu. Melhor avisar a pessoa do que duplicar o projeto dela.
//
// Como o modulo real fala com a rede e com o armazenamento do navegador, aqui
// reproduzimos a MESMA logica de repeticao sobre um fetch de mentira. O que
// esta sendo testado e a decisao: repetir ou nao, e quantas vezes.
// ===========================================================================

let falhas = 0;
const ok = (cond, oque) => {
  if (!cond) falhas++;
  console.log(`${cond ? "ok    " : "FALHOU"}  ${oque}`);
};

// --- copia fiel das regras de src/core/github.js ---------------------------
const ESPERA_ENTRE_TENTATIVAS = [700, 1800];

function ehFalhaDeRede(e) {
  return e instanceof TypeError || /failed to fetch|network|load failed/i.test(e?.message || "");
}

async function api(path, options, chamar) {
  const ehLeitura = !options.method || options.method === "GET";
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await chamar(path, options);
    } catch (e) {
      const vale = ehLeitura && e?.redeInstavel && tentativa < ESPERA_ENTRE_TENTATIVAS.length;
      if (!vale) throw e;
      // sem dormir de verdade: o teste nao precisa esperar 2,5s
    }
  }
}

/** Um "GitHub" de mentira que falha nas N primeiras vezes. */
function falhandoNasPrimeiras(n, { comoRede = true } = {}) {
  let chamadas = 0;
  const fn = async () => {
    chamadas++;
    if (chamadas <= n) {
      const e = new Error(comoRede ? "Failed to fetch" : "O token do GitHub nao e mais aceito.");
      if (comoRede) e.redeInstavel = true;
      throw e;
    }
    return { ok: true, chamadas };
  };
  fn.quantas = () => chamadas;
  return fn;
}

console.log("\n-- reconhecer a falha de rede --");
ok(ehFalhaDeRede(new TypeError("Failed to fetch")), "o TypeError do fetch e falha de rede");
ok(ehFalhaDeRede(new Error("NetworkError when attempting to fetch resource")), "a mensagem do Firefox tambem");
ok(ehFalhaDeRede(new Error("Load failed")), "a mensagem do Safari tambem");
ok(!ehFalhaDeRede(new Error("Not Found")), "404 NAO e falha de rede");
ok(!ehFalhaDeRede(new Error("Bad credentials")), "token invalido NAO e falha de rede");
// AbortError e timeout, tratado antes e com outra mensagem ("nao respondeu
// em 30s"). Se cair aqui, a pessoa levaria tres timeouts de 30s seguidos.
const abort = new Error("The user aborted a request."); abort.name = "AbortError";
ok(!ehFalhaDeRede(abort), "timeout NAO entra na repeticao de rede");

console.log("\n-- leitura repete --");
let fn = falhandoNasPrimeiras(1);
let r = await api("/repos/x/y", {}, fn);
ok(r.ok && fn.quantas() === 2, "falhou uma vez, acertou na segunda");

fn = falhandoNasPrimeiras(2);
r = await api("/repos/x/y", {}, fn);
ok(r.ok && fn.quantas() === 3, "falhou duas vezes, acertou na terceira");

fn = falhandoNasPrimeiras(9);
let erro = null;
try { await api("/repos/x/y", {}, fn); } catch (e) { erro = e; }
ok(erro !== null, "falha sempre: termina em erro, nao em laco infinito");
ok(fn.quantas() === 3, "tenta no maximo 3 vezes (1 + 2 repeticoes)");

console.log("\n-- escrita NAO repete --");
fn = falhandoNasPrimeiras(1);
erro = null;
try { await api("/user/repos", { method: "POST" }, fn); } catch (e) { erro = e; }
ok(erro !== null && fn.quantas() === 1, "POST falha de primeira, sem repetir");
for (const metodo of ["PUT", "PATCH", "DELETE"]) {
  fn = falhandoNasPrimeiras(1);
  try { await api("/x", { method: metodo }, fn); } catch {}
  ok(fn.quantas() === 1, `${metodo} tambem nao repete`);
}

console.log("\n-- erro que nao e de rede nao repete --");
fn = falhandoNasPrimeiras(1, { comoRede: false });
erro = null;
try { await api("/repos/x/y", {}, fn); } catch (e) { erro = e; }
ok(erro !== null && fn.quantas() === 1, "token invalido falha na hora (repetir nao resolveria)");

console.log("\n-- quando da tudo certo --");
fn = falhandoNasPrimeiras(0);
r = await api("/repos/x/y", {}, fn);
ok(r.ok && fn.quantas() === 1, "sem falha, uma chamada so");

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
