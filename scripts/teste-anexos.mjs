// ===========================================================================
// Teste da foto anexada numa edicao
//   node scripts/teste-anexos.mjs
//
// O DEFEITO QUE ISTO IMPEDE DE VOLTAR:
// a pessoa anexava a foto, pedia "troca a imagem do topo por essa", a IA
// respondia "pronto, troquei" e o site continuava igual. A foto so entrava no
// projeto se a IA lembrasse de chamar uma ferramenta — e o modelo de visao do
// DeepSeek, que e quem acaba sendo escolhido quando ha imagem, muitas vezes so
// responde texto, sem chamar ferramenta nenhuma.
//
// Agora a foto ganha endereco ANTES de a IA falar, e o binario entra no commit
// sozinho quando algum arquivo aponta para esse endereco.
// ===========================================================================

import { prepararAnexos, recadoDosAnexos } from "../src/core/agent.js";

let falhas = 0;
const ok = (cond, oque) => {
  if (!cond) falhas++;
  console.log(`${cond ? "ok    " : "FALHOU"}  ${oque}`);
};

// base64 de 1 pixel, em dois formatos
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

console.log("\n-- cada foto ganha um endereco --");
const a = prepararAnexos([`data:image/png;base64,${PNG}`, `data:image/jpeg;base64,${JPG}`]);
ok(a.length === 2, "duas fotos, dois enderecos");
ok(a[0].caminho.startsWith("public/") && a[0].caminho.endsWith(".png"), "png vai para public/ com a extensao certa");
ok(a[1].caminho.endsWith(".jpg"), "jpeg vira .jpg");
// Em projeto Vite, public/foto-x.png e servido em /foto-x.png. Errar isso da
// imagem quebrada no site publicado, que e pior do que nao ter imagem.
ok(a[0].url === "/" + a[0].caminho.slice("public/".length), "a URL e o caminho sem o public/");
ok(!a[0].url.includes("public"), "a URL NAO leva 'public' dentro");

console.log("\n-- o nome vem do conteudo --");
const b = prepararAnexos([`data:image/png;base64,${PNG}`]);
ok(b[0].caminho === a[0].caminho, "mandar a mesma foto de novo aponta para o mesmo arquivo");
ok(a[0].caminho !== a[1].caminho, "fotos diferentes nunca se sobrescrevem");

console.log("\n-- entrada estranha nao quebra nada --");
ok(prepararAnexos([]).length === 0, "sem anexo, lista vazia");
ok(prepararAnexos(null).length === 0, "nulo nao estoura");
ok(prepararAnexos(["https://exemplo.com/foto.jpg"]).length === 0, "URL que nao e data: e ignorada");
ok(prepararAnexos([""]).length === 0, "texto vazio e ignorado");

console.log("\n-- o recado para a IA --");
const recado = recadoDosAnexos(a);
ok(recado.includes(a[0].url) && recado.includes(a[1].url), "o recado lista os dois enderecos");
// As tres frases abaixo existem para corrigir as tres respostas erradas que a
// IA mais dava. Se alguem reescrever o recado e tirar uma delas, o defeito
// correspondente volta — por isso elas sao testadas.
ok(/N[AÃ]O peca para a pessoa subir/i.test(recado), "proibe mandar a pessoa subir a foto");
ok(/n[aã]o precisa enxergar/i.test(recado), "diz que nao precisa enxergar a imagem");
ok(/DEPOIS de realmente escrever/i.test(recado), "proibe dizer que trocou sem ter trocado");
ok(recadoDosAnexos([]) === "", "sem anexo, nenhum recado e acrescentado ao pedido");

// -------------------------------------------------------------------------
// O binario entra no commit quando alguem aponta para ele — e so entao.
// Reproduz o laco de commit_files (tools.js) sobre uma area de preparacao.
// -------------------------------------------------------------------------
console.log("\n-- o binario entra junto, e so quando citado --");
function staged(arquivos, anexos) {
  const mapa = new Map(Object.entries(arquivos).map(([p, c]) => [p, { content: c }]));
  for (const anexo of anexos) {
    if (mapa.has(anexo.caminho)) continue;
    const citado = [...mapa.values()].some(v =>
      !v.delete && !v.base64 && typeof v.content === "string" && v.content.includes(anexo.url)
    );
    if (citado) mapa.set(anexo.caminho, { content: anexo.base64, base64: true });
  }
  return mapa;
}

const usou = staged({ "src/Hero.jsx": `<img src="${a[0].url}" alt="capa" />` }, a);
ok(usou.has(a[0].caminho), "a foto citada entra no commit");
ok(usou.get(a[0].caminho).base64 === true, "e entra como binario, nao como texto");
ok(!usou.has(a[1].caminho), "a foto que ninguem citou fica de fora");

const soPergunta = staged({ "src/Hero.jsx": "<h1>oi</h1>" }, a);
ok(soPergunta.size === 1, "foto mandada so para perguntar algo nao vira lixo no repositorio");

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
