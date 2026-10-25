// ===========================================================================
// Teste da conversa guiada de chave externa
//   node scripts/teste-servicos.mjs
//
// O risco aqui é dos dois lados:
//
//   detectar de menos -> o gerador de vídeo é publicado sem chave, abre bonito
//                        e não faz nada; a pessoa desiste sem saber por quê.
//   ler escolha demais -> uma mensagem comum ("muda a cor do botão 2") vira
//                        resposta da pergunta, e a pessoa fica presa num
//                        diálogo que não pediu.
// ===========================================================================

import {
  detectarCapacidade, lerEscolha, capacidadePorId, opcaoPorId,
  perguntaDeEscolha, pedidoDaChave
} from "../src/core/servicos-externos.js";

let falhas = 0;
function conferir(descricao, condicao, extra = "") {
  const ok = Boolean(condicao);
  if (!ok) falhas++;
  console.log(`${ok ? "ok    " : "FALHOU"}  ${descricao}${extra ? "  " + extra : ""}`);
}

// ---------------------------------------------------------------- detecção
// Detecção é por CHAMADA DE API DE VERDADE, nunca por palavra em português.
const projVideo = { "src/App.jsx": 'await fetch("https://api.replicate.com/v1/predictions")' };
const projImagem = { "src/pages/Gerar.jsx": 'await fetch("https://api.openai.com/v1/images/generations")' };
const projSimples = { "src/App.jsx": 'export default function App(){ return <h1>Barbearia</h1> }' };
const projComChave = { "src/App.jsx": 'const t = "r8_AbCdEf1234567890abcd"; fetch("https://api.replicate.com/v1/x")' };

// --------------------------------------------------------------------------
// O CASO QUE QUEBROU DE VERDADE, e que não pode voltar:
// o gerador usa pollinations.ai (grátis, sem chave) para as imagens de
// exemplo, e a URL dele traz "model=flux". A primeira versão tinha "flux" no
// padrão de imagem — então TODO link na bio com foto passou a pedir uma chave
// de IA que nunca foi necessária, no meio da conversa de quem só queria um
// link na bio.
// --------------------------------------------------------------------------
const projPollinations = {
  "src/App.jsx": '<img src={`https://image.pollinations.ai/prompt/${p}?width=800&model=flux&nologo=true`} />'
};

conferir("acha vídeo por chamada real de API", detectarCapacidade(projVideo)?.id === "video");
conferir("acha imagem por chamada real de API", detectarCapacidade(projImagem)?.id === "imagem");
conferir("site comum NÃO dispara pergunta", detectarCapacidade(projSimples) === null);
conferir("não pergunta se a chave já está no código", detectarCapacidade(projComChave) === null);
conferir("pollinations (grátis) NÃO pede chave", detectarCapacidade(projPollinations) === null);
conferir("prosa em português NÃO dispara nada",
  detectarCapacidade({ "a.jsx": '// aqui dá pra gerar imagem depois, e gerar video tambem' }) === null);
conferir("não repergunta o que já foi resolvido",
  detectarCapacidade(projVideo, ["video", "REPLICATE_API_TOKEN"]) === null);
// A Replicate atende vídeo E imagem: dada a chave, nenhuma das duas pergunta.
conferir("mesma chave não é pedida duas vezes",
  detectarCapacidade(projVideo, ["REPLICATE_API_TOKEN"]) === null);
conferir("projeto vazio não dispara nada", detectarCapacidade({}) === null);

// ------------------------------------------------------------ ler a escolha
const video = capacidadePorId("video");

conferir('entende "1"', lerEscolha(video, "1")?.id === video.opcoes[0].id);
conferir('entende "2"', lerEscolha(video, "2")?.id === video.opcoes[1].id);
conferir('entende o nome do serviço', lerEscolha(video, "quero replicate")?.id === "replicate");
conferir('entende "a primeira"', lerEscolha(video, "a primeira")?.id === video.opcoes[0].id);

conferir('entende "opção 2"', lerEscolha(video, "opção 2")?.id === video.opcoes[1].id);
conferir('entende "quero a 1"', lerEscolha(video, "quero a 1")?.id === video.opcoes[0].id);

// ---------------------------------------------------------------------------
// O LADO PERIGOSO, e o que já quebrou de verdade:
// a primeira versão aceitava qualquer dígito solto no texto. Com isso,
// "muda a cor do botão 2" virava escolha de fornecedor e a pessoa era levada a
// colar uma chave que nunca pediu. Número só conta sozinho ou com palavra de
// escolha.
// ---------------------------------------------------------------------------
conferir('NÃO engole "muda a cor do botão 2"', lerEscolha(video, "muda a cor do botão 2") === null);
conferir('NÃO engole "põe 1 banner no topo"', lerEscolha(video, "põe 1 banner no topo") === null);
conferir('NÃO engole "quero 2 seções na home"', lerEscolha(video, "quero 2 seções na home") === null);
conferir('NÃO engole "aumenta pra 3 colunas"', lerEscolha(video, "aumenta pra 3 colunas") === null);
conferir('NÃO engole "muda a cor do cabeçalho"', lerEscolha(video, "muda a cor do cabeçalho") === null);
conferir('NÃO engole texto vazio', lerEscolha(video, "   ") === null);
conferir('NÃO engole "não sei"', lerEscolha(video, "não sei") === null);
conferir('número fora da lista não vale', lerEscolha(video, "9") === null);

// ------------------------------------------------------------------ textos
const op = opcaoPorId("video", "replicate");
const pergunta = perguntaDeEscolha(video);
const pedido = pedidoDaChave(video, op);

conferir("a pergunta numera as opções", /1\./.test(pergunta) && /2\./.test(pergunta));
conferir("a pergunta diz o que acontece sem a chave", /não gera nada/i.test(pergunta));
conferir("o pedido mostra onde pegar a chave", pedido.includes(op.onde));
conferir("o pedido avisa que a chave fica no servidor", /servidor/i.test(pedido));

// Mapa é a exceção: a chave dele PODE ir para o navegador.
const mapa = capacidadePorId("mapa");
const opMapa = opcaoPorId("mapa", "gmaps");
conferir("mapa é marcado como chave de navegador", mapa.noNavegador === true);
conferir("mapa tem variável do app", Boolean(opMapa.envFront));
conferir("mapa NÃO promete servidor", !/no servidor/i.test(pedidoDaChave(mapa, opMapa)));

console.log("\n" + (falhas ? `>>> ${falhas} FALHA(S) <<<` : ">>> TUDO CERTO <<<") + "\n");
process.exit(falhas ? 1 : 0);
