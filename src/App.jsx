import React, { useEffect, useRef, useState } from "react";
import Aurora from "./Aurora.jsx";
import BorderGlow from "./BorderGlow.jsx";
import * as store from "./core/storage.js";
import { PROVIDER_CATALOG } from "./core/config.js";
import { criarProjeto, editarProjeto, reconectarSupabase, criarTabelas, configurarChaveMapa, desfazerUltimo, gerarPlano, BLINDAR_PROMPT } from "./core/runtime.js";
import { listModels, healthCheck } from "./core/providers.js";
import * as history from "./core/history.js";
import { startGithubLoginWeb, startSupabaseLoginWeb, githubConfigurado, supabaseConfigurado } from "./core/oauth-web.js";
import * as github from "./core/github.js";
import * as vercel from "./core/vercel.js";
import * as sbmgmt from "./core/supabase-mgmt.js";

// Sugestões da home: só preenchem o campo (a pessoa revisa e envia).
const SUGESTOES = [
  "Landing page para uma barbearia com agendamento",
  "CRM simples com login e pipeline de vendas",
  "Cardápio digital com carrinho e pedido no WhatsApp",
  "Dashboard financeiro com gráficos e filtros"
];

export default function App({ oauthResult, oauthError }) {
  const [view, setView] = useState("home");        // home | workspace
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
  const [sideOpen, setSideOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth > 820 : true));
  const [mobileView, setMobileView] = useState("chat");   // mobile: "chat" | "preview"
  const [repo, setRepo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [viewport, setViewport] = useState("desktop");
  const [conn, setConn] = useState({ github: null, supabase: false, vercel: false });
  const [vercelProjects, setVercelProjects] = useState(null);
  const [connOpen, setConnOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [modelsCache, setModelsCache] = useState({});
  const [modelHealth, setModelHealth] = useState({});
  const [attached, setAttached] = useState([]);   // imagens anexadas (data URLs)
  const [plano, setPlano] = useState(null);        // plano pendente (1o comando de projeto novo)
  const [toast, setToast] = useState(null);
  const sessionRef = useRef(null);
  const msgRef = useRef(null);
  const inputRef = useRef(null);
  const flowRef = useRef("ia");   // "ia" = geração/edição por IA · "sistema" = deploy/reconexão sem IA
  async function loadModelsCache() { setModelsCache((await store.get("modelsCache")) || {}); setModelHealth((await store.get("modelHealth")) || {}); }

  function showToast(text, err = false) { setToast({ text, err }); setTimeout(() => setToast(null), 4200); }
  async function refreshConn() {
    const gh = await store.get("github"), sb = await store.get("supabase"), vc = await store.getSecret("VERCEL_TOKEN");
    setConn({ github: gh.login || (gh.token ? "conectado" : null), supabase: Boolean(sb.oauth || sb.token), vercel: Boolean(vc) });
    if (vc) loadVercelProjects();
  }
  async function refreshHistory() { setSessions(await history.listSessions()); }
  async function loadVercelProjects() {
    try { setVercelProjects(await vercel.listProjects()); }
    catch (e) { setVercelProjects([]); }
  }

  useEffect(() => {
    refreshConn(); refreshHistory(); loadModelsCache();
    if (oauthResult?.provider === "github") showToast(`GitHub conectado: @${oauthResult.login}`);
    if (oauthResult?.provider === "supabase") showToast("Supabase conectado.");
    if (oauthError) showToast(oauthError, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight; }, [messages]);

  // Tick do cronômetro global de execução (só corre enquanto busy).
  useEffect(() => {
    if (!busy) return;
    setRunAgora(Date.now());
    const t = setInterval(() => setRunAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [busy]);

  // Batimento de progresso: a geração pode demorar minutos sem emitir evento
  // (a IA “Pensando…” e o agente só volta a falar no deploy). Sem isso, a pessoa
  // acha que bugou. Aqui traduzimos a espera em passos claros, com o tempo —
  // com frases próprias para fluxo de IA e para fluxo só de sistema/deploy.
  useEffect(() => {
    if (!busy) return;
    const t0 = runStartedAt || Date.now();
    const batidas = flowRef.current === "ia" ? [
      { s: 0,   texto: "Enviando seu pedido para a IA…" },
      { s: 8,   texto: "A IA está entendendo o pedido e desenhando as telas…" },
      { s: 20,  texto: "A IA está escrevendo o código do seu projeto…" },
      { s: 40,  texto: "A IA ainda está escrevendo o código — projetos maiores levam mais tempo…" },
      { s: 70,  texto: "Quase lá — ajustando detalhes e preparando o commit…" },
      { s: 110, texto: "Finalizando: salvando no GitHub e preparando a publicação…" }
    ] : [
      { s: 0,   texto: "Trabalhando no seu pedido…" },
      { s: 15,  texto: "Aplicando as mudanças no projeto…" },
      { s: 45,  texto: "Preparando a publicação…" },
      { s: 90,  texto: "Quase pronto — aguardando o preview atualizar…" }
    ];
    let enviadas = 0;
    function tick() {
      const seg = Math.floor((Date.now() - t0) / 1000);
      while (enviadas < batidas.length && seg >= batidas[enviadas].s) {
        const b = batidas[enviadas++];
        const passo = `${b.texto} (${fmtDur(seg * 1000)} de trabalho)`;
        addStep(passo);
        setStatusText(passo);
      }
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // addStep/setStatusText são estáveis (setState); fmtDur é função de módulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  function pushMsg(role, text, images) { setMessages(m => [...m, { role, text, images }]); }
  function startRun() { setStatusText("Preparando…"); setRunStartedAt(Date.now()); setMessages(m => [...m, { role: "run", steps: [], done: false, startedAt: Date.now() }]); }
  function addStep(text) {
    setMessages(m => {
      const c = [...m];
      for (let i = c.length - 1; i >= 0; i--) { if (c[i].role === "run" && !c[i].done) { c[i] = { ...c[i], steps: [...c[i].steps, text] }; break; } }
      return c;
    });
  }
  function endRun() { setMessages(m => m.map(x => (x.role === "run" && !x.done) ? { ...x, done: true, endedAt: Date.now() } : x)); }

  function onEvent(ev) {
    const t = eventoTexto(ev);
    if (t) { setStatusText(t); addStep(t); }
  }

  async function run(userText, { hardening = false, images = [], planoAprovado = false } = {}) {
    if (!userText.trim()) return;
    if (busy) { showToast("Ainda estou trabalhando no pedido anterior — espere terminar ou recarregue a página.", true); return; }

    // A pessoa colou uma chave (ex.: Google Maps)? Manda direto pro Supabase como
    // secret, sem passar pela geração de código — e sem mostrar a chave no chat.
    const seg = detectarSegredo(userText);
    if (seg) {
      const sb = await store.get("supabase");
      const ehMapa = seg.kind === "gmaps" || seg.kind === "mapbox";   // chave de mapa vai NO APP (front)
      if (ehMapa && !repo) { showToast("Abra um projeto primeiro (o mapa usa a chave no app).", true); return; }
      if (!ehMapa && !sb.projectRef) { showToast("Escolha um projeto Supabase pra guardar a chave (Conexões).", true); setConnOpen(true); return; }

      setView("workspace"); flowRef.current = "sistema"; setBusy(true);
      pushMsg("user", `🔑 (enviei minha chave do ${seg.label})`);
      startRun();
      try {
        let partes = [];
        // 1) Chave de mapa client-side (Google Maps/Mapbox): vai NO APP + redeploy.
        if (ehMapa && repo) {
          const r = await configurarChaveMapa({ repo, apiKey: seg.value, envFront: seg.envFront, kind: seg.kind, label: seg.label, onEvent });
          if (r.url) { setPreviewUrl(r.url); setRepo({ ...repo, url: r.url }); }
          if (r.ok) partes.push(`Coloquei sua chave do ${seg.label} no app e republiquei — o mapa deve carregar em ~1 min (recarregue o preview).`);
          else partes.push(`Não achei onde o app usa a chave do ${seg.label} — talvez a tela do mapa ainda não exista. Peça primeiro pra criar o mapa.`);
        }
        // 2) Também guarda no Supabase (pra uso no servidor/Edge Functions, se houver).
        if (sb.projectRef) { try { await sbmgmt.setSecrets({ [seg.name]: seg.value }); partes.push(`Também guardei a chave no seu Supabase (variável "${seg.name}").`); } catch { /* opcional */ } }
        endRun();
        const txt = partes.join(" ") || `Guardei sua chave do ${seg.label}.`;
        pushMsg("assistant", txt);
        if (sessionRef.current) await history.appendMessage(sessionRef.current, { role: "assistant", text: txt });
      } catch (e) { endRun(); pushMsg("error", "Não consegui aplicar a chave: " + e.message); showToast(e.message, true); }
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
        ? 'Beleza! Me manda aqui a sua chave do Google Maps — ela começa com "AIza…". Assim que você colar, eu guardo direto no seu Supabase (variável GOOGLE_MAPS_API_KEY), fora do código.'
        : "Pra guardar a chave com segurança, primeiro escolha um projeto Supabase em Conexões → Supabase → Projeto. Depois é só me mandar a chave.";
      pushMsg("assistant", resp);
      await history.appendMessage(sessionRef.current, { role: "assistant", text: resp });
      if (!sb.projectRef) setConnOpen(true);
      refreshHistory();
      return;
    }

    if (!conn.github) { showToast("Conecte o GitHub primeiro (Conexões).", true); setConnOpen(true); return; }

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
      if (!sb.projectRef) { showToast("Escolha um projeto Supabase primeiro (Conexões → Supabase → Projeto).", true); setConnOpen(true); return; }
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
    if (!repo && !hardening && !planoAprovado) {
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
        pushMsg("error", "Não consegui montar o plano: " + e.message);
        showToast(e.message, true);
      } finally { setBusy(false); }
      return;
    }

    setView("workspace");
    flowRef.current = "ia";
    setBusy(true);
    if (!planoAprovado) pushMsg("user", hardening ? "🛡️ Blindar o projeto" : userText, images.length ? images : undefined);
    startRun();
    if (!sessionRef.current) sessionRef.current = await history.createSession({ title: userText.slice(0, 48), kind });
    await history.appendMessage(sessionRef.current, { role: "user", text: hardening ? "Blindar o projeto" : userText });
    try {
      const r = repo
        ? await editarProjeto({ repo, userMessage: userText, providerId, sessionId: sessionRef.current, embedImages: images }, onEvent)
        : await criarProjeto({ userMessage: userText, kind: detectarTipo(userText), providerId, sessionId: sessionRef.current, embedImages: images }, onEvent);
      endRun();
      setRepo(r.repo);
      if (r.url) setPreviewUrl(r.url);
      pushMsg("assistant", r.resumo || `${repo ? "Pronto — alteração salva." : `Projeto criado: ${r.repo.owner}/${r.repo.name}`}${r.url ? `\nNo ar: ${r.url}` : ""}`);
      refreshHistory(); loadVercelProjects();
    } catch (e) {
      endRun();
      let msg = e.message;
      if (/recusaram|timeout|refus/i.test(msg)) {
        msg += "\n\n💡 Dica: no seletor de IA escolha um modelo de CÓDIGO (ex.: DeepSeek → deepseek-chat, ou Gemini). Evite modelos de visão/experimentais — eles travam. E deixe mais de um provedor ligado em Conexões pra ter reserva.";
      }
      pushMsg("error", msg); showToast(e.message, true);
    }
    finally { setBusy(false); }
  }

  async function addFiles(fileList) {
    const novos = [];
    for (const f of fileList) {
      if (!f.type.startsWith("image/")) continue;
      if (attached.length + novos.length >= 4) { showToast("Máximo de 4 imagens por pedido.", true); break; }
      try { novos.push(await fileToDataUrl(f)); } catch { /* ignora imagem ilegível */ }
    }
    if (novos.length) setAttached(a => [...a, ...novos]);
  }

  function handleSend() {
    const t = input.trim();
    if (!t && !attached.length) return;
    const imgs = attached.slice();
    setInput(""); setAttached([]);
    run(t || "Use a imagem que enviei.", { images: imgs });
  }
  function aprovarPlano(textoFinal) {
    if (!plano) return;
    const p = plano; setPlano(null);
    const texto = (textoFinal ?? p.texto).trim();
    const prompt = p.prompt + (texto ? `\n\n[PLANO APROVADO — siga este plano]\n${texto}` : "");
    run(prompt, { images: p.images, planoAprovado: true });
  }
  function recusarPlano() {
    setPlano(null);
    pushMsg("assistant", "Plano descartado. Me diga o que mudar ou mande um novo pedido que eu monto outro plano.");
  }
  function handleBlindar() { if (!repo) return showToast("Crie ou abra um projeto antes de blindar.", true); run(BLINDAR_PROMPT, { hardening: true }); }
  async function desfazer() {
    if (!repo || busy) return showToast(repo ? "Aguarde terminar." : "Nenhum projeto aberto.", true);
    setView("workspace"); flowRef.current = "sistema"; setBusy(true);
    pushMsg("user", "↩ Desfazer a última alteração"); startRun();
    try {
      const r = await desfazerUltimo(repo, onEvent);
      endRun();
      if (r.url) { setPreviewUrl(r.url + (r.url.includes("?") ? "&" : "?") + "r=" + Date.now()); setRepo({ ...repo, url: r.url }); }
      pushMsg("assistant", "Voltei pra versão anterior do projeto e republiquei. Recarregue o preview em ~1 min.");
    } catch (e) { endRun(); pushMsg("error", e.message); showToast(e.message, true); }
    finally { setBusy(false); }
  }
  function novoProjeto() { sessionRef.current = null; setRepo(null); setPreviewUrl(null); setMessages([]); setView("home"); }
  // Só preenche o campo (comportamento igual ao de digitar): não envia nada.
  function sugerir(t) { setInput(t); setTimeout(() => inputRef.current?.focus(), 0); }

  async function openSession(id) {
    const s = await history.getSession(id);
    if (!s) return;
    setHistOpen(false); sessionRef.current = id;
    setRepo(s.repo || null); setPreviewUrl(s.repo?.url || null);
    setMessages((s.messages || []).map(m => ({ role: m.role, text: m.text })));
    setView("workspace");
  }
  async function openProject(p) {
    setProjOpen(false);
    // Continuidade: se já existe uma conversa deste projeto, reabre ela.
    const todas = await history.listSessions();
    const existente = todas.find(s => s.repo && s.repo.owner === p.owner && s.repo.name === p.name);
    if (existente) { await openSession(existente.id); return; }

    sessionRef.current = null;
    const repoInfo = { owner: p.owner, name: p.name, branch: p.branch || "main", url: p.url || null, brief: "" };
    setRepo(repoInfo);
    setMessages([{ role: "assistant", text: `Projeto aberto: ${p.owner}/${p.name}. Peça as alterações aqui que eu edito.` }]);
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
      pushMsg("assistant", "Conectei seu app ao Supabase que você escolheu. Agora ele fala com o seu banco de verdade (sem mais placeholder).");
    } catch (e) { endRun(); pushMsg("error", e.message); }
    finally { setBusy(false); }
  }

  const composer = (
    <Composer
      big={view === "home"} repo={repo} busy={busy} input={input} setInput={setInput}
      inputRef={inputRef}
      kind={kind} setKind={setKind} onSend={handleSend} onBlindar={handleBlindar}
      providerId={providerId} activeModel={activeModel} onPickModel={pickModel} modelsCache={modelsCache} modelHealth={modelHealth}
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

  const sidebarAtivo = projOpen ? "projetos" : histOpen ? "conversas" : connOpen ? "conexoes" : (view === "home" ? "inicio" : "inicio");

  return (
    <div className="app">
      <AuroraBackdrop />

      {sideOpen && <Sidebar
        conn={conn} projects={vercelProjects} ativo={sidebarAtivo}
        onNew={novoProjeto}
        onProjetos={() => { loadVercelProjects(); setProjOpen(true); }}
        onConversas={() => { refreshHistory(); setHistOpen(true); }}
        onConexoes={() => { setKeysOpen(false); setConnOpen(true); }}
        onOpenProject={openProject}
        onCollapse={() => setSideOpen(false)}
      />}
      {sideOpen && <div className="side-scrim" onClick={() => setSideOpen(false)} />}

      <div className="content">
        {!sideOpen && <button className="icon-btn side-reopen" onClick={() => setSideOpen(true)} title="Mostrar menu"><IconMenu /></button>}
        {view === "home" ? (
          <div className="home">
            <div className="home-inner">
              <div className="hero-badge">
                <span className="tag">BYOK</span> <b>Suas chaves de IA</b> · sem mensalidade escondida
              </div>
              <h1 className="hero-title">O que você quer <span className="grad">criar</span> hoje?</h1>
              <p className="hero-sub">Descreva a ideia em uma frase. A IA escreve o código, versiona no seu GitHub e publica na Vercel — sem sair desta tela.</p>
              {composer}
              <div className="hero-chips">
                {SUGESTOES.map((s, i) => (
                  <button key={i} className="sug" onClick={() => sugerir(s)} title="Usar esta ideia">
                    <IconSpark /> {s}
                  </button>
                ))}
              </div>

              <div className="steps">
                <StepCard n="1" titulo="Conecte as chaves" desc="GitHub pra versionar, Vercel pra publicar e a IA que você preferir (as grátis já bastam)." />
                <StepCard n="2" titulo="Descreva a ideia" desc="Um prompt curto já começa o app. Depois é só pedir mudanças em português." />
                <StepCard n="3" titulo="Veja no ar" desc="O projeto nasce no seu repositório e sobe sozinho. Preview ao lado, sem deploy manual." />
              </div>

              {recentes.length > 0 && (
                <div className="recent">
                  <div className="recent-head"><h2>Continue de onde parou</h2><span className="line" /></div>
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
                </div>
              )}

              <p className="home-hint">Comece pelos modelos grátis (NVIDIA, Gemini, Groq). Já tem um projeto? Abra em <b>Projetos</b> ou peça alterações direto no chat.</p>
            </div>
          </div>
        ) : (
          <div className="workspace">
            <div className="m-tabs">
              <button className={"m-tab" + (mobileView === "chat" ? " on" : "")} onClick={() => setMobileView("chat")}>Chat</button>
              <button className={"m-tab" + (mobileView === "preview" ? " on" : "")} onClick={() => setMobileView("preview")}>Preview</button>
            </div>
            <div className={"chat-col" + (mobileView === "preview" ? " m-off" : "")}>
              <div className="chat-top">
                {repo ? (
                  <div className="repo-chip" title={`${repo.owner}/${repo.name}`}>
                    <IconRepo />
                    <span className="owner">{repo.owner}<span className="sep">/</span></span><b>{repo.name}</b>
                  </div>
                ) : (
                  <div className="repo-chip"><IconSpark /><b>Novo projeto</b></div>
                )}
                <div className={"live" + (busy ? " on" : "")}>
                  {busy ? (statusText || "trabalhando…") : (repo ? "pronto pra editar" : "aguardando")}
                </div>
              </div>

              <div className="chat-messages" ref={msgRef}>
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <span className="orb"><IconSpark /></span>
                    <div>Descreva o que você quer construir ou mudar neste projeto. Eu cuido do código, do commit e do deploy.</div>
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
                  <span className="working-text">{statusText || "Trabalhando…"}</span>
                  <span className="working-time" title="Tempo decorrido">{fmtDur(Math.max(0, (runAgora - (runStartedAt || runAgora))))}</span>
                </div>
              )}
              {composer}
            </div>

            <div className={"preview-col" + (mobileView === "chat" ? " m-off" : "")}>
              <div className="preview-bar">
                <div className="browser-dots"><i /><i /><i /></div>
                <div className="url-bar" title={previewUrl || "sem preview ainda"}>
                  <span className="lock"><IconLock /></span>
                  <span className="url">{previewUrl ? previewUrl.replace(/^https?:\/\//, "") : "sem preview ainda"}</span>
                </div>
                <div className="vp-toggle">
                  <button className={"vp" + (viewport === "desktop" ? " on" : "")} onClick={() => setViewport("desktop")} title="Desktop"><IconDesktop /></button>
                  <button className={"vp" + (viewport === "mobile" ? " on" : "")} onClick={() => setViewport("mobile")} title="Mobile"><IconMobile /></button>
                </div>
                <div className="preview-actions">
                  {repo && <button className="icon-btn" onClick={desfazer} disabled={busy} title="Desfazer a última alteração"><IconUndo /></button>}
                  {previewUrl && <button className="icon-btn" onClick={() => setPreviewUrl(previewUrl + (previewUrl.includes("?") ? "&" : "?") + "r=" + Date.now())} title="Recarregar"><IconRefresh /></button>}
                  {previewUrl && <button className="btn sm" onClick={() => window.open(previewUrl, "_blank")} title="Abrir em nova aba">Abrir <IconExternal /></button>}
                </div>
              </div>
              <div className={"preview-stage" + (viewport === "mobile" ? " mobile" : "")}>
                {previewUrl ? <iframe className="preview-frame" src={previewUrl} title="preview" />
                  : <div className="preview-empty">
                      <span className="orb"><IconMonitor /></span>
                      <b>O preview aparece aqui</b>
                      <p>Assim que a Vercel publicar, a página roda neste painel. Use o ícone de celular pra ver o layout no mobile.</p>
                    </div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {projOpen && <ProjectsDrawer projects={vercelProjects} onReload={loadVercelProjects} onOpen={openProject} onClose={() => setProjOpen(false)} />}
      {histOpen && <HistoryDrawer sessions={sessions} onOpen={openSession}
        onDelete={async id => { await history.deleteSession(id); refreshHistory(); }}
        onClear={async () => { await history.clearAll(); refreshHistory(); }}
        onClose={() => setHistOpen(false)} />}
      {connOpen && <Connections repo={repo} startKeys={keysOpen} onSupabaseBound={aoLigarSupabase} onClose={() => { setConnOpen(false); refreshConn(); loadModelsCache(); }} showToast={showToast} />}
      {toast && <div className={"toast" + (toast.err ? " err" : "")}>{toast.text}</div>}
    </div>
  );
}

/* ---------------- Fundo ambiente ---------------- */
function AuroraBackdrop() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora-orb o1" />
      <span className="aurora-orb o2" />
      <span className="aurora-orb o3" />
      <Aurora
        className="aurora-gl"
        colorStops={["#180810", "#e11d48", "#2a0a16"]}
        amplitude={0.9}
        blend={0.55}
        speed={0.6}
        mouse
      />
    </div>
  );
}

/* ---------------- Sidebar ---------------- */
function iniciais(nome) {
  const limpo = String(nome || "?").replace(/[^a-zA-Z0-9]/g, "");
  return (limpo.slice(0, 2) || "?").toUpperCase();
}
const CORES_AVATAR = ["", " c2", " c3", " c4"];

function Sidebar({ conn, projects, ativo, onNew, onProjetos, onConversas, onConexoes, onOpenProject, onCollapse }) {
  return (
    <aside className="sidebar">
      <div className="side-head">
        <div className="brand">
          <span className="brand-mark"><img src="/brand/logo.png" alt="logo" className="brand-logo" /></span>
        </div>
        <button className="icon-btn side-collapse" onClick={onCollapse} title="Minimizar menu"><IconChevronLeft /></button>
      </div>

      <button className="side-new" onClick={onNew}><IconPlus /> Nova conversa</button>

      <nav className="side-nav">
        <button className={"nav-item" + (ativo === "inicio" ? " on" : "")} onClick={onNew}><IconHome /> Início</button>
        <button className={"nav-item" + (ativo === "projetos" ? " on" : "")} onClick={onProjetos}>
          <IconGrid /> Projetos
          {Array.isArray(projects) && projects.length > 0 && <span className="nav-count">{projects.length}</span>}
        </button>
        <button className={"nav-item" + (ativo === "conversas" ? " on" : "")} onClick={onConversas}>
          <IconChat /> Conversas
        </button>
      </nav>

      <div className="side-section">Projetos recentes</div>
      <div className="side-list">
        {/* Estado da lista: se não há token da Vercel, nada vai carregar — dizemos isso. */}
        {!conn.vercel ? <span className="side-empty">conecte a Vercel pra listar seus projetos</span>
          : projects === null ? <span className="side-empty">carregando…</span>
          : projects.length === 0 ? <span className="side-empty">nenhum projeto ainda</span>
          : projects.slice(0, 8).map((p, i) => (
            <button key={i} className="side-proj" onClick={() => onOpenProject(p)} title={p.url || `${p.owner}/${p.name}`}>
              <span className={"proj-avatar" + CORES_AVATAR[i % 4]}><IconGem /></span>
              <span>{p.vercelName || p.name}</span>
            </button>
          ))}
      </div>

      <div className="side-foot">
        <div className="side-card">
          <div className="side-card-title"><IconPlug /> Conexões</div>
          <div className="side-card-sub">GitHub versiona, Vercel publica, Supabase guarda os dados. Você usa as suas chaves.</div>
          <button className="btn sm wide" style={{ marginTop: 10 }} onClick={onConexoes}>Gerenciar conexões</button>
        </div>
        <div className="side-status">
          <span className={conn.github ? "on" : ""}>GitHub</span>
          <span className={conn.supabase ? "on" : ""}>Supabase</span>
          <span className={conn.vercel ? "on" : ""}>Vercel</span>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- Card de passo (home) ---------------- */
function StepCard({ n, titulo, desc }) {
  return (
    <div className="step-card">
      <div className="step-n">{n}</div>
      <div className="step-title">{titulo}</div>
      <div className="step-desc">{desc}</div>
    </div>
  );
}

/* ---------------- Composer (v0-style) ---------------- */
function Composer({ big, repo, busy, input, setInput, inputRef, kind, setKind, onSend, onBlindar, providerId, activeModel, onPickModel, modelsCache, modelHealth, attached = [], onAddFiles, onRemoveAttach, projects, onLoadProjects, onOpenProject, onNew, onPlusConexoes, onPlusChaves }) {
  const [plus, setPlus] = useState(false);
  const fileRef = useRef(null);
  return (
    <div className={"composer" + (big ? " big" : "")}>
      {repo && <div className="composer-ctx">Editando <b>{repo.owner}/{repo.name}</b> · <button className="linklike" onClick={onNew}>novo projeto</button></div>}
      {attached.length > 0 && (
        <div className="attach-strip">
          {attached.map((src, i) => (
            <div className="thumb" key={i}>
              <img src={src} alt="" />
              <button className="thumb-x" onClick={() => onRemoveAttach(i)} title="Remover">×</button>
            </div>
          ))}
        </div>
      )}
      <textarea className="composer-input" rows={big ? 2 : 3} ref={inputRef}
        placeholder={repo ? "Peça uma alteração… (ou anexe uma imagem pra trocar/usar)" : "Descreva sua ideia, vamos dar vida a ela…"}
        value={input} onChange={e => setInput(e.target.value)}
        onPaste={e => { const imgs = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean); if (imgs.length) { e.preventDefault(); onAddFiles(imgs); } }}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); } }} disabled={busy} />
      <div className="composer-row">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { onAddFiles([...e.target.files]); e.target.value = ""; }} />
        <button className="chip" onClick={() => fileRef.current?.click()} title="Anexar imagem" disabled={busy}><IconImage /></button>
        <div className="pop-anchor">
          <button className="chip icon" onClick={() => setPlus(v => !v)} title="Mais"><IconPlus /></button>
          {plus && (<>
            <div className="pop-back" onClick={() => setPlus(false)} />
            <div className="pop menu">
              <button onClick={() => { setPlus(false); onPlusConexoes(); }}><IconPlug /> Conexões</button>
              <button onClick={() => { setPlus(false); onPlusChaves(); }}><IconSpark /> Chaves de IA / modelos</button>
            </div>
          </>)}
        </div>
        <ModelPicker providerId={providerId} activeModel={activeModel} onPick={onPickModel} modelsCache={modelsCache} modelHealth={modelHealth} />
        <button className="chip" onClick={onBlindar} disabled={busy || !repo} title="Blindar contra vazamento de dados"><IconShield /></button>
        <div className="spacer" />
        <ProjectPicker projects={projects} onLoad={onLoadProjects} onOpen={onOpenProject} onNew={onNew} />
        <button className="send" onClick={onSend} disabled={busy} title="Enviar">{busy ? <span className="spin" /> : <IconArrowUp />}</button>
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
    case "status": return ev.text;
    case "provider_try": return `Pensando com a IA (${ev.provider})…`;
    case "provider_switch": return `Trocando de IA (${ev.provider})…`;
    case "provider": return `Pensando com a IA (${ev.label || ev.model || ev.providerId})…`;
    case "deploy": return ev.text || ev.phase || "publicando…";
    case "tool_start": return ({
      list_files: "Olhando os arquivos do projeto…",
      read_file: `Lendo ${a.path || "um arquivo"}…`,
      search_code: `Procurando "${a.query || ""}"…`,
      write_file: `Escrevendo ${a.path || "um arquivo"}…`,
      delete_file: `Removendo ${a.path || "um arquivo"}…`,
      commit_changes: "Salvando as mudanças no GitHub…",
      salvar_imagem: "Salvando a imagem no projeto…",
      listar_tabelas: "Vendo as tabelas do banco…",
      criar_tabela: "Criando a tabela no Supabase…",
      criar_edge_function: "Publicando a função no Supabase…"
    })[ev.name] || `Usando ${ev.name}…`;
    case "commit": return `Salvo no GitHub${ev.shortSha ? ` (${ev.shortSha})` : ""}.`;
    case "tool_error": return `⚠️ erro em ${ev.name}: ${ev.message}`;
    case "notice": return "⚠️ " + ev.text;
    case "html_retry": return "A resposta veio incompleta — pedindo de novo…";
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
  return "app";
}

function detectarSegredo(texto) {
  const gm = String(texto).match(/\bAIza[0-9A-Za-z_\-]{20,}\b/);
  if (gm) return { name: "GOOGLE_MAPS_API_KEY", value: gm[0], label: "Google Maps", envFront: "VITE_GOOGLE_MAPS_API_KEY", kind: "gmaps" };
  const mb = String(texto).match(/\bpk\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/);
  if (mb) return { name: "MAPBOX_TOKEN", value: mb[0], label: "Mapbox", envFront: "VITE_MAPBOX_TOKEN", kind: "mapbox" };
  return null;
}

function ModelPicker({ providerId, activeModel, onPick, modelsCache = {}, modelHealth = {} }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const label = providerId ? (activeModel || "modelo") : "Automático";
  return (
    <div className="pop-anchor">
      <button className="chip" onClick={() => setOpen(v => !v)} title="Escolher IA/modelo"><IconSpark /> <span>{label}</span> <IconChevronDown /></button>
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className="pop models">
          <input className="pop-search" placeholder="Buscar modelos" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="pop-scroll">
            <button className={"pop-item" + (!providerId ? " sel" : "")} onClick={() => { onPick("", ""); setOpen(false); }}>
              <span>Automático (revezamento)</span>{!providerId && <IconCheck />}
            </button>
            {PROVIDER_CATALOG.map(pc => {
              const h = modelHealth[pc.id] || {};
              // Esconde do seletor só os modelos que o health check reprovou (❌).
              const todos = [...new Set([...(pc.models || []), ...(modelsCache[pc.id] || [])])].filter(EH_CODIGO).filter(m => h[m]?.status !== "fail");
              const models = todos.filter(m => !q || m.toLowerCase().includes(q.toLowerCase()) || pc.label.toLowerCase().includes(q.toLowerCase()));
              if (!models.length) return null;
              return (
                <div key={pc.id}>
                  <div className="pop-group">{pc.label}</div>
                  {models.map(m => {
                    const sel = providerId === pc.id && activeModel === m;
                    return <button key={m} className={"pop-item" + (sel ? " sel" : "")} onClick={() => { onPick(pc.id, m); setOpen(false); }}>
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
      <button className="chip" onClick={toggle} title="Projetos"><IconGrid /> <span>Projetos</span> <IconChevronDown /></button>
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className="pop models right">
          <input className="pop-search" placeholder="Buscar projetos" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="pop-scroll">
            <button className="pop-item" onClick={() => { setOpen(false); onNew(); }}><span>+ Novo projeto</span></button>
            {projects === null ? <div className="pop-group">carregando…</div>
              : list.length === 0 ? <div className="pop-group">nenhum projeto na Vercel</div>
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

function PlanCard({ plano, onAprovar, onRecusar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(plano.texto);
  useEffect(() => { setTexto(plano.texto); setEditando(false); }, [plano]);
  return (
    <div className="plan-card">
      <div className="plan-head">
        <span className="plan-badge">Plano</span>
        <span className="plan-title">Revise antes de eu construir</span>
      </div>
      {editando
        ? <textarea className="plan-edit" value={texto} onChange={e => setTexto(e.target.value)} rows={10} autoFocus />
        : <div className="plan-body">{texto}</div>}
      <div className="plan-actions">
        <button className="btn sm" onClick={() => onAprovar(texto)}><IconCheck /> Aprovar e construir</button>
        {editando
          ? <button className="btn sm ghost" onClick={() => setEditando(false)}>Pronto</button>
          : <button className="btn sm ghost" onClick={() => setEditando(true)}>Editar</button>}
        <button className="btn sm ghost" onClick={onRecusar}>Recusar</button>
      </div>
    </div>
  );
}

function Bubble({ role, text, images }) {
  if (role === "system" || role === "error") return <div className={"note " + role}>{text}</div>;
  const eu = role === "user";
  return (
    <div className={"bubble " + role}>
      <div className="bubble-head">
        <span className={"avatar" + (eu ? " me" : "")}>{eu ? "VC" : "AI"}</span>
        {eu ? "você" : "copilot code"}
      </div>
      {images && images.length > 0 && (
        <div className="bubble-imgs">
          {images.map((src, i) => <img key={i} src={src} alt="imagem enviada" />)}
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

function RunCard({ steps, done, startedAt, endedAt }) {
  const [open, setOpen] = useState(true);   // aberto enquanto trabalha (ensina), recolhe ao terminar
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { if (done) setOpen(false); }, [done]);
  // cronometro ao vivo: so corre enquanto trabalha
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [done]);

  const base = startedAt || agora;
  const decorrido = done ? ((endedAt || base) - base) : (agora - base);
  const last = steps[steps.length - 1] || "Começando…";

  return (
    <div className={"run-card" + (done ? " done" : "")}>
      <div className="run-head">
        {done ? <span className="run-ok">✓</span> : <span className="spin" />}
        <span className="run-title">{done ? "Concluído" : last}</span>
        <span className="run-time" title={done ? "Tempo total" : "Tempo decorrido"}>{fmtDur(decorrido)}</span>
        <button className="run-toggle" onClick={() => setOpen(o => !o)}>{open ? "Ocultar" : "Detalhes"}</button>
      </div>
      {!open && (
        <div className="run-sub">{done ? `${steps.length} etapas · veja o resumo abaixo` : `${steps.length} etapa${steps.length === 1 ? "" : "s"} até agora`}</div>
      )}
      {open && (
        <div className="run-steps">
          {steps.length === 0 ? <div className="run-step cur"><span className="run-dot">▸</span> preparando…</div>
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
      <button className="icon-btn" onClick={onClose} title="Fechar"><IconClose /></button>
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

function ProjectsDrawer({ projects, onReload, onOpen, onClose }) {
  useEffect(() => { onReload?.(); /* eslint-disable-next-line */ }, []);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <DrawerHead icon={<IconGrid />} titulo="Projetos" onClose={onClose}>
          <button className="btn sm ghost" onClick={onReload}><IconRefresh /> Atualizar</button>
        </DrawerHead>
        <div className="body">
          <p className="hint" style={{ marginTop: 0 }}>Seus projetos na Vercel. Clicar abre o projeto (puxa o repositório do GitHub ligado) para editar.</p>
          {projects === null ? <p className="hint">carregando…</p>
            : projects.length === 0 ? (
              <div className="empty">
                <span className="orb"><IconGrid /></span>
                <div>Nenhum projeto na Vercel ainda — ou o Worker <code>/proxy</code> não está no ar.</div>
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

function fmtData(ts) { try { return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function HistoryDrawer({ sessions, onOpen, onDelete, onClear, onClose }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <BorderGlow className="drawer-glow" backgroundColor="transparent" borderRadius={0}
          glowColor="347 90 58" glowRadius={18} edgeSensitivity={40} glowIntensity={0.6} coneSpread={22}
          colors={["#e11d48", "#fb7185", "#f97316"]}>
          <DrawerHead icon={<IconChat />} titulo="Conversas" onClose={onClose}>
            {sessions.length > 0 && <button className="btn sm ghost" onClick={() => { if (window.confirm("Apagar todo o histórico?")) onClear(); }}>Limpar</button>}
          </DrawerHead>
          <div className="body">
            {sessions.length === 0 ? (
              <div className="empty">
                <span className="orb"><IconChat /></span>
                <div>Nada aqui ainda. Cada conversa fica salva no seu navegador.</div>
              </div>
            )
              : sessions.map(s => (
                <div key={s.id} className="hist-item">
                  <span className="proj-avatar"><IconChat /></span>
                  <div className="hist-main" onClick={() => onOpen(s.id)}>
                    <div className="hist-title">{s.title}</div>
                    <div className="hist-meta">{fmtData(s.updatedAt)}{s.repo ? ` · ${s.repo.owner}/${s.repo.name}` : ""}{s.count ? ` · ${s.count} msg` : ""}</div>
                  </div>
                  <button className="icon-btn" onClick={() => onDelete(s.id)} title="Apagar conversa"><IconClose /></button>
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
function Connections({ repo, startKeys, onClose, onSupabaseBound, showToast }) {
  const [secrets, setSecrets] = useState(null);
  const [gh, setGh] = useState({});
  const [sb, setSb] = useState({});
  const [showKeys, setShowKeys] = useState(Boolean(startKeys));
  const [sbProjects, setSbProjects] = useState(null);
  const [sbLoading, setSbLoading] = useState(false);
  useEffect(() => { (async () => { setSecrets(await store.get("secrets")); setGh(await store.get("github")); setSb(await store.get("supabase")); })(); }, []);
  async function saveSecret(k, v) { setSecrets(s => ({ ...s, [k]: v })); await store.patch("secrets", { [k]: v }); }
  async function connectGithubToken() {
    const t = window.prompt("Cole um token do GitHub (github_pat_… com Contents: Read/Write):"); if (!t) return;
    try { const p = await github.validateToken(t.trim()); await store.patch("github", { token: t.trim(), login: p.login, avatar: p.avatar }); setGh(await store.get("github")); showToast(`GitHub conectado: @${p.login}`); }
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
      showToast(`Projeto Supabase ligado: ${p.name}`);
      if (repo && onSupabaseBound) { onClose(); onSupabaseBound(); }   // reconecta o app aberto
    }
    catch (e) { showToast(e.message, true); }
  }
  async function sbLogout() { await sbmgmt.disconnect(); setSb({}); setSbProjects(null); }
  if (!secrets) return null;
  const sbConn = Boolean(sb.oauth || sb.token);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <DrawerHead icon={<IconPlug />} titulo="Conexões" onClose={onClose} />
        <div className="body">
          <div className="drawer-section">Serviços</div>
          <div className="conn-card">
            <ConnRow icon={<Gh />} name="GitHub" sub={gh.login ? `@${gh.login}` : "desconectado"} subOff={!gh.login}>
              {gh.login ? <button className="btn sm ghost" onClick={ghLogout}>sair</button>
                : githubConfigurado() ? <button className="btn sm primary" onClick={startGithubLoginWeb}>Entrar</button>
                : <button className="btn sm primary" onClick={connectGithubToken}>Token</button>}
              {!gh.login && githubConfigurado() && <button className="btn sm ghost" onClick={connectGithubToken}>token</button>}
            </ConnRow>
            <ConnRow icon={<Sb />} name="Supabase" sub={sbConn ? (sb.projectName ? `projeto: ${sb.projectName}` : "escolha um projeto") : "desconectado"} subOff={!sbConn || !sb.projectName}>
              {sbConn
                ? <><button className="btn sm" onClick={loadSbProjects} disabled={sbLoading}>{sbLoading ? "…" : (sb.projectName ? "Trocar" : "Projeto")}</button><button className="btn sm ghost" onClick={sbLogout}>sair</button></>
                : supabaseConfigurado() ? <button className="btn sm primary" onClick={startSupabaseLoginWeb}>Conectar</button>
                : <span className="pill">config</span>}
            </ConnRow>
            <ConnRow icon={<Vc />} name="Vercel" sub={secrets.VERCEL_TOKEN ? "token salvo" : "sem token"} subOff={!secrets.VERCEL_TOKEN}>
              <input className="text mini" type="password" placeholder="token" defaultValue={secrets.VERCEL_TOKEN} onBlur={e => saveSecret("VERCEL_TOKEN", e.target.value.trim())} />
            </ConnRow>
            <ConnRow icon={<IconRepo />} name="Repositório" sub={repo ? `${repo.owner}/${repo.name}` : "nenhum"} subOff={!repo} />
          </div>

          {sbProjects && (
            <div className="conn-card" style={{ marginTop: 10 }}>
              <div className="sb-pick-head">Escolha o projeto Supabase</div>
              {sbProjects.length === 0 ? <div className="sb-pick-empty">Nenhum projeto nesta conta.</div>
                : sbProjects.map(p => (
                  <button key={p.ref} className="sb-pick-item" onClick={() => bindSb(p)}>
                    <strong>{p.name}</strong><span>{p.region} · {p.status}</span>
                  </button>
                ))}
            </div>
          )}

          <p className="hint">Token da Vercel: <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">vercel.com/account/tokens</a></p>

          <div className="drawer-section">Chaves de IA (BYOK)</div>
          <button className="btn wide" onClick={() => setShowKeys(v => !v)}>{showKeys ? "Ocultar chaves de IA" : "Configurar chaves de IA"}</button>
          {showKeys && <AiProviders showToast={showToast} />}
        </div>
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
  xai: "linear-gradient(135deg,#64748b,#0f172a)"
};

function AiProviders({ showToast }) {
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
      showToast(`${pc.label}: ${ok} de ${Object.keys(mapa).length} modelo(s) funcionando.`);
    } catch (e) { showToast(pc.label + ": " + e.message, true); }
    finally { setTestando(""); }
  }
  async function salvarChave(pc) {
    const v = (drafts[pc.secretKey] ?? secrets[pc.secretKey] ?? "").trim();
    await store.patch("secrets", { [pc.secretKey]: v }); setSecrets(s => ({ ...s, [pc.secretKey]: v }));
    showToast(v ? `Chave do ${pc.label} salva.` : `Chave do ${pc.label} removida.`);
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
      showToast(`${pc.label}: ${list.length} modelos.`);
    }
    catch (e) { showToast(pc.label + ": " + e.message, true); } finally { setBuscando(""); }
  }
  async function setModel(id, model) { const arr = (await store.get("providers")).map(p => p.id === id ? { ...p, model } : p); await store.set("providers", arr); setProvs(arr); }
  async function toggle(id) { const arr = (await store.get("providers")).map(p => p.id === id ? { ...p, enabled: !p.enabled } : p); await store.set("providers", arr); setProvs(arr); }
  if (!secrets) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <p className="hint" style={{ marginTop: 0 }}>Preencha ao menos uma e clique <b>Salvar</b> — ao salvar, testo os modelos pra você. Comece pelas <b>grátis</b>: Gemini, OpenRouter, Mistral, Groq.</p>
      {PROVIDER_CATALOG.map(pc => {
        const c = cfg(pc.id); const salva = Boolean((secrets[pc.secretKey] || "").trim());
        const opcoes = [...new Set([c.model, ...(pc.models || []), ...(fetched[pc.id] || [])].filter(Boolean))].filter(EH_CODIGO);
        const H = health[pc.id] || {};
        const testOn = testando === pc.id;
        const icone = m => testOn ? "⏳" : ({ ok: "✅", fail: "❌", retry: "⏳" })[H[m]?.status] || "";
        return (
          <div className="ai-card" key={pc.id}>
            <div className="ai-head">
              <label className="ai-enable">
                <input type="checkbox" checked={c.enabled !== false} onChange={() => toggle(pc.id)} />
                <span className="ai-avatar">{iniciais(pc.label)}</span>
                <span className="ai-name">{pc.label}</span>
              </label>
              <span className={"pill " + (pc.tier === "free" ? "free" : "paid")}>{pc.tier === "free" ? "grátis" : "paga"}</span>
              {salva && <span className="pill on">chave ✓</span>}
            </div>
            <div className="ai-row">
              <input className="text" type="password" placeholder={`chave ${pc.label}`} value={drafts[pc.secretKey] ?? secrets[pc.secretKey] ?? ""} onChange={e => setDrafts(d => ({ ...d, [pc.secretKey]: e.target.value }))} />
              <button className="btn sm" onClick={() => salvarChave(pc)}>Salvar</button>
            </div>
            {pc.keyUrl && <a className="getkey" href={pc.keyUrl} target="_blank" rel="noreferrer">Obter chave <IconExternal /></a>}
            <div className="ai-row">
              <select className="text" value={c.model || pc.defaultModel} onChange={e => setModel(pc.id, e.target.value)}>
                {opcoes.map(m => <option key={m} value={m} disabled={H[m]?.status === "fail"}>{icone(m) ? icone(m) + " " : ""}{m}</option>)}
              </select>
              <button className="btn sm ghost" onClick={() => testar(pc)} disabled={!salva || testOn} title="Testar os modelos">{testOn ? "…" : "Testar"}</button>
              <button className="btn sm ghost" onClick={() => buscar(pc)} disabled={buscando === pc.id} title="Buscar modelos disponíveis">{buscando === pc.id ? "…" : "Buscar"}</button>
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
const IconArrowUp = () => <svg viewBox="0 0 24 24" width="17" height="17" {...S} strokeWidth="2.2"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>;
const IconChevronDown = () => <svg viewBox="0 0 24 24" width="12" height="12" {...S} strokeWidth="2.2"><path d="m6 9 6 6 6-6" /></svg>;
const IconChevronLeft = () => <svg viewBox="0 0 24 24" width="15" height="15" {...S} strokeWidth="2.2"><path d="m15 18-6-6 6-6" /></svg>;
const IconMenu = () => <svg viewBox="0 0 24 24" width="16" height="16" {...S} strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
const IconPlus = () => <svg viewBox="0 0 24 24" width="14" height="14" {...S} strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>;
const Gh = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/></svg>;
const Sb = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M13 2 4 13.5c-.4.5 0 1.3.7 1.3H12v7l9-11.5c.4-.5 0-1.3-.7-1.3H13V2z"/></svg>;
const Vc = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3 22 20H2L12 3z"/></svg>;
