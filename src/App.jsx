import React, { useEffect, useRef, useState } from "react";
import Aurora from "./Aurora.jsx";
import Tutoriais from "./Tutoriais.jsx";
import BorderGlow from "./BorderGlow.jsx";
import * as store from "./core/storage.js";
import { PROVIDER_CATALOG } from "./core/config.js";
import { criarProjeto, publicarProjeto, editarProjeto, reconectarSupabase, criarTabelas, configurarChaveMapa, desfazerUltimo, gerarPlano, BLINDAR_PROMPT } from "./core/runtime.js";
import { montarHtmlPrevia } from "./core/previa.js";
import { guardarRascunho, lerRascunho, apagarRascunho, idsComRascunho } from "./core/rascunhos.js";
import { cancelarIA, comecarIA } from "./core/net.js";
import { authConfigurada, dadosDoUsuario, sair as sairDaConta } from "./core/auth.js";
import { carregarPlano, motivoDoBloqueio, linkDeConvite, registrarConviteDoLink, avisarProjetoCriado } from "./core/plano.js";
import { marcarProjetoNovo, consumirUsouCasa } from "./core/casa.js";
import { detectarCapacidade, perguntaDeEscolha, lerEscolha, pedidoDaChave, capacidadePorId, opcaoPorId } from "./core/servicos-externos.js";
import { listModels, healthCheck } from "./core/providers.js";
import * as history from "./core/history.js";
import { startGithubLoginWeb, startSupabaseLoginWeb, startVercelLoginWeb, githubConfigurado, supabaseConfigurado, vercelConfigurado } from "./core/oauth-web.js";
import * as github from "./core/github.js";
import { extrairRotas } from "./core/site-generator.js";
import * as vercel from "./core/vercel.js";
import * as sbmgmt from "./core/supabase-mgmt.js";
import { t, useIdioma, setIdioma, IDIOMAS, infoIdioma, locale } from "./i18n.js";

// Galeria de modelos da home: só preenchem o campo (a pessoa revisa e envia).
// Os textos batem com os kits de nicho do gerador (detectarKit), então cada
// modelo já nasce com telas, dados e fluxos do nicho.
const CATEGORIAS = [
  { id: "todos", label: "Todos" },
  { id: "apps", label: "Apps e SaaS" },
  { id: "sites", label: "Sites" },
  { id: "ia", label: "IA e mídia" }
];
const MODELOS = [
  { cat: "apps", ic: "calendar", thumb: "cal", titulo: "Agendamento", desc: "Serviços, horários livres e painel do profissional", prompt: "Sistema de agendamento online para barbearia com serviços, profissionais, horários disponíveis, confirmação e painel admin" },
  { cat: "apps", ic: "kanban", thumb: "kanban", titulo: "CRM de vendas", desc: "Pipeline kanban, contatos, tarefas e métricas", prompt: "CRM de vendas com pipeline kanban, cadastro de contatos, tarefas, histórico de negociações e dashboard de métricas" },
  { cat: "apps", ic: "utensils", thumb: "grid", titulo: "Cardápio digital", desc: "Categorias, carrinho e pedido no WhatsApp", prompt: "Cardápio digital para hamburgueria com categorias, carrinho, adicionais, taxa de entrega e pedido pelo WhatsApp" },
  { cat: "apps", ic: "wallet", thumb: "dash", titulo: "Controle financeiro", desc: "Receitas, despesas, categorias e gráficos", prompt: "Controle financeiro com receitas, despesas, categorias, gráficos mensais, metas e exportação" },
  { cat: "apps", ic: "bag", thumb: "grid", titulo: "Loja online", desc: "Catálogo, filtros, carrinho e pedidos", prompt: "Loja online de roupas com catálogo, filtros, página de produto, carrinho, checkout e painel de pedidos" },
  { cat: "apps", ic: "play", thumb: "media", titulo: "Área de membros", desc: "Cursos, módulos, aulas e progresso", prompt: "Área de membros com cursos, módulos, aulas em vídeo, progresso do aluno e certificado" },
  { cat: "apps", ic: "box", thumb: "dash", titulo: "Estoque", desc: "Produtos, entradas, saídas e alertas", prompt: "Sistema de controle de estoque com produtos, entradas, saídas, fornecedores e alerta de estoque baixo" },
  { cat: "apps", ic: "dumbbell", thumb: "dash", titulo: "Academia", desc: "Alunos, planos, treinos e check-in", prompt: "Sistema para academia com alunos, planos, fichas de treino, check-in e mensalidades" },
  { cat: "sites", ic: "layout", thumb: "landing", titulo: "Landing de SaaS", desc: "Hero, benefícios, planos, depoimentos e FAQ", prompt: "Landing page para um SaaS com hero, benefícios, como funciona, depoimentos, planos de preço e FAQ" },
  { cat: "sites", ic: "camera", thumb: "grid", titulo: "Portfólio", desc: "Galeria, sobre, serviços e contato", prompt: "Portfólio de fotógrafo com galeria em grid, sobre, serviços, depoimentos e contato" },
  { cat: "sites", ic: "building", thumb: "grid", titulo: "Imobiliária", desc: "Busca de imóveis, filtros e detalhes", prompt: "Site de imobiliária com busca de imóveis, filtros por preço e bairro, página de detalhes e contato com corretor" },
  { cat: "sites", ic: "link", thumb: "bio", titulo: "Link na bio", desc: "Página de links com a sua marca", prompt: "Página de link na bio para criadora de conteúdo com links, redes sociais, produtos em destaque e newsletter" },
  { cat: "sites", ic: "ticket", thumb: "landing", titulo: "Evento", desc: "Programação, palestrantes e ingressos", prompt: "Site de evento com programação, palestrantes, lotes de ingressos, inscrição e ingresso com QR code" },
  { cat: "ia", ic: "wand", thumb: "media", titulo: "Gerador de imagens", desc: "Prompt, estilos, proporções e galeria", prompt: "Gerador de imagens com IA com prompt, estilos, proporções, galeria do histórico e download" },
  { cat: "ia", ic: "film", thumb: "media", titulo: "Gerador de vídeos", desc: "Texto para vídeo com fila e histórico", prompt: "Gerador de vídeos com IA a partir de texto, com fila de geração, histórico e download" },
  { cat: "ia", ic: "bot", thumb: "chat", titulo: "Assistente de IA", desc: "Chat de atendimento treinado no seu negócio", prompt: "Assistente de IA em chat para atendimento de uma clínica odontológica, com respostas sobre serviços e agendamento" },
  { cat: "ia", ic: "quiz", thumb: "quiz", titulo: "Quiz e funil", desc: "Perguntas, resultado e captura de lead", prompt: "Quiz de funil de captação com perguntas, barra de progresso, resultado personalizado e captura de lead" }
];
// Blocos abaixo do campo (estilo Bolt): escolhem o tipo do projeto.
const TIPOS = [
  { id: "site", ic: "globe", label: "Site" },
  { id: "app", ic: "apps", label: "App / SaaS" },
  { id: "clone", ic: "copy", label: "Clonar site", novo: true },
  { id: "ia", ic: "wand", label: "IA e mídia" }
];
const PROMPT_CLONE = "Recrie esta página com a minha marca e o meu conteúdo: https://";

// Plano antes de construir (1o comando de projeto novo): DESATIVADO a pedido —
// ir direto pra construção. Troque pra true pra reativar o fluxo de plano.
const PLANO_ATIVO = false;

export default function App({ oauthResult, oauthError, sessao = null }) {
  const lang = useIdioma();   // re-renderiza tudo ao trocar o idioma
  useEffect(() => { document.title = t("Prumo Code — crie sites, apps e SaaS com IA"); }, [lang]);
  // Lê o plano assim que a sessão existe (e de novo se a pessoa trocar de conta).
  // Antes disso, registra o convite: quem chegou por um link de alguém ganha um
  // site a mais, e a leitura do plano logo abaixo já mostra esse site a mais.
  useEffect(() => {
    let vivo = true;
    registrarConviteDoLink(sessao)
      .catch(() => null)
      .then(() => carregarPlano(sessao))
      .then(p => {
        if (!vivo) return;
        acessoRef.current = p;
        setAcesso(p);
        // Com o site do dia na mão, a IA já está pronta mesmo sem chave colada.
        setConn(c => ({ ...c, ia: Boolean(c.iaPropria) || p.casaDisponivel === true }));
      });
    return () => { vivo = false; };
  }, [sessao]);
  const [view, setView] = useState("home");
  // O que esta pessoa pode fazer (plano, slots, se cria app). Começa liberado:
  // se a consulta demorar ou falhar, é melhor deixar passar do que travar quem
  // tem direito. A trava que realmente segura dinheiro é a da chave da casa,
  // e essa vive no servidor (ver src/core/plano.js).
  const [acesso, setAcesso] = useState({
    carregado: false, semLogin: true, pago: true, podeApps: true, podeApisPagas: true,
    casaDisponivel: false, casaNovoProjeto: false, casaRestantesHoje: 0, casaTotalDia: 0,
    propriosRestantes: Infinity, propriosTotal: Infinity, propriosUsados: 0,
    convitesPagos: 0, podeCriarSite: true, codigoConvite: ""
  });
  const [modo, setModo] = useState("");   // "" | "site" | "app" — escolhido nos blocos da home (força o tipo)        // home | workspace
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [kind, setKind] = useState("app");
  const [providerId, setProviderId] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  // Cronômetro do trabalho da IA: começa quando busy vira true (também é exibido
  // na working-bar durante a geração, pra pessoa ver quanto tempo está levando).
  const [runStartedAt, setRunStartedAt] = useState(null);
  const [runAgora, setRunAgora] = useState(Date.now());
  // Menu aberto/recolhido: no desktop lembra a última escolha (como o Bolt);
  // no celular começa sempre fechado.
  const [sideOpen, setSideOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth <= 820) return false;
    try { return localStorage.getItem("copilot:sideOpen") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    if (window.innerWidth > 820) { try { localStorage.setItem("copilot:sideOpen", sideOpen ? "1" : "0"); } catch { /* ok */ } }
  }, [sideOpen]);
  // Escreveu a ideia na pagina de vendas? Ela chega aqui pelo navegador (chave
  // "copilot:ideia") e vai direto pro campo, pra ninguem ver tela em branco
  // depois de ja ter contado o que quer. Limpa na hora: e de uma vez so.
  useEffect(() => {
    try {
      const ideia = localStorage.getItem("copilot:ideia");
      if (ideia) { setInput(ideia); localStorage.removeItem("copilot:ideia"); }
    } catch { /* navegador sem localStorage: comeca com o campo vazio */ }
  }, []);
  const [mobileView, setMobileView] = useState("chat");   // mobile: "chat" | "preview"
  const [repo, setRepo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  // Rotas do projeto (lidas do App.jsx) para o seletor em cima do preview.
  const [rotas, setRotas] = useState(["/"]);
  const [rota, setRota] = useState("/");
  const [viewport, setViewport] = useState("desktop");
  const [conn, setConn] = useState({ github: null, supabase: false, vercel: false, ia: true });
  // { [id]: "ok" | "sem-chave" | "desligado" } — ver refreshConn
  const [estadoProvs, setEstadoProvs] = useState(null);
  // Projeto gerado e AINDA NÃO publicado: { files, nome, brief, kind }. É o que
  // alimenta a prévia de verdade e o botão Publicar.
  const [rascunho, setRascunho] = useState(null);
  // Conversa guiada de chave externa: a IA pergunta qual serviço, a pessoa
  // responde, e só então pedimos o token. Sem isso, um "gerador de vídeo"
  // era publicado bonito e sem funcionar, e a pessoa não descobria por quê.
  // { fase: "escolhendo" | "esperandoChave", capacidade, opcao }
  const [guia, setGuia] = useState(null);
  // Chaves que vao NO APP (so mapa). As de IA nunca passam por aqui: elas vao
  // direto pros segredos do Supabase em guardarChaveExterna().
  const [chavesExternas, setChavesExternas] = useState({});
  const resolvidasRef = useRef([]);
  const [rotaPrevia, setRotaPrevia] = useState("/");
  const [publicando, setPublicando] = useState(false);
  // Largura da conversa, em %. Fica no navegador pra não ter que reajustar
  // toda vez. Guardada direto no localStorage (não é dado de projeto).
  const [larguraChat, setLarguraChat] = useState(() => {
    const n = Number(localStorage.getItem("copilot:larguraChat"));
    return Number.isFinite(n) && n >= 28 && n <= 72 ? n : 45;
  });
  const salvarLargura = (v) => {
    setLarguraChat(v);
    try { localStorage.setItem("copilot:larguraChat", String(Math.round(v))); } catch {}
  };
  const [categoria, setCategoria] = useState("todos");
  const [vercelProjects, setVercelProjects] = useState(null);
  const [connOpen, setConnOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [tutsOpen, setTutsOpen] = useState(false);   // aba Tutoriais (tela em src/Tutoriais.jsx)
  const [sessions, setSessions] = useState([]);
  const [modelsCache, setModelsCache] = useState({});
  const [modelHealth, setModelHealth] = useState({});
  const [attached, setAttached] = useState([]);   // imagens anexadas (data URLs)
  const [plano, setPlano] = useState(null);        // plano pendente (1o comando de projeto novo)
  const [toast, setToast] = useState(null);
  const sessionRef = useRef(null);
  const msgRef = useRef(null);
  // "Grudar" no fim da conversa: só rola sozinho pro fim quando a pessoa já
  // está perto do fim. Assim, durante a geração (passos entrando a cada seg.),
  // se ela rolar pra cima pra ler, a tela NÃO é puxada de volta.
  const stickRef = useRef(true);
  const inputRef = useRef(null);
  const homeFileRef = useRef(null);
  const flowRef = useRef("ia");   // "ia" = geração/edição por IA · "sistema" = deploy/reconexão sem IA
  // O saldo de slots fora do React, pra funções soltas (refreshConn, run)
  // poderem ler o valor ATUAL sem virar dependência de efeito.
  const acessoRef = useRef(acesso);

  /** Relê o saldo de slots (depois de criar um projeto, por exemplo). */
  async function recarregarAcesso() {
    try {
      const p = await carregarPlano(sessao);
      acessoRef.current = p;
      setAcesso(p);
      // "IA pronta" também muda com o saldo: quem gastou o site do dia e não
      // tem chave própria volta a precisar de uma.
      setConn(c => ({ ...c, ia: Boolean(c.iaPropria) || p.casaDisponivel === true }));
    } catch { /* saldo desatualizado não quebra nada */ }
  }
  async function loadModelsCache() { setModelsCache((await store.get("modelsCache")) || {}); setModelHealth((await store.get("modelHealth")) || {}); }

  function showToast(text, err = false) { setToast({ text, err }); setTimeout(() => setToast(null), 4200); }
  async function refreshConn() {
    const gh = await store.get("github"), sb = await store.get("supabase"), vc = await store.getSecret("VERCEL_TOKEN");
    // IA pronta = pelo menos um provedor ligado com chave salva.
    const provs = (await store.get("providers")) || [], segredos = (await store.get("secrets")) || {};
    const comChave = p => Boolean((segredos[PROVIDER_CATALOG.find(c => c.id === p.id)?.secretKey] || "").trim());
    const temChave = p => p.enabled !== false && comChave(p);
    const iaPropria = provs.some(temChave);
    // ...OU o site de hoje com a NOSSA IA. Quem entrou agora não tem chave
    // nenhuma e mesmo assim consegue criar: sem isto, o app pediria uma chave
    // que ela não precisa ter (ver src/core/casa.js).
    const ia = iaPropria || acessoRef.current.casaDisponivel === true;
    // Quais provedores dá pra escolher de verdade. Sem isto, o seletor listava
    // o catálogo inteiro: escolher a Claude sem ter chave dela deixava o app
    // falhando em toda mensagem com "o provedor escolhido não está ativo ou
    // está sem chave", sem dizer qual nem onde resolver.
    // "desligado" e "sem chave" sao problemas diferentes e tem solucoes
    // diferentes: um se resolve no botao de ligar, o outro colando a chave.
    // Dizer "sem chave" para um servico que tem chave e so esta desligado
    // mandaria a pessoa procurar no lugar errado.
    setEstadoProvs(Object.fromEntries(provs.map(p =>
      [p.id, !comChave(p) ? "sem-chave" : (p.enabled === false ? "desligado" : "ok")]
    )));
    setConn({ github: gh.login || (gh.token ? "conectado" : null), avatar: gh.avatar || "", supabase: Boolean(sb.oauth || sb.token), vercel: Boolean(vc), ia, iaPropria });
    if (vc) loadVercelProjects();
  }
  async function refreshHistory() { setSessions(await history.listSessions()); }
  async function loadVercelProjects() {
    try { setVercelProjects(await vercel.listProjects()); }
    catch (e) { setVercelProjects([]); }
  }

  useEffect(() => {
    refreshConn(); refreshHistory(); loadModelsCache();
    if (oauthResult?.provider === "github") showToast(t("GitHub conectado: @{login}", { login: oauthResult.login }));
    if (oauthResult?.provider === "supabase") showToast(t("Supabase conectado."));
    if (oauthResult?.provider === "vercel") showToast(t("Vercel conectada."));
    if (oauthError) showToast(oauthError, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const el = msgRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight; }, [messages]);
  // Atualiza o "grudar" conforme a pessoa rola: perto do fim = volta a grudar.
  function onChatScroll(e) { const el = e.currentTarget; stickRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 90; }

  // Tick do cronômetro global de execução (só corre enquanto busy).
  useEffect(() => {
    if (!busy) return;
    setRunAgora(Date.now());
    const timer = setInterval(() => setRunAgora(Date.now()), 250);
    return () => clearInterval(timer);
  }, [busy]);

  // Batimento de progresso: a geração pode demorar minutos sem emitir evento
  // (a IA “Pensando…” e o agente só volta a falar no deploy). Sem isso, a pessoa
  // acha que bugou. Aqui traduzimos a espera em passos claros, com o tempo —
  // com frases próprias para fluxo de IA e para fluxo só de sistema/deploy.
  useEffect(() => {
    if (!busy) return;
    const t0 = runStartedAt || Date.now();
    const batidas = flowRef.current === "ia" ? [
      { s: 0,   texto: t("Enviando seu pedido para a IA…") },
      { s: 8,   texto: t("A IA está entendendo o pedido e desenhando as telas…") },
      { s: 20,  texto: t("A IA está escrevendo o código do seu projeto…") },
      { s: 40,  texto: t("A IA ainda está escrevendo o código — projetos maiores levam mais tempo…") },
      // Nada de "commit" nem "GitHub" aqui: desde que publicar virou um botão, a
      // geração não encosta em repositório nenhum. Dizer o contrário fazia
      // parecer que o app estava publicando pelas costas da pessoa.
      { s: 70,  texto: t("Quase lá — ajustando os detalhes das telas…") },
      // Daqui pra baixo NAO prometemos etapa nenhuma. A frase antiga dizia
      // "Montando a prévia" aos 110s, mas isso era só o relógio: por baixo a IA
      // muitas vezes ainda estava escrevendo, ou brigando com uma gratuita fora
      // do ar. Quem lia aquilo e via 5 minutos passarem achava, com razão, que
      // tinha travado. Agora o texto conta o que está acontecendo de verdade.
      { s: 110, texto: t("Ainda escrevendo — projetos com várias telas levam alguns minutos…") },
      { s: 170, texto: t("Demorando mais que o normal. As IAs gratuitas ficam lentas quando estão cheias; se alguma falhar, eu troco sozinho.") },
      { s: 260, texto: t("Última tentativa. Se não der, eu aviso aqui e você pode mandar de novo ou escolher outra IA no seletor.") }
    ] : [
      { s: 0,   texto: t("Trabalhando no seu pedido…") },
      { s: 15,  texto: t("Aplicando as mudanças no projeto…") },
      { s: 45,  texto: t("Preparando a publicação…") },
      { s: 90,  texto: t("Quase pronto — aguardando o preview atualizar…") }
    ];
    let enviadas = 0;
    function tick() {
      const seg = Math.floor((Date.now() - t0) / 1000);
      while (enviadas < batidas.length && seg >= batidas[enviadas].s) {
        const b = batidas[enviadas++];
        const passo = t("{texto} ({tempo} de trabalho)", { texto: b.texto, tempo: fmtDur(seg * 1000) });
        addStep(passo);
        setStatusText(passo);
      }
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // addStep/setStatusText são estáveis (setState); fmtDur é função de módulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  function pushMsg(role, text, images) { setMessages(m => [...m, { role, text, images }]); }
  function startRun() { stickRef.current = true; setStatusText(t("Preparando…")); setRunStartedAt(Date.now()); setMessages(m => [...m, { role: "run", steps: [], done: false, startedAt: Date.now() }]); }
  function addStep(text) {
    setMessages(m => {
      const c = [...m];
      for (let i = c.length - 1; i >= 0; i--) { if (c[i].role === "run" && !c[i].done) { c[i] = { ...c[i], steps: [...c[i].steps, text] }; break; } }
      return c;
    });
  }
  function endRun() { setMessages(m => m.map(x => (x.role === "run" && !x.done) ? { ...x, done: true, endedAt: Date.now() } : x)); }

  function onEvent(ev) {
    const passo = eventoTexto(ev);
    if (passo) { setStatusText(passo); addStep(passo); }
  }

  async function run(userText, { hardening = false, images = [], planoAprovado = false } = {}) {
    if (!userText.trim()) return;
    if (busy) { showToast(t("Ainda estou trabalhando no pedido anterior — espere terminar ou recarregue a página."), true); return; }

    // ---- conversa guiada da chave externa -----------------------------------
    // REGRA DE OURO AQUI: nunca prender a pessoa na pergunta. Se o que ela
    // escreveu não for uma resposta, a gente larga o assunto e trata como
    // pedido normal. Um app que insiste "responda 1 ou 2" quando a pessoa quer
    // mudar a cor de um botão é pior do que não ter perguntado nada.
    if (guia?.fase === "escolhendo") {
      const cap = capacidadePorId(guia.capacidade);
      const escolha = cap ? lerEscolha(cap, userText) : null;
      if (escolha) {
        setView("workspace");
        pushMsg("user", userText);
        setGuia({ fase: "esperandoChave", capacidade: cap.id, opcao: escolha.id });
        pushMsg("assistant", pedidoDaChave(cap, escolha));
        setInput("");
        return;
      }
      setGuia(null);   // não era resposta: segue o fluxo normal
    }

    if (guia?.fase === "esperandoChave") {
      const cap = capacidadePorId(guia.capacidade);
      const op = opcaoPorId(guia.capacidade, guia.opcao);
      const valor = op ? extrairChaveDoTexto(userText, op) : null;
      if (valor && cap && op) {
        await guardarChaveExterna(cap, op, valor);
        setInput("");
        return;
      }
      setGuia(null);   // não era a chave: segue o fluxo normal
    }

    // A pessoa colou uma chave (ex.: Google Maps)? Manda direto pro Supabase como
    // secret, sem passar pela geração de código — e sem mostrar a chave no chat.
    const seg = detectarSegredo(userText);
    if (seg) {
      const sb = await store.get("supabase");
      const ehMapa = seg.kind === "gmaps" || seg.kind === "mapbox";   // chave de mapa vai NO APP (front)
      if (ehMapa && !repo) { showToast(t("Abra um projeto primeiro (o mapa usa a chave no app)."), true); return; }
      if (!ehMapa && !sb.projectRef) { showToast(t("Escolha um projeto Supabase pra guardar a chave (Conexões)."), true); setConnOpen(true); return; }

      setView("workspace"); flowRef.current = "sistema"; setBusy(true);
      pushMsg("user", t("(enviei minha chave do {label})", { label: seg.label }));
      startRun();
      try {
        let partes = [];
        // 1) Chave de mapa client-side (Google Maps/Mapbox): vai NO APP + redeploy.
        if (ehMapa && repo) {
          const r = await configurarChaveMapa({ repo, apiKey: seg.value, envFront: seg.envFront, kind: seg.kind, label: seg.label, onEvent });
          if (r.url) { setPreviewUrl(r.url); setRepo({ ...repo, url: r.url }); }
          if (r.ok) partes.push(t("Coloquei sua chave do {label} no app e republiquei — o mapa deve carregar em ~1 min (recarregue o preview).", { label: seg.label }));
          else partes.push(t("Não achei onde o app usa a chave do {label} — talvez a tela do mapa ainda não exista. Peça primeiro pra criar o mapa.", { label: seg.label }));
        }
        // 2) Também guarda no Supabase (pra uso no servidor/Edge Functions, se houver).
        if (sb.projectRef) { try { await sbmgmt.setSecrets({ [seg.name]: seg.value }); partes.push(t("Também guardei a chave no seu Supabase (variável {nome}).", { nome: seg.name })); } catch { /* opcional */ } }
        endRun();
        const txt = partes.join(" ") || t("Guardei sua chave do {label}.", { label: seg.label });
        pushMsg("assistant", txt);
        if (sessionRef.current) await history.appendMessage(sessionRef.current, { role: "assistant", text: txt });
      } catch (e) { endRun(); pushMsg("error", t("Não consegui aplicar a chave: ") + e.message); showToast(e.message, true); }
      finally { setBusy(false); }
      return;
    }

    // Pediu pra CONFIGURAR/ADICIONAR a chave do Google Maps mas NÃO colou a chave:
    // a gente PEDE a chave. MAS só se for um pedido curto e direto — se for uma
    // edição (trocar por mapbox, remover, mudar estilo, prompt grande), deixa a
    // IA fazer de verdade, sem sequestrar com mensagem pronta.
    const ehEdicaoDeMapa = /\b(remov|tir|retir|troc|substitu|mapbox|mapa\s*box|mude|muda|altere?|estilo|melhor|uber|refator|reescrev)/i.test(userText);
    const pedeChaveMaps = /google\s*maps/i.test(userText)
      && /\b(adicion|configur|coloc|por a chave|p[õo]e a chave|ativar|habilit)/i.test(userText)
      && !ehEdicaoDeMapa
      && userText.length < 140;
    if (pedeChaveMaps) {
      setView("workspace");
      pushMsg("user", userText);
      if (!sessionRef.current) sessionRef.current = await history.createSession({ title: userText.slice(0, 48), kind });
      await history.appendMessage(sessionRef.current, { role: "user", text: userText });
      const sb = await store.get("supabase");
      const resp = sb.projectRef
        ? t('Beleza! Me manda aqui a sua chave do Google Maps — ela começa com "AIza…". Assim que você colar, eu guardo direto no seu Supabase (variável GOOGLE_MAPS_API_KEY), fora do código.')
        : t("Pra guardar a chave com segurança, primeiro escolha um projeto Supabase em Conexões → Supabase → Projeto. Depois é só me mandar a chave.");
      pushMsg("assistant", resp);
      await history.appendMessage(sessionRef.current, { role: "assistant", text: resp });
      if (!sb.projectRef) setConnOpen(true);
      refreshHistory();
      return;
    }

    // So EDITAR precisa de GitHub (o projeto ja vive num repositorio). Criar do
    // zero nao: a geracao e a previa acontecem inteiras aqui no navegador, e o
    // GitHub so entra quando a pessoa aperta Publicar.
    if (repo && !conn.github) { showToast(t("Conecte o GitHub primeiro (Conexões)."), true); setConnOpen(true); return; }

    // "desfaz/reverte/volta a versão anterior" → restaura o commit anterior (sem IA).
    if (repo && /\b(desfaz|desfa[çc]|revert|revers|undo|volta?r?\s+(a|pra|para)\s+(vers|anterior)|vers[aã]o\s+anterior)/i.test(userText)) {
      desfazer();
      return;
    }

    // "crie as tabelas / banco de dados" → fluxo dedicado (quase sem IA),
    // em vez de regenerar o app inteiro (que depende muito da IA).
    const pedeTabelas = repo && !hardening
      && /\b(tabelas?|banco de dados|schema)\b/i.test(userText)
      && /\b(cri|gera|faz|monta|configur|precis|quero|adiciona)/i.test(userText);
    if (pedeTabelas) {
      const sb = await store.get("supabase");
      if (!sb.projectRef) { showToast(t("Escolha um projeto Supabase primeiro (Conexões → Supabase → Projeto)."), true); setConnOpen(true); return; }
      setView("workspace"); flowRef.current = "sistema"; setBusy(true);
      pushMsg("user", userText); startRun();
      if (!sessionRef.current) sessionRef.current = await history.createSession({ title: userText.slice(0, 48), kind });
      await history.appendMessage(sessionRef.current, { role: "user", text: userText });
      try {
        const r = await criarTabelas({ repo, providerId, sessionId: sessionRef.current }, onEvent);
        endRun(); pushMsg("assistant", r.texto); refreshHistory();
      } catch (e) { endRun(); pushMsg("error", e.message); showToast(e.message, true); }
      finally { setBusy(false); }
      return;
    }

    // PLANO PRIMEIRO: só no 1º comando de um projeto NOVO (sem repo). A IA monta
    // um plano, a pessoa aprova/edita/recusa, e só então constrói. Edições de
    // projeto já aberto e os comandos seguintes passam direto.
    if (PLANO_ATIVO && !repo && !hardening && !planoAprovado) {
      setView("workspace");
      flowRef.current = "ia";
      setBusy(true);
      setPlano(null);
      pushMsg("user", userText, images.length ? images : undefined);
      startRun();
      try {
        const texto = await gerarPlano({ userMessage: userText, kind: detectarTipo(userText), providerId }, onEvent);
        endRun();
        setPlano({ prompt: userText, texto, images, kind: detectarTipo(userText) });
      } catch (e) {
        endRun();
        pushMsg("error", t("Não consegui montar o plano: ") + e.message);
        showToast(e.message, true);
      } finally { setBusy(false); }
      return;
    }

    // Trava do plano. Vale só para projeto NOVO: quem já tem um projeto aberto
    // continua editando, mesmo que o plano tenha vencido no meio do caminho —
    // tirar a ferramenta da mão de alguém no meio do trabalho é pior do que
    // deixar terminar.
    if (!repo && !acesso.semLogin && !acesso.pago) {
      const tipoPedido = modo || detectarTipo(userText);
      const bloqueio = motivoDoBloqueio(acesso, tipoPedido === "app" ? "app" : "site", conn.iaPropria === true);
      if (bloqueio) {
        // setView ANTES de empurrar as mensagens, e isto nao e detalhe: a home
        // nao desenha a conversa. Sem esta linha o pedido era aceito, o campo
        // limpava e a pessoa ficava olhando para a mesma tela sem explicacao
        // nenhuma — aconteceu com uma cliente de verdade, que achou que o
        // sistema tinha engolido o pedido dela.
        setView("workspace");
        pushMsg("user", userText, images.length ? images : undefined);
        pushMsg("assistant", bloqueio);
        // O aviso tambem vai de toast: se a pessoa estiver com a conversa
        // rolada para cima, a mensagem nova pode nascer fora do campo de visao.
        showToast(bloqueio, true);
        setInput("");
        return;
      }
    }

    // PROJETO NOVO: avisa a chave da casa que a PRÓXIMA chamada de IA começa um
    // projeto — nela o servidor confere se ainda há site do dia. Ver
    // src/core/casa.js.
    if (!repo) marcarProjetoNovo();

    setView("workspace");
    flowRef.current = "ia";
    setBusy(true);
    if (!planoAprovado) pushMsg("user", hardening ? t("Blindar o projeto") : userText, images.length ? images : undefined);
    startRun();
    // O histórico é conveniência: serve pra pessoa reabrir a conversa depois.
    // Se ele falhar (armazenamento cheio, modo privado, dado antigo corrompido),
    // isso NÃO pode impedir alguém de criar o projeto. Antes estes dois awaits
    // ficavam fora do try de baixo: um tropeço aqui matava o run() inteiro em
    // silêncio, com o botão de enviar travado.
    try {
      if (!sessionRef.current) sessionRef.current = await history.createSession({ title: userText.slice(0, 48), kind });
      await history.appendMessage(sessionRef.current, { role: "user", text: hardening ? t("Blindar o projeto") : userText });
    } catch (e) {
      console.warn("[historico] nao consegui guardar a conversa:", e);
    }
    try {
      const r = repo
        ? await editarProjeto({ repo, userMessage: userText, providerId, sessionId: sessionRef.current, embedImages: images }, onEvent)
        : await criarProjeto({ userMessage: userText, kind: modo || detectarTipo(userText), providerId, sessionId: sessionRef.current, embedImages: images }, onEvent);
      endRun();
      // CRIAÇÃO: nada foi publicado ainda. Guardamos os arquivos, mostramos a
      // prévia rodando de verdade e esperamos a pessoa clicar em Publicar.
      if (!repo) {
        setRascunho({ files: r.files, nome: r.nome, brief: r.brief, kind: r.kind });
        // Guarda junto da conversa. O slot ja foi gasto: sair da conversa e
        // voltar NAO pode significar perder o projeto.
        guardarRascunho(sessionRef.current, { files: r.files, nome: r.nome, brief: r.brief, kind: r.kind });
        setRotaPrevia("/");
        aplicarRotas(r.files?.["src/App.jsx"] || "");
        // SAIU UM PROJETO: anota no servidor. É isto que gasta o slot próprio e
        // que paga o convite de quem indicou esta pessoa. Não esperamos a
        // resposta nem mostramos erro: o projeto já está na tela, e perder a
        // contagem é menos grave do que estragar um momento que deu certo.
        if (!acesso.semLogin) {
          const usouCasa = consumirUsouCasa();
          avisarProjetoCriado(sessao, { nome: r.nome, tipo: r.kind, chaveDaCasa: usouCasa })
            .then(resp => {
              if (resp?.premiouConvite) {
                showToast(t("Quem te convidou ganhou {n} sites. Obrigado por criar!", { n: resp.premio }));
              }
              recarregarAcesso();
            })
            .catch(() => recarregarAcesso());
        }
      } else {
        setRepo(r.repo);
        if (r.url) setPreviewUrl(r.url);
      }
      // Na edição relemos o App.jsx (a alteração pode ter criado rotas novas).
      if (repo) {
        if (r.files?.["src/App.jsx"]) aplicarRotas(r.files["src/App.jsx"]);
        else carregarRotas(r.repo);
      }
      pushMsg("assistant", r.resumo || (repo
        ? t("Pronto — alteração salva.")
        : t("Projeto montado. Confira a prévia ao lado e clique em Publicar quando estiver bom.")));

      // O projeto precisa de uma IA de fora (vídeo, imagem, voz)? Então a
      // conversa NÃO acaba aqui. Publicar um gerador de vídeo sem chave entrega
      // um app que abre bonito e não faz nada — e a pessoa desiste achando que
      // a ferramenta é ruim, sem nunca descobrir o que faltava.
      // Perguntamos DEPOIS de mostrar a prévia, de propósito: ela já viu o
      // projeto de pé, então entende pra que serve a chave que estou pedindo.
      const cap = detectarCapacidade(r.files, resolvidasRef.current);
      if (cap) {
        setGuia({ fase: "escolhendo", capacidade: cap.id });
        pushMsg("assistant", perguntaDeEscolha(cap));
      }

      refreshHistory(); loadVercelProjects();
    } catch (e) {
      endRun();
      // Cancelar nao e falha: quem mandou parar sabe o que aconteceu e nao
      // precisa de tela vermelha nem de "dica" para consertar coisa nenhuma.
      if (e?.name === "CanceladoPeloUsuario") {
        pushMsg("assistant", t("Parei por aqui. Pode mandar outro pedido quando quiser."));
        setBusy(false);
        return;
      }
      let msg = e.message;
      if (/recusaram|timeout|refus/i.test(msg)) {
        msg += "\n\n" + t("Dica: no seletor de IA escolha um modelo de CÓDIGO (ex.: DeepSeek → deepseek-v4-pro, ou Gemini). Evite modelos de visão/experimentais — eles travam. E deixe mais de um provedor ligado em Conexões pra ter reserva.");
      }
      pushMsg("error", msg); showToast(e.message, true);
    }
    finally { setBusy(false); }
  }

  async function addFiles(fileList) {
    const novos = [];
    for (const f of fileList) {
      if (!f.type.startsWith("image/")) continue;
      if (attached.length + novos.length >= 4) { showToast(t("Máximo de 4 imagens por pedido."), true); break; }
      try { novos.push(await fileToDataUrl(f)); } catch { /* ignora imagem ilegível */ }
    }
    if (novos.length) setAttached(a => [...a, ...novos]);
  }

  /**
   * TODA chamada de run() passa por aqui.
   *
   * run() é async e era chamada sem .catch(). Qualquer erro fora do try interno
   * virava uma "rejeição não tratada": o navegador engole, nada aparece na tela
   * — e, como setBusy(true) já tinha rodado, o botão de enviar ficava
   * desabilitado para sempre. Da cadeira de quem usa: "mandei o prompt, ele
   * sumiu e não aconteceu nada", sem erro nenhum para contar o porquê.
   *
   * Aqui o erro vira mensagem, vira aviso e destrava o botão. Pode ser que um
   * pedido falhe; o que não pode é falhar calado.
   */
  /**
   * A pessoa colou a chave que pedimos. Guarda no lugar CERTO.
   *
   * Chave de mapa é feita para o navegador (se protege por domínio autorizado),
   * então vai no app. Chave de IA, não: no navegador ela fica legível para
   * qualquer visitante, e quem paga a conta é o dono do app. Essa vai para os
   * segredos do Supabase, onde só a Edge Function alcança.
   */
  async function guardarChaveExterna(cap, op, valor) {
    setView("workspace");
    pushMsg("user", t("(colei minha chave do {label})", { label: op.label }));

    if (cap.noNavegador) {
      // Mapa: o caminho já existente cuida disso (põe no app e republica).
      setGuia(null);
      resolvidasRef.current = [...resolvidasRef.current, cap.id];
      pushMsg("assistant", t("Anotei sua chave do {label}. Ela entra no app quando você publicar.", { label: op.label }));
      setChavesExternas(c => ({ ...c, [op.envFront]: valor }));
      return;
    }

    const sb = await store.get("supabase");
    if (!sb.projectRef) {
      // Sem Supabase não há onde guardar com segurança. Não guardamos no
      // navegador "pra adiantar": seria entregar a chave dela ao mundo.
      pushMsg("assistant", t("Pra guardar essa chave com segurança eu preciso do seu Supabase ligado — é lá que ela fica, fora do alcance de quem abre o site. Abri as Conexões: escolha um projeto Supabase e me mande a chave de novo."));
      setConnOpen(true);
      return;
    }

    setBusy(true); flowRef.current = "sistema"; startRun();
    try {
      await sbmgmt.setSecrets({ [op.segredo]: valor });
      endRun();
      setGuia(null);
      resolvidasRef.current = [...resolvidasRef.current, cap.id];
      pushMsg("assistant", t("Guardei sua chave do {label} nos segredos do seu Supabase (variável {nome}). Ela não aparece no site nem no código — só a função de servidor enxerga.", { label: op.label, nome: op.segredo }));
    } catch (e) {
      endRun();
      pushMsg("error", t("Não consegui guardar a chave: ") + e.message);
      showToast(e.message, true);
    } finally { setBusy(false); }
  }

  /** O botão de parar. Interrompe a IA sem recarregar a página. */
  function cancelarPedido() {
    cancelarIA();
    showToast(t("Parando…"));
  }

  function dispararRun(texto, opcoes) {
    // Baixa a bandeira de um cancelamento anterior, senão o pedido novo
    // nasceria já cancelado.
    comecarIA();
    run(texto, opcoes).catch(e => {
      if (e?.name === "CanceladoPeloUsuario") {
        endRun();
        pushMsg("assistant", t("Parei por aqui. Pode mandar outro pedido quando quiser."));
        setBusy(false);
        return;
      }
      console.error("[run] falhou fora do try:", e);
      const motivo = e?.message || String(e);
      setView("workspace");
      pushMsg("error", t("Algo deu errado antes de eu começar: ") + motivo);
      showToast(motivo, true);
      endRun();
      setBusy(false);
    });
  }

  function handleSend() {
    const texto = input.trim();
    if (!texto && !attached.length) return;
    const imgs = attached.slice();
    setInput(""); setAttached([]);
    dispararRun(texto || t("Use a imagem que enviei."), { images: imgs });
  }
  function aprovarPlano(textoFinal) {
    if (!plano) return;
    const p = plano; setPlano(null);
    const texto = (textoFinal ?? p.texto).trim();
    const prompt = p.prompt + (texto ? `\n\n[PLANO APROVADO — siga este plano]\n${texto}` : "");
    dispararRun(prompt, { images: p.images, planoAprovado: true });
  }
  function recusarPlano() {
    setPlano(null);
    pushMsg("assistant", t("Plano descartado. Me diga o que mudar ou mande um novo pedido que eu monto outro plano."));
  }
  function handleBlindar() { if (!repo) return showToast(t("Crie ou abra um projeto antes de blindar."), true); dispararRun(BLINDAR_PROMPT, { hardening: true }); }
  // Só aqui o projeto sai do navegador: cria o repositório e publica na Vercel.
  async function publicar() {
    if (!rascunho || publicando) return;
    // É AQUI que o GitHub passa a ser necessário, e não na hora de criar: a
    // pessoa já viu o projeto pronto, então agora a conexão tem um motivo
    // visível. Avisamos antes de tentar, para ela não esperar uma publicação
    // que já sabíamos que ia falhar.
    if (!conn.github) {
      pushMsg("assistant", t("Pra publicar eu preciso da sua conta do GitHub — é lá que o código do projeto fica guardado. Abri as Conexões pra você conectar; o projeto continua aqui, do jeitinho que está."));
      showToast(t("Conecte o GitHub para publicar (Conexões)."), true);
      setConnOpen(true);
      return;
    }
    setPublicando(true);
    flowRef.current = "sistema";
    startRun();
    try {
      const r = await publicarProjeto({
        files: rascunho.files, nome: rascunho.nome, brief: rascunho.brief,
        providerId, sessionId: sessionRef.current,
        envExtra: Object.keys(chavesExternas).length ? chavesExternas : null
      }, onEvent);
      endRun();
      setRepo(r.repo);
      apagarRascunho(sessionRef.current);   // publicado: o rascunho nao serve mais
      setRascunho(null);               // a partir daqui o preview é o site no ar
      if (r.url) setPreviewUrl(r.url);
      pushMsg("assistant", r.url
        ? t("Publicado! Seu site está no ar: {url}", { url: r.url })
        : t("Publicado no GitHub: {repo}", { repo: `${r.repo.owner}/${r.repo.name}` }));
      refreshHistory(); loadVercelProjects();
    } catch (e) {
      endRun();
      pushMsg("error", t("Não consegui publicar: ") + e.message);
      showToast(e.message, true);
    } finally { setPublicando(false); }
  }

  async function desfazer() {
    if (!repo || busy) return showToast(repo ? t("Aguarde terminar.") : t("Nenhum projeto aberto."), true);
    setView("workspace"); flowRef.current = "sistema"; setBusy(true);
    pushMsg("user", t("Desfazer a última alteração")); startRun();
    try {
      const r = await desfazerUltimo(repo, onEvent);
      endRun();
      if (r.url) { setPreviewUrl(r.url + (r.url.includes("?") ? "&" : "?") + "r=" + Date.now()); setRepo({ ...repo, url: r.url }); }
      pushMsg("assistant", t("Voltei pra versão anterior do projeto e republiquei. Recarregue o preview em ~1 min."));
    } catch (e) { endRun(); pushMsg("error", e.message); showToast(e.message, true); }
    finally { setBusy(false); }
  }
  // Rotas: do arquivo gerado (criação) ou lendo o App.jsx do repositório.
  function aplicarRotas(appJsx) { const rs = extrairRotas(appJsx); setRotas(rs); setRota(r => rs.includes(r) ? r : "/"); }
  async function carregarRotas(r) {
    if (!r?.owner) return;
    // readFile devolve { path, sha, size, content } — o texto está em .content.
    try { aplicarRotas((await github.readFile(r.owner, r.name, r.branch || "main", "src/App.jsx")).content); }
    catch { setRotas(["/"]); setRota("/"); }
  }
  // Troca a rota mostrada no preview (igual ao Lovable: clicou, o preview vai).
  function irParaRota(nova) {
    setRota(nova);
    // Antes de publicar, trocar de tela é trocar a rota da prévia local — não
    // existe URL para navegar ainda.
    if (rascunho) { setRotaPrevia(nova); return; }
    const base = (() => { try { return new URL(repo?.url || previewUrl).origin; } catch { return null; } })();
    if (base) setPreviewUrl(base + (nova === "/" ? "/" : nova) + "?r=" + Date.now());
  }

  function novoProjeto() { setModo(""); setRotas(["/"]); setRota("/"); sessionRef.current = null; setRepo(null); setPreviewUrl(null); setRascunho(null); setRotaPrevia("/"); setMessages([]); setView("home"); }
  // Só preenche o campo (comportamento igual ao de digitar): não envia nada.
  function sugerir(texto) {
    setInput(texto);
    setTimeout(() => { const el = inputRef.current; if (!el) return; el.focus(); el.setSelectionRange(texto.length, texto.length); el.scrollIntoView({ block: "center", behavior: "smooth" }); }, 0);
  }

  async function openSession(id) {
    const s = await history.getSession(id);
    if (!s) return;
    setHistOpen(false); sessionRef.current = id; stickRef.current = true;
    // Mesma recuperação do openProject: conversas antigas foram salvas antes de
    // existir o store de briefs, e sem o pedido original a IA recria genérico.
    let r = s.repo || null;
    if (r && !r.brief) {
      const briefs = (await store.get("briefs")) || {};
      const salvo = briefs[`${r.owner}/${r.name}`];
      if (salvo) r = { ...r, brief: salvo };
    }
    setRepo(r); setPreviewUrl(r?.url || null);
    setRota("/"); carregarRotas(s.repo);
    setMessages((s.messages || []).map(m => ({ role: m.role, text: m.text })));

    // Projeto gerado e ainda nao publicado? Ele volta com a conversa, com a
    // previa rodando. Antes disto o rascunho morava so na memoria da tela:
    // sair e voltar apagava o projeto, e o slot ja tinha sido gasto.
    const guardado = await lerRascunho(id);
    if (guardado && !r) {
      setRascunho({ files: guardado.files, nome: guardado.nome, brief: guardado.brief, kind: guardado.kind });
      setRotaPrevia("/");
      aplicarRotas(guardado.files?.["src/App.jsx"] || "");
    } else {
      setRascunho(null);
    }

    setView("workspace");
  }
  async function openProject(p) {
    setProjOpen(false);
    // Continuidade: se já existe uma conversa deste projeto, reabre ela.
    const todas = await history.listSessions();
    const existente = todas.find(s => s.repo && s.repo.owner === p.owner && s.repo.name === p.name);
    if (existente) { await openSession(existente.id); return; }

    sessionRef.current = null;
    // Recupera o pedido original salvo na criação. Sem ele, pedir "arruma isso"
    // num projeto reaberto fazia a IA recriar um site genérico, de outro tema.
    const briefs = (await store.get("briefs")) || {};
    const repoInfo = { owner: p.owner, name: p.name, branch: p.branch || "main", url: p.url || null, brief: briefs[`${p.owner}/${p.name}`] || "" };
    setRepo(repoInfo);
    setRota("/"); carregarRotas(repoInfo);
    setMessages([{ role: "assistant", text: t("Projeto aberto: {repo}. Peça as alterações aqui que eu edito.", { repo: `${p.owner}/${p.name}` }) }]);
    setView("workspace");
    let url = p.url || null;
    if (!url) { try { url = await vercel.getProdUrl(p.owner, p.name); } catch {} }
    setPreviewUrl(url); if (url) setRepo({ ...repoInfo, url });
  }

  function pickModel(id, model) { setProviderId(id); setActiveModel(model); if (id && model) store.get("providers").then(a => store.set("providers", a.map(p => p.id === id ? { ...p, model } : p))); }

  // Chamado após escolher o projeto Supabase: se há um app aberto, injeta as
  // credenciais nele e republica (determinístico, sem IA).
  async function aoLigarSupabase() {
    refreshConn();
    if (!repo || busy) return;
    setView("workspace"); flowRef.current = "sistema"; setBusy(true); startRun();
    try {
      const r = await reconectarSupabase(repo, onEvent);
      endRun();
      if (r.url) { setPreviewUrl(r.url); setRepo({ ...repo, url: r.url }); }
      pushMsg("assistant", t("Conectei seu app ao Supabase que você escolheu. Agora ele fala com o seu banco de verdade (sem mais placeholder)."));
    } catch (e) { endRun(); pushMsg("error", e.message); }
    finally { setBusy(false); }
  }

  const composer = (
    <Composer
      big={view === "home"} repo={repo} busy={busy} input={input} setInput={setInput}
      inputRef={inputRef}
      kind={kind} setKind={setKind} onSend={handleSend} onCancel={cancelarPedido} onBlindar={handleBlindar}
      providerId={providerId} activeModel={activeModel} onPickModel={pickModel} modelsCache={modelsCache} modelHealth={modelHealth}
      estadoProvs={estadoProvs} podeApisPagas={acesso.podeApisPagas !== false}
      onPlanoPago={() => showToast(t("As IAs pagas (Claude, DeepSeek, xAI) fazem parte do plano Pro. No grátis dá para usar as quatro gratuitas."))}
      attached={attached} onAddFiles={addFiles} onRemoveAttach={(i) => setAttached(a => a.filter((_, x) => x !== i))}
      projects={vercelProjects} onLoadProjects={loadVercelProjects} onOpenProject={openProject} onNew={novoProjeto}
      onPlusConexoes={() => { setKeysOpen(false); setConnOpen(true); }} onPlusChaves={() => { setKeysOpen(true); setConnOpen(true); }}
    />
  );

  // "Continue de onde parou": conversas recentes; se não houver, projetos.
  // Só reaproveita handlers que já existem (abrir conversa / abrir projeto).
  const recentes = sessions.length
    ? sessions.slice(0, 4).map(s => ({
        id: s.id,
        titulo: s.title,
        meta: `${fmtData(s.updatedAt)}${s.repo ? ` · ${s.repo.name}` : ""}`,
        abrir: () => openSession(s.id)
      }))
    : (vercelProjects || []).slice(0, 4).map((p, i) => ({
        id: `${p.owner}/${p.name}/${i}`,
        titulo: p.vercelName || p.name,
        meta: p.url ? p.url.replace(/^https?:\/\//, "") : `${p.owner}/${p.name}`,
        abrir: () => openProject(p)
      }));

  const sidebarAtivo = tutsOpen ? "tutoriais" : projOpen ? "projetos" : histOpen ? "conversas" : connOpen ? "conexoes" : "inicio";
  const abrirConexoes = () => { setKeysOpen(false); setConnOpen(true); };
  const abrirChaves = () => { setKeysOpen(true); setConnOpen(true); };
  const abrirProjetos = () => { loadVercelProjects(); setProjOpen(true); };
  // No celular a barra lateral cobre a tela toda, entao sai da frente ao abrir os tutoriais.
  const abrirTutoriais = () => { setTutsOpen(true); if (window.innerWidth <= 820) setSideOpen(false); };
  const abrirConversas = () => { refreshHistory(); setHistOpen(true); };
  const irParaModelos = () => document.getElementById("modelos")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Blocos estilo Bolt abaixo do campo: escolhem o TIPO do projeto.
  function escolherTipo(id) {
    // App e SaaS sao do plano Pro. Mostramos o bloco mesmo assim, com cadeado:
    // esconder nao converte ninguem, ver o que esta bloqueado converte.
    if ((id === "app" || id === "ia") && !acesso.podeApps) {
      showToast(motivoDoBloqueio(acesso, "app"));
      return;
    }
    if (id === "clone") { setModo(""); sugerir(t(PROMPT_CLONE)); return; }
    if (id === "ia") { setModo("app"); setCategoria("ia"); irParaModelos(); return; }
    const novo = modo === id ? "" : id;
    setModo(novo);
    setCategoria(novo === "site" ? "sites" : novo === "app" ? "apps" : "todos");
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  const dicaComposer = modo === "site" ? t("Descreva o site: o negócio, as seções e o estilo…")
    : modo === "app" ? t("Descreva o app: quem usa, as telas e o que precisa salvar…") : "";

  return (
    <div className="app">
      {sideOpen
        ? <Sidebar
            conn={conn} projects={vercelProjects} ativo={sidebarAtivo}
            onNew={novoProjeto} onProjetos={abrirProjetos} onConversas={abrirConversas}
            onConexoes={abrirConexoes} onChaves={abrirChaves} onTutoriais={abrirTutoriais}
            onOpenProject={openProject} onCollapse={() => setSideOpen(false)}
          />
        : <SideRail
            conn={conn} ativo={sidebarAtivo} onExpand={() => setSideOpen(true)}
            onNew={novoProjeto} onProjetos={abrirProjetos} onConversas={abrirConversas}
            onConexoes={abrirConexoes} onChaves={abrirChaves} onTutoriais={abrirTutoriais}
          />}
      {sideOpen && <div className="side-scrim" onClick={() => setSideOpen(false)} />}

      <div className="content">
        {!sideOpen && <button className="icon-btn side-reopen" onClick={() => setSideOpen(true)} title={t("Mostrar menu")}><IconMenu /></button>}
        {view === "home" ? (
          <div className="home">
            <HomeBackdrop />
            <div className="home-top"><LangSelect down /></div>
            <div className="home-inner">
              <button className="announce" onClick={() => escolherTipo("clone")}>
                <span className="announce-tag">{t("Novo")}</span>
                {t("Clone qualquer site com um link")}
                <IconChevronRight />
              </button>
              <h1 className="hero-title">{t("O que você quer")} <span className="grad">{t("criar")}</span> {t("hoje?")}</h1>
              <p className="hero-sub">{t("Crie sites, apps e SaaS conversando com a IA. Ela escreve o código, publica na Vercel e explica cada passo para você aprender junto.")}</p>
              {React.cloneElement(composer, { dica: dicaComposer })}

              <div className="kinds" role="group" aria-label={t("Tipo de projeto")}>
                {TIPOS.map(k => (
                  <button key={k.id} className={"kind" + (modo === k.id ? " on" : "")} onClick={() => escolherTipo(k.id)} aria-pressed={modo === k.id}>
                    <span className="kind-ic">{k.novo && <span className="kind-new">{t("Novo")}</span>}<TplIcon ic={k.ic} /></span>
                    <span className="kind-label">{t(k.label)}</span>
                  </button>
                ))}
              </div>

              <div className="start-from">
                <span>{t("ou comece de")}</span>
                <button className="from-chip" onClick={irParaModelos}><IconGrid /> {t("Um modelo")}</button>
                <button className="from-chip" onClick={() => homeFileRef.current?.click()}><IconImage /> {t("Um print ou imagem")}</button>
                <button className="from-chip" onClick={abrirProjetos}><IconFolder /> {t("Um projeto seu")}</button>
                <input ref={homeFileRef} type="file" accept="image/*" multiple hidden onChange={e => {
                  addFiles([...e.target.files]); e.target.value = "";
                  if (!input.trim()) sugerir(t("Recrie esta tela a partir da imagem que enviei, com o mesmo layout e estilo."));
                }} />
              </div>

              {!(conn.ia && conn.github && conn.vercel) && (
                <div className="setup">
                  <div className="setup-text">
                    <b>{t("Configure em 2 minutos")}</b>
                    <span>{t("As opções grátis já bastam para criar e publicar.")}</span>
                  </div>
                  <div className="setup-steps">
                    <span className={"setup-step" + (conn.ia ? " ok" : "")}><span className="setup-dot">{conn.ia ? <IconCheck /> : "1"}</span>{t("Chave de IA")}</span>
                    <span className={"setup-step" + (conn.github ? " ok" : "")}><span className="setup-dot">{conn.github ? <IconCheck /> : "2"}</span>GitHub</span>
                    <span className={"setup-step" + (conn.vercel ? " ok" : "")}><span className="setup-dot">{conn.vercel ? <IconCheck /> : "3"}</span>Vercel</span>
                  </div>
                  <button className="btn sm primary" onClick={() => (conn.ia ? abrirConexoes() : abrirChaves())}>{t("Configurar")}</button>
                </div>
              )}
            </div>

            <section className="home-section" id="modelos">
              <div className="section-head">
                <h2>{t("Modelos")}</h2>
                <span className="section-sub">{t("Cada modelo já nasce com telas, dados de exemplo e fluxos do nicho.")}</span>
                <div className="seg" role="tablist">
                  {CATEGORIAS.map(c => (
                    <button key={c.id} role="tab" aria-selected={categoria === c.id} className={"seg-btn" + (categoria === c.id ? " on" : "")} onClick={() => setCategoria(c.id)}>{t(c.label)}</button>
                  ))}
                </div>
              </div>
              <div className="tpl-grid">
                {MODELOS.filter(m => categoria === "todos" || m.cat === categoria).map(m => (
                  <button key={m.titulo} className="tpl" onClick={() => { setModo(m.cat === "sites" ? "site" : "app"); sugerir(t(m.prompt)); }} title={t(m.prompt)}>
                    <Thumb tipo={m.thumb} />
                    <span className="tpl-body">
                      <span className="tpl-ic"><TplIcon ic={m.ic} /></span>
                      <span className="tpl-text">
                        <span className="tpl-title">{t(m.titulo)}</span>
                        <span className="tpl-desc">{t(m.desc)}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {recentes.length > 0 && (
              <section className="home-section">
                <div className="section-head">
                  <h2>{t("Continue de onde parou")}</h2>
                  <button className="section-link" onClick={sessions.length ? abrirConversas : abrirProjetos}>{t("Ver tudo")} <IconChevronRight /></button>
                </div>
                <div className="recent-grid">
                  {recentes.map(r => (
                    <button key={r.id} className="recent-card" onClick={r.abrir}>
                      <span className="recent-thumb"><IconFolder /></span>
                      <span className="recent-text">
                        <span className="recent-title">{r.titulo}</span>
                        <span className="recent-meta">{r.meta}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <p className="home-hint"><IconLock /> {t("Suas chaves ficam só no seu navegador. O código é seu, no seu GitHub.")}</p>
          </div>
        ) : (
          <div className="workspace">
            <div className="m-tabs">
              <button className={"m-tab" + (mobileView === "chat" ? " on" : "")} onClick={() => setMobileView("chat")}>{t("Chat")}</button>
              <button className={"m-tab" + (mobileView === "preview" ? " on" : "")} onClick={() => setMobileView("preview")}>{t("Preview")}</button>
            </div>
            <div className={"chat-col" + (mobileView === "preview" ? " m-off" : "")} style={{ width: larguraChat + "%" }}>
              <div className="chat-top">
                {repo ? (
                  <div className="repo-chip" title={`${repo.owner}/${repo.name}`}>
                    <IconRepo />
                    <span className="owner">{repo.owner}<span className="sep">/</span></span><b>{repo.name}</b>
                  </div>
                ) : (
                  <div className="repo-chip"><IconSpark /><b>{t("Novo projeto")}</b></div>
                )}
                <div className={"live" + (busy ? " on" : "")}>
                  {busy ? (statusText || t("trabalhando…")) : (repo ? t("pronto pra editar") : t("aguardando"))}
                </div>
              </div>

              <div className="chat-messages" ref={msgRef} onScroll={onChatScroll}>
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <span className="orb"><IconSpark /></span>
                    <div>{t("Descreva o que você quer construir ou mudar neste projeto. Eu cuido do código, do commit e do deploy.")}</div>
                  </div>
                )}
                {messages.map((m, i) => m.role === "run"
                  ? <RunCard key={i} steps={m.steps} done={m.done} startedAt={m.startedAt} endedAt={m.endedAt} />
                  : <Bubble key={i} role={m.role} text={m.text} images={m.images} />)}
              </div>

              {plano && !busy && (
                <PlanCard plano={plano} onAprovar={aprovarPlano} onRecusar={recusarPlano} />
              )}
              {busy && (
                <div className="working-bar">
                  <span className="spin" />
                  <span className="working-text">{statusText || t("Trabalhando…")}</span>
                  <span className="working-time" title={t("Tempo decorrido")}>{fmtDur(Math.max(0, (runAgora - (runStartedAt || runAgora))))}</span>
                </div>
              )}
              {composer}
            </div>

            {/* Divisória arrastável: a conversa era fixa em 45% e, numa tela de
                1366px, sobravam ~470px — estreito a ponto de obrigar a mexer no
                zoom do navegador pra ler. Agora cada um escolhe, e fica salvo. */}
            <div
              className="split-handle"
              role="separator"
              aria-label={t("Arraste para mudar a largura da conversa")}
              title={t("Arraste para mudar a largura da conversa (dois cliques volta ao padrão)")}
              onDoubleClick={() => salvarLargura(45)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const area = e.currentTarget.parentElement;
                const mover = (ev) => {
                  const r = area.getBoundingClientRect();
                  const pct = ((ev.clientX - r.left) / r.width) * 100;
                  setLarguraChat(Math.min(72, Math.max(28, pct)));
                };
                const soltar = (ev) => {
                  e.currentTarget.releasePointerCapture?.(ev.pointerId);
                  window.removeEventListener("pointermove", mover);
                  window.removeEventListener("pointerup", soltar);
                  setLarguraChat(v => { salvarLargura(v); return v; });
                };
                window.addEventListener("pointermove", mover);
                window.addEventListener("pointerup", soltar);
              }}
            />

            <div className={"preview-col" + (mobileView === "chat" ? " m-off" : "")}>
              <div className="preview-bar">
                <div className="browser-dots"><i /><i /><i /></div>
                <RotaPicker rotas={rotas} rota={rota} onPick={irParaRota} previewUrl={previewUrl} local={Boolean(rascunho)} onAbrir={() => carregarRotas(repo)} />
                <div className="vp-toggle">
                  <button className={"vp" + (viewport === "desktop" ? " on" : "")} onClick={() => setViewport("desktop")} title={t("Computador")}><IconDesktop /></button>
                  <button className={"vp" + (viewport === "mobile" ? " on" : "")} onClick={() => setViewport("mobile")} title={t("Celular")}><IconMobile /></button>
                </div>
                <div className="preview-actions">
                  {/* Nada foi para o GitHub nem para a Vercel ainda: este botão é
                      que decide. Enquanto ele não for clicado, a conta da pessoa
                      não ganha repositório nem deploy de tentativa. */}
                  {rascunho && (
                    <button className="btn sm primary" onClick={publicar} disabled={publicando || busy}
                      title={t("Criar o repositório no GitHub e colocar no ar na Vercel")}>
                      {publicando ? t("Publicando…") : t("Publicar")}
                    </button>
                  )}
                  {rascunho && <button className="icon-btn" onClick={() => setRotaPrevia(r => r)} title={t("Recarregar a prévia")}><IconRefresh /></button>}
                  {repo && <button className="icon-btn" onClick={desfazer} disabled={busy} title={t("Desfazer a última alteração")}><IconUndo /></button>}
                  {previewUrl && <button className="icon-btn" onClick={() => setPreviewUrl(previewUrl + (previewUrl.includes("?") ? "&" : "?") + "r=" + Date.now())} title={t("Recarregar")}><IconRefresh /></button>}
                  {previewUrl && <button className="btn sm" onClick={() => window.open(previewUrl, "_blank")} title={t("Abrir em nova aba")}>{t("Abrir")} <IconExternal /></button>}
                </div>
              </div>
              <div className={"preview-stage" + (viewport === "mobile" ? " mobile" : "")}>
                {/* Prévia LOCAL: o projeto roda aqui antes de existir repositório.
                    A key força o iframe a remontar ao trocar de tela — a prévia usa
                    MemoryRouter, então a rota entra na montagem. */}
                {rascunho ? (
                  <iframe
                    key={rotaPrevia}
                    className="preview-frame"
                    title="previa"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    srcDoc={montarHtmlPrevia(rascunho.files, rotaPrevia, { marca: "painel" })}
                  />
                ) : previewUrl ? <iframe className="preview-frame" src={previewUrl} title="preview" />
                  : <div className="preview-empty">
                      <span className="orb"><IconMonitor /></span>
                      <b>{t("O preview aparece aqui")}</b>
                      <p>{t("Assim que o projeto for montado, a página roda neste painel. Use o ícone de celular pra ver o layout no mobile.")}</p>
                    </div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {projOpen && <ProjectsDrawer projects={vercelProjects} onReload={loadVercelProjects} onOpen={openProject} onClose={() => setProjOpen(false)} acesso={acesso} onConvidar={() => { setProjOpen(false); abrirConexoes(); }} />}
      {histOpen && <HistoryDrawer sessions={sessions} onOpen={openSession}
        onDelete={async id => { await history.deleteSession(id); refreshHistory(); }}
        onClear={async () => { await history.clearAll(); refreshHistory(); }}
        onClose={() => setHistOpen(false)} />}
      {/* onMudou: a cada chave salva/ligada o seletor precisa saber NA HORA. Antes
          só o onClose atualizava, então salvar a chave e abrir o seletor sem
          fechar o painel mostrava "sem chave" num serviço que já tinha chave. */}
      {connOpen && <Connections repo={repo} startKeys={keysOpen} onSupabaseBound={aoLigarSupabase} sessao={sessao} acesso={acesso}
        onMudou={() => { refreshConn(); loadModelsCache(); }}
        onClose={() => { setConnOpen(false); refreshConn(); loadModelsCache(); }} showToast={showToast} />}
      {tutsOpen && <Tutoriais onClose={() => setTutsOpen(false)} />}
      {toast && <div className={"toast" + (toast.err ? " err" : "")}>{toast.text}</div>}
    </div>
  );
}

/* ---------------- Fundo da home (estilo Bolt: aurora + pontos + horizonte) ---------------- */
function HomeBackdrop() {
  return (
    <div className="home-bg" aria-hidden="true">
      <Aurora
        className="home-aurora"
        colorStops={["#2b0716", "#e11d48", "#5b1240"]}
        amplitude={0.85}
        blend={0.6}
        speed={0.5}
        mouse
      />
      <div className="home-dots" />
      <div className="home-horizon" />
    </div>
  );
}

/* ---------------- Miniaturas dos modelos (mockups em CSS, sem imagem externa) ---------------- */
function Thumb({ tipo }) {
  const n = k => Array.from({ length: k }, (_, i) => i);
  const corpo = {
    dash: <><i className="m-side" /><span className="m-main"><span className="m-row">{n(3).map(i => <i key={i} className="m-stat" />)}</span><span className="m-bars">{[40, 65, 50, 85, 60, 95, 72].map((h, i) => <i key={i} style={{ height: h + "%" }} />)}</span></span></>,
    landing: <span className="m-col"><i className="m-nav" /><i className="m-h1" /><i className="m-h2" /><i className="m-cta" /><span className="m-row">{n(3).map(i => <i key={i} className="m-card" />)}</span></span>,
    grid: <span className="m-col"><i className="m-nav" /><span className="m-tiles">{n(6).map(i => <i key={i} className="m-tile" />)}</span></span>,
    chat: <span className="m-col m-chat"><i className="m-msg l" /><i className="m-msg r" /><i className="m-msg l w" /><i className="m-msg r s" /><i className="m-input" /></span>,
    cal: <span className="m-col"><i className="m-nav" /><span className="m-cal">{n(21).map(i => <i key={i} className={[3, 9, 10, 16].includes(i) ? "on" : ""} />)}</span></span>,
    kanban: <span className="m-kan">{n(3).map(c => <span key={c} className="m-lane">{n(3 - (c % 2)).map(i => <i key={i} />)}</span>)}</span>,
    media: <span className="m-col"><i className="m-art" /><i className="m-input" /></span>,
    bio: <span className="m-col m-bio"><i className="m-ava" /><i className="m-h2" />{n(4).map(i => <i key={i} className="m-pill" />)}</span>,
    quiz: <span className="m-col m-quiz"><i className="m-prog" /><i className="m-h1" />{n(3).map(i => <i key={i} className={"m-opt" + (i === 1 ? " on" : "")} />)}</span>
  }[tipo] || null;
  return <span className={"tpl-thumb th-" + tipo} aria-hidden="true"><span className="m-win">{corpo}</span></span>;
}

/* ---------------- Seletor de idioma ---------------- */
function LangSelect({ compact = false, down = false }) {
  useIdioma();
  const [open, setOpen] = useState(false);
  const atual = infoIdioma();
  return (
    <div className={"pop-anchor lang" + (compact ? " compact" : "")}>
      {compact
        ? <button className="rail-btn" onClick={() => setOpen(v => !v)} data-tip={t("Idioma")} aria-label={t("Idioma")}><IconGlobe /></button>
        : <button className="lang-btn" onClick={() => setOpen(v => !v)} aria-label={t("Idioma")}><IconGlobe /> <span>{atual.label}</span> <IconChevronDown /></button>}
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className={"pop menu lang-pop" + (compact ? " side" : "") + (down ? " down" : "")}>
          {IDIOMAS.map(x => (
            <button key={x.id} onClick={() => { setIdioma(x.id); setOpen(false); }}>
              <span className="lang-code">{x.curto}</span><span>{x.label}</span>{x.id === atual.id && <span className="lang-ok"><IconCheck /></span>}
            </button>
          ))}
        </div>
      </>)}
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function iniciais(nome) {
  const limpo = String(nome || "?").replace(/[^a-zA-Z0-9]/g, "");
  return (limpo.slice(0, 2) || "?").toUpperCase();
}
const CORES_AVATAR = ["", " c2", " c3", " c4"];

function Conta({ conn, onClick, compact = false }) {
  const tudoOk = conn.ia && conn.github && conn.vercel;
  const foto = conn.avatar
    ? <img src={conn.avatar} alt="" />
    : <span className="acc-ini">{conn.github && conn.github !== "conectado" ? iniciais(conn.github) : <IconUser />}</span>;
  if (compact) {
    return (
      <button className="rail-acc" onClick={onClick} data-tip={conn.github && conn.github !== "conectado" ? "@" + conn.github : t("Conectar GitHub")}>
        {foto}<span className={"acc-dot" + (tudoOk ? " ok" : "")} />
      </button>
    );
  }
  return (
    <button className="acc" onClick={onClick} title={t("Conexões")}>
      <span className="acc-pic">{foto}<span className={"acc-dot" + (tudoOk ? " ok" : "")} /></span>
      <span className="acc-text">
        <span className="acc-name">{conn.github && conn.github !== "conectado" ? "@" + conn.github : (conn.github ? t("GitHub conectado") : t("Conectar GitHub"))}</span>
        <span className="acc-sub">{tudoOk ? t("Tudo conectado") : t("Configuração pendente")}</span>
      </span>
      <IconChevronDown />
    </button>
  );
}

function Sidebar({ conn, projects, ativo, onNew, onProjetos, onConversas, onConexoes, onChaves, onTutoriais, onOpenProject, onCollapse }) {
  return (
    <aside className="sidebar">
      <div className="side-head">
        <div className="brand">
          <span className="brand-mark"><img src="/brand/logo.png" alt="Prumo Code" className="brand-logo" /></span>
        </div>
        <button className="icon-btn ghosty side-collapse" onClick={onCollapse} title={t("Recolher menu")}><IconPanel /></button>
      </div>

      <Conta conn={conn} onClick={onConexoes} />

      <button className="side-new" onClick={onNew}><IconPlus /> {t("Nova conversa")}</button>

      <nav className="side-nav">
        <button className={"nav-item" + (ativo === "inicio" ? " on" : "")} onClick={onNew}><IconHome /> {t("Início")}</button>
        <button className={"nav-item" + (ativo === "projetos" ? " on" : "")} onClick={onProjetos}>
          <IconGrid /> {t("Projetos")}
          {Array.isArray(projects) && projects.length > 0 && <span className="nav-count">{projects.length}</span>}
        </button>
        <button className={"nav-item" + (ativo === "conversas" ? " on" : "")} onClick={onConversas}><IconChat /> {t("Conversas")}</button>
        <button className={"nav-item" + (ativo === "tutoriais" ? " on" : "")} onClick={onTutoriais}><IconPlayBox /> {t("Tutoriais")}</button>
        <span className="side-sep" />
        <button className={"nav-item" + (ativo === "conexoes" ? " on" : "")} onClick={onConexoes}><IconPlug /> {t("Conexões")}</button>
        <button className="nav-item" onClick={onChaves}><IconKey /> {t("Chaves de IA")}</button>
      </nav>

      <div className="side-section">{t("Projetos recentes")}</div>
      <div className="side-list">
        {!conn.vercel ? <button className="side-empty linklike-muted" onClick={onConexoes}>{t("Conecte a Vercel para listar seus projetos")}</button>
          : projects === null ? <span className="side-empty">{t("Carregando…")}</span>
          : projects.length === 0 ? <span className="side-empty">{t("Nenhum projeto ainda")}</span>
          : projects.slice(0, 8).map((p, i) => (
            <button key={i} className="side-proj" onClick={() => onOpenProject(p)} title={p.url || `${p.owner}/${p.name}`}>
              <span className={"proj-avatar" + CORES_AVATAR[i % 4]}><IconGem /></span>
              <span>{p.vercelName || p.name}</span>
            </button>
          ))}
      </div>

      <div className="side-foot">
        <LangSelect />
        <div className="side-status">
          <span className={conn.ia ? "on" : ""}>{t("IA")}</span>
          <span className={conn.github ? "on" : ""}>GitHub</span>
          <span className={conn.supabase ? "on" : ""}>Supabase</span>
          <span className={conn.vercel ? "on" : ""}>Vercel</span>
        </div>
      </div>
    </aside>
  );
}

// Menu recolhido (estilo Bolt): trilho só de ícones, com dica ao passar o mouse.
function SideRail({ conn, ativo, onExpand, onNew, onProjetos, onConversas, onConexoes, onChaves, onTutoriais }) {
  return (
    <aside className="rail">
      <button className="rail-btn" onClick={onExpand} data-tip={t("Expandir menu")}><IconPanel /></button>
      <button className="rail-logo" onClick={onNew} data-tip="Prumo Code"><img src="/brand/logo.png" alt="Prumo Code" /></button>
      <button className="rail-btn rail-new" onClick={onNew} data-tip={t("Nova conversa")}><IconPlus /></button>
      <button className={"rail-btn" + (ativo === "inicio" ? " on" : "")} onClick={onNew} data-tip={t("Início")}><IconHome /></button>
      <button className={"rail-btn" + (ativo === "projetos" ? " on" : "")} onClick={onProjetos} data-tip={t("Projetos")}><IconGrid /></button>
      <button className={"rail-btn" + (ativo === "conversas" ? " on" : "")} onClick={onConversas} data-tip={t("Conversas")}><IconChat /></button>
      <button className={"rail-btn" + (ativo === "tutoriais" ? " on" : "")} onClick={onTutoriais} data-tip={t("Tutoriais")}><IconPlayBox /></button>
      <span className="rail-sep" />
      <button className={"rail-btn" + (ativo === "conexoes" ? " on" : "")} onClick={onConexoes} data-tip={t("Conexões")}><IconPlug /></button>
      <button className="rail-btn" onClick={onChaves} data-tip={t("Chaves de IA")}><IconKey /></button>
      <span className="spacer" />
      <LangSelect compact />
      <Conta conn={conn} onClick={onConexoes} compact />
    </aside>
  );
}

/* ---------------- Ícones da galeria de modelos (traço fino, estilo lucide) ---------------- */
const TPL_PATHS = {
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>,
  kanban: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M8 7v7M12 7v4M16 7v9" /></>,
  utensils: <><path d="M3 2v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2M6 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v4h-4a2 2 0 0 0 0 4h4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /></>,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  play: <><rect x="2.5" y="4" width="19" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  dumbbell: <><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" /></>,
  layout: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M3 9h18M9 21V9" /></>,
  camera: <><path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z" /><circle cx="12" cy="13" r="3.5" /></>,
  building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-4h6v4M8 6.5h.01M12 6.5h.01M16 6.5h.01M8 10.5h.01M12 10.5h.01M16 10.5h.01M8 14h.01M12 14h.01M16 14h.01" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  ticket: <><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 11v2M13 17v2" /></>,
  wand: <><path d="m15 4 .8 2.2L18 7l-2.2.8L15 10l-.8-2.2L12 7l2.2-.8zM19.5 12l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" /><path d="m3 21 11-11" /></>,
  film: <><rect x="2.5" y="2.5" width="19" height="19" rx="2.5" /><path d="M7 2.5v19M17 2.5v19M2.5 12h19M2.5 7H7M2.5 17H7M17 17h4.5M17 7h4.5" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4M8 4h8M9 13v1M15 13v1M2 14h2M20 14h2" /></>,
  quiz: <><circle cx="12" cy="12" r="9.5" /><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19" /></>,
  apps: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><path d="M17.25 13.5v7.5M13.5 17.25H21" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2.5" /><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" /></>
};
function TplIcon({ ic }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TPL_PATHS[ic] || TPL_PATHS.layout}</svg>;
}

/* ---------------- Composer (v0-style) ---------------- */
function Composer({ big, repo, busy, input, setInput, inputRef, kind, setKind, onSend, onCancel = () => {}, onBlindar, providerId, activeModel, onPickModel, modelsCache, modelHealth, estadoProvs, podeApisPagas = true, onPlanoPago = () => {}, attached = [], onAddFiles, onRemoveAttach, projects, onLoadProjects, onOpenProject, onNew, onPlusConexoes, onPlusChaves, dica = "" }) {
  const [plus, setPlus] = useState(false);
  const fileRef = useRef(null);
  return (
    <div className={"composer" + (big ? " big" : "")}>
      {repo && <div className="composer-ctx">{t("Editando")} <b>{repo.owner}/{repo.name}</b> · <button className="linklike" onClick={onNew}>{t("novo projeto")}</button></div>}
      {attached.length > 0 && (
        <div className="attach-strip">
          {attached.map((src, i) => (
            <div className="thumb" key={i}>
              <img src={src} alt="" />
              <button className="thumb-x" onClick={() => onRemoveAttach(i)} title={t("Remover")}>×</button>
            </div>
          ))}
        </div>
      )}
      <textarea className="composer-input" rows={big ? 2 : 3} ref={inputRef}
        placeholder={repo ? t("Peça uma alteração… (ou anexe uma imagem pra trocar/usar)") : (dica || t("Descreva sua ideia, vamos dar vida a ela…"))}
        value={input} onChange={e => setInput(e.target.value)}
        onPaste={e => { const imgs = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean); if (imgs.length) { e.preventDefault(); onAddFiles(imgs); } }}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); } }} disabled={busy} />
      <div className="composer-row">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { onAddFiles([...e.target.files]); e.target.value = ""; }} />
        <button className="chip" onClick={() => fileRef.current?.click()} title={t("Anexar imagem")} disabled={busy}><IconImage /></button>
        <div className="pop-anchor">
          <button className="chip icon" onClick={() => setPlus(v => !v)} title={t("Mais")}><IconPlus /></button>
          {plus && (<>
            <div className="pop-back" onClick={() => setPlus(false)} />
            <div className="pop menu">
              <button onClick={() => { setPlus(false); onPlusConexoes(); }}><IconPlug /> {t("Conexões")}</button>
              <button onClick={() => { setPlus(false); onPlusChaves(); }}><IconSpark /> {t("Chaves de IA / modelos")}</button>
            </div>
          </>)}
        </div>
        <ModelPicker providerId={providerId} activeModel={activeModel} onPick={onPickModel} modelsCache={modelsCache} modelHealth={modelHealth} estadoProvs={estadoProvs} onPlusChaves={onPlusChaves} podeApisPagas={podeApisPagas} onPlanoPago={onPlanoPago} />
        <button className="chip" onClick={onBlindar} disabled={busy || !repo} title={t("Blindar contra vazamento de dados")}><IconShield /></button>
        <div className="spacer" />
        <ProjectPicker projects={projects} onLoad={onLoadProjects} onOpen={onOpenProject} onNew={onNew} />
        {busy
          ? <button className="send parar" onClick={onCancel} title={t("Parar")} aria-label={t("Parar")}><IconParar /></button>
          : <button className="send" onClick={onSend} title={t("Enviar")}><IconArrowUp /></button>}
      </div>
    </div>
  );
}

// Esconde modelos de visão/experimentais do seletor de CÓDIGO (são lentos ou
// impróprios pra gerar app e já travaram uma geração). A visão é acionada
// sozinha quando há imagem; e Conexões ainda mostra todos pra uso avançado.
const EH_CODIGO = m => !/vision|experimental|preview|(^|[-_])exp([-_]|$)|-exp\b/i.test(m);

// Traduz os eventos do agente em um passo curto, em português simples.
function eventoTexto(ev) {
  const a = ev.args || {};
  switch (ev.type) {
    case "status": return t(ev.text);
    case "provider_try": return t("Pensando com a IA ({ia})…", { ia: ev.provider });
    case "provider_switch": return t("Trocando de IA ({ia})…", { ia: ev.provider });
    case "provider": return t("Pensando com a IA ({ia})…", { ia: ev.label || ev.model || ev.providerId });
    case "deploy": return ev.text ? t(ev.text) : (ev.phase || t("publicando…"));
    case "tool_start": return ({
      list_files: t("Olhando os arquivos do projeto…"),
      read_file: t("Lendo {arquivo}…", { arquivo: a.path || t("um arquivo") }),
      search_code: t("Procurando \"{busca}\"…", { busca: a.query || "" }),
      write_file: t("Escrevendo {arquivo}…", { arquivo: a.path || t("um arquivo") }),
      delete_file: t("Removendo {arquivo}…", { arquivo: a.path || t("um arquivo") }),
      commit_changes: t("Salvando as mudanças no GitHub…"),
      salvar_imagem: t("Salvando a imagem no projeto…"),
      listar_tabelas: t("Vendo as tabelas do banco…"),
      criar_tabela: t("Criando a tabela no Supabase…"),
      criar_edge_function: t("Publicando a função no Supabase…")
    })[ev.name] || t("Usando {ferramenta}…", { ferramenta: ev.name });
    case "commit": return t("Salvo no GitHub") + (ev.shortSha ? ` (${ev.shortSha})` : "") + ".";
    case "tool_error": return t("Erro em {ferramenta}: {erro}", { ferramenta: ev.name, erro: ev.message });
    case "notice": return t(ev.text);
    case "arquivo_stream": return t("Escrevendo {arquivo}…", { arquivo: ev.path });
    case "kit": return t("Usando o kit de {kit} — telas e dados prontos do nicho", { kit: t(({ agendamento: "agendamento", delivery: "cardápio/delivery", ecommerce: "loja online", membros: "área de membros", crm: "CRM", financeiro: "financeiro", estoque: "estoque", gerador_imagem: "gerador de imagens", gerador_video: "gerador de vídeos", chat_ia: "assistente de IA", link_bio: "link na bio", portfolio: "portfólio", imobiliaria: "imobiliária", academia: "academia", quiz: "quiz/funil", eventos: "eventos" })[ev.kit] || ev.kit) });
    case "clone": return t("Página de referência lida — recriando a estrutura de {site}", { site: String(ev.url || "").replace(/^https?:\/\//, "").slice(0, 40) });
    case "continuacao": return t("A resposta foi cortada — a próxima IA está continuando de onde parou") + (ev.parte > 1 ? ` (${t("parte")} ${ev.parte})` : "") + "…";
    case "html_retry": return t("A resposta veio incompleta — pedindo de novo…");
    case "assistant_text": return (ev.text || "").replace(/\s+/g, " ").trim().slice(0, 120);
    default: return "";
  }
}

// Converte imagem em data URL, reduzindo o tamanho (modelos cobram por pixel).
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1400; let { width, height } = img;
        if (width > max || height > max) { const s = max / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
        const cv = document.createElement("canvas"); cv.width = width; cv.height = height;
        cv.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(r.result);
      img.src = r.result;
    };
    r.onerror = reject; r.readAsDataURL(file);
  });
}

// Detecta uma chave colada no chat (por enquanto, Google Maps: começa com AIza).
// Regra forte: app x site, detectado pelo que a pessoa pede (sem seletor).
// Prioridade: (1) página de marketing/portfólio = SITE; (2) sistema/app = APP;
// (3) "site/website" = SITE; (4) padrão = APP (a maioria dos pedidos é sistema).
function detectarTipo(texto) {
  const t = String(texto || "").toLowerCase();
  if (/\b(landing|landing\s*page|p[áa]gina\s+de\s+vendas|p[áa]gina\s+de\s+captura|one[\s-]?page|portf[óo]lio|institucional|p[áa]gina\s+de\s+lan[çc]amento)\b/.test(t)) return "site";
  if (/\b(app|aplicativo|aplica[çc][ãa]o|micro[\s-]?saas|saas|sistema|plataforma|dashboard|painel|crm|erp|[áa]rea\s+de\s+membros|membros|curso|agendamento|delivery|card[áa]pio|e-?commerce|loja|estoque|financeiro|gest[ãa]o|controle|agenda)\b/.test(t)) return "app";
  if (/\b(site|website|p[áa]gina\s+web)\b/.test(t)) return "site";
  // ingles / espanhol
  if (/\b(landing|sales\s+page|portfolio|portafolio|one[\s-]?page|p[áa]gina\s+de\s+(ventas|aterrizaje))\b/.test(t)) return "site";
  if (/\b(app|application|aplicaci[óo]n|platform|plataforma|dashboard|panel|crm|erp|store|shop|tienda|booking|reservas|inventory|finance|members?)\b/.test(t)) return "app";
  if (/\b(sitio|website|web\s*page)\b/.test(t)) return "site";
  return "app";
}

/**
 * A pessoa colou a chave que a gente pediu?
 *
 * Quando o serviço tem prefixo conhecido (sk-, r8_, AIza…) exigimos ele: é o
 * que impede tratar um "pode ser a 1 mesmo" como se fosse uma chave. Sem
 * prefixo, aceitamos um texto longo sem espaço, que é a cara de um token.
 */
function extrairChaveDoTexto(texto, opcao) {
  const t = String(texto || "").trim();
  if (!t) return null;
  if (opcao.prefixo) {
    const esc = opcao.prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = t.match(new RegExp(esc + "[A-Za-z0-9_\\-]{12,}"));
    return m ? m[0] : null;
  }
  // Sem prefixo conhecido: texto longo e sem espaço tem cara de token. O piso
  // de 24 caracteres é o que separa uma chave de um "pode ser a 1 mesmo".
  const m = t.match(/[A-Za-z0-9_\-:.]{24,}/);
  return m ? m[0] : null;
}

function detectarSegredo(texto) {
  const gm = String(texto).match(/\bAIza[0-9A-Za-z_\-]{20,}\b/);
  if (gm) return { name: "GOOGLE_MAPS_API_KEY", value: gm[0], label: "Google Maps", envFront: "VITE_GOOGLE_MAPS_API_KEY", kind: "gmaps" };
  const mb = String(texto).match(/\bpk\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/);
  if (mb) return { name: "MAPBOX_TOKEN", value: mb[0], label: "Mapbox", envFront: "VITE_MAPBOX_TOKEN", kind: "mapbox" };
  return null;
}

function ModelPicker({ providerId, activeModel, onPick, modelsCache = {}, modelHealth = {}, estadoProvs = null, onPlusChaves = () => {}, podeApisPagas = true, onPlanoPago = () => {} }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const label = providerId ? (activeModel || t("modelo")) : t("Automático");
  return (
    <div className="pop-anchor">
      <button className="chip" onClick={() => setOpen(v => !v)} title={t("Escolher IA/modelo")}><IconSpark /> <span>{label}</span> <IconChevronDown /></button>
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className="pop models">
          <input className="pop-search" placeholder={t("Buscar modelos")} value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="pop-scroll">
            <button className={"pop-item" + (!providerId ? " sel" : "")} onClick={() => { onPick("", ""); setOpen(false); }}>
              <span>{t("Automático (revezamento)")}</span>{!providerId && <IconCheck />}
            </button>
            {PROVIDER_CATALOG.map(pc => {
              const h = modelHealth[pc.id] || {};
              const brutos = [...new Set([...(pc.models || []), ...(modelsCache[pc.id] || [])])].filter(EH_CODIGO);
              // Esconde os modelos que o health check reprovou (❌) — MAS só
              // enquanto sobrar algum bom. Se TODOS falharem (chave com erro de
              // digitação, teste feito offline), o provedor inteiro sumia da
              // lista: a pessoa não entendia para onde ele foi nem tinha como
              // voltar. Nesse caso mostramos tudo, marcado.
              const bons = brutos.filter(m => h[m]?.status !== "fail");
              const todosFalharam = brutos.length > 0 && bons.length === 0;
              const todos = bons.length ? bons : brutos;
              const models = todos.filter(m => !q || m.toLowerCase().includes(q.toLowerCase()) || pc.label.toLowerCase().includes(q.toLowerCase()));
              if (!models.length) return null;
              // Sem chave salva, escolher este provedor só produz erro em toda
              // mensagem. Em vez de deixar escolher e falhar depois, marcamos e
              // o clique leva direto pra tela de chaves. (estadoProvs null =
              // ainda carregando: não marca nada pra não piscar "sem chave".)
              const estado = estadoProvs ? (estadoProvs[pc.id] || "sem-chave") : "ok";
              // IA paga no plano grátis: aparece, mas com etiqueta "Pro". Mesma
              // razão de sempre — esconder não converte, mostrar bloqueado sim.
              const soNoPago = pc.tier === "paid" && !podeApisPagas;
              // Marcado = escolher aqui só daria erro. O clique leva à tela de
              // chaves, onde dá pra colar a chave, ligar o serviço ou testar.
              const marcado = soNoPago || estado !== "ok" || todosFalharam;
              const etiqueta = soNoPago ? t("Pro")
                : estado === "sem-chave" ? t("sem chave")
                : estado === "desligado" ? t("desligado")
                : t("chave recusada");
              const dicaItem = soNoPago
                ? t("As IAs pagas fazem parte do plano Pro.")
                : estado === "sem-chave"
                ? t("Adicione a chave deste serviço para poder usá-lo")
                : estado === "desligado"
                ? t("Este serviço está desligado. Clique para ligá-lo em Chaves de IA.")
                : t("A chave deste serviço foi recusada no teste. Clique para conferir ou testar de novo.");
              return (
                <div key={pc.id}>
                  <div className="pop-group">{pc.label}{marcado && <span className="tag-sem-chave">{etiqueta}</span>}</div>
                  {models.map(m => {
                    const sel = providerId === pc.id && activeModel === m;
                    return <button key={m} className={"pop-item" + (sel ? " sel" : "") + (marcado ? " sem-chave" : "")}
                      title={marcado ? dicaItem : ""}
                      onClick={() => {
                        setOpen(false);
                        if (soNoPago) onPlanoPago();
                        else if (marcado) onPlusChaves();
                        else onPick(pc.id, m);
                      }}>
                      <span>{m}</span>{sel && <IconCheck />}
                    </button>;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </>)}
    </div>
  );
}

function ProjectPicker({ projects, onLoad, onOpen, onNew }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  function toggle() { if (!open) onLoad?.(); setOpen(v => !v); }
  const list = (projects || []).filter(p => !q || (p.vercelName || p.name || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="pop-anchor">
      <button className="chip" onClick={toggle} title={t("Projetos")}><IconGrid /> <span>{t("Projetos")}</span> <IconChevronDown /></button>
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className="pop models right">
          <input className="pop-search" placeholder={t("Buscar projetos")} value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="pop-scroll">
            <button className="pop-item" onClick={() => { setOpen(false); onNew(); }}><span>+ {t("Novo projeto")}</span></button>
            {projects === null ? <div className="pop-group">{t("carregando…")}</div>
              : list.length === 0 ? <div className="pop-group">{t("nenhum projeto na Vercel")}</div>
              : list.map((p, i) => (
                <button key={i} className="pop-item" onClick={() => { setOpen(false); onOpen(p); }}>
                  <span>{p.vercelName || p.name}</span>
                </button>
              ))}
          </div>
        </div>
      </>)}
    </div>
  );
}

// Barra de endereço do preview que também LISTA as rotas do projeto: clicou,
// o preview abre aquela tela (/admin, /clientes…), como no Lovable.
function RotaPicker({ rotas, rota, onPick, previewUrl, onAbrir, local = false }) {
  const [open, setOpen] = useState(false);
  // Antes de publicar nao existe endereco: a barra diz que a previa e local,
  // em vez de "sem preview ainda", que daria a impressao de que nada rodou.
  const host = local ? t("prévia local — ainda não publicado")
    : (() => { try { return new URL(previewUrl).host; } catch { return null; } })();
  // Sempre clicavel: antes ficava desabilitado quando so havia "/" (por exemplo
  // quando a leitura do App.jsx falhava) e dava a impressao de estar quebrado.
  const soRaiz = rotas.length <= 1;
  return (
    <div className="url-bar-wrap">
      <button
        className="url-bar clicavel"
        onClick={() => { const abrindo = !open; setOpen(abrindo); if (abrindo && soRaiz) onAbrir?.(); }}
        title={local ? t("A prévia roda aqui no navegador. Clique em Publicar pra colocar no ar.") : (previewUrl || t("sem preview ainda"))}
      >
        <span className="lock"><IconLock /></span>
        <span className="url">{host ? host : t("sem preview ainda")}<b className="url-rota">{host && rota !== "/" ? rota : ""}</b></span>
        <span className="url-count">{rotas.length} {t(rotas.length === 1 ? "tela" : "telas")}</span>
        <IconChevronDown />
      </button>
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className="pop menu rotas-pop">
          <div className="pop-group">{t("Telas do projeto")}</div>
          {rotas.map(r => (
            <button key={r} className={r === rota ? "on" : ""} onClick={() => { setOpen(false); onPick(r); }}>
              <IconFile /> <span>{r}</span>{r === rota && <span className="lang-ok"><IconCheck /></span>}
            </button>
          ))}
          {soRaiz && <div className="rotas-aviso">{t("Só achei a tela inicial. Se o projeto tem outras telas, conecte o GitHub para eu ler as rotas.")}</div>}
        </div>
      </>)}
    </div>
  );
}

function PlanCard({ plano, onAprovar, onRecusar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(plano.texto);
  useEffect(() => { setTexto(plano.texto); setEditando(false); }, [plano]);
  return (
    <div className="plan-card">
      <div className="plan-head">
        <span className="plan-badge">{t("Plano")}</span>
        <span className="plan-title">{t("Revise antes de eu construir")}</span>
      </div>
      {editando
        ? <textarea className="plan-edit" value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus />
        : <div className="plan-body">{texto}</div>}
      <div className="plan-actions">
        <button className="btn sm" onClick={() => onAprovar(texto)}><IconCheck /> {t("Aprovar e construir")}</button>
        {editando
          ? <button className="btn sm ghost" onClick={() => setEditando(false)}>{t("Pronto")}</button>
          : <button className="btn sm ghost" onClick={() => setEditando(true)}>{t("Editar")}</button>}
        <button className="btn sm ghost" onClick={onRecusar}>{t("Recusar")}</button>
      </div>
    </div>
  );
}

function Bubble({ role, text, images }) {
  if (role === "system" || role === "error") return <div className={"note " + role}><span className="note-ic">{role === "error" ? <IconAlert /> : <IconInfo />}</span><span>{text}</span></div>;
  const eu = role === "user";
  return (
    <div className={"bubble " + role}>
      <div className="bubble-head">
        {eu ? <span className="avatar me">{t("VC")}</span> : <span className="avatar ai"><img src="/brand/logo.png" alt="" /></span>}
        {eu ? t("Você") : "Prumo Code"}
      </div>
      {images && images.length > 0 && (
        <div className="bubble-imgs">
          {images.map((src, i) => <img key={i} src={src} alt={t("imagem enviada")} />)}
        </div>
      )}
      {text && <div className="bubble-body">{text}</div>}
    </div>
  );
}

function fmtDur(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

function RunCard({ steps = [], done, startedAt, endedAt }) {
  steps = Array.isArray(steps) ? steps : [];
  const [open, setOpen] = useState(true);   // aberto enquanto trabalha (ensina), recolhe ao terminar
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { if (done) setOpen(false); }, [done]);
  // cronometro ao vivo: so corre enquanto trabalha
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(timer);
  }, [done]);

  const base = startedAt || agora;
  const decorrido = done ? ((endedAt || base) - base) : (agora - base);
  const last = steps[steps.length - 1] || t("Começando…");

  return (
    <div className={"run-card" + (done ? " done" : "")}>
      <div className="run-head">
        {done ? <span className="run-ok">✓</span> : <span className="spin" />}
        <span className="run-title">{done ? t("Concluído") : last}</span>
        <span className="run-time" title={done ? t("Tempo total") : t("Tempo decorrido")}>{fmtDur(decorrido)}</span>
        <button className="run-toggle" onClick={() => setOpen(o => !o)}>{open ? t("Ocultar") : t("Detalhes")}</button>
      </div>
      {!open && (
        <div className="run-sub">{done ? t("{n} etapas · veja o resumo abaixo", { n: steps.length }) : t(steps.length === 1 ? "{n} etapa até agora" : "{n} etapas até agora", { n: steps.length })}</div>
      )}
      {open && (
        <div className="run-steps">
          {steps.length === 0 ? <div className="run-step cur"><span className="run-dot">▸</span> {t("preparando…")}</div>
            : steps.map((s, i) => {
                const atual = !done && i === steps.length - 1;
                return (
                  <div key={i} className={"run-step " + (atual ? "cur" : "done")}>
                    <span className="run-dot">{atual ? "▸" : "•"}</span> {s}
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Drawers ---------------- */
function DrawerHead({ icon, titulo, children, onClose }) {
  return (
    <header>
      <h2><span className="h-ico">{icon}</span>{titulo}</h2>
      {children}
      <button className="icon-btn" onClick={onClose} title={t("Fechar")}><IconClose /></button>
    </header>
  );
}

// Miniatura ao vivo da tela inicial do app (estilo v0): carrega a URL publicada
// num iframe escalado. Monta o iframe so quando o card entra na tela (IntersectionObserver)
// e mede a largura pra escalar a partir de um "desktop" de 1280px.
function ProjectThumb({ url }) {
  const boxRef = useRef(null);
  const DESIGN_W = 1280, DESIGN_H = 800;
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(0.25);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const medir = () => { const w = el.clientWidth; if (w) setScale(w / DESIGN_W); };
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "250px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  return (
    <span className="pc-thumb" ref={boxRef}>
      {url && visible ? (
        <iframe
          className={"pc-frame" + (carregou ? " on" : "")}
          src={url}
          title="preview"
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin allow-forms"
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})` }}
          onLoad={() => setCarregou(true)}
        />
      ) : null}
      {(!url || !carregou) && <span className="pc-thumb-ph"><IconGrid /></span>}
    </span>
  );
}

/**
 * Os slots, desenhados.
 *
 * O número "3 sites restantes" não diz nada para quem não programa — some no
 * meio do texto. Peça vazia e peça cheia a pessoa entende sem ler: ela vê o
 * que tem, vê o que gastou e vê quanto falta, igual a vida/munição num jogo.
 *
 * Fica em Projetos de propósito: é a tela onde ela vem ver o que já criou, e
 * portanto onde a pergunta "posso criar mais?" nasce sozinha.
 */
function SlotsDoPlano({ acesso, onConvidar }) {
  if (!acesso || acesso.semLogin || !acesso.carregado) return null;

  if (acesso.pago) {
    return (
      <div className="slots-box slots-pago">
        <span className="slots-coroa"><IconGem /></span>
        <div>
          <strong>{t("Sites ilimitados")}</strong>
          <span>{t("Seu plano não usa slots. Crie quantos quiser.")}</span>
        </div>
      </div>
    );
  }

  const casaTotal = Math.max(acesso.casaTotalDia || 0, acesso.casaRestantesHoje || 0);
  const casaLivres = acesso.casaRestantesHoje || 0;
  const propTotal = acesso.propriosTotal || 0;
  const propLivres = acesso.propriosRestantes || 0;
  const porConvite = acesso.slotsPorConvite || 1;
  const esperando = acesso.slotsEsperando || 0;
  const noMes = acesso.ganhosNoMes || 0;
  const tetoMes = acesso.tetoDoMes || 10;

  const pecas = (total, livres) => Array.from({ length: Math.max(total, 1) }, (_, i) => (
    <span key={i} className={"slot-peca" + (i < livres ? " livre" : " usada")}
      title={i < livres ? t("Pronto pra usar") : t("Já usado")}>
      {i < livres ? <IconMaisFino /> : <IconCheckFino />}
    </span>
  ));

  return (
    <div className="slots-box">
      <div className="slots-linha">
        <div className="slots-cab">
          <strong>{t("Site de hoje")}</strong>
          <span>{t("feito com a nossa IA · renova todo dia")}</span>
        </div>
        <div className="slots-fila">{pecas(casaTotal, casaLivres)}</div>
      </div>

      <div className="slots-linha">
        <div className="slots-cab">
          <strong>{t("Com a sua chave")}</strong>
          <span>{propTotal > 0
            ? t("ganhos por indicação")
            : t("você ainda não tem — convide alguém pra ganhar")}</span>
        </div>
        <div className="slots-fila">
          {propTotal > 0
            ? pecas(propTotal, propLivres)
            : <span className="slot-peca vazia" title={t("Nenhum ainda")}>·</span>}
          {/* Peças ganhas hoje: aparecem apagadas com um relógio. Esconder
              faria o prêmio parecer que não veio. */}
          {Array.from({ length: esperando }, (_, i) => (
            <span key={"e" + i} className="slot-peca esperando" title={t("Liberado amanhã")}>
              <IconRelogio />
            </span>
          ))}
        </div>
      </div>

      {esperando > 0 && (
        <p className="slots-espera">
          {esperando === 1
            ? t("1 site ganho hoje — ele libera amanhã.")
            : t("{n} sites ganhos hoje — eles liberam amanhã.", { n: esperando })}
        </p>
      )}

      <button className="slots-cta" onClick={onConvidar}>
        <IconGem />
        <span>{t("Convide alguém e ganhe +{n} sites", { n: porConvite })}</span>
      </button>
      <p className="slots-nota">
        {t("Quem entra pelo seu link já começa com um site a mais. Você ganha o seu quando essa pessoa criar o primeiro site dela — e ele fica disponível no dia seguinte.")}
        {noMes > 0 && " " + t("Você já ganhou {a} de {b} sites possíveis neste mês.", { a: noMes, b: tetoMes })}
      </p>
    </div>
  );
}

function ProjectsDrawer({ projects, onReload, onOpen, onClose, acesso, onConvidar }) {
  useEffect(() => { onReload?.(); /* eslint-disable-next-line */ }, []);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <DrawerHead icon={<IconGrid />} titulo={t("Projetos")} onClose={onClose}>
          <button className="btn sm ghost" onClick={onReload}><IconRefresh /> {t("Atualizar")}</button>
        </DrawerHead>
        <div className="body">
          <SlotsDoPlano acesso={acesso} onConvidar={onConvidar} />
          <p className="hint" style={{ marginTop: 0 }}>{t("Seus projetos na Vercel. Clicar abre o projeto (puxa o repositório do GitHub ligado) para editar.")}</p>
          {projects === null ? <p className="hint">{t("carregando…")}</p>
            : projects.length === 0 ? (
              <div className="empty">
                <span className="orb"><IconGrid /></span>
                <div>{t("Nenhum projeto na Vercel ainda — ou o Worker /proxy não está no ar.")}</div>
              </div>
            )
            : (
              <div className="proj-grid">
                {projects.map((p, i) => (
                  <button key={i} className="proj-card" onClick={() => onOpen(p)}>
                    <ProjectThumb url={p.url} />
                    <span className="pc-foot">
                      <span className={"proj-avatar" + CORES_AVATAR[i % 4]}><IconGem /></span>
                      <span className="pc-text">
                        <strong>{p.vercelName || p.name}</strong>
                        <span>{p.url ? p.url.replace(/^https?:\/\//, "") : `${p.owner}/${p.name}`}</span>
                      </span>
                      <IconExternal />
                    </span>
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
    </>
  );
}

function fmtData(ts) { try { return new Date(ts).toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function HistoryDrawer({ sessions, onOpen, onDelete, onClear, onClose }) {
  // Quais conversas tem projeto gerado e ainda nao publicado. Sem esta marca
  // a pessoa teria que abrir uma por uma para achar o site que ela fez —
  // e o slot dela ja foi gasto nele.
  const [comRascunho, setComRascunho] = useState([]);
  useEffect(() => { idsComRascunho().then(setComRascunho).catch(() => {}); }, [sessions]);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <BorderGlow className="drawer-glow" backgroundColor="transparent" borderRadius={0}
          glowColor="347 90 58" glowRadius={18} edgeSensitivity={40} glowIntensity={0.6} coneSpread={22}
          colors={["#e11d48", "#fb7185", "#f97316"]}>
          <DrawerHead icon={<IconChat />} titulo={t("Conversas")} onClose={onClose}>
            {sessions.length > 0 && <button className="btn sm ghost" onClick={() => { if (window.confirm(t("Apagar todo o histórico?"))) onClear(); }}>{t("Limpar")}</button>}
          </DrawerHead>
          <div className="body">
            {sessions.length === 0 ? (
              <div className="empty">
                <span className="orb"><IconChat /></span>
                <div>{t("Nada aqui ainda. Cada conversa fica salva no seu navegador.")}</div>
              </div>
            )
              : sessions.map(s => (
                <div key={s.id} className="hist-item">
                  <span className="proj-avatar"><IconChat /></span>
                  <div className="hist-main" onClick={() => onOpen(s.id)}>
                    <div className="hist-title">
                      {s.title}
                      {comRascunho.includes(s.id) && !s.repo && (
                        <span className="hist-rascunho" title={t("Projeto pronto, esperando você publicar")}>{t("não publicado")}</span>
                      )}
                    </div>
                    <div className="hist-meta">{fmtData(s.updatedAt)}{s.repo ? ` · ${s.repo.owner}/${s.repo.name}` : ""}{s.count ? ` · ${s.count} ${t("msg")}` : ""}</div>
                  </div>
                  <button className="icon-btn" onClick={() => onDelete(s.id)} title={t("Apagar conversa")}><IconClose /></button>
                </div>
              ))}
          </div>
        </BorderGlow>
      </div>
    </>
  );
}

/* ---------------- Conexões + IAs ---------------- */

function ConnRow({ icon, name, sub, subOff, children }) {
  return (<div className="conn-row"><div className="conn-ic">{icon}</div><div className="conn-main"><div className="conn-name">{name}</div><div className={"conn-sub" + (subOff ? " off" : "")}>{sub}</div></div><div className="conn-act">{children}</div></div>);
}
function Connections({ repo, startKeys, onClose, onSupabaseBound, showToast, sessao = null, acesso = {}, onMudou = () => {} }) {
  const [secrets, setSecrets] = useState(null);
  const [gh, setGh] = useState({});
  const [sb, setSb] = useState({});
  const [showKeys, setShowKeys] = useState(Boolean(startKeys));
  const [sbProjects, setSbProjects] = useState(null);
  const [sbLoading, setSbLoading] = useState(false);
  useEffect(() => { (async () => { setSecrets(await store.get("secrets")); setGh(await store.get("github")); setSb(await store.get("supabase")); })(); }, []);
  // Grava o segredo ANTES de mexer no estado, para quem reagir à mudança ler o
  // valor novo e não o antigo.
  async function saveSecret(k, v) {
    await store.patch("secrets", { [k]: v });
    setSecrets(s => ({ ...s, [k]: v }));
  }
  async function connectGithubToken() {
    const tok = window.prompt(t("Cole um token do GitHub (github_pat_… com Contents: Read/Write):")); if (!tok) return;
    try { const p = await github.validateToken(tok.trim()); await store.patch("github", { token: tok.trim(), login: p.login, avatar: p.avatar }); setGh(await store.get("github")); showToast(t("GitHub conectado: @{login}", { login: p.login })); }
    catch (e) { showToast(e.message, true); }
  }
  async function ghLogout() { await store.patch("github", { token: "", login: "", avatar: "" }); setGh({}); }
  async function loadSbProjects() {
    setSbLoading(true);
    try { setSbProjects(await sbmgmt.listProjects()); }
    catch (e) { showToast("Supabase: " + e.message, true); }
    finally { setSbLoading(false); }
  }
  async function bindSb(p) {
    try {
      await sbmgmt.bindProject(p.ref, p.name);
      setSb(await store.get("supabase")); setSbProjects(null);
      showToast(t("Projeto Supabase ligado: {nome}", { nome: p.name }));
      if (repo && onSupabaseBound) { onClose(); onSupabaseBound(); }   // reconecta o app aberto
    }
    catch (e) { showToast(e.message, true); }
  }
  async function sbLogout() { await sbmgmt.disconnect(); setSb({}); setSbProjects(null); }
  // Alternativa pra quem nao quer (ou nao consegue) instalar a integracao: o
  // token colado continua funcionando, e vale pra conta pessoal.
  async function connectVercelToken() {
    const tok = window.prompt(t("Cole um token da Vercel (pegue em vercel.com/account/tokens):"));
    if (!tok) return;
    // Token colado e sempre de conta pessoal: zera o teamId de uma conexao
    // anterior por OAuth, senao as chamadas continuariam indo para o time.
    await store.patch("vercel", { oauth: false, teamId: "", configurationId: "" });
    await saveSecret("VERCEL_TOKEN", tok.trim());
  }
  async function vcLogout() {
    await store.patch("vercel", { oauth: false, teamId: "", configurationId: "" });
    await saveSecret("VERCEL_TOKEN", "");
  }
  if (!secrets) return null;
  const sbConn = Boolean(sb.oauth || sb.token);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <DrawerHead icon={<IconPlug />} titulo={t("Conexões")} onClose={onClose} />
        <div className="body">
          {/* A conta do Prumo Code fica SEPARADA das conexoes. Juntar com o
              GitHub confundiria: sair de uma nao e sair da outra. */}
          {authConfigurada() && sessao && (() => {
            const u = dadosDoUsuario(sessao);
            return (
              <>
                <div className="drawer-section">{t("Sua conta")}</div>
                <div className="conn-card">
                  <ConnRow
                    icon={u?.foto ? <img className="acc-foto" src={u.foto} alt="" /> : <IconUser />}
                    name={u?.nome || t("Conectado")}
                    sub={u?.email || ""}
                  >
                    <button className="btn sm ghost" onClick={() => sairDaConta()}>{t("Sair")}</button>
                  </ConnRow>
                </div>
              </>
            );
          })()}
          {/* Convite logo depois da conta: e sobre a conta, e e aqui que a
              pessoa olha quando quer saber quantos sites ainda tem. */}
          {authConfigurada() && sessao && <ConviteBloco acesso={acesso} showToast={showToast} />}
          <div className="drawer-section">{t("Serviços")}</div>
          <div className="conn-card">
            <ConnRow icon={<Gh />} name="GitHub" sub={gh.login ? `@${gh.login}` : t("desconectado")} subOff={!gh.login}>
              {gh.login ? <button className="btn sm ghost" onClick={ghLogout}>{t("sair")}</button>
                : githubConfigurado() ? <button className="btn sm primary" onClick={startGithubLoginWeb}>{t("Entrar")}</button>
                : <button className="btn sm primary" onClick={connectGithubToken}>{t("Token")}</button>}
              {!gh.login && githubConfigurado() && <button className="btn sm ghost" onClick={connectGithubToken}>{t("token")}</button>}
            </ConnRow>
            <ConnRow icon={<Sb />} name="Supabase" sub={sbConn ? (sb.projectName ? `${t("projeto:")} ${sb.projectName}` : t("escolha um projeto")) : t("desconectado")} subOff={!sbConn || !sb.projectName}>
              {sbConn
                ? <><button className="btn sm" onClick={loadSbProjects} disabled={sbLoading}>{sbLoading ? "…" : (sb.projectName ? t("Trocar") : t("Projeto"))}</button><button className="btn sm ghost" onClick={sbLogout}>{t("sair")}</button></>
                : supabaseConfigurado() ? <button className="btn sm primary" onClick={startSupabaseLoginWeb}>{t("Conectar")}</button>
                : <span className="pill">config</span>}
            </ConnRow>
            <ConnRow icon={<Vc />} name="Vercel"
              sub={secrets.VERCEL_TOKEN ? t("conectada") : t("desconectada")}
              subOff={!secrets.VERCEL_TOKEN}>
              {secrets.VERCEL_TOKEN
                ? <button className="btn sm ghost" onClick={vcLogout}>{t("sair")}</button>
                : vercelConfigurado()
                  ? <><button className="btn sm primary" onClick={startVercelLoginWeb}>{t("Conectar")}</button>
                      <button className="btn sm ghost" onClick={connectVercelToken}>{t("token")}</button></>
                  : <input className="text mini" type="password" placeholder={t("token")} defaultValue={secrets.VERCEL_TOKEN} onBlur={e => saveSecret("VERCEL_TOKEN", e.target.value.trim())} />}
            </ConnRow>
            <ConnRow icon={<IconRepo />} name={t("Repositório")} sub={repo ? `${repo.owner}/${repo.name}` : t("nenhum")} subOff={!repo} />
          </div>

          {sbProjects && (
            <div className="conn-card" style={{ marginTop: 10 }}>
              <div className="sb-pick-head">{t("Escolha o projeto Supabase")}</div>
              {sbProjects.length === 0 ? <div className="sb-pick-empty">{t("Nenhum projeto nesta conta.")}</div>
                : sbProjects.map(p => (
                  <button key={p.ref} className="sb-pick-item" onClick={() => bindSb(p)}>
                    <strong>{p.name}</strong><span>{p.region} · {p.status}</span>
                  </button>
                ))}
            </div>
          )}

          <p className="hint">{t("Token da Vercel:")} <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">vercel.com/account/tokens</a></p>

          <div className="drawer-section">{t("Chaves de IA (BYOK)")}</div>
          <button className="btn wide" onClick={() => setShowKeys(v => !v)}>{showKeys ? t("Ocultar chaves de IA") : t("Configurar chaves de IA")}</button>
          {showKeys && <AiProviders showToast={showToast} onMudou={onMudou} />}
        </div>
      </div>
    </>
  );
}

/**
 * "Seus sites" + "Convide e ganhe sites" — no painel de Conexões, embaixo da
 * conta.
 *
 * MOSTRA OS DOIS SALDOS SEPARADOS, e isso é de propósito: eles são de tipos
 * diferentes e a pessoa precisa entender a diferença pra não achar que o app
 * travou sem motivo.
 *
 *   "Hoje, com a nossa IA"  -> 1 por dia, renova sozinho, não precisa de chave.
 *   "Com a sua chave"       -> vem de convite, e só funciona com uma chave
 *                              grátis colada em Conexões.
 *
 * O PRÊMIO É DOS DOIS LADOS: quem compartilha o link não está pedindo favor,
 * está dando um presente (a pessoa convidada já entra com um site a mais).
 * Convite que só premia quem indica soa a corrente, e quase ninguém manda.
 *
 * Fica invisível sem login configurado e sem código de convite — e o saldo não
 * aparece pra quem é do plano pago, porque pago não tem limite.
 */
function ConviteBloco({ acesso = {}, showToast }) {
  const [copiado, setCopiado] = useState(false);
  const codigo = acesso.codigoConvite || "";
  if (!codigo) return null;

  const link = linkDeConvite(codigo);
  const mostraSaldo = !acesso.pago && acesso.carregado;
  const porConvite = acesso.slotsPorConvite || 2;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      showToast?.(t("Não consegui copiar sozinho. Toque no link, selecione tudo e copie."), true);
    }
  }

  return (
    <>
      {mostraSaldo && (
        <>
          <div className="drawer-section">{t("Seus sites")}</div>
          <div className="conn-card conv-card">
            <div className="conv-saldo">
              <b>{t("Hoje, com a nossa IA: {n} de {total}", {
                n: acesso.casaRestantesHoje, total: acesso.casaTotalDia
              })}</b>
              <span>{t("renova todo dia, sem precisar de chave")}</span>
            </div>
            <div className="conv-saldo">
              <b>{t("Com a sua chave: {n} de {total}", {
                n: acesso.propriosRestantes, total: acesso.propriosTotal
              })}</b>
              <span>{acesso.convitesPagos > 0
                ? t("{q} convite(s) já premiado(s)", { q: acesso.convitesPagos })
                : t("ganhe {n} por convite", { n: porConvite })}</span>
            </div>
          </div>
        </>
      )}
      <div className="drawer-section">{t("Convide e ganhe sites")}</div>
      <div className="conn-card conv-card">
        <div className="conv-link">
          <input className="text" readOnly value={link} onFocus={e => e.target.select()} aria-label={t("Seu link de convite")} />
          <button className="btn sm primary" onClick={copiar}>{copiado ? t("Copiado!") : t("Copiar")}</button>
        </div>
        <p className="conv-expl">
          {t("Quem entra pelo seu link já começa com um site a mais. E quando essa pessoa criar o primeiro site dela, você ganha {n} sites para criar com a sua própria chave de IA.", { n: porConvite })}
        </p>
      </div>
    </>
  );
}

// Cor do avatar por provedor (só estética).
const CORES_IA = {
  gemini: "linear-gradient(135deg,#4285f4,#a855f7)",
  openrouter: "linear-gradient(135deg,#818cf8,#c084fc)",
  mistral: "linear-gradient(135deg,#fb923c,#f43f5e)",
  groq: "linear-gradient(135deg,#f43f5e,#fb923c)",
  anthropic: "linear-gradient(135deg,#d97757,#fbbf24)",
  deepseek: "linear-gradient(135deg,#4f7cff,#22d3ee)",
  xai: "linear-gradient(135deg,#64748b,#0f172a)",
  teamsoclo: "linear-gradient(135deg,#16a34a,#06b6d4)"
};

function AiProviders({ showToast, onMudou = () => {} }) {
  const [secrets, setSecrets] = useState(null);
  const [provs, setProvs] = useState([]);
  const [fetched, setFetched] = useState({});
  const [drafts, setDrafts] = useState({});
  const [buscando, setBuscando] = useState("");
  const [health, setHealth] = useState({});   // { [id]: { [model]: {status, detail} } }
  const [testando, setTestando] = useState("");
  useEffect(() => { (async () => { setSecrets(await store.get("secrets")); setProvs(await store.get("providers")); setHealth(await store.get("modelHealth")); })(); }, []);
  const cfg = id => provs.find(p => p.id === id) || {};
  async function testar(pc) {
    setTestando(pc.id);
    try {
      const mapa = await healthCheck(pc.id);
      setHealth(h => ({ ...h, [pc.id]: mapa }));
      const ok = Object.values(mapa).filter(r => r.status === "ok").length;
      showToast(t("{ia}: {ok} de {total} modelo(s) funcionando.", { ia: pc.label, ok, total: Object.keys(mapa).length }));
      onMudou();
    } catch (e) { showToast(pc.label + ": " + e.message, true); }
    finally { setTestando(""); }
  }
  async function salvarChave(pc) {
    const v = (drafts[pc.secretKey] ?? secrets[pc.secretKey] ?? "").trim();
    await store.patch("secrets", { [pc.secretKey]: v }); setSecrets(s => ({ ...s, [pc.secretKey]: v }));
    showToast(v ? t("Chave do {ia} salva.", { ia: pc.label }) : t("Chave do {ia} removida.", { ia: pc.label }));
    onMudou();   // o seletor de modelos precisa saber agora, nao so ao fechar o painel
    // Ao salvar uma chave, testa os modelos automaticamente (health check).
    if (v) testar(pc);
    else setHealth(h => { const n = { ...h }; delete n[pc.id]; return n; });
  }
  async function buscar(pc) {
    setBuscando(pc.id);
    try {
      const list = await listModels(pc.id);
      setFetched(f => ({ ...f, [pc.id]: list }));
      const cache = (await store.get("modelsCache")) || {};
      cache[pc.id] = list; await store.set("modelsCache", cache);   // compartilha com o seletor
      showToast(t("{ia}: {n} modelos.", { ia: pc.label, n: list.length }));
      onMudou();
    }
    catch (e) { showToast(pc.label + ": " + e.message, true); } finally { setBuscando(""); }
  }
  async function setModel(id, model) { const arr = (await store.get("providers")).map(p => p.id === id ? { ...p, model } : p); await store.set("providers", arr); setProvs(arr); }
  async function toggle(id) { const arr = (await store.get("providers")).map(p => p.id === id ? { ...p, enabled: !p.enabled } : p); await store.set("providers", arr); setProvs(arr); onMudou(); }
  // Reordena a fila: sobe/desce um provedor DENTRO do mesmo grupo (grátis/paga).
  // A ordem define quem o rodízio tenta primeiro.
  const tierDe = id => (PROVIDER_CATALOG.find(p => p.id === id)?.tier === "paid" ? 1 : 0);
  async function mover(id, dir) {
    let arr = (await store.get("providers")).slice()
      .sort((a, b) => (tierDe(a.id) - tierDe(b.id)) || ((a.priority ?? 0) - (b.priority ?? 0)));
    const i = arr.findIndex(p => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    if (tierDe(arr[j].id) !== tierDe(id)) return;   // não cruza grátis <-> paga
    [arr[i], arr[j]] = [arr[j], arr[i]];
    arr = arr.map((p, k) => ({ ...p, priority: k }));
    await store.set("providers", arr);
    setProvs(arr);
  }
  if (!secrets) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <p className="hint" style={{ marginTop: 0 }}>{t("Preencha ao menos uma e clique Salvar. Use as setas ↑↓ pra definir a ordem do rodízio (quem é tentado primeiro). As grátis sempre vêm antes das pagas.")}</p>
      {[...PROVIDER_CATALOG]
        .sort((a, b) => (tierDe(a.id) - tierDe(b.id)) || ((cfg(a.id).priority ?? 99) - (cfg(b.id).priority ?? 99)))
        .map((pc, idx, lista) => {
        const c = cfg(pc.id); const salva = Boolean((secrets[pc.secretKey] || "").trim());
        const opcoes = [...new Set([c.model, ...(pc.models || []), ...(fetched[pc.id] || [])].filter(Boolean))].filter(EH_CODIGO);
        const H = health[pc.id] || {};
        const testOn = testando === pc.id;
        const icone = m => testOn ? "…" : ({ ok: "✓", fail: "✕", retry: "…" })[H[m]?.status] || "";
        const primeiroDoTier = idx === 0 || tierDe(lista[idx - 1].id) !== tierDe(pc.id);
        const ultimoDoTier = idx === lista.length - 1 || tierDe(lista[idx + 1].id) !== tierDe(pc.id);
        return (
          <div className="ai-card" key={pc.id}>
            <div className="ai-head">
              <span className="ai-order">
                <button className="ord" disabled={primeiroDoTier} onClick={() => mover(pc.id, -1)} title={t("Subir")}>↑</button>
                <button className="ord" disabled={ultimoDoTier} onClick={() => mover(pc.id, 1)} title={t("Descer")}>↓</button>
              </span>
              <label className="ai-enable">
                <input type="checkbox" checked={c.enabled !== false} onChange={() => toggle(pc.id)} />
                <span className="ai-avatar">{iniciais(pc.label)}</span>
                <span className="ai-name">{pc.label}</span>
              </label>
              <span className={"pill " + (pc.tier === "free" ? "free" : "paid")}>{pc.tier === "free" ? t("grátis") : t("paga")}</span>
              {salva && <span className="pill on">{t("chave")} ✓</span>}
            </div>
            <div className="ai-row">
              <input className="text" type="password" placeholder={`${t("chave")} ${pc.label}`} value={drafts[pc.secretKey] ?? secrets[pc.secretKey] ?? ""} onChange={e => setDrafts(d => ({ ...d, [pc.secretKey]: e.target.value }))} />
              <button className="btn sm" onClick={() => salvarChave(pc)}>{t("Salvar")}</button>
            </div>
            {pc.keyUrl && <a className="getkey" href={pc.keyUrl} target="_blank" rel="noreferrer">{t("Obter chave")} <IconExternal /></a>}
            <div className="ai-row">
              <select className="text" value={c.model || pc.defaultModel} onChange={e => setModel(pc.id, e.target.value)}>
                {opcoes.map(m => <option key={m} value={m} disabled={H[m]?.status === "fail"}>{icone(m) ? icone(m) + " " : ""}{m}</option>)}
              </select>
              <button className="btn sm ghost" onClick={() => testar(pc)} disabled={!salva || testOn} title={t("Testar os modelos")}>{testOn ? "…" : t("Testar")}</button>
              <button className="btn sm ghost" onClick={() => buscar(pc)} disabled={buscando === pc.id} title={t("Buscar modelos disponíveis")}>{buscando === pc.id ? "…" : t("Buscar")}</button>
            </div>
            {Object.keys(H).length > 0 && !testOn && (
              <div className="ai-health">
                {opcoes.filter(m => H[m]).map(m => (
                  <span key={m} className={"hstat " + H[m].status} title={H[m].detail || ""}>{icone(m)} {m}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Ícones ---------------- */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const IconLogo = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /></svg>;
const IconHome = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9.5 21v-6h5v6" /></svg>;
const IconGrid = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
const IconChat = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const IconGem = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><path d="M6 3h12l3.5 5.5L12 21 2.5 8.5z" /><path d="M2.5 8.5h19M8.5 3.5 6 8.5l6 12.5M15.5 3.5 18 8.5 12 21" /></svg>;
const IconPlug = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6" /></svg>;
const IconPlayBox = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><rect x="2.5" y="4" width="19" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>;
const IconSpark = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.5l1.9 5.7 5.6 1.9-5.6 1.9L12 17.7l-1.9-5.7L4.5 10l5.6-1.9z" /><path d="M18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" opacity=".65" /></svg>;
const IconImage = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.4" /><path d="m21 15.5-4.5-4.5L6 21" /></svg>;
const IconCheck = () => <svg viewBox="0 0 24 24" width="14" height="14" {...S} strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>;
const IconDesktop = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><rect x="2" y="3" width="20" height="14" rx="2.5" /><path d="M8 21h8M12 17v4" /></svg>;
const IconMobile = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><rect x="7" y="2" width="10" height="20" rx="2.6" /><path d="M11 18h2" /></svg>;
const IconMonitor = () => <svg viewBox="0 0 24 24" width="22" height="22" {...S}><rect x="2" y="3" width="20" height="14" rx="2.5" /><path d="M8 21h8M12 17v4" /></svg>;
const IconFolder = () => <svg viewBox="0 0 24 24" width="18" height="18" {...S}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>;
const IconRepo = () => <svg viewBox="0 0 24 24" width="17" height="17" {...S}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></svg>;
const IconClose = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const IconRefresh = () => <svg viewBox="0 0 24 24" width="14" height="14" {...S}><path d="M21 12a9 9 0 1 1-3.2-6.9M21 4v5h-5" /></svg>;
const IconUndo = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><path d="M3 8h11a5 5 0 0 1 0 10H8" /><path d="M3 8l4-4M3 8l4 4" /></svg>;
const IconExternal = () => <svg viewBox="0 0 24 24" width="13" height="13" {...S}><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>;
const IconLock = () => <svg viewBox="0 0 24 24" width="12" height="12" {...S}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
const IconShield = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><path d="M12 3l7.5 3v6c0 4.5-3.2 8-7.5 9.4C7.7 20 4.5 16.5 4.5 12V6z" /><path d="M9.3 12.2l1.9 1.9 3.6-3.7" /></svg>;
const IconRelogio = () => <svg viewBox="0 0 24 24" width="12" height="12" {...S} strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;
const IconMaisFino = () => <svg viewBox="0 0 24 24" width="12" height="12" {...S} strokeWidth="2.6"><path d="M12 6v12M6 12h12" /></svg>;
const IconCheckFino = () => <svg viewBox="0 0 24 24" width="12" height="12" {...S} strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>;
const IconArrowUp = () => <svg viewBox="0 0 24 24" width="17" height="17" {...S} strokeWidth="2.2"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>;
// Quadrado cheio: o simbolo universal de "parar". Fica no lugar da seta
// enquanto a IA trabalha, entao o botao nunca some da onde a pessoa procura.
const IconParar = () => <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" /></svg>;
const IconChevronDown = () => <svg viewBox="0 0 24 24" width="12" height="12" {...S} strokeWidth="2.2"><path d="m6 9 6 6 6-6" /></svg>;
const IconChevronLeft = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S} strokeWidth="2.2"><path d="m15 18-6-6 6-6" /></svg>;
const IconMenu = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S} strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
const IconAlert = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
const IconInfo = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4.5M12 8h.01" /></svg>;
const IconFile = () => <svg viewBox="0 0 24 24" width="14" height="14" {...S}><path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" /><path d="M14 2.5v5h5" /></svg>;
const IconPanel = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><rect x="3" y="3.5" width="18" height="17" rx="3" /><path d="M9 3.5v17" /></svg>;
const IconGlobe = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19M12 2.5a14.5 14.5 0 0 0 0 19" /></svg>;
const IconKey = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S}><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" /></svg>;
const IconUser = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const IconChevronRight = () => <svg viewBox="0 0 24 24" width="13" height="13" {...S} strokeWidth="2.2"><path d="m9 18 6-6-6-6" /></svg>;
const IconPlus = () => <svg viewBox="0 0 24 24" width="14" height="14" {...S} strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>;
const Gh = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/></svg>;
const Sb = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M13 2 4 13.5c-.4.5 0 1.3.7 1.3H12v7l9-11.5c.4-.5 0-1.3-.7-1.3H13V2z"/></svg>;
const Vc = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3 22 20H2L12 3z"/></svg>;
