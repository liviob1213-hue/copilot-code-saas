// ============================================================================
// Admin.jsx — a pagina /acesso-anual
// ----------------------------------------------------------------------------
// Voce digita um e-mail e a pessoa ganha (ou perde) o acesso. Serve para
// liberar de cortesia, consertar um pagamento que a Kiwify nao avisou, ou
// tirar acesso de alguem.
//
// Quem manda e o servidor: esta tela so envia o pedido com o seu token. Quem
// confere se voce e administrador e /api/liberar, pela variavel ADMIN_EMAILS.
// Se alguem abrir esta pagina sem ser voce, a tela ate aparece — mas o
// servidor recusa, que e onde a seguranca tem que estar.
//
// ATENCAO: quem ja estava no banco antes de tudo isso ja foi colocado no plano
// anual pelo proprio supabase/contas.sql. Voce nao precisa liberar um por um.
// ============================================================================

import React, { useState } from "react";
import { clienteContas, dadosDoUsuario } from "./core/auth.js";

export default function Admin({ sessao }) {
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState("basico");
  const [meses, setMeses] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState("");
  // O que o banco sabe sobre o e-mail digitado (botao Conferir).
  const [ficha, setFicha] = useState(null);

  const eu = dadosDoUsuario(sessao);

  /** O token prova quem esta pedindo. Sem ele o servidor recusa. */
  async function meuToken() {
    const sb = clienteContas();
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
    return token;
  }

  /**
   * CONFERIR — antes de liberar na mao, veja o que esta gravado.
   *
   * Existe porque "o cliente pagou e o app pede assinatura" tem varias causas
   * diferentes (aviso da Kiwify que nao chegou, e-mail diferente do da compra,
   * plano vencido, pagamento guardado que nao foi aplicado) e todas aparecem
   * iguais na tela do cliente. Esta ficha diz QUAL delas e — e, se for
   * pagamento guardado, o servidor ja aplica na hora.
   */
  async function conferir() {
    const limpo = email.trim();
    if (!limpo.includes("@")) { setErro("Digite um e-mail válido."); return; }

    setErro(""); setRecado(""); setFicha(null); setOcupado(true);
    try {
      const token = await meuToken();
      const r = await fetch("/api/conta", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: limpo })
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo.erro || `Falhou (${r.status}).`);
      setFicha(corpo);
    } catch (e) {
      setErro(e.message || String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function enviar(ev) {
    ev.preventDefault();
    const limpo = email.trim();
    if (!limpo.includes("@")) { setErro("Digite um e-mail válido."); return; }

    setErro(""); setRecado(""); setFicha(null); setOcupado(true);
    try {
      const token = await meuToken();

      const r = await fetch("/api/liberar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: limpo, plano, meses: Number(meses) || 0 })
      });

      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo.erro || `Falhou (${r.status}).`);

      setRecado((corpo.recado || "Pronto.")
        + " Peça para a pessoa recarregar a página (F5) para o plano novo aparecer.");
      setEmail("");
    } catch (e) {
      setErro(e.message || String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="login-tela">
      <div className="login-caixa" style={{ maxWidth: 520 }}>
        <div className="login-marca">
          <h1>Liberar acesso</h1>
          <p>Dê ou tire o acesso de alguém pelo e-mail.</p>
        </div>

        <form onSubmit={enviar} className="login-form" noValidate>
          <label htmlFor="adm-email">E-mail da pessoa</label>
          <input
            id="adm-email" className="text" type="email" autoComplete="off"
            placeholder="pessoa@exemplo.com" value={email} autoFocus
            onChange={e => { setEmail(e.target.value); setErro(""); setRecado(""); setFicha(null); }}
          />

          {/* CONFERIR vem ANTES de liberar, de proposito: na maioria dos casos
              o plano certo ja esta pago e o problema e outro. Liberar na mao sem
              olhar esconde o defeito e ele volta no proximo cliente. */}
          <button className="btn wide" type="button" disabled={ocupado}
            onClick={conferir} style={{ marginTop: 12 }}>
            {ocupado ? "Conferindo…" : "Conferir o que está gravado"}
          </button>

          {/* Os tres niveis de hoje. Faltavam aqui: sem a opcao "Básico" nao
              dava pra consertar na mao um cliente do plano de R$ 24,97 — a
              unica saida era dar Premium, de graca. */}
          <label htmlFor="adm-plano" style={{ marginTop: 14 }}>Plano</label>
          <select id="adm-plano" className="text" value={plano}
            onChange={e => setPlano(e.target.value)}>
            <option value="basico">Básico — R$ 24,97 (libera a DeepSeek)</option>
            <option value="pro">Pro — R$ 34,97 (Claude e xAI Grok)</option>
            <option value="premium">Premium — R$ 47 (todas as IAs pagas)</option>
            <option value="anual">Premium anual — R$ 297</option>
            <option value="mensal">Mensal (nome antigo do Premium)</option>
            <option value="free">Grátis — tirar o acesso pago</option>
          </select>

          <label htmlFor="adm-meses" style={{ marginTop: 14 }}>Vence em</label>
          <select id="adm-meses" className="text" value={meses}
            onChange={e => setMeses(e.target.value)}>
            <option value={0}>Nunca (acesso vitalício)</option>
            <option value={1}>1 mês</option>
            <option value={12}>12 meses</option>
          </select>

          <button className="btn primary wide" type="submit" disabled={ocupado} style={{ marginTop: 18 }}>
            {ocupado ? "Gravando…" : "Liberar acesso"}
          </button>
        </form>

        {recado && <div className="login-erro" style={{
          background: "rgba(52,211,153,.1)",
          borderColor: "rgba(52,211,153,.3)",
          color: "#86efac"
        }}>{recado}</div>}
        {erro && <div className="login-erro">{erro}</div>}

        {ficha && <Ficha dados={ficha} />}

        <p className="login-dica" style={{ marginTop: 20 }}>
          Se a pessoa ainda não tiver conta, o acesso fica guardado e entra
          sozinho no dia em que ela se cadastrar com esse e-mail.
        </p>

        {eu && (
          <p className="login-dica" style={{ marginTop: 10, opacity: .7 }}>
            Você está como <b>{eu.email}</b>. Esse e-mail precisa estar na
            variável <code>ADMIN_EMAILS</code> da Vercel, senão o servidor recusa.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A ficha do cliente, em portugues. O campo que importa de verdade e o
 * "recado": ele JA diz o que fazer. O resto esta ali pra conferencia.
 */
function Ficha({ dados }) {
  const linhas = dados.tem_conta
    ? [
      ["Conta no app", "existe"],
      ["Plano gravado", `${dados.plano_nome} (${dados.plano})`],
      ["O plano vale agora?", dados.pago ? "SIM" : "NÃO"],
      ["Vence em", String(dados.vence_em)],
      ["Veio de", String(dados.origem)],
      ["IAs pagas liberadas", (dados.ias_pagas_liberadas || []).join(", ") || "nenhuma"],
      ["Pagamento guardado", dados.pagamento_guardado
        ? `plano ${dados.pagamento_guardado.plano}, desde ${dados.pagamento_guardado.desde}`
        : "nenhum"],
      ["Consertado agora", dados.consertado_agora ? `sim → ${dados.consertado_agora}` : "não precisou"]
    ]
    : [
      ["Conta no app", "NÃO existe com esse e-mail"],
      ["Pagamento guardado", dados.pagamento_guardado
        ? `plano ${dados.pagamento_guardado.plano}, desde ${dados.pagamento_guardado.desde}`
        : "nenhum"]
    ];

  return (
    <div className="login-erro" style={{
      background: "rgba(148,163,184,.08)",
      borderColor: "rgba(148,163,184,.25)",
      color: "#cbd5e1",
      textAlign: "left"
    }}>
      <p style={{ margin: "0 0 10px", lineHeight: 1.5 }}><b>{dados.recado}</b></p>
      <div style={{ fontSize: 12, opacity: .85, lineHeight: 1.7 }}>
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>{rotulo}: <b>{valor}</b></div>
        ))}
        <div style={{ marginTop: 8, opacity: .7 }}>
          E-mail conferido: {dados.email_normalizado}
        </div>
      </div>
    </div>
  );
}
