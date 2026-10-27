// Core do SaaS (standalone). Este arquivo E a fonte da verdade: edite aqui.
// Nao rode `npm run sync-core` sem revisar — ele sobrescreve com a versao da extensao.
import { completeComEspera, normalizeConversation } from "./providers.js";
import { TOOL_SCHEMAS, runTool, stagedSummary } from "./tools.js";
import { AGENT_LIMITS } from "./config.js";
import * as gh from "./github.js";

/**
 * Rede de seguranca do SQL do Lovable Cloud: modelos fracos (ex.: DeepSeek) as
 * vezes mandam so um "alter table X add column" — que FALHA se a tabela ainda
 * nao existe. Aqui, para CADA tabela que recebe "add column" mas nao tem um
 * "create table", injetamos um "create table if not exists" minimo + RLS/policy
 * ANTES dos alters. E puramente aditivo: se a tabela ja existe, o create vira
 * no-op; nunca remove nem altera o que a IA escreveu.
 */
export function reforcarSqlLovable(text) {
  if (!text || !/alter\s+table\s+[a-z0-9_]+\s+add\s+column/i.test(text)) return text;
  const tabelas = [];
  const reAlter = /alter\s+table\s+([a-z0-9_]+)\s+add\s+column/gi;
  let m;
  while ((m = reAlter.exec(text))) {
    const t = m[1].toLowerCase();
    if (!tabelas.includes(t)) tabelas.push(t);
  }
  const faltando = tabelas.filter(t =>
    !new RegExp("create\\s+table\\s+(if\\s+not\\s+exists\\s+)?" + t + "\\b", "i").test(text)
  );
  if (!faltando.length) return text;
  const blocos = faltando.map(t =>
    `create table if not exists ${t} (\n  id uuid primary key default gen_random_uuid(),\n  created_at timestamptz not null default now()\n);\nalter table ${t} enable row level security;\ndrop policy if exists "acesso" on ${t};\ncreate policy "acesso" on ${t} for all to anon using (true) with check (true);\n`
  ).join("");
  // Insere os creates logo antes do primeiro "alter table X add column".
  return text.replace(/(alter\s+table\s+[a-z0-9_]+\s+add\s+column)/i, blocos + "$1");
}

/**
 * Normaliza o historico para um formato que todo provedor aceita: chamadas e
 * respostas de ferramenta sempre casadas e na ordem certa. Corrige os 400 de
 * "role 'tool' sem 'tool_calls'" (DeepSeek/OpenAI) e "tool_result sem tool_use"
 * (Anthropic), que apareciam quando o historico era cortado no meio de uma
 * sequencia. A logica de verdade fica em providers.js e e reusada aqui.
 */
export function sanitizeHistory(history) {
  return normalizeConversation(history);
}

export function systemPrompt(ctx) {
  const cabecalho = ctx.saas
    ? `Voce e um engenheiro de software senior (nivel Lovable/v0/Bolt) editando um projeto web real no GitHub. Cada commit vira deploy automatico na Vercel e a pessoa ve o resultado no preview.

Repositorio: ${ctx.repo.owner}/${ctx.repo.name}
Branch: ${ctx.repo.branch}
${ctx.brief ? `Tema/negocio do projeto (pedido original — NUNCA troque por outro): ${String(ctx.brief).slice(0, 400)}\n` : ""}
Como este projeto funciona:
- Stack: Vite + React (JSX) + Tailwind, por cima de um kit pronto: src/components/ui/ (Button, Card, Input, Textarea, Label, Badge — exportados NOMEADOS: import { Button } from ".../ui/button"), src/components/fx/ (efeitos visuais, export default), src/lib/utils.js (cn) e src/lib/useStore.js (dados persistentes: const [itens, setItens] = useStore("chave", [])). Pode haver TypeScript se o projeto veio de fora — siga o que encontrar.
- Pacotes disponiveis: react, react-router-dom, lucide-react, framer-motion, date-fns, react-day-picker, @supabase/supabase-js + o que estiver no package.json. NAO importe outros.
- Codigo quebrado derruba o deploy. Escreva com cuidado.`
    : `Voce e um engenheiro de software trabalhando no repositorio GitHub de um projeto Lovable.

Repositorio: ${ctx.repo.owner}/${ctx.repo.name}
Branch: ${ctx.repo.branch}
Projeto Lovable: ${ctx.lovable?.projectId || "nao identificado"}${ctx.lovable?.title ? ` (${ctx.lovable.title})` : ""}

Como este projeto funciona:
- O Lovable e o GitHub tem sincronia nos dois sentidos na branch ${ctx.repo.branch}. O que voce commitar aparece no Lovable em segundos.
- A stack tipica e Vite + React + TypeScript + Tailwind + shadcn/ui. As paginas ficam em src/pages, os componentes em src/components, as rotas em src/App.tsx.
- Nao existe passo de build aqui. Codigo quebrado vai quebrar a visualizacao da pessoa. Escreva com cuidado.`;
  return `${cabecalho}

EDICAO NIVEL PROFISSIONAL (como um cirurgiao, nao um pintor que refaz o quadro):
- ACHE O ALVO PRIMEIRO: se a pessoa cita um texto que aparece na tela ("o botao Agendar", "o titulo Bem-vindo"), use search_code com esse texto para achar o arquivo exato antes de abrir outros.
- Mude so o necessario. Nao redesenhe nem renomeie o que nao foi pedido. Mantenha cores, fontes e o estilo ja existentes.
- "Remova/tire X" = apague X (e imports que ficarem sem uso). Nunca crie arquivo novo para remover algo.
- "Adicione uma pagina/secao" = crie o componente seguindo o padrao dos arquivos vizinhos, ligue a ROTA no App e um link no menu.
- "Melhore o visual/deixe profissional" = pode refazer o LAYOUT daquela parte, preservando textos e funcionalidade, com hierarquia tipografica, espacamento generoso, cards com sombra suave, estados de hover e responsivo mobile-first.
- "Coloque imagens/fotos" = ATENCAO: nenhum servico gratuito entrega foto DO assunto pedido. O picsum.photos devolve foto ALEATORIA (a palavra na URL e so um identificador, nao uma busca), e o image.pollinations.ai hoje recusa a maioria dos pedidos. Entao: use no maximo 1-2 fotos, como textura sob um overlay da cor da marca, e resolva o resto com gradiente, CSS e SVG. URL https://picsum.photos/seed/PALAVRA/1200/800 com onError trocando para https://picsum.photos/1200/800?grayscale, e sempre data-foto-troca="o que deveria estar aqui" na <img>, que e como a pessoa troca pela foto dela depois.
- Cadastros/edicoes em sistemas abrem em MODAL; listas tem estados de vazio/carregando; acoes dao feedback (toast simples feito com useState).
- Aspas retas sempre (nunca aspas curvas); todo icone lucide usado no JSX precisa estar no import do topo do arquivo.` + _regrasTrabalho(ctx) + (ctx.idiomaIA || "");
}

// Regras de trabalho, rotas/auth, diagnostico de erros, imagens e Supabase
// (o bloco original do prompt do agente).
function _regrasTrabalho(ctx) {
  return `

Regras de trabalho:
1. Comece explorando. Use list_files e read_file antes de qualquer edicao. Nunca suponha o que existe em um arquivo.
2. write_file substitui o arquivo inteiro. Envie sempre o conteudo final completo, com todos os imports. Nunca envie trechos, reticencias ou marcadores de diff. SINTAXE VALIDA SEMPRE: em JSX/TSX, balanceie ( ), { } e [ ] e feche todas as tags — um simbolo a mais ou a menos (ex.: um ")" ou "}" sobrando) quebra o build inteiro na Vercel. Releia e confira o balanceamento antes de commitar.
3. Preserve o que ja funciona. Se o pedido e sobre um botao, mude o botao e mantenha o resto do arquivo intacto.
4. Respeite os padroes que voce encontrar no codigo: mesmas bibliotecas, mesmo estilo de import, mesmos componentes de UI ja usados. Nao introduza dependencia nova sem necessidade real, porque nada instala pacotes aqui.
5. Se precisar de uma dependencia nova, avise a pessoa em vez de importar algo que nao esta no package.json.
6. Termine chamando commit_changes uma unica vez, com uma mensagem curta no imperativo descrevendo a mudanca. ANTES de enviar, o commit_changes CONFERE o projeto (procura nomes que nao existem e abre as telas de verdade num navegador). Se a resposta dele comecar com "AINDA NAO COMMITEI", nada foi enviado: conserte exatamente o que ele apontou com write_file e chame commit_changes de novo. Se comecar com "COMMIT CANCELADO", a sua alteracao apagaria uma tela do site — releia o arquivo com read_file e refaca preservando o conteudo que ja existia.
7. Leia o pedido da pessoa em portugues do Brasil com atencao e faca EXATAMENTE o que foi pedido — nem mais, nem menos. Ao terminar, diga em frases simples e em portugues o que voce fez e em quais arquivos. Texto puro: SEM asteriscos, sem "**", sem markdown, sem cercas de codigo.
8. Economize contexto: use list_files com filtro (ex: "src/components") em vez de listar tudo, e leia apenas os arquivos que voce realmente vai alterar. Varios servicos aqui tem limite apertado de tokens por minuto, e um pedido inchado e recusado antes de chegar ao modelo.

ROTAS E AUTENTICACAO (siga a risca sempre que o pedido envolver login, acesso, papeis, permissoes ou paginas protegidas — e o que mais quebra quando feito errado):
1. EXPLORE PRIMEIRO. Antes de escrever, leia como o projeto JA faz rotas e login: procure App.tsx/App.jsx e o main, e por AuthProvider/AuthContext, ProtectedRoute, useAuth, hooks de sessao e o cliente supabase (src/lib, src/integrations, src/hooks). REAPROVEITE o que existir. NUNCA crie um segundo sistema de login, um segundo cliente supabase ou um segundo Router — dois sistemas em paralelo e a causa numero 1 do app bugar.
2. UM unico provedor de auth. Toda a sessao passa por UM AuthProvider (Context) que expoe pelo menos { user, session, role, loading, signIn, signOut }. Todas as telas de login usam esse mesmo provider e o mesmo cliente supabase.
3. MULTIPLOS ACESSOS = MESMO login com PAPEL (role) diferente, jamais sistemas separados. Ex.: admin e colaborador entram pelo MESMO login; o que muda e o role. Guarde o papel numa tabela profiles (id uuid references auth.users, role text) ou no user_metadata, e decida telas, menus e dados pelo role — nao por um segundo login isolado.
4. ROTAS PROTEGIDAS com UM wrapper reutilizavel (ProtectedRoute): enquanto loading, mostre carregando (nunca pisque o conteudo protegido); sem user, redirecione com <Navigate to="/login" replace />; com um requiredRole que nao bate com o role do usuario, mande para a home do papel dele ou uma pagina "sem permissao".
5. UM unico Router: um <BrowserRouter> so (no main) e um <Routes> so (no App), com as rotas publicas (/login) e as protegidas juntas. Nunca aninhe dois BrowserRouter nem duplique <Routes>. Toda nova rota entra nesse <Routes> existente.
6. SUPABASE AUTH por email: cadastro supabase.auth.signUp({ email, password }); login supabase.auth.signInWithPassword({ email, password }); liberacao por link no email supabase.auth.signInWithOtp({ email }); sessao no provider com supabase.auth.getSession() + supabase.auth.onAuthStateChange(); sair com supabase.auth.signOut().
7. PAPEL NO BANCO + RLS: quando houver papeis, crie/ajuste a tabela profiles e as policies para checarem o papel (ex.: admin ve tudo, colaborador ve so o dele). Garanta que o profile do usuario seja criado no cadastro (trigger no signup ou insert no primeiro acesso).
8. ADICIONAR um segundo acesso/rota a um app que JA tem login: some a rota ao <Routes> existente e proteja com <ProtectedRoute requiredRole="..."> reaproveitando o AuthProvider atual. Se ainda nao houver AuthProvider, crie UM so e migre as telas para ele — nunca dois.
9. Respeite a stack do projeto: se for TypeScript, shadcn/ui e Tailwind, siga esse padrao (tipos, componentes de ui ja existentes, mesmo estilo de import). Cada import deve apontar para um arquivo que existe de verdade.
10. EDITAR a area de UM papel/acesso especifico (ex.: "muda X no acesso do ALUNO", "no painel do professor", "so no perfil cliente", "no acesso do COLABORADOR"): o nome do papel e a PISTA de onde mexer — nao ignore. Passos: (a) DESCUBRA como esse papel se chama NO CODIGO: use search_code pelo nome em portugues ("aluno", "professor", "cliente", "colaborador") E pelos provaveis valores tecnicos ("student", "teacher", "collaborator", "role", "requiredRole", "profile"), e leia o AuthProvider/ProtectedRoute para ver a lista real de roles — o rotulo "aluno" pode estar gravado como "student", "aluno" ou "user". (b) LOCALIZE as rotas, telas e itens de menu daquele papel (ProtectedRoute requiredRole="...", paginas em src/pages, menus condicionados ao role). (c) Aplique a mudanca SO naquela area, sem tocar nos outros papeis. Se o papel pedido nao existir no codigo, diga quais existem e pergunte (ou crie seguindo o padrao atual). Admin e "padrao" costumam ser faceis de achar; os demais (aluno, professor, etc.) exigem esse search_code pelo nome — faca sempre, nunca responda que "nao encontrei" sem ter procurado pelo nome do papel.
11. "Em TODOS os cadastros / em todos os perfis / em todos os acessos": aplique a MESMA mudanca em CADA formulario de cadastro (ou cada papel), um por um — nao pare no primeiro. Use search_code para achar todos os formularios/telas envolvidos, altere cada um e, no fim, liste quais arquivos voce mexeu.

DIAGNOSTICO DE ERROS (quando a pessoa relatar um bug, uma tela quebrada, ou colar uma mensagem de erro):
1. Primeiro ENTENDA o erro. Leia a mensagem/print com atencao: arquivo, linha, e o tipo (import quebrado, variavel/componente indefinido, erro de rota, erro do Supabase/RLS/401, hook fora de componente, etc.).
2. LOCALIZE a causa antes de mudar qualquer coisa: use search_code e read_file para abrir os arquivos citados e os relacionados (o import que falta, o componente que nao existe, a rota mal ligada, a policy que bloqueia). Nao adivinhe.
3. Ache a CAUSA RAIZ, nao o sintoma. Tela branca quase sempre e import inexistente, export default faltando, hook fora de componente ou rota errada — descubra qual.
4. Corrija de forma MINIMA e cirurgica: mude so o que resolve, preservando o resto. Nao reescreva telas inteiras nem troque bibliotecas por causa de um bug pontual.
5. Confira antes de commitar: todo import aponta para arquivo real, os nomes batem, a rota existe no <Routes>, e o conserto nao quebrou outra tela.
6. Ao final, explique em uma linha o que era o erro e o que voce corrigiu.

Se o pedido estiver ambiguo o bastante para gerar retrabalho, pergunte antes de editar.

IMAGENS: quando a pessoa anexa uma foto, ela JA ENTROU no projeto e o endereco dela vem escrito no proprio pedido, num bloco [FOTO ANEXADA PELA PESSOA]. Seu trabalho e so apontar o src da <img> para aquele endereco e commitar — nao ha upload pendente, nao ha nada para a pessoa fazer. NUNCA responda que "nao consigo salvar arquivos binarios", nunca peca para ela colocar a foto na pasta public na mao e nunca invente outro caminho. Isso vale mesmo que o seu modelo nao exiba a imagem: trocar um src nao exige enxergar a foto. E so diga que trocou depois de ter escrito o arquivo de verdade — responder "pronto, troquei" sem ter mexido em nada e o pior erro possivel aqui. (A ferramenta salvar_imagem continua existindo para casos em que voce queira um nome de arquivo especifico.)

Quando a pessoa pedir para adicionar algo que ainda nao existe (uma pagina nova, uma secao, um componente): crie o arquivo. Nao responda que "nao encontrou" — se a pagina de vendas nao existe, o pedido e para criar uma. Antes de criar, olhe um arquivo parecido que ja exista (outra pagina, outro componente) para seguir o mesmo padrao de imports, estilo e estrutura, e lembre de ligar a pagina nova nas rotas (geralmente src/App.tsx) e num menu ou link, se fizer sentido.
${ctx.supabase?.connected && ctx.supabase?.projectRef ? `
BACKEND AUTOMATICO — Supabase conectado (projeto "${ctx.supabase.projectName}")
Este projeto tem um banco Supabase REAL ligado. Voce nao escreve SQL em arquivo e nao pede para a pessoa rodar nada: voce CRIA no banco de verdade, sozinho, como parte da tarefa.

Sempre que o pedido envolver guardar ou ler dados — formulario, cadastro, contato, lista, comentarios, pedidos, produtos, login, upload — faca nesta ordem:
1. listar_tabelas — veja o que ja existe e quais colunas tem. Nunca duplique uma tabela existente.
2. criar_tabela — execute o SQL de criacao no banco. A tabela passa a existir de fato, na hora.
3. write_file — escreva o codigo do front que le/grava nessa tabela, ja com os nomes de coluna reais.
4. commit_changes — envie o codigo.

Se o pedido precisar de logica no servidor (enviar email, pagamento, webhook, usar chave secreta), use criar_edge_function para publicar a funcao no Supabase.

Padrao de SQL que voce deve seguir:
- Chave: "id bigint generated always as identity primary key" (ou uuid com gen_random_uuid()).
- Sempre "created_at timestamptz not null default now()".
- SEMPRE habilite RLS: "alter table NOME enable row level security;"
- E SEMPRE crie as policies necessarias, senao o front nao consegue gravar. Para um formulario publico de contato, por exemplo: "create policy \\"qualquer um envia\\" on contatos for insert to anon with check (true);"
- Para dados de usuario logado, use "auth.uid()" nas policies.
- Nomes de tabela e coluna em minusculas, sem acento, no plural para tabelas.

Conexao do front — use ESTES valores reais no codigo (a anon key e PUBLICA, feita para o navegador; pode e deve ir no front, quem protege os dados sao as policies de RLS):
  URL = "${ctx.supabase.url}"
  ANON KEY = "${ctx.supabase.anonKey}"
Ligue o front ao banco com createClient(URL, ANON KEY) usando esses valores. NUNCA peca a URL nem a anon key para a pessoa — voce JA TEM os dois aqui. Nunca deixe placeholder tipo SUA_URL/SUA_CHAVE.
- Projeto com build (Vite/React): crie/reuse um cliente em src/lib/supabase (ou padrao do projeto) importando de "@supabase/supabase-js".
- Projeto HTML estatico (so index.html, sem build): carregue o supabase-js pela CDN com <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> e use const supabase = window.supabase.createClient(URL, ANON KEY); depois troque as gravacoes/leituras locais por supabase.from("tabela").insert/select/update para os botoes funcionarem de verdade contra o banco.

PROIBIDO: DROP, DELETE, TRUNCATE — sao bloqueados. Voce so cria e adiciona.
Nunca responda "crie a tabela manualmente" nem "rode este SQL": faca voce mesmo com criar_tabela.` : ctx.lovableCloud ? `
BACKEND VIA LOVABLE CLOUD — este e um projeto do Lovable e o Supabase NAO esta conectado na extensao, entao a pessoa usa o banco do proprio Lovable (Lovable Cloud). Voce NAO tem acesso ao banco; NUNCA use criar_tabela ou listar_tabelas (nao ha conexao). Em vez disso:

1) DADOS (cadastro, aba com registros, lista, formulario que salva): escreva o FRONT normalmente (telas, formularios e chamadas ao cliente supabase que o projeto ja usa) e, no FINAL da resposta, entregue o SQL para a pessoa colar no Lovable Cloud.
REGRA CRITICA: entregue SEMPRE o SCRIPT COMPLETO e idempotente da(s) tabela(s) — NUNCA apenas um "alter table add column" de um unico campo. No Lovable Cloud a tabela pode ainda nem existir, entao um alter sozinho FALHA. O script tem que funcionar tanto se a tabela nao existe (ele cria) quanto se ja existe faltando so a coluna nova (ele adiciona). Mesmo quando o pedido foi so "adicione o campo X", devolva a tabela INTEIRA com TODAS as colunas que o front usa.
Use EXATAMENTE este formato (com o SQL dentro de um bloco \`\`\`sql):
SQL para colar no Lovable Cloud:
\`\`\`sql
create table if not exists NOME (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  TODAS_AS_COLUNAS_QUE_O_FRONT_USA
);
alter table NOME add column if not exists CADA_COLUNA TIPO;
alter table NOME enable row level security;
drop policy if exists "acesso" on NOME;
create policy "acesso" on NOME for all to anon using (true) with check (true);
\`\`\`
Regras: uma linha "alter table NOME add column if not exists" para CADA coluna (garante os campos novos numa tabela que ja existe); inclua TODAS as tabelas necessarias; nomes minusculo, sem acento, tabela no plural; use os MESMOS nomes de tabela/coluna que o front usa.

2) IMPORTAR ARQUIVO / IMAGEM (upload): escreva o front do upload usando supabase.storage.from("BUCKET"), e de um PASSO A PASSO curto no chat para a pessoa criar o bucket no Lovable Cloud (Storage > New bucket > nome "BUCKET" > publico ou privado > Create) e liberar as policies de upload e leitura.

3) API / SEGREDO (secret, api key): escreva o codigo lendo a variavel/secret e de um PASSO A PASSO para a pessoa adicionar o segredo no Lovable Cloud (nas configuracoes de Secrets/Environment do projeto).

NAO crie edge functions manuais (o Lovable nao aceita isso): se precisar de logica de servidor, diga que a pessoa deve criar a edge function pelo proprio Lovable.
No final, diga em portugues e direto o que voce fez no front e o que a pessoa precisa COLAR/CONFIGURAR no Lovable Cloud.` : `
BACKEND: nenhum Supabase esta conectado nesta extensao, entao VOCE (a IA) NAO consegue criar tabelas nem conectar o banco sozinho — isso depende de uma conexao que so a pessoa liga. Se o pedido precisa guardar dados (cadastro, lista, formulario que salva):
- Escreva o front normalmente (telas e formularios), mas NAO invente conexao de banco nem valores de URL/chave no codigo.
- Explique, curto e direto, que QUEM conecta o Supabase e a pessoa, no painel: linha "Supabase" > Conectar > colar o token do projeto dela. So depois disso, ao pedir de novo, voce cria as tabelas AUTOMATICAMENTE e liga o app ao banco (inclusive no deploy).
- NUNCA diga "quer que eu conecte o Supabase?" nem de a entender que criou/conectou as tabelas — voce NAO consegue conectar; quem faz isso e a pessoa, no painel.
- Alternativa: se a pessoa preferir criar as tabelas na mao, ela pode pedir "me da o SQL das tabelas" que voce escreve o script SQL pronto (create table + colunas + RLS + policy) para ela colar no Supabase dela.`}`;
}

const EXT_POR_TIPO = {
  "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
  "image/webp": ".webp", "image/gif": ".gif", "image/svg+xml": ".svg"
};

/**
 * Da a cada foto anexada um endereco definitivo no projeto, ANTES de a IA
 * responder qualquer coisa.
 *
 * O nome vem do CONTEUDO da imagem, nao do relogio: mandar a mesma foto duas
 * vezes aponta para o mesmo arquivo (em vez de encher o repositorio de copias),
 * e mandar uma foto diferente nunca sobrescreve a anterior, que pode estar em
 * uso em outra tela.
 */
export function prepararAnexos(images) {
  const lista = [];
  for (const dataUrl of images || []) {
    const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!m) continue;
    const ext = EXT_POR_TIPO[m[1].toLowerCase()] || ".jpg";
    const caminho = `public/foto-${hashCurto(m[2])}${ext}`;
    lista.push({
      caminho,
      // Em projeto Vite, o que esta em public/ e servido na raiz.
      url: "/" + caminho.slice("public/".length),
      base64: m[2]
    });
  }
  return lista;
}

/** Hash simples e estavel. Nao precisa ser forte: so precisa nao colidir. */
function hashCurto(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(7, "0").slice(0, 7);
}

/**
 * O recado que vai junto do pedido da pessoa.
 *
 * Ele e escrito para funcionar mesmo com um modelo que NAO enxerga a imagem:
 * nao pede para descrever a foto, pede para apontar um src. E deixa explicito
 * que nao existe upload pendente, porque a resposta errada mais comum era
 * mandar a pessoa "subir a imagem para a pasta public".
 */
export function recadoDosAnexos(anexos) {
  if (!anexos.length) return "";
  const linhas = anexos.map((a, i) => `  ${i + 1}. ${a.url}`).join("\n");
  return `\n\n[FOTO ANEXADA PELA PESSOA]
Ela anexou ${anexos.length} foto(s), e elas JA ESTAO no projeto, nestes enderecos:
${linhas}
Para usar, basta apontar o src para o endereco acima — ex.: <img src="${anexos[0].url}" alt="..." />.
REGRAS:
- NAO peca para a pessoa subir, salvar ou enviar a imagem para lugar nenhum: ja esta la.
- NAO invente outro caminho ("/public/foto.jpg", "./imagens/x.png"): use exatamente o endereco acima.
- Voce NAO precisa enxergar a foto para fazer isso. Se o seu modelo nao exibe imagens, troque o src mesmo assim — e a troca que a pessoa pediu.
- Se for para SUBSTITUIR uma imagem existente, troque o src dela e apague a URL antiga; nao deixe as duas.
- So diga que trocou DEPOIS de realmente escrever o arquivo e commitar. Dizer "pronto, troquei" sem ter escrito nada e o erro mais grave que voce pode cometer aqui.`;
}

/**
 * Executa um pedido do inicio ao fim.
 * emit(evento) alimenta a interface em tempo real.
 */
export async function runAgent({ ws, history, userMessage, images, ctx, deveParar, preferredProviderId = "" }, emit = () => {}) {
  // As imagens anexadas ficam disponiveis para a ferramenta salvar_imagem, que
  // grava a foto no repositorio como arquivo de verdade.
  ws.imagensAnexadas = images || [];

  // ---------------------------------------------------------------------
  // A FOTO ANEXADA NAO PODE DEPENDER DE A IA ENXERGAR NEM DE ELA CHAMAR UMA
  // FERRAMENTA.
  //
  // Era assim antes, e dava o defeito mais chato de todos: a pessoa anexava a
  // foto, pedia para trocar, a IA respondia "pronto, troquei" e NADA mudava.
  // Dois motivos, os dois fora do controle dela:
  //   - o modelo escolhido pode nao enxergar imagem (DeepSeek usa um modelo de
  //     visao separado, experimental, que nem sempre faz chamada de ferramenta);
  //   - sem chamada de ferramenta, nenhum arquivo e gravado — mas o texto da
  //     resposta continua dizendo que foi.
  //
  // Agora a conta e outra: o arquivo JA TEM endereco antes de a IA falar, e nos
  // dizemos esse endereco a ela. O trabalho dela vira trocar uma string de src,
  // que qualquer modelo de texto faz. O binario so entra no commit se alguem
  // apontar para ele (ver commit_files em tools.js), entao uma foto mandada so
  // para perguntar "por que essa tela esta assim?" nao vira lixo no repositorio.
  // ---------------------------------------------------------------------
  ws.anexosDisponiveis = prepararAnexos(images);
  const avisoAnexos = recadoDosAnexos(ws.anexosDisponiveis);

  const system = systemPrompt(ctx);

  const historicoLimpo = sanitizeHistory(history);

  // Damos a arvore do projeto ja de entrada. Sem isso, a IA precisa adivinhar
  // caminhos e as vezes desiste dizendo "nao encontrei a pagina", quando na
  // verdade so nao sabia onde procurar. Com o mapa em maos, ela vai direto.
  // So enviamos na PRIMEIRA mensagem da conversa: nas seguintes o mapa ja esta
  // no historico, entao repetir a lista inteira so gastaria tokens a toa.
  let mapaInicial = "";
  if (!historicoLimpo.length) {
    try {
      if (!ws.treeCache) ws.treeCache = await gh.getTree(ws.repo.owner, ws.repo.name, ws.repo.branch);
      const arquivos = ws.treeCache.files
        .filter(f => !AGENT_LIMITS.ignorar.test(f.path))
        .map(f => f.path);
      // Cabe folgado no contexto e evita a primeira chamada de list_files.
      const limiteInicial = AGENT_LIMITS.initialTreeEntries || 180;
      mapaInicial = `\n\nArquivos do projeto (${arquivos.length}):\n${arquivos.slice(0, limiteInicial).join("\n")}`;
      if (arquivos.length > limiteInicial) mapaInicial += `\n[... e mais ${arquivos.length - limiteInicial}. Use list_files com filtro para ver o resto.]`;
    } catch { /* se falhar, a IA usa list_files normalmente */ }
  }

  const messages = [
    ...historicoLimpo,
    { role: "user", text: userMessage + avisoAnexos + mapaInicial, images: images || [] }
  ];
  let steps = 0;
  let respostasVazias = 0;   // quantas vezes a IA voltou vazia (sem texto e sem acao)
  let passosSoLeitura = 0;   // passos seguidos so lendo, sem escrever nada
  const SO_LEITURA = new Set(["read_file", "list_files", "search_code", "listar_tabelas"]);

  while (steps < AGENT_LIMITS.maxSteps) {
    steps++;

    // Parada pedida pela pessoa: sai limpo, mantendo o que ja foi preparado.
    if (deveParar?.()) {
      emit({ type: "parado" });
      return { messages, done: false, staged: stagedSummary(ws), parado: true };
    }

    const reply = await completeComEspera(
      { system, messages, tools: TOOL_SCHEMAS, preferredProviderId },
      ev => emit(ev)
    );

    // A imagem (print) so precisa ser lida UMA vez. Depois do 1o passo, tiramos
    // ela da conversa para os passos seguintes usarem a melhor IA de CODIGO
    // (rapida) em vez da IA de VISAO (lenta e ruim em ferramentas). Era isso
    // que deixava o agente minutos lendo arquivos em loop.
    if (steps === 1) {
      for (const m of messages) if (m.images && m.images.length) m.images = [];
    }

    messages.push({
      role: "assistant",
      text: reply.text,
      toolCalls: reply.toolCalls
    });

    if (reply.text) {
      // No modo Lovable Cloud, garante que o SQL cria a tabela (nao so o alter).
      const textoParaMostrar = ctx?.lovableCloud ? reforcarSqlLovable(reply.text) : reply.text;
      emit({ type: "assistant_text", text: textoParaMostrar, provider: reply.providerLabel });
    }

    if (!reply.toolCalls?.length) {
      // A IA parou sem texto E sem acao: nao encerra em silencio (era o
      // "ficou pensando e sumiu, nada aconteceu"). Cutuca para continuar e,
      // se insistir vazia, avisa a pessoa em vez de morrer calado.
      if (!reply.text || !reply.text.trim()) {
        respostasVazias++;
        if (respostasVazias <= 3) {
          // Voltar vazio quase sempre e: contexto grande demais OU o arquivo a
          // reescrever passou do limite de SAIDA do modelo (DeepSeek ~8k tokens).
          // Enxugamos os resultados de leitura E pedimos uma edicao CIRURGICA
          // (so o trecho que muda), para caber na saida.
          for (const m of messages) {
            if (m.role === "tool" && typeof m.result === "string" && m.result.length > 1500) {
              m.result = m.result.slice(0, 1500) + "\n[...conteudo encurtado; peca de novo so se for essencial...]";
            }
          }
          emit({ type: "notice", text: "A IA voltou vazia; enxugando o contexto e pedindo uma edicao menor…" });
          messages.push({
            role: "user",
            text: "Voce parou sem terminar (a resposta pode ter ficado grande demais). NAO leia mais arquivos. Faca a MENOR mudanca possivel: edite UM arquivo por vez e altere SO os trechos necessarios, mantendo o resto igual — nao reescreva o arquivo inteiro se ele for grande. Comece pelo mais importante do pedido, use write_file e depois commit_changes com um resumo curto."
          });
          continue;
        }
        emit({ type: "notice", text: "O modelo travou (provavelmente o arquivo e grande demais para a saida dele). Tente: 1) pedir UMA mudanca por vez (ex.: so o filtro, depois o bug); ou 2) trocar para gpt-4.1 ou Claude, que aguentam arquivos maiores." });
      }
      return { messages, done: true, staged: stagedSummary(ws) };
    }
    respostasVazias = 0;   // teve acao: zera o contador

    for (const call of reply.toolCalls) {
      if (deveParar?.()) {
        emit({ type: "parado" });
        return { messages, done: false, staged: stagedSummary(ws), parado: true };
      }
      emit({ type: "tool_start", name: call.name, args: call.args });
      let result;
      try {
        result = await runTool(ws, call.name, call.args, emit);
      } catch (err) {
        result = `Erro ao executar ${call.name}: ${err.message}`;
        emit({ type: "tool_error", name: call.name, message: err.message });
      }
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        result: String(result).slice(0, 60_000)
      });
    }

    // Freio anti-loop: se a IA so fica LENDO arquivos sem escrever nada, empurra
    // ela para agir. Evita ficar 15 min lendo os mesmos arquivos.
    if (reply.toolCalls.every(c => SO_LEITURA.has(c.name))) passosSoLeitura++;
    else passosSoLeitura = 0;
    if (passosSoLeitura >= 5) {
      passosSoLeitura = 0;
      emit({ type: "notice", text: "Explorou o bastante; pedindo para escrever agora…" });
      messages.push({
        role: "user",
        text: "PARE de ler arquivos. Voce ja tem contexto suficiente. AGORA use write_file para criar/editar os arquivos que faltam (ex.: as paginas importadas no App.jsx) e depois chame commit_changes. Nao leia mais nada a menos que seja absolutamente essencial."
      });
    }
  }

  emit({
    type: "limit",
    message: `Parei em ${AGENT_LIMITS.maxSteps} passos para nao entrar em loop. Peca a continuacao se ainda faltou algo.`
  });
  return { messages, done: false, staged: stagedSummary(ws) };
}
