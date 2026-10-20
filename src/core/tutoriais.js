// ============================================================================
// tutoriais.js — A LISTA DOS VÍDEOS DA ABA "TUTORIAIS"
// ----------------------------------------------------------------------------
// Este arquivo é só a LISTA. É aqui que você mexe quando grava um vídeo novo.
// Não precisa saber programar: siga as instruções abaixo.
//
//
// COMO COLOCAR UM VÍDEO QUE VOCÊ ACABOU DE GRAVAR
// -----------------------------------------------
// 1) Suba o vídeo no YouTube (pode ser "não listado": só quem tem o link vê,
//    e ele funciona normalmente aqui dentro do app).
//
// 2) Copie o endereço do vídeo. Ele é parecido com isto:
//
//        https://www.youtube.com/watch?v=dQw4w9WgXcQ
//                                       └──────┬──────┘
//                                   ISTO é o código do vídeo
//
//    O código é o pedaço que vem DEPOIS de "v=". No exemplo: dQw4w9WgXcQ
//    (se o endereço for do tipo https://youtu.be/dQw4w9WgXcQ, o código é o
//    pedaço depois da barra — a mesma coisa).
//
// 3) Lá embaixo, ache o vídeo na lista e cole o código entre as aspas do
//    campo `youtube`. Antes:
//
//        youtube: "",
//
//    Depois:
//
//        youtube: "dQw4w9WgXcQ",
//
// 4) Salve o arquivo. Pronto: o cartão sai de "Em breve" e passa a tocar.
//
//
// REGRAS QUE VALEM A PENA SABER
// -----------------------------
// • Enquanto o campo `youtube` estiver vazio (""), o cartão aparece apagado,
//   escrito "Em breve", e não dá pra clicar. Nada quebra. Pode deixar assim
//   o tempo que quiser.
// • Toda vírgula e toda aspa que já estão aqui precisam continuar no lugar.
//   O mais seguro é só trocar o que está ENTRE as aspas.
// • `duracao` é o tempo do vídeo, escrito do jeito que você quiser mostrar na
//   tela (ex.: "4 min", "12 min"). Os tempos que estão aí embaixo são só um
//   chute pra você trocar depois de gravar; enquanto o vídeo está "Em breve"
//   esse tempo nem aparece na tela.
// • `grupo` é o título da fileira onde o cartão aparece. Dois vídeos com o
//   mesmo texto em `grupo` ficam na mesma fileira. Para criar uma fileira
//   nova, basta escrever um nome novo aqui.
// • `pro: true` mostra a etiqueta "Plano Pro" no cartão. É só um aviso de que
//   o recurso do vídeo é do plano pago — o vídeo continua liberado pra todo
//   mundo assistir (é isso que mostra pra quem está no grátis o que existe do
//   outro lado). Quem não é do plano pago, use `pro: false`.
// • `id` é um apelido interno de cada vídeo, só pro app não se confundir.
//   Se adicionar um vídeo novo, dê um apelido que ainda não exista na lista.
//
//
// COMO ADICIONAR UM VÍDEO NOVO (que não está na lista)
// ----------------------------------------------------
// Copie um bloco inteiro de { ... } abaixo, cole logo depois dele (atenção na
// vírgula entre um bloco e o outro) e troque os textos.
// ============================================================================

export const TUTORIAIS = [
  {
    id: "primeiro-site",
    grupo: "Primeiros passos",
    titulo: "Criando seu primeiro site",
    descricao: "Descreva o que você quer e veja a IA montar o site inteiro.",
    duracao: "4 min",
    pro: false,
    youtube: ""   // <- cole aqui o código do vídeo (o pedaço depois de v=)
  },
  {
    id: "chave-de-ia",
    grupo: "Primeiros passos",
    titulo: "Colando sua chave de IA",
    descricao: "Onde pegar a chave do provedor e onde colar aqui no app.",
    duracao: "3 min",
    pro: false,
    youtube: ""   // <- cole aqui o código do vídeo (o pedaço depois de v=)
  },
  {
    id: "publicar",
    grupo: "Colocando no ar",
    titulo: "Publicando no GitHub e na Vercel",
    descricao: "Do botão de publicar até o seu endereço funcionando na internet.",
    duracao: "6 min",
    pro: false,
    youtube: ""   // <- cole aqui o código do vídeo (o pedaço depois de v=)
  },
  {
    id: "editar-projeto",
    grupo: "Indo além",
    titulo: "Editando um projeto pronto",
    descricao: "Abra um projeto que já existe e peça mudanças conversando.",
    duracao: "5 min",
    pro: true,
    youtube: ""   // <- cole aqui o código do vídeo (o pedaço depois de v=)
  },
  {
    id: "clonar-site",
    grupo: "Indo além",
    titulo: "Clonando um site que você gostou",
    descricao: "Cole o link de uma página e recrie com a sua marca e o seu texto.",
    duracao: "5 min",
    pro: true,
    youtube: ""   // <- cole aqui o código do vídeo (o pedaço depois de v=)
  }
];

/* ----------------------------------------------------------------------------
   Daqui pra baixo é código do app. Você não precisa mexer em nada.
   ---------------------------------------------------------------------------- */

/** Um vídeo só está pronto quando tem um código do YouTube preenchido. */
export function temVideo(tut) {
  return typeof tut?.youtube === "string" && tut.youtube.trim() !== "";
}

/** Limpa o que foi colado: aceita o código puro, o link completo ou o youtu.be. */
export function codigoDoVideo(tut) {
  const bruto = String(tut?.youtube || "").trim();
  if (!bruto) return "";
  // Colou o endereço inteiro em vez de só o código? A gente entende os dois.
  const porParametro = bruto.match(/[?&]v=([\w-]{6,})/);
  if (porParametro) return porParametro[1];
  const porCaminho = bruto.match(/(?:youtu\.be|embed|shorts|live)\/([\w-]{6,})/);
  if (porCaminho) return porCaminho[1];
  return bruto.replace(/[^\w-]/g, "");
}

/** Miniatura do vídeo no YouTube (não carrega player nenhum: é só uma imagem). */
export function miniaturaDoVideo(tut) {
  const id = codigoDoVideo(tut);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

/** Agrupa a lista por `grupo`, mantendo a ordem em que os vídeos aparecem aqui. */
export function porGrupo(lista = TUTORIAIS) {
  const grupos = [];
  for (const tut of lista) {
    const nome = tut.grupo || "Tutoriais";
    let g = grupos.find(x => x.nome === nome);
    if (!g) { g = { nome, videos: [] }; grupos.push(g); }
    g.videos.push(tut);
  }
  return grupos;
}
