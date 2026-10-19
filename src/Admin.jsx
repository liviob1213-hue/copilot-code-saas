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
  const [plano, setPlano] = useState("anual");
  const [meses, setMeses] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState("");

  const eu = dadosDoUsuario(sessao);

  async function enviar(ev) {
    ev.preventDefault();
    const limpo = email.trim();
    if (!limpo.includes("@")) { setErro("Digite um e-mail válido."); return; }

    setErro(""); setRecado(""); setOcupado(true);
    try {
      // O token prova quem esta pedindo. Sem ele o servidor recusa.
      const sb = clienteContas();
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre de novo.");

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

      setRecado(corpo.recado || "Pronto.");
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
            onChange={e => { setEmail(e.target.value); setErro(""); setRecado(""); }}
          />

          <label htmlFor="adm-plano" style={{ marginTop: 14 }}>Plano</label>
          <select id="adm-plano" className="text" value={plano}
            onChange={e => setPlano(e.target.value)}>
            <option value="anual">Anual (completo)</option>
            <option value="mensal">Mensal</option>
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
