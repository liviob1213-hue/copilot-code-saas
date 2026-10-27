// ============================================================================
// trocar-imagem.js — trocar uma foto do projeto NA MAO, sem IA
// ----------------------------------------------------------------------------
// POR QUE ISTO EXISTE
//
// Trocar uma foto e a alteracao mais pedida e a que menos precisa de IA: a
// pessoa ja sabe qual imagem quer e onde ela vai. Passar isso por um modelo
// custa dinheiro, demora, as vezes volta errado e — no pior caso, que foi o que
// aconteceu de verdade — a IA responde "pronto, troquei" sem ter trocado nada.
//
// Aqui a pessoa clica na imagem dentro da previa, escolhe a nova, e o endereco
// e trocado no codigo por busca de texto. E uma operacao de localizar-e-
// substituir, nao um pedido: ou acha e troca, ou diz que nao achou. Nunca
// "parece que deu certo".
//
// POR QUE BUSCA DE TEXTO, E NAO UM PARSER DE JSX: o endereco de uma imagem
// aparece no codigo exatamente como aparece no navegador, entre aspas. Um
// parser traria dependencia e casos de borda (template string, variavel, css)
// para resolver um problema que a string ja resolve — e, quando a string NAO
// resolve, a gente avisa em vez de adivinhar.
// ============================================================================

/** Escapa um texto para entrar numa expressao regular como literal. */
function literal(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Onde esta esta imagem?
 *
 * Devolve a lista de arquivos que citam o endereco, com quantas vezes cada um
 * cita. Serve para a tela poder dizer "vou trocar em 2 lugares" ANTES de mexer.
 */
export function ondeApareceA(files, endereco) {
  const alvo = String(endereco || "").trim();
  if (!alvo) return [];
  const re = new RegExp(literal(alvo), "g");
  const achados = [];
  for (const [caminho, conteudo] of Object.entries(files || {})) {
    if (typeof conteudo !== "string") continue;
    const vezes = (conteudo.match(re) || []).length;
    if (vezes) achados.push({ caminho, vezes });
  }
  return achados;
}

/**
 * Troca um endereco de imagem por outro em todo o projeto.
 *
 * Devolve { files, trocas, arquivos } — files NOVO (nao mexe no original, pra
 * quem chamou poder desfazer simplesmente ignorando o retorno).
 *
 * `trocas: 0` significa NAO ENCONTREI. Quem chama precisa dizer isso para a
 * pessoa, nunca engolir: uma troca que nao aconteceu e exatamente o defeito que
 * esta tela veio consertar.
 */
export function trocarImagem(files, { de, para }) {
  const antigo = String(de || "").trim();
  const novo = String(para || "").trim();
  if (!antigo || !novo) return { files, trocas: 0, arquivos: [] };
  if (antigo === novo) return { files, trocas: 0, arquivos: [] };

  const re = new RegExp(literal(antigo), "g");
  const saida = { ...files };
  let trocas = 0;
  const arquivos = [];

  for (const [caminho, conteudo] of Object.entries(files || {})) {
    if (typeof conteudo !== "string" || !conteudo.includes(antigo)) continue;
    const vezes = (conteudo.match(re) || []).length;
    saida[caminho] = conteudo.replace(re, novo);
    trocas += vezes;
    arquivos.push(caminho);
  }

  return { files: saida, trocas, arquivos };
}

/**
 * O limite de tamanho da foto que a pessoa sobe.
 *
 * A foto entra no codigo como data URL — e o jeito que o projeto ja usa para as
 * imagens anexadas no chat, e e o unico que funciona sem repositorio (a troca
 * acontece ANTES de publicar). Como base64 engorda o arquivo em ~33%, uma foto
 * de 10 MB viraria 13 MB dentro de um .jsx: o editor trava, a previa fica
 * lenta e o commit do GitHub recusa.
 *
 * 4 MB e folgado para foto de celular redimensionada e ainda cabe com conforto.
 */
export const LIMITE_FOTO_MB = 4;

/** Diz, em portugues, por que esta foto nao serve — ou "" se ela serve. */
export function recusaDaFoto(arquivo) {
  if (!arquivo) return "Escolha uma imagem.";
  if (!/^image\//i.test(arquivo.type || "")) {
    return "Esse arquivo não é uma imagem. Escolha um JPG, PNG, WEBP ou GIF.";
  }
  const mb = (arquivo.size || 0) / (1024 * 1024);
  if (mb > LIMITE_FOTO_MB) {
    return `Essa imagem tem ${mb.toFixed(1)} MB e o limite é ${LIMITE_FOTO_MB} MB. `
      + "Reduza o tamanho dela e tente de novo — foto grande demais deixa o site lento para quem acessa.";
  }
  return "";
}

/**
 * Le o arquivo escolhido como data URL (o formato que entra direto no src).
 */
export function lerComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ""));
    leitor.onerror = () => reject(new Error("Não consegui ler essa imagem."));
    leitor.readAsDataURL(arquivo);
  });
}
