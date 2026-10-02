import React, { useEffect, useRef, useState } from "react";
import * as store from "./core/storage.js";
import { PROVIDER_CATALOG } from "./core/config.js";
import { criarProjeto, editarProjeto, reconectarSupabase, criarTabelas, configurarChaveMapa, desfazerUltimo, BLINDAR_PROMPT } from "./core/runtime.js";
import { listModels } from "./core/providers.js";
import * as history from "./core/history.js";
import { startGithubLoginWeb, startSupabaseLoginWeb, githubConfigurado, supabaseConfigurado } from "./core/oauth-web.js";
import * as github from "./core/github.js";
import * as vercel from "./core/vercel.js";
import * as sbmgmt from "./core/supabase-mgmt.js";

export default function App({ oauthResult, oauthError }) {
  const [view, setView] = useState("home");        // home | workspace
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [kind, setKind] = useState("app");
  const [providerId, setProviderId] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sideOpen, setSideOpen] = useState(true);
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
  const [attached, setAttached] = useState([]);   // imagens anexadas (data URLs)
  const [toast, setToast] = useState(null);
  const sessionRef = useRef(null);
  const msgRef = useRef(null);
  async function loadModelsCache() { setModelsCache((await store.get("modelsCache")) || {}); }

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

  function pushMsg(role, text) { setMessages(m => [...m, { role, text }]); }
  function startRun() { setStatusText("Preparando…"); setMessages(m => [...m, { role: "run", steps: [], done: false }]); }
  function addStep(text) {
    setMessages(m => {
      const c = [...m];
      for (let i = c.length - 1; i >= 0; i--) { if (c[i].role === "run" && !c[i].done) { c[i] = { ...c[i], steps: [...c[i].steps, text] }; break; } }
      return c;
    });
  }
  function endRun() { setMessages(m => m.map(x => (x.role === "run" && !x.done) ? { ...x, done: true } : x)); }

  function onEvent(ev) {
    const t = eventoTexto(ev);
    if (t) { setStatusText(t); addStep(t); }
  }

  async function run(userText, { hardening = false, images = [] } = {}) {
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

      setView("workspace"); setBusy(true);
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
      setView("workspace"); setBusy(true);
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

    setView("workspace");
    setBusy(true);
    pushMsg("user", hardening ? "🛡️ Blindar o projeto" : userText);
    startRun();
    if (!sessionRef.current) sessionRef.current = await history.createSession({ title: userText.slice(0, 48), kind });
    await history.appendMessage(sessionRef.current, { role: "user", text: hardening ? "Blindar o projeto" : userText });
    try {
      const r = repo
        ? await editarProjeto({ repo, userMessage: userText, providerId, sessionId: sessionRef.current, embedImages: images }, onEvent)
        : await criarProjeto({ userMessage: userText, kind, providerId, sessionId: sessionRef.current, embedImages: images }, onEvent);
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
  function handleBlindar() { if (!repo) return showToast("Crie ou abra um projeto antes de blindar.", true); run(BLINDAR_PROMPT, { hardening: true }); }
  async function desfazer() {
    if (!repo || busy) return showToast(repo ? "Aguarde terminar." : "Nenhum projeto aberto.", true);
    setView("workspace"); setBusy(true);
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
    setView("workspace"); setBusy(true); startRun();
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
      kind={kind} setKind={setKind} onSend={handleSend} onBlindar={handleBlindar}
      providerId={providerId} activeModel={activeModel} onPickModel={pickModel} modelsCache={modelsCache}
      attached={attached} onAddFiles={addFiles} onRemoveAttach={(i) => setAttached(a => a.filter((_, x) => x !== i))}
      projects={vercelProjects} onLoadProjects={loadVercelProjects} onOpenProject={openProject} onNew={novoProjeto}
      onPlusConexoes={() => { setKeysOpen(false); setConnOpen(true); }} onPlusChaves={() => { setKeysOpen(true); setConnOpen(true); }}
    />
  );

  return (
    <div className="app">
      {sideOpen && <Sidebar
        conn={conn} projects={vercelProjects}
        onNew={novoProjeto}
        onProjetos={() => { loadVercelProjects(); setProjOpen(true); }}
        onConversas={() => { refreshHistory(); setHistOpen(true); }}
        onConexoes={() => { setKeysOpen(false); setConnOpen(true); }}
        onOpenProject={openProject}
        onCollapse={() => setSideOpen(false)}
      />}

      <div className="content">
        {!sideOpen && <button className="side-reopen" onClick={() => setSideOpen(true)} title="Mostrar menu">☰</button>}
        {view === "home" ? (
          <div className="home">
            <h1>O que você quer criar?</h1>
            {composer}
            <p className="home-hint">A IA gera o código, publica no seu GitHub e coloca no ar na Vercel. Comece pelos modelos grátis.</p>
          </div>
        ) : (
          <div className="workspace">
            <div className="chat-col">
              <div className="chat-messages" ref={msgRef}>
                {messages.map((m, i) => m.role === "run"
                  ? <RunCard key={i} steps={m.steps} done={m.done} />
                  : <Bubble key={i} role={m.role} text={m.text} />)}
              </div>
              {busy && (
                <div className="working-bar">
                  <span className="spin" />
                  <span className="working-text">{statusText || "Trabalhando…"}</span>
                </div>
              )}
              {composer}
            </div>
            <div className="preview-col">
              <div className="preview-bar">
                <div className="vp-toggle">
                  <button className={"vp" + (viewport === "desktop" ? " on" : "")} onClick={() => setViewport("desktop")} title="Desktop"><IconDesktop /></button>
                  <button className={"vp" + (viewport === "mobile" ? " on" : "")} onClick={() => setViewport("mobile")} title="Mobile"><IconMobile /></button>
                </div>
                <span className="url">{previewUrl || "sem preview ainda"}</span>
                {repo && <button className="btn sm ghost" onClick={desfazer} disabled={busy} title="Desfazer a última alteração">↩ Desfazer</button>}
                {previewUrl && <button className="btn sm ghost" onClick={() => setPreviewUrl(previewUrl + (previewUrl.includes("?") ? "&" : "?") + "r=" + Date.now())} title="Recarregar">↻</button>}
                {previewUrl && <button className="btn sm" onClick={() => window.open(previewUrl, "_blank")}>Abrir</button>}
              </div>
              <div className={"preview-stage" + (viewport === "mobile" ? " mobile" : "")}>
                {previewUrl ? <iframe className="preview-frame" src={previewUrl} title="preview" />
                  : <div className="preview-empty">O preview aparece aqui depois que a Vercel publicar.</div>}
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

/* ---------------- Sidebar ---------------- */
function Sidebar({ conn, projects, onNew, onProjetos, onConversas, onConexoes, onOpenProject, onCollapse }) {
  return (
    <aside className="sidebar">
      <div className="side-brand"><span className="dot" /> Copilot Code
        <button className="side-collapse" onClick={onCollapse} title="Minimizar menu">«</button>
      </div>
      <button className="side-new" onClick={onNew}>+ Nova conversa</button>
      <nav className="side-nav">
        <button onClick={onNew}><IconHome /> Início</button>
        <button onClick={onProjetos}><IconGrid /> Projetos</button>
        <button onClick={onConversas}><IconChat /> Conversas</button>
      </nav>
      <div className="side-section">Projetos recentes</div>
      <div className="side-projects">
        {projects === null ? <span className="side-empty">—</span>
          : projects.length === 0 ? <span className="side-empty">nenhum ainda</span>
          : projects.slice(0, 8).map((p, i) => (
            <button key={i} className="side-proj" onClick={() => onOpenProject(p)} title={p.url || `${p.owner}/${p.name}`}>
              <span className="side-proj-dot" /> {p.vercelName || p.name}
            </button>
          ))}
      </div>
      <div className="side-foot">
        <button className="side-conn" onClick={onConexoes}><IconPlug /> Conexões</button>
        <div className="side-status">
          <span className={conn.github ? "on" : ""} title="GitHub">GH</span>
          <span className={conn.supabase ? "on" : ""} title="Supabase">SB</span>
          <span className={conn.vercel ? "on" : ""} title="Vercel">VC</span>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- Composer (v0-style) ---------------- */
function Composer({ big, repo, busy, input, setInput, kind, setKind, onSend, onBlindar, providerId, activeModel, onPickModel, modelsCache, attached = [], onAddFiles, onRemoveAttach, projects, onLoadProjects, onOpenProject, onNew, onPlusConexoes, onPlusChaves }) {
  const [plus, setPlus] = useState(false);
  const fileRef = useRef(null);
  return (
    <div className={"composer" + (big ? " big" : "")}>
      {repo && <div className="composer-ctx">Editando <b>{repo.owner}/{repo.name}</b> · <button className="linklike" onClick={onNew}>novo</button></div>}
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
      <textarea className="composer-input" rows={big ? 2 : 3}
        placeholder={repo ? "Peça uma alteração… (ou anexe uma imagem pra trocar/usar)" : "Peça ao Copilot para construir…"}
        value={input} onChange={e => setInput(e.target.value)}
        onPaste={e => { const imgs = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean); if (imgs.length) { e.preventDefault(); onAddFiles(imgs); } }}
        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); } }} disabled={busy} />
      <div className="composer-row">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { onAddFiles([...e.target.files]); e.target.value = ""; }} />
        <button className="chip" onClick={() => fileRef.current?.click()} title="Anexar imagem" disabled={busy}><IconImage /></button>
        <div className="pop-anchor">
          <button className="chip icon" onClick={() => setPlus(v => !v)} title="Mais">+</button>
          {plus && (<>
            <div className="pop-back" onClick={() => setPlus(false)} />
            <div className="pop menu">
              <button onClick={() => { setPlus(false); onPlusConexoes(); }}><IconPlug /> Conexões</button>
              <button onClick={() => { setPlus(false); onPlusChaves(); }}><IconSpark /> Chaves de IA / modelos</button>
            </div>
          </>)}
        </div>
        <ModelPicker providerId={providerId} activeModel={activeModel} onPick={onPickModel} modelsCache={modelsCache} />
        {!repo && (
          <select className="chip" value={kind} onChange={e => setKind(e.target.value)} disabled={busy} title="Tipo">
            <option value="app">App</option>
            <option value="site">Site</option>
          </select>
        )}
        <button className="chip" onClick={onBlindar} disabled={busy || !repo} title="Blindar contra vazamento de dados">🛡️</button>
        <div className="spacer" />
        <ProjectPicker projects={projects} onLoad={onLoadProjects} onOpen={onOpenProject} onNew={onNew} />
        <button className="send" onClick={onSend} disabled={busy} title="Enviar">{busy ? "…" : "↑"}</button>
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
function detectarSegredo(texto) {
  const gm = String(texto).match(/\bAIza[0-9A-Za-z_\-]{20,}\b/);
  if (gm) return { name: "GOOGLE_MAPS_API_KEY", value: gm[0], label: "Google Maps", envFront: "VITE_GOOGLE_MAPS_API_KEY", kind: "gmaps" };
  const mb = String(texto).match(/\bpk\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/);
  if (mb) return { name: "MAPBOX_TOKEN", value: mb[0], label: "Mapbox", envFront: "VITE_MAPBOX_TOKEN", kind: "mapbox" };
  return null;
}

function ModelPicker({ providerId, activeModel, onPick, modelsCache = {} }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const label = providerId ? (activeModel || "modelo") : "Automático";
  return (
    <div className="pop-anchor">
      <button className="chip" onClick={() => setOpen(v => !v)} title="Escolher IA/modelo"><IconSpark /> {label} ▾</button>
      {open && (<>
        <div className="pop-back" onClick={() => setOpen(false)} />
        <div className="pop models">
          <input className="pop-search" placeholder="Buscar modelos" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="pop-scroll">
            <button className={"pop-item" + (!providerId ? " sel" : "")} onClick={() => { onPick("", ""); setOpen(false); }}>
              <span>Automático (revezamento)</span>{!providerId && <IconCheck />}
            </button>
            {PROVIDER_CATALOG.map(pc => {
              const todos = [...new Set([...(pc.models || []), ...(modelsCache[pc.id] || [])])].filter(EH_CODIGO);
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
      <button className="chip" onClick={toggle} title="Projetos"><IconGrid /> Projetos ▾</button>
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

function Bubble({ role, text }) {
  if (role === "system" || role === "error") return <div className={"note " + role}>{text}</div>;
  return (<div className={"bubble " + role}><div className="bubble-head">{role === "user" ? "você" : "copilot"}</div><div className="bubble-body">{text}</div></div>);
}

function RunCard({ steps, done }) {
  const [open, setOpen] = useState(true);   // aberto enquanto trabalha (ensina), recolhe ao terminar
  useEffect(() => { if (done) setOpen(false); }, [done]);
  const last = steps[steps.length - 1] || "Começando…";
  return (
    <div className="run-card">
      <div className="run-head">
        {done ? <span className="run-ok">✓</span> : <span className="spin" />}
        <span className="run-title">{done ? "Concluído — veja o resumo abaixo" : last}</span>
        <button className="run-toggle" onClick={() => setOpen(o => !o)}>{open ? "Ocultar" : "Detalhes"}</button>
      </div>
      {open && (
        <div className="run-steps">
          {steps.length === 0 ? <div className="run-step">preparando…</div>
            : steps.map((s, i) => <div key={i} className="run-step"><span className="run-dot">•</span> {s}</div>)}
        </div>
      )}
    </div>
  );
}

/* ---------------- Drawers ---------------- */
function ProjectsDrawer({ projects, onReload, onOpen, onClose }) {
  useEffect(() => { onReload?.(); /* eslint-disable-next-line */ }, []);
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <header><h2>Projetos</h2><button className="btn sm ghost" onClick={onReload}>Atualizar</button><button className="btn sm ghost" onClick={onClose}>Fechar</button></header>
        <div className="body">
          <p className="hint" style={{ marginTop: 0 }}>Seus projetos na Vercel. Clicar abre o projeto (puxa o repositório do GitHub ligado) para editar.</p>
          {projects === null ? <p className="hint">carregando…</p>
            : projects.length === 0 ? <p className="hint">Nenhum projeto na Vercel (ou o Worker /proxy não está no ar).</p>
            : projects.map((p, i) => (
              <button key={i} className="proj-item" onClick={() => onOpen(p)}>
                <strong>{p.vercelName || p.name}</strong>
                <span>{p.url ? p.url.replace(/^https?:\/\//, "") : `${p.owner}/${p.name}`}</span>
              </button>
            ))}
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
        <header><h2>Conversas</h2>
          {sessions.length > 0 && <button className="btn sm ghost" onClick={() => { if (window.confirm("Apagar todo o histórico?")) onClear(); }}>Limpar</button>}
          <button className="btn sm ghost" onClick={onClose}>Fechar</button>
        </header>
        <div className="body">
          {sessions.length === 0 ? <p className="hint">Nada aqui ainda. Cada conversa fica salva no seu navegador.</p>
            : sessions.map(s => (
              <div key={s.id} className="hist-item">
                <div className="hist-main" onClick={() => onOpen(s.id)}>
                  <div className="hist-title">{s.title}</div>
                  <div className="hist-meta">{fmtData(s.updatedAt)}{s.repo ? ` · ${s.repo.owner}/${s.repo.name}` : ""}{s.count ? ` · ${s.count} msg` : ""}</div>
                </div>
                <button className="btn sm ghost" onClick={() => onDelete(s.id)}>✕</button>
              </div>
            ))}
        </div>
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
        <header><h2>Conexões</h2><button className="btn sm ghost" onClick={onClose}>Fechar</button></header>
        <div className="body">
          <div className="conn-card">
            <ConnRow icon={<Gh />} name="GitHub" sub={gh.login ? `@${gh.login}` : "desconectado"} subOff={!gh.login}>
              {gh.login ? <button className="btn sm ghost" onClick={ghLogout}>sair</button>
                : githubConfigurado() ? <button className="btn sm" onClick={startGithubLoginWeb}>Entrar</button>
                : <button className="btn sm" onClick={connectGithubToken}>Token</button>}
              {!gh.login && githubConfigurado() && <button className="btn sm ghost" onClick={connectGithubToken}>token</button>}
            </ConnRow>
            <ConnRow icon={<Sb />} name="Supabase" sub={sbConn ? (sb.projectName ? `projeto: ${sb.projectName}` : "escolha um projeto") : "desconectado"} subOff={!sbConn || !sb.projectName}>
              {sbConn
                ? <><button className="btn sm" onClick={loadSbProjects} disabled={sbLoading}>{sbLoading ? "…" : (sb.projectName ? "Trocar" : "Projeto")}</button><button className="btn sm ghost" onClick={sbLogout}>sair</button></>
                : supabaseConfigurado() ? <button className="btn sm" onClick={startSupabaseLoginWeb}>Conectar</button>
                : <span className="pill">config</span>}
            </ConnRow>
            <ConnRow icon={<Vc />} name="Vercel" sub={secrets.VERCEL_TOKEN ? "token salvo" : "sem token"} subOff={!secrets.VERCEL_TOKEN}>
              <input className="text mini" type="password" placeholder="token" defaultValue={secrets.VERCEL_TOKEN} onBlur={e => saveSecret("VERCEL_TOKEN", e.target.value.trim())} />
            </ConnRow>
            <ConnRow icon={<Repo />} name="Repositório" sub={repo ? `${repo.owner}/${repo.name}` : "nenhum"} subOff={!repo} />
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
          <button className="btn wide" onClick={() => setShowKeys(v => !v)}>{showKeys ? "Ocultar chaves de IA" : "Chaves de IA (BYOK)"}</button>
          {showKeys && <AiProviders showToast={showToast} />}
        </div>
      </div>
    </>
  );
}

function AiProviders({ showToast }) {
  const [secrets, setSecrets] = useState(null);
  const [provs, setProvs] = useState([]);
  const [fetched, setFetched] = useState({});
  const [drafts, setDrafts] = useState({});
  const [buscando, setBuscando] = useState("");
  useEffect(() => { (async () => { setSecrets(await store.get("secrets")); setProvs(await store.get("providers")); })(); }, []);
  const cfg = id => provs.find(p => p.id === id) || {};
  async function salvarChave(pc) {
    const v = (drafts[pc.secretKey] ?? secrets[pc.secretKey] ?? "").trim();
    await store.patch("secrets", { [pc.secretKey]: v }); setSecrets(s => ({ ...s, [pc.secretKey]: v }));
    showToast(v ? `Chave do ${pc.label} salva.` : `Chave do ${pc.label} removida.`);
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
      <p className="hint" style={{ marginTop: 0 }}>Preencha ao menos uma e clique <b>Salvar</b>. Comece pelas grátis: NVIDIA, Gemini, Groq.</p>
      {PROVIDER_CATALOG.map(pc => {
        const c = cfg(pc.id); const salva = Boolean((secrets[pc.secretKey] || "").trim());
        const opcoes = [...new Set([c.model, ...(pc.models || []), ...(fetched[pc.id] || [])].filter(Boolean))].filter(EH_CODIGO);
        return (
          <div className="ai-card" key={pc.id}>
            <div className="ai-head">
              <label className="ai-enable"><input type="checkbox" checked={c.enabled !== false} onChange={() => toggle(pc.id)} /><span className="ai-name">{pc.label}</span></label>
              {salva && <span className="pill on">chave ✓</span>}
            </div>
            <div className="ai-row">
              <input className="text" type="password" placeholder={`chave ${pc.label}`} value={drafts[pc.secretKey] ?? secrets[pc.secretKey] ?? ""} onChange={e => setDrafts(d => ({ ...d, [pc.secretKey]: e.target.value }))} />
              <button className="btn sm" onClick={() => salvarChave(pc)}>Salvar</button>
            </div>
            <div className="ai-row">
              <select className="text" value={c.model || pc.defaultModel} onChange={e => setModel(pc.id, e.target.value)}>{opcoes.map(m => <option key={m} value={m}>{m}</option>)}</select>
              <button className="btn sm ghost" onClick={() => buscar(pc)} disabled={buscando === pc.id}>{buscando === pc.id ? "…" : "Buscar"}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Ícones ---------------- */
const IconHome = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
const IconGrid = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
const IconChat = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IconPlug = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6"/></svg>;
const IconSpark = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>;
const IconImage = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>;
const IconCheck = () => <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>;
const IconDesktop = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
const IconMobile = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>;
const Gh = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/></svg>;
const Sb = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13 2 4 13.5c-.4.5 0 1.3.7 1.3H12v7l9-11.5c.4-.5 0-1.3-.7-1.3H13V2z"/></svg>;
const Vc = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 3 22 20H2L12 3z"/></svg>;
const Repo = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>;
