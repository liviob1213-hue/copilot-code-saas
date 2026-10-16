// Testa o verificador. O que mais importa aqui NAO e achar o erro — e nao
// inventar erro nenhum em codigo bom: um alarme falso faria a IA "consertar"
// o que estava certo.
import { nomesIndefinidos, conferirProjeto, pedidoDeConserto } from "../src/core/verificador.js";

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "PASSOU" : "FALHOU"}  ${m}`); if (!c) falhas++; };
const nomes = (src) => nomesIndefinidos(src).map(x => x.nome).sort();

// ---- 1) O CASO REAL: /agendar morreu com "horarios is not defined" ----------
const agendar = `
import { useState } from "react";
export default function Agendar() {
  const [data, setData] = useState("");
  return (
    <div>
      {horarios.map(h => <button key={h} onClick={() => setData(h)}>{h}</button>)}
    </div>
  );
}`;
ok(nomes(agendar).includes("horarios"), "pega o 'horarios' que derrubou a pagina de agendamento");

// ---- 2) Codigo BOM nao pode acusar nada -------------------------------------
const bom = `
import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import Card from "../components/Card.jsx";

const PRECOS = { corte: 45, barba: 35 };

export default function Servicos({ titulo, onEscolher = () => {} }) {
  const [sel, setSel] = useState(null);
  const { corte, barba } = PRECOS;
  const lista = Object.entries(PRECOS).map(([nome, valor]) => ({ nome, valor }));
  useEffect(() => { document.title = titulo; }, [titulo]);
  function formatar(v) { return "R$ " + v.toFixed(2); }
  const [a, [b, c]] = [1, [2, 3]];
  try { JSON.parse("{}"); } catch (erro) { console.warn(erro); }
  return (
    <Card>
      <Calendar />
      <h2 className="titulo">{titulo} {formatar(corte)} {formatar(barba)} {a}{b}{c}</h2>
      {lista.map(s => <button key={s.nome} onClick={() => { setSel(s); onEscolher(s); }}>{s.nome} {sel ? "ok" : ""}</button>)}
    </Card>
  );
}`;
ok(nomes(bom).length === 0, "nao acusa nada em codigo bom (deu: " + JSON.stringify(nomes(bom)) + ")");

// ---- 3) Armadilhas classicas de busca por texto ------------------------------
const armadilhas = `
import React from "react";
export default function T({ dados }) {
  const obj = { horarios: [1, 2], total: 3 };
  const { horarios } = obj;
  const copia = obj.horarios;
  const chave = "horarios";
  return <div data-x={obj[chave]}>{horarios.length}{copia.length}{dados.horarios}</div>;
}`;
ok(nomes(armadilhas).length === 0, "entende propriedade, chave de objeto e desestruturacao (deu: " + JSON.stringify(nomes(armadilhas)) + ")");

// ---- 4) Componente usado sem import (a outra causa de tela preta) ------------
const semImport = `
export default function P() { return <div><Header /><p>oi</p></div>; }`;
ok(nomes(semImport).includes("Header"), "pega <Componente/> usado sem import");
ok(!nomes(semImport).includes("div") && !nomes(semImport).includes("p"), "nao confunde tag html com componente");

// ---- 5) Nao atrapalha quando o arquivo nem compila ---------------------------
ok(nomesIndefinidos("export default function ( {{{ ").length === 0, "arquivo que nao compila fica para o build acusar");

// ---- 6) Varredura do projeto e pedido para a IA ------------------------------
const projeto = {
  "src/pages/Agendar.jsx": agendar,
  "src/pages/Servicos.jsx": bom,
  "src/components/ui/button.jsx": "export function Button(){ return <button/>; }",
  "package.json": "{}"
};
const achados = conferirProjeto(projeto, new Set(["src/components/ui/button.jsx"]));
ok(achados.length === 1 && achados[0].arquivo === "src/pages/Agendar.jsx", "varre o projeto e aponta so o arquivo certo");
ok(achados[0].linha > 0, "informa a linha (" + achados[0].linha + ")");
const pedido = pedidoDeConserto(achados);
ok(/src\/pages\/Agendar\.jsx: horarios/.test(pedido) && /===FILE:/.test(pedido), "monta o pedido de conserto para a IA");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
