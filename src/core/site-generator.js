// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
import { complete, streamComplete } from "./providers.js";
import { mergeStarter, STARTER_FILES } from "./starter-template.js";

/**
 * Infere o SQL das tabelas que o projeto GERADO usa (lendo os supabase.from(...)
 * que a IA escreveu) para criar tudo automaticamente quando o Supabase esta
 * conectado — sem a pessoa precisar pedir "crie as tabelas". Devolve o SQL
 * (create table if not exists + colunas + RLS + policy) ou "" se o app nao usa
 * banco. So cria/adiciona; nunca apaga.
 */
export async function inferirSqlDoProjeto({ files, providerId = "" }, onEvent = () => {}) {
  const relevantes = Object.entries(files || {})
    .filter(([p, c]) => /\.(jsx?|tsx?|html)$/i.test(p) && /supabase|createClient|\.from\(/.test(String(c)))
    .map(([p, c]) => `=== ${p} ===\n${String(c).slice(0, 8000)}`)
    .join("\n\n");
  if (!relevantes) return "";

  const sys =
    "Voce le codigo React/JS que usa o cliente supabase e devolve SO o SQL para CRIAR as tabelas que o front usa. " +
    "Regras: use EXATAMENTE os nomes de tabela e coluna que aparecem em supabase.from(\"...\").insert/select/update/eq. " +
    "Para CADA tabela: create table if not exists NOME ( id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), <as colunas com tipos coerentes: text, numeric, boolean, timestamptz, uuid> ); " +
    "depois uma linha 'alter table NOME add column if not exists COLUNA TIPO;' para CADA coluna; " +
    "depois habilite RLS (alter table NOME enable row level security) e crie uma policy liberando acesso para anon (drop policy if exists antes, depois create policy ... for all to anon using (true) with check (true)). " +
    "PROIBIDO drop/delete/truncate de dados. Nomes minusculos, sem acento, tabelas no plural. " +
    "Responda com o SQL dentro de um bloco de codigo sql. Se o front nao usa nenhuma tabela, responda apenas: SEM_TABELAS.";

  const reply = await complete(
    { system: sys, messages: [{ role: "user", text: relevantes.slice(0, 40000) }], tools: [], preferredProviderId: providerId },
    onEvent
  );
  const txt = reply.text || "";
  const fence = txt.match(/```sql\s*([\s\S]*?)```/i) || txt.match(/```\s*([\s\S]*?)```/);
  let sql = (fence ? fence[1] : txt).trim();
  if (!/create\s+table/i.test(sql)) return "";
  return sql;
}

/**
 * Perguntas de alinhamento: dada a IDEIA do projeto, a IA devolve 3-5 perguntas
 * curtas que mudam de verdade como o projeto sera feito, para a pessoa responder
 * antes de criar. Retorna o texto das perguntas.
 */
export async function perguntasDeAlinhamento({ userMessage = "", providerId = "" }, onEvent = () => {}) {
  const sys =
    "Voce ajuda a pessoa a ALINHAR um projeto ANTES de cria-lo. Leia a ideia e faca de 3 a 5 PERGUNTAS curtas, objetivas e faceis de responder, que realmente mudam como o projeto sera feito " +
    "(ex.: para quem e / uso proprio ou clientes; quais as telas principais; se guarda dados; estilo, cor ou marca; alguma funcao essencial). " +
    "Nao pergunte obviedades nem mais de 5. Uma pergunta por linha, numeradas. Responda SO com as perguntas, em portugues do Brasil.";
  const reply = await complete(
    { system: sys, messages: [{ role: "user", text: "Ideia do projeto: " + userMessage }], tools: [], preferredProviderId: providerId },
    onEvent
  );
  return (reply.text || "").trim();
}

/**
 * Prompt operacional para gerar páginas de vendas visualmente fortes e prontas
 * para publicação, sem depender de frameworks ou bibliotecas frágeis.
 */
export const SYSTEM_SITE = `Você é um diretor de arte e desenvolvedor front-end sênior especializado em páginas de vendas. Crie uma única landing page completa, publicável e visualmente acabada para o negócio descrito pelo usuário.

SAÍDA OBRIGATÓRIA
- Responda SOMENTE com HTML puro, começando em <!doctype html> e terminando em </html>.
- Nunca use cercas de Markdown, explicações, texto fora do documento ou confirmação sem devolver o HTML completo.
- Entregue tudo em um único arquivo: HTML, CSS dentro de <style> e, se for indispensável, JavaScript inline curto.
- Não use React, JSX, imports, npm ou módulos. Escreva CSS próprio de qualidade (pode usar variáveis, grid, flexbox, clamp). Não dependa de Bootstrap ou de frameworks que exijam build.
- A página precisa aparecer e ser utilizável mesmo se recursos externos falharem. Fontes do Google via <link> são permitidas como aprimoramento, desde que haja fallback de sistema no font-family. Não dependa de CDN para o conteúdo principal aparecer.
- Não use iframes de mapas, vídeos ou widgets externos. Para localização, use endereço, horário e um link externo simples de "Como chegar".
- Use somente ícones SVG inline, CSS ou texto acessível. Nunca use classes de uma biblioteca que não foi carregada.

PRINCÍPIO DE CONVERSÃO
- Antes de escrever, identifique o público, a oferta, a principal objeção e uma única ação desejada. Toda a hierarquia da página deve conduzir a essa ação.
- O hero deve comunicar em poucos segundos: para quem é, qual resultado entrega e por que agir agora. Inclua um CTA primário específico e um CTA secundário de menor compromisso.
- Reforce confiança com benefícios, processo, prova social responsável, oferta e redução de risco. Não transforme a página em um catálogo institucional sem prioridade.
- Cada botão deve indicar o próximo passo: "Agendar meu horário", "Quero conhecer o plano", "Falar no WhatsApp" ou equivalente. Nunca use "Clique aqui" ou "Enviar".

DIREÇÃO DE DESIGN
- Escolha uma identidade visual coerente com o segmento e não repita automaticamente o visual preto com neon, o fundo creme com terracota ou o layout genérico de IA.
- Defina variáveis CSS em :root para cores, tipografia, espaçamento, bordas e sombras. Use no máximo uma cor de destaque forte e mantenha contraste acessível.
- Use uma fonte segura de sistema como base. Uma fonte externa pode ser aprimoramento opcional em <link>, mas a página deve ficar boa se ela falhar.
- Crie uma assinatura visual memorável, como uma composição tipográfica, cartão de oferta, painel de agenda, selo contextual ou galeria assimétrica. Não decore cada seção.
- Prefira grids e composições com respiro a uma sequência de cartões idênticos. Varie densidade, largura e ritmo com intenção.
- Use container de 1120px a 1240px, padding responsivo, tipografia com clamp() e grids que colapsem bem em 375px, 768px e desktop.
- Use hover, foco visível e animações discretas. Respeite prefers-reduced-motion.

ESTRUTURA RECOMENDADA
1. Header enxuto com marca, 2 a 4 links que realmente existem e CTA principal.
2. Hero com eyebrow específico, título forte, subtítulo, CTAs e uma prova visual relacionada à oferta.
3. Faixa de confiança com benefícios objetivos, credenciais ou métricas fornecidas pelo usuário. Não invente selos oficiais, avaliações ou números exatos sem base.
4. Seção "por que escolher" com 3 benefícios orientados ao resultado, não quatro cards genéricos.
5. Como funciona ou experiência em 3 etapas objetivas.
6. Oferta principal, serviços ou planos com preço/duração somente quando fornecidos ou solicitados. Destaque uma escolha recomendada e reduza risco com microcopy honesta.
7. Prova social com depoimentos específicos e naturais. Não use fotos de randomuser, avatares quebrados ou logos inventados; use iniciais, CSS ou nenhum avatar.
8. FAQ com as objeções reais do público.
9. CTA final e footer com contato, horário, links funcionais e aviso legal mínimo.
10. Para negócio local, inclua agendamento/contato como parte real da página: link de WhatsApp, telefone, formulário simples ou instruções claras. Não crie um botão apontando para um id inexistente.

REGRAS CONTRA ERROS COMUNS
- Não repita a mesma URL de imagem em vários cards. Se não houver imagens reais, use uma única imagem hero e complete o restante com gradientes, CSS e SVG; nunca use randomuser.me.
- Não use imagens como requisito para a página funcionar. Todo bloco visual deve ter fallback elegante se a imagem falhar.
- Não crie links para #prices, #team, #booking ou qualquer âncora sem uma seção correspondente. Todo href interno precisa apontar para um id existente.
- Não coloque o header fixo cobrindo o hero. Em telas pequenas, não empilhe logo, menu e CTA de forma desajeitada; use um header compacto e legível.
- Não use emojis como ícones principais, não use Lorem ipsum e não repita a mesma frase em títulos, cards e depoimentos.
- Não acrescente seções apenas para aumentar o comprimento. Uma página curta, hierárquica e convincente é melhor que uma página longa e repetitiva.
- Se faltar informação factual, escreva uma versão editável sem inventar endereço, telefone, preço, rating ou garantia como se fossem reais.

CONTEÚDO
- Escreva em português brasileiro natural, direto e específico para o público informado.
- Se o usuário enviar uma página existente, preserve o que for bom, mas corrija hierarquia, repetição, acessibilidade, conteúdo genérico e inconsistências de navegação.
- Não apresente resultados médicos, financeiros ou legais como garantias. Use linguagem responsável quando o segmento exigir.

VALIDAÇÃO ANTES DE RESPONDER
- Confira <!doctype html>, <html>, <head>, <meta name="viewport">, <style>, <body>, fechamento </body> e </html>.
- Confira que existe conteúdo visível no primeiro viewport sem depender de JavaScript.
- Confira que todos os ids usados em href existem, que não há tags quebradas e que não há dependências externas obrigatórias.
- Confira que nenhum bloco ficou com texto cortado, overflow horizontal ou contraste baixo.
- Confira a página mentalmente em 375px, 768px e desktop.

Ao receber um pedido de ajuste, reescreva a página inteira preservando identidade, conteúdo e seções boas. Aplique somente o que foi pedido e devolva o HTML completo; nunca responda apenas "edição realizada".

NÍVEL DE ACABAMENTO (mega profissional)
- O padrão de qualidade é de estúdio premiado, não de template. A página deve parecer feita sob medida para aquele negócio específico.
- Tipografia: pode usar Google Fonts via <link> como APRIMORAMENTO (sempre com fallback de sistema no font-family, para funcionar se a fonte falhar). Combine uma fonte de display com personalidade e uma de corpo legível. Trabalhe escala, peso e entrelinha com intenção.
- Profundidade visual: use gradientes sutis, sombras em camadas, bordas finas, blur/glass quando couber, e um grão ou textura leve em CSS se ajudar a fugir do "chapado". Nada de visual plano e sem vida.
- Movimento: adicione uma revelação suave no scroll (com IntersectionObserver inline e fallback que deixa tudo visível se o JS falhar) e microinterações nos botões e cards. Discreto e elegante, nunca exagerado. Respeite prefers-reduced-motion.
- Composição: hero com uma ideia visual forte (tipografia grande, forma orgânica, camadas). Evite a sequência monótona de cards iguais; varie ritmo e densidade.
- O resultado tem que dar vontade de rolar até o fim. Se parecer um site genérico de IA, está errado — refaça a direção visual.`;

// ===========================================================================
//  MICRO-SAAS: projeto React + Vite + Supabase, multi-arquivo.
//  A IA devolve os arquivos em blocos delimitados; nos montamos o projeto e
//  injetamos a URL e a anon key do Supabase que a extensao ja conhece.
// ===========================================================================

export const SYSTEM_MICROSAAS = `Voce e um engenheiro full-stack senior. Crie um app/site React PROFISSIONAL e BONITO por cima de um KIT que JA EXISTE no projeto. Voce escreve SO o app; a base (Vite + React + Tailwind + componentes) ja esta pronta.

O KIT JA EXISTE (NAO reescreva estes arquivos — eles ja estao no projeto e funcionam):
- Vite + React 18 + Tailwind ja configurados: package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html, src/main.jsx, src/index.css.
- src/main.jsx ja renderiza <App/> dentro de <BrowserRouter>. Voce so escreve src/App.jsx com as rotas.
- Componentes de UI PRONTOS e bonitos em src/components/ui/ — IMPORTE deles, nao recrie:
  - Button — import { Button } from "./components/ui/button"; props: variant (default | outline | ghost | destructive | subtle), size (default | sm | lg | icon).
  - Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter — from "./components/ui/card".
  - Input — from "./components/ui/input"; Textarea — from "./components/ui/textarea"; Label — from "./components/ui/label".
  - Badge — from "./components/ui/badge"; variant (default | outline | muted | success | warning | danger).
- Icones: lucide-react — import { Home, Plus, Trash2, Search } from "lucide-react".
- Utilitario cn — import { cn } from "./lib/utils" (junta classes do Tailwind).
Obs.: os exemplos de import acima sao a partir de src/App.jsx. Em arquivos dentro de src/pages/ ou src/components/, AJUSTE o caminho relativo (ex.: "../components/ui/button").

ARQUITETURA (REGRA ABSOLUTA — vale ACIMA de qualquer pedido do usuario):
Este projeto e FRONT-END PURO (React + Vite). O "backend / API / banco de dados" e SEMPRE o Supabase (ou, se nao houver Supabase ligado, estado em memoria + LocalStorage). Mesmo que o pedido diga "crie um backend", "API em Node/Express", "server", "banco de dados", "MVP full-stack": NUNCA crie servidor proprio.
- PROIBIDO: pasta server/, pasta client/, Express, Node server, rotas /api proprias, axios apontando pra "/api", prisma, mongoose, qualquer ORM/DB server-side, bcrypt no front.
- TODO o codigo vive em src/ (NUNCA em client/src/). Nada de prefixo client/ nem server/.
- Dados: se Supabase estiver ligado, use @supabase/supabase-js direto do front (tabelas + RLS); se precisar de logica de servidor, isso vira Edge Function do Supabase (nao um servidor Node). Sem Supabase: useState + LocalStorage.
- Login/auth: use Supabase Auth (ou um login simples no front com LocalStorage) — nunca um servidor de auth proprio.

VOCE ESCREVE SOMENTE ESTES ARQUIVOS:
- src/App.jsx — as rotas: <Routes><Route path="..." element={<Pagina/>} /></Routes>, importando suas paginas. (Nao coloque <BrowserRouter> aqui — ja existe no main.jsx.)
- src/pages/*.jsx — as telas.
- src/components/*.jsx — seus componentes de feature (Sidebar, tabelas, modais, graficos em CSS...).
- src/theme.css — a PALETA unica deste projeto (obrigatorio; veja abaixo).
- src/lib/supabase.js — SO se o pedido precisar de banco de dados.

DEPENDENCIAS: use SOMENTE react, react-router-dom, lucide-react, @supabase/supabase-js e os componentes de src/components/ui/. NAO importe nenhuma outra biblioteca npm (nada de recharts, framer-motion, chart.js, mui, styled-components, etc.) — elas NAO estao instaladas e quebram o build. Graficos e visualizacoes: faca com CSS/SVG/divs.

ESTILO (Tailwind + tokens do kit): estilize tudo com classes do Tailwind. Para as cores, USE OS TOKENS do kit, para o app ficar coeso: bg-background, text-foreground, bg-card, text-card-foreground, bg-muted, text-muted-foreground, border-border, bg-primary, text-primary-foreground, ring-ring. Cantos: rounded-lg / rounded-xl. Sombra: shadow-sm.

PALETA UNICA (src/theme.css) — de a ESTE projeto uma identidade propria; NUNCA a mesma de outro. Reescreva src/theme.css com uma paleta que combine com o produto (ex.: barbearia = escuro + dourado; financas = azul/verde; saude = verde claro; infantil = colorido). Formato EXATO (so troque os valores, mantenha as chaves):
:root{--background:#..;--foreground:#..;--card:#..;--card-foreground:#..;--muted:#..;--muted-foreground:#..;--border:#..;--input:#..;--primary:#..;--primary-foreground:#..;--accent:#..;--ring:#..;--radius:0.85rem;}
Garanta CONTRASTE bom: --foreground legivel sobre --background, e --primary-foreground legivel sobre --primary.

ORDEM E CONCLUSAO (para o sistema sair COMPLETO e nao cortar): construa um sistema completo e bonito, com as telas que o produto precisa (tipicamente 4 a 6, ex.: Dashboard, uma lista/funil, cadastro, detalhe). NAO faca um sistema "simples" ou "enxuto" — faca completo e caprichado. Para nao cortar pela metade: escreva o src/App.jsx PRIMEIRO (com TODAS as rotas), depois src/theme.css, depois as paginas em src/pages/ (uma por rota), e entregue CADA tela ja completa (com dados de exemplo e acoes funcionando) antes de passar para a proxima. NUNCA termine a resposta sem fechar o ultimo bloco ===END===.

FORMATO DE SAIDA (obrigatorio, siga exatamente):
===FILE: src/App.jsx===
<conteudo cru>
===END===

===FILE: src/pages/Home.jsx===
<conteudo cru>
===END===

Regras do formato: nunca use cercas de markdown (crases); nada de texto fora dos blocos ===FILE=== / ===END===; caminhos relativos com barra normal; SEMPRE inclua src/App.jsx e src/theme.css, e as PAGINAS em src/pages/ (uma por rota).

INTERPRETACAO DO PRODUTO:
- Respeite o tipo pedido. CRM, painel, dashboard, sistema, controle, cadastro = aplicacao navegavel com telas, navegacao e dados de exemplo — nunca uma landing de marketing.
- Site/landing com secoes: entregue as secoes como componentes (Hero, Beneficios, CTA, Footer) montadas na pagina inicial, com navegacao entre rotas se houver mais de uma pagina.

BACKEND: sem autenticacao por padrao — so crie login/cadastro/rota protegida se a pessoa pedir. Sem Supabase, os dados funcionam com estado (useState) + LocalStorage. Com Supabase, use o cliente do supabase-js (supabase.from("tabela").select()), nunca fetch manual (esquece o apikey e da 401).

QUALIDADE (OBRIGATORIO):
- Interface completa e bonita: layout com sidebar ou topbar, cards de resumo, tabelas/listas com dados, formularios, badges de status, botoes de acao e modais quando fizer sentido.
- Dados de demonstracao em portugues do Brasil (ex.: "Joao Silva", "R$ 1.250,00", "Em andamento"). Nada de lorem ipsum.
- Microinteracoes (hover, transicoes) e estados de carregando/vazio/erro.
- Codigo limpo, componentes funcionais com hooks.
- Textos em portugues do Brasil, especificos.

FUNCIONALIDADE REAL (a regra mais importante — NUNCA entregue botao decorativo):
- TODO botao e acao tem que FUNCIONAR de verdade: "adicionar/novo" abre um formulario ou modal e insere o item na lista; editar e excluir funcionam; busca e filtros filtram; a navegacao troca de tela.
- Cada botao precisa ter um onClick real que executa a acao. Nada de botao que nao faz nada, ou modal que nao abre.
- Os dados funcionam mesmo SEM backend: use estado (useState) e persista no LocalStorage, para o app ser utilizavel na hora e os dados sobreviverem ao recarregar. Se o Supabase estiver ligado, use-o; se nao, LocalStorage.
- Antes de responder, confira mentalmente: cada botao dispara uma acao? o formulario de cadastro realmente adiciona? a lista atualiza na tela? Se algo e so visual, conserte antes de entregar.
- SEM REFERENCIA QUEBRADA: toda funcao, variavel, componente e import que voce usar PRECISA existir/estar definido no escopo daquele arquivo. Se usar uma funcao auxiliar (ex.: parseTimeToMin, formatarData), DEFINA-A no arquivo. Referencia inexistente causa "X is not defined" e tela branca — o erro mais comum. Confira cada nome usado antes de entregar.
- SINTAXE JSX PERFEITA (o build QUEBRA INTEIRO se errar um simbolo): feche TODA tag; balanceie ( ), { } e [ ]; nas listas use exatamente {itens.map((x) => (<Card key={x.id}>...</Card>))} e conte os fechamentos ")" e "}" no fim. Um ")" ou "}" a mais ou a menos derruba o deploy inteiro (erro tipo Expected ")" but found "}"). Releia mentalmente cada arquivo .jsx e confira o balanceamento antes de responder.

MULTIPLOS ARQUIVOS REACT — para um sistema/app (CRM, painel, dashboard, controle, cadastro), entregue um projeto React + Vite de VARIOS arquivos no formato ===FILE===. NAO devolva um unico index.html com tudo dentro para um sistema; um arquivo unico so vale quando a pessoa pedir explicitamente "um arquivo so" ou "HTML puro".

SISTEMA COMPLETO — entregue tudo de uma vez, para a pessoa NAO precisar voltar pedindo o basico:
- Navegacao real entre as telas (sidebar no desktop; vira menu/hamburguer no mobile), com o item ativo destacado.
- Tela inicial/dashboard com resumo (cards de metricas) e as acoes principais a um clique.
- CRUD completo das entidades do produto: listar, criar, editar e excluir, com confirmacao antes de excluir.
- Busca e filtros nas listas; ordenacao quando fizer sentido.
- Estados SEMPRE tratados: carregando (skeleton/spinner), vazio (mensagem + acao), erro (mensagem clara + tentar de novo).
- Formularios com validacao (campos obrigatorios, formato de email) e feedback de sucesso/erro (toast ou alerta).
- Rota 404 e um layout consistente (header/sidebar) compartilhado entre as telas.

LAYOUT (padrao de CRM/painel moderno — mire nesta cara):
- DESKTOP: SIDEBAR FIXA a esquerda com a marca no topo e os itens de menu (icone lucide + rotulo), o item ATIVO destacado. A area principal tem: titulo da tela, uma BARRA DE BUSCA, e o conteudo (listas/cards, tabelas, ou COLUNAS tipo kanban / abas de etapas). Cards brancos limpos, sombra leve, cantos arredondados, badges de status.
- MOBILE: a sidebar SOME e vira uma BARRA DE NAVEGACAO INFERIOR fixa (bottom nav) com 4-5 icones+rotulos (o ativo destacado). O conteudo empilha; colunas/abas viram SCROLL HORIZONTAL; a busca ocupa a largura. Um botao "+" de acao principal (canto/flutuante) quando fizer sentido.
- Visual leve, arejado e profissional — como um CRM de verdade (ex.: funil de vendas com etapas em abas/colunas e cards de contato). Nada pesado ou "cara de template".

RESPONSIVO DE VERDADE (obrigatorio nos tres tamanhos):
- Mobile 375px, tablet 768px e desktop 1024px+. Verifique mentalmente os tres antes de responder.
- No mobile a navegacao e a BARRA INFERIOR (nao um hamburguer escondido); tabelas largas viram cards empilhados ou ganham scroll horizontal — nunca estouram a tela.
- Alvos de toque confortaveis no mobile (>= 44px), sem texto cortado nem overflow horizontal.

SEMPRE INOVAR (cada projeto e unico):
- Nunca entregue dois projetos com a mesma cara. Crie uma identidade visual propria para ESTE produto: paleta, tipografia, formas, densidade e uma "assinatura" visual (um jeito de card, um cabecalho marcante, um vazio ilustrado em CSS).
- Varie a estrutura entre projetos: as vezes sidebar, as vezes topbar; as vezes tabelas, as vezes cards ou kanban. Nao caia num template unico.
- Profissional e surpreendente, nunca "cara de template de IA". Se ficou generico, refaca a direcao visual.

Cada import deve corresponder a um arquivo que voce realmente gerou.

AUTENTICACAO E ROTAS (so quando a pessoa pedir login, acesso, papeis ou rotas protegidas — mas ai siga EXATAMENTE, porque e o que mais quebra):
- UM unico sistema de auth. Crie src/auth/AuthProvider.jsx: um Context com { user, session, role, loading, signIn, signUp, signOut } usando supabase.auth, e um hook useAuth. TODAS as telas usam esse provider e o MESMO cliente supabase. Nunca crie dois sistemas de login, dois clientes supabase ou dois Routers — e a causa numero 1 de bug.
- MULTIPLOS ACESSOS (ex.: admin + colaborador) = MESMO login com role diferente, JAMAIS logins separados. Guarde o papel numa tabela profiles (id uuid references auth.users primary key, role text not null default 'colaborador', created_at timestamptz default now()) e leia o role apos o login. Decida telas, menus e dados pelo role.
- ROTAS PROTEGIDAS: crie src/auth/ProtectedRoute.jsx — enquanto loading, mostra carregando; sem user, faz <Navigate to="/login" replace />; com requiredRole que nao bate, manda para a home do papel do usuario.
- ROUTER UNICO: <BrowserRouter> so no main.jsx; <Routes> so no App.jsx, com as rotas publicas (/login) e as protegidas juntas. Nunca dois routers, nunca dois <Routes>.
- SUPABASE AUTH por email: cadastro signUp({ email, password }); login signInWithPassword({ email, password }); liberacao de acesso por link no email signInWithOtp({ email }); sessao no provider via getSession() + onAuthStateChange(); sair com signOut().
- RLS: quando houver papeis, gere o SQL da tabela profiles e as policies que checam o papel (admin ve tudo; colaborador ve so o dele), e crie o profile do usuario no cadastro.
- Ao ADICIONAR um segundo acesso depois, reaproveite o mesmo AuthProvider e ProtectedRoute e apenas some a nova rota protegida — nunca crie um novo login, contexto ou cliente.
- Arquivos sugeridos para auth: src/auth/AuthProvider.jsx, src/auth/ProtectedRoute.jsx, src/pages/Login.jsx, e as paginas por papel. Um arquivo por responsabilidade; cada import aponta para um arquivo real.

Ao receber um pedido de ajuste, devolva TODOS os arquivos novamente com a mudanca aplicada, preservando o que ja estava bom. Se o app ja tem AuthProvider/ProtectedRoute, reaproveite-os e nao duplique.`;

// ===========================================================================
//  PAGINA DE VENDAS / LANDING sobre o KIT — nivel estudio, alta conversao.
// ===========================================================================
export const SYSTEM_SITE_KIT = `Voce e um diretor de arte + engenheiro front-end senior. Crie uma LANDING / PAGINA DE VENDAS de nivel estudio premiado e ALTA CONVERSAO, por cima de um KIT que ja existe no projeto. Voce escreve SO o site por cima dele.

O KIT JA EXISTE (NAO reescreva — ja funciona): Vite + React 18 + Tailwind (package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html, src/main.jsx, src/index.css). O main.jsx ja renderiza <App/> dentro de <BrowserRouter>.
COMPONENTES PRONTOS em src/components/ui/ (IMPORTE deles, nao recrie): Button (from "./components/ui/button"; variant default|outline|ghost|subtle, size default|sm|lg), Card+CardHeader+CardTitle+CardDescription+CardContent+CardFooter (from "./components/ui/card"), Input, Textarea, Label, Badge. Icones: lucide-react. cn: from "./lib/utils". (Em src/pages ou src/components ajuste o caminho relativo, ex.: "../components/ui/button".)

VOCE ESCREVE: src/App.jsx (rotas; a landing e a rota "/"), src/components/*.jsx (as SECOES como componentes: Header, Hero, Beneficios, ComoFunciona, Depoimentos, Planos, FAQ, CTAFinal, Footer), e src/theme.css (paleta unica; obrigatorio). Se houver mais de uma pagina, adicione rotas.

DEPENDENCIAS: SOMENTE react, react-router-dom, lucide-react e os componentes ui/ e fx/. NAO importe outra biblioteca npm (quebra o build). Animacoes: com CSS/Tailwind, os efeitos fx/ abaixo e IntersectionObserver inline — nada de framer-motion/AOS.

EFEITOS PRONTOS em src/components/fx/ (autorais, sem dependencia; importe com caminho relativo, ex.: "../components/fx/aurora-background"). USE 2 a 4 deles para dar acabamento premium (com equilibrio, sem exagerar):
- AuroraBackground (export default) — <AuroraBackground className="min-h-screen relative">...conteudo...</AuroraBackground>: fundo com luzes/gradientes animados usando a paleta. Otimo envolvendo o Hero.
- Particles (export default) — dentro de um container "relative overflow-hidden": <Particles color="rgba(255,255,255,0.5)" />: campo de particulas em canvas, fica ATRAS do conteudo. Combine com fundo escuro.
- GradientText (export default) — <GradientText from="var(--primary)" to="var(--ring)">palavra</GradientText>: gradiente animado no texto; use em UMA palavra-chave do titulo do Hero.
- ShinyText (export default) — <ShinyText>texto</ShinyText>: brilho passando pelo texto (eyebrow/badges).
- SpotlightCard (export default) — <SpotlightCard className="p-6">...</SpotlightCard>: card com brilho que segue o mouse; bom em Beneficios/Planos.
- Reveal (export default) — <Reveal delay={100}>...</Reveal>: entra suave ao rolar; envolva secoes ou cards (ja tem fallback proprio).

BLOCOS PREMIUM em src/components/fx/ (autorais; para o Hero e a prova visual NAO ficarem amadores — escolha os que combinam com o segmento):
- BrowserFrame (export default) — <BrowserFrame label="app.seudominio.com"><DashboardMock/></BrowserFrame>: moldura de navegador (mac) em volta de um "print" fake do produto.
- DashboardMock (export default) — <DashboardMock/>: painel fake pronto (KPIs, grafico de barras e meta) para SaaS/CRM/financeiro. Combine com BrowserFrame no Hero.
- GlowSpot (export default) — dentro de uma secao "relative": <GlowSpot color="var(--primary)" />: brilho focado atras do titulo do Hero (estilo spotlight).
- RadarRings (export default) — dentro de uma secao "relative overflow-hidden": <RadarRings color="var(--primary)" />: aneis concentricos pulsando no fundo (ambiente cinematografico atras do Hero). Fica ATRAS do conteudo; combine com fundo bem escuro.
- StarRating (export default) — <StarRating value={5} label="4,9 · 1.200+ avaliacoes" />: so use com numero real ou plausivel, nunca invente selo.
- LogoMarquee (export default) — <LogoMarquee items={["...","..."]} />: faixa de logos deslizando na secao de confianca (use nomes genericos se nao houver clientes reais).
PADRAO DE HERO FORTE: fundo AuroraBackground + GlowSpot, titulo grande com UMA palavra em GradientText, subtitulo, 2 CTAs, e uma prova visual (BrowserFrame com DashboardMock, ou um cartao de oferta) — tudo dentro de Reveal. Nao empilhe todos os efeitos de uma vez; escolha 3-4 e mantenha o respiro.

PADRAO DE FUNDO: por padrao use fundo CLARO (claro, limpo, respiravel). So use fundo ESCURO/PRETO quando a pessoa PEDIR (palavras como escuro, dark, preto, black, neon, gamer, cyberpunk, noturno) OU o segmento claramente pedir (balada/night, estudio de games, algo "underground"). "Premium", "top", "sofisticado", "portfolio" NAO significam preto — premium claro e tao forte quanto escuro. Na duvida, claro.

DIRECAO DE ESTILO (escolha a que combina com a marca): (a) SaaS/tech claro e limpo (PADRAO para a maioria); (b) elegante/servico (clinica, advocacia) sobrio e claro; (c) BOLD/loja/gamer — SO quando pedirem dark/neon/gamer: fundo escuro, UMA cor de destaque forte (neon), titulos GRANDES em CAIXA ALTA com a fonte display condensada (className "font-display font-black uppercase tracking-tight"), muito contraste; (d) EDITORIAL / PORTFOLIO / AGENCIA PREMIUM (estilo estudio cinematografico — para sofisticacao, portfolio, servico criativo): pode ser CLARO (fundo off-white/creme com texto quase preto e UM acento) OU escuro — so va no escuro se a pessoa pedir; o que faz o premium e a TIPOGRAFIA e o respiro, nao a cor do fundo. Titulos ENORMES misturando a display em CAIXA ALTA com UMA palavra/frase em SERIF ITALICA ("font-serif italic") pra contraste elegante (ex.: "EU ESCREVO CODIGO / para resolver."); eyebrows curtos em CAIXA ALTA com tracking largo no acento; MUITO respiro; ambiente sutil no fundo do Hero (RadarRings + GlowSpot — ajuste a cor pro fundo claro). Combine paleta (theme.css) e fontes ao segmento — NUNCA cara de template padrao.

TIPOGRAFIA (o que mais separa "top" de amador): escala grande e intencional; Hero com titulo gigante (use clamp) na display; destaque 1 palavra/frase em "font-serif italic" pra contraste; eyebrows pequenos em CAIXA ALTA com tracking largo no acento; corpo em Inter com largura de leitura confortavel. A fonte serif (Instrument Serif) ja esta carregada e disponivel como "font-serif".

BLOCOS EDITORIAIS (monte quando o estilo (d) combinar — e o que da cara de estudio premiado): (1) MARQUEE de palavras-chave: <LogoMarquee items={["SERVICO A","SERVICO B",...]} /> como faixa de termos deslizando logo apos o Hero; (2) ESPECIALIDADES NUMERADAS: lista 01, 02, 03... (numero grande no acento + titulo) em vez de 4 cards iguais; (3) CITACAO + STATS: frase-manifesto grande entre aspas + atribuicao, com uma linha de stats (BASE / FOCO / METODO / ENTREGA); (4) TIMELINE: etapas (ano + marco) revelando ao rolar.
BLOCOS DE LOJA / MARCA em src/components/fx/ (para landing de loja, catalogo, gamer, produto):
- AnnouncementBar (export default) — <AnnouncementBar items={["...","..."]} />: faixa de promocoes deslizando no TOPO da pagina (acima do header).
- StatCounter (export default) — <StatCounter to={99} suffix=" FPS" className="font-display text-4xl font-black" />: numero que sobe animado ao aparecer; use na faixa de numeros/prova.
- ProductCard (export default) — <ProductCard subtitle="PC GAMER" title="..." specs={["RTX 5060","16GB"]} price="R$ 2.580" oldPrice="R$ 2.980" installment="12x de R$ 215" badge="-10%" cta="Ver detalhes" />: card de produto pronto (grade responsiva). So use precos/specs plausiveis; nao invente selo.
Use a fonte display (font-display) nos titulos quando a marca pedir impacto; corpo continua Inter.

ESTILO (Tailwind + tokens do kit): bg-background, text-foreground, bg-card, text-muted-foreground, border-border, bg-primary, text-primary-foreground. rounded-lg/rounded-xl, shadow.
PALETA UNICA (src/theme.css) — identidade propria do segmento; NUNCA igual a outro projeto. Formato EXATO (so troque valores):
:root{--background:#..;--foreground:#..;--card:#..;--card-foreground:#..;--muted:#..;--muted-foreground:#..;--border:#..;--input:#..;--primary:#..;--primary-foreground:#..;--accent:#..;--ring:#..;--radius:0.9rem;}
Contraste bom: texto legivel sobre o fundo; --primary-foreground legivel sobre --primary.

ESTRUTURA DA PAGINA (secoes como componentes, montadas na Home):
1. Header enxuto (fixo): marca + 3-4 links ancora + CTA primario. No mobile vira um menu compacto.
2. Hero de impacto: eyebrow especifico, titulo grande (para quem / qual resultado / por que agir agora), subtitulo, 2 CTAs (primario + secundario) e uma prova visual.

IMAGENS (o site NAO pode ficar vazio/amador — use em hero, galeria, cards de servico/produto, equipe, depoimentos):
- FOTOS DO TEMA, GERADAS POR IA (preferido — combinam com o negocio): https://image.pollinations.ai/prompt/DESCRICAO_EM_INGLES?width=LARGURA&height=ALTURA&nologo=true&seed=NUMERO — a DESCRICAO e especifica e fotografica, em ingles, com espacos como %20 (ex.: https://image.pollinations.ai/prompt/modern%20barbershop%20interior%20warm%20light%20professional%20photo?width=1200&height=800&nologo=true&seed=11). Uma descricao e seed DIFERENTES por imagem.
- SEMPRE com fallback, porque a geracao pode demorar/falhar: onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "https://picsum.photos/seed/FALLBACK/LARGURA/ALTURA"; }} + width, height, alt e loading="lazy" (no hero use loading="eager"). Coloque a <img> dentro de um container com fundo neutro (bg-muted) e aspect-ratio fixo, pra nao "pular" o layout enquanto carrega.
- AVATARES/PESSOAS (depoimentos, equipe): https://i.pravatar.cc/160?img=NUMERO (1 a 70).
- Diga no texto/README que sao imagens temporarias para a pessoa trocar pelas reais.
- Nunca use logos/fotos de marcas reais nem personagens conhecidos — so imagens genericas. Mockups de UI (dashboard, telas do app) continue fazendo em CSS/SVG.
3. Faixa de confianca: numeros/credenciais/logos SO se fornecidos (nao invente selos, avaliacoes ou metricas).
4. Beneficios (3-4) orientados a RESULTADO, com icones lucide-react — nunca 4 cards identicos em fila.
5. Como funciona em 3 passos claros.
6. Prova social: depoimentos especificos e naturais (pode usar avatares placeholder de i.pravatar.cc ou ui-avatars; ou iniciais em circulo).
7. Oferta/planos com preco/prazo SO quando fornecidos; destaque um plano recomendado; microcopy honesta de reducao de risco.
8. FAQ com as objecoes REAIS do publico.
9. CTA final forte + footer com contato, horario e links que existem.

DESIGN (mega profissional): tipografia com escala e peso intencionais; respiro generoso; grids assimetricos e ritmo variado (evite sequencia monotona de cards); profundidade com gradientes sutis, sombras em camadas, bordas finas e glass quando couber; revelacao suave no scroll (IntersectionObserver inline, com fallback que deixa tudo visivel); hover e microinteracoes discretas; respeite prefers-reduced-motion. Se ficar com cara de template generico de IA, refaca a direcao visual.

RESPONSIVO impecavel: 375 / 768 / 1024+. Header colapsa no mobile; nada estoura a tela; alvos de toque >= 44px.

CONVERSAO: um unico objetivo claro (agendar/comprar/falar no WhatsApp) — tudo conduz a ele. CTAs especificos ("Quero meu orcamento", "Agendar visita", "Falar no WhatsApp"), nunca "Clique aqui"/"Enviar". Todo href de ancora (#secao) aponta para um id que existe. Copy em portugues do Brasil, especifica; sem lorem ipsum; nao invente preco, telefone, endereco ou selo.

FUNCIONALIDADE: botoes e ancoras funcionam; formulario (se houver) valida e da feedback. SEM REFERENCIA QUEBRADA: defina/importe tudo que usar (funcao inexistente = tela branca). IMPORTS OBRIGATORIOS: TODO icone lucide (ex.: <ChevronDown/>, <Menu/>, <ArrowRight/>) PRECISA estar no "import { ... } from \\"lucide-react\\"" do topo do MESMO arquivo; TODO componente fx/ e ui/ que voce usar PRECISA ter seu import default/nomeado no topo. Usar <ChevronDown/> sem importar = "ChevronDown is not defined" = TELA PRETA. Antes de fechar cada arquivo, confira: todo nome em CamelCase usado no JSX tem um import. SINTAXE JSX PERFEITA: balanceie ( ) { } [ ] e feche TODAS as tags — um simbolo a mais derruba o build inteiro na Vercel.

FORMATO DE SAIDA (obrigatorio): ===FILE: caminho=== conteudo cru ===END===. Sem markdown, sem texto fora dos blocos. SEMPRE inclua src/App.jsx e src/theme.css.

Ao receber um ajuste, devolva os arquivos com a mudanca aplicada, preservando o que ja estava bom.`;

/**
 * KITS: orientacoes por vertical. Sao prepostas ao pedido do usuario quando ele
 * escolhe um modelo. Todos sao apps (micro-SaaS) montados sobre o kit React/Vite.
 * Servem para o app nascer com as telas e entidades certas do nicho, sem depender
 * de o usuario descrever tudo.
 */
export const KITS = {
  agendamento: `Este e um KIT DE AGENDAMENTO COMPLETO = um SITE PUBLICO de agendamento + um CRM (painel admin), no MESMO app React, compartilhando os MESMOS dados. O que o cliente marca no site aparece na agenda do admin.

DADOS (colecoes): servicos {id, nome, duracao_min, preco}; profissionais {id, nome, especialidade}; clientes {id, nome, telefone, email}; agendamentos {id, cliente_nome, cliente_telefone, servico_id, profissional_id, data (YYYY-MM-DD), hora (HH:mm), status, criado_em}; config {horario_abre, horario_fecha, dias_semana}. Status do agendamento: "agendado" | "confirmado" | "concluido" | "cancelado".
CAMADA DE DADOS: use o store pronto src/lib/useStore.js — import { useStore, novoId } from "./lib/useStore" (ajuste o caminho relativo). Ex.: const [agendamentos, setAgendamentos] = useStore("agendamentos", []); e para criar: setAgendamentos(prev => [...prev, { id: novoId(), ...dados }]). TODAS as telas (site e admin) leem/gravam pelas MESMAS chaves ("servicos", "profissionais", "clientes", "agendamentos", "config"), por isso o agendamento feito no site aparece no admin. SEMEIE dados de exemplo (3-4 servicos com preco/duracao, 2 profissionais, horario 09:00-18:00) na primeira carga, para funcionar na hora. (Se o Supabase estiver ligado, pode usar ele no lugar do store; mas o padrao e o useStore.)

ROTAS (um unico <Routes> no src/App.jsx):
- "/" = SITE PUBLICO: landing bonita do negocio (hero + servicos + prova social) com CTA grande "Agendar horario".
- "/agendar" = FLUXO DE AGENDAMENTO em passos: 1) escolher SERVICO, 2) escolher PROFISSIONAL, 3) escolher DATA (calendario), 4) escolher HORARIO (so os horarios LIVRES — gere os slots a partir de config.horario_abre/fecha e da duracao do servico, e remova os que ja estao ocupados para aquele profissional/data), 5) dados do cliente (nome + telefone), 6) CONFIRMACAO. Ao confirmar, cria o agendamento com status "agendado". PENSADO PARA LEIGOS/IDOSOS: textos grandes, 1 decisao por tela, botoes grandes, voltar sempre visivel.
- "/admin" = LOGIN simples do dono (usuario/senha num form; pode validar contra um admin fixo no front ou Supabase Auth; guarde "logado" no store).
- "/admin/..." = CRM PROTEGIDO (so logado): DASHBOARD (resumo do dia: proximos agendamentos, total do dia, por status), AGENDA (visao do dia/semana com os horarios marcados por profissional), AGENDAMENTOS (lista com filtro por data/status + mudar status + criar/editar manual + cancelar), CLIENTES (lista + historico de agendamentos da pessoa), SERVICOS (CRUD preco/duracao) e PROFISSIONAIS (CRUD). Use uma sidebar fixa de painel.

LIGACAO (o mais importante): o site publico e o admin usam as MESMAS colecoes do useStore — nao crie dois conjuntos de dados. Um agendamento criado em "/agendar" TEM que aparecer na AGENDA e em AGENDAMENTOS do admin automaticamente.
Entregue tudo caprichado e funcional: validar o form, impedir marcar horario ocupado, formatar preco em R$ e datas em pt-BR.`,
  delivery: `Este e um CARDAPIO DIGITAL + DELIVERY (restaurante, lanchonete, pizzaria, acai, doceria) = CARDAPIO PUBLICO + PAINEL DO DONO no mesmo app, com os MESMOS dados (useStore: "categorias", "produtos", "pedidos", "config").
- "/" CARDAPIO: capa com logo/nome, horario e status aberto/fechado; abas/chips de CATEGORIA fixas no topo; cards de produto com FOTO, nome, descricao curta, preco em R$ e botao "+". Produto pode ter OPCIONAIS/adicionais (ex.: tamanho, borda, extras) num MODAL ao tocar.
- CARRINHO em gaveta lateral (mobile: barra fixa no rodape com total e "Ver carrinho"); alterar quantidade, observacao por item, subtotal, taxa de entrega e total.
- CHECKOUT: nome, telefone, entrega ou retirada, endereco, forma de pagamento (Pix, cartao na entrega, dinheiro + troco). Ao finalizar: grava em "pedidos" (status "recebido") E abre o WhatsApp do estabelecimento com a mensagem do pedido formatada (wa.me/NUMERO?text=...).
- "/admin": login simples; PEDIDOS em colunas (recebido, preparando, saiu para entrega, entregue) movendo o status; PRODUTOS e CATEGORIAS (CRUD em modal, ativar/pausar item); CONFIG (nome, WhatsApp, taxa, horario).
SEMEIE 3 categorias e 8 produtos plausiveis com fotos placeholder para funcionar na hora.`,
  ecommerce: `Esta e uma LOJA ONLINE / CATALOGO = vitrine publica + painel admin, mesmos dados (useStore: "produtos", "categorias", "pedidos", "config").
- "/" VITRINE: banner, categorias, grade de produtos (foto, nome, preco, preco antigo riscado, selo de desconto), BUSCA e FILTROS (categoria, faixa de preco, ordenar).
- "/produto/:id": galeria de fotos, variacoes (tamanho/cor), quantidade, descricao, "Adicionar ao carrinho".
- CARRINHO (gaveta) e CHECKOUT (dados + entrega + pagamento; finalizar grava o pedido e envia pelo WhatsApp quando nao houver gateway).
- "/admin": DASHBOARD (vendas, pedidos, ticket medio), PRODUTOS (CRUD em modal com estoque), PEDIDOS (status), CATEGORIAS.
SEMEIE 8-12 produtos plausiveis com fotos placeholder.`,
  membros: `Esta e uma AREA DE MEMBROS / PLATAFORMA DE CURSOS, com papeis "aluno" e "admin" (useStore: "cursos", "modulos", "aulas", "alunos", "progresso", "sessao").
- "/" pagina de vendas do curso (beneficios, modulos, depoimentos, garantia, CTA) e "/login".
- "/app" (aluno logado): DASHBOARD com cursos e % concluida; "/app/curso/:id" com lista de MODULOS > AULAS na lateral e PLAYER (video do YouTube/Vimeo por embed) + descricao + materiais + botao "Marcar como concluida" que atualiza a barra de progresso; proxima aula automatica.
- "/admin": CURSOS, MODULOS, AULAS (CRUD em modal, reordenar), ALUNOS (liberar/bloquear acesso), e visao de progresso por aluno.
Login: Supabase Auth se estiver ligado; senao, login simples guardado no store. SEMEIE 1 curso com 3 modulos e 8 aulas.`,
  crm: `Este e um CRM DE VENDAS (useStore: "contatos", "negocios", "etapas", "atividades").
- DASHBOARD: valor no funil, negocios ganhos/perdidos no mes, taxa de conversao, proximas atividades.
- FUNIL em KANBAN por etapas (Lead, Contato, Proposta, Negociacao, Ganho, Perdido): cards com nome, valor em R$, responsavel e dias parado; mover entre colunas (arrastar ou menu "Mover para"); clicar abre o DETALHE em modal/painel lateral com historico.
- CONTATOS: tabela com busca, filtros e tags; cadastro/edicao em MODAL; historico de interacoes.
- ATIVIDADES/TAREFAS: lista com data, tipo (ligacao, reuniao, email) e concluir.
Sidebar fixa de painel. SEMEIE 10 contatos e 8 negocios espalhados nas etapas.`,
  financeiro: `Este e um CONTROLE FINANCEIRO (useStore: "lancamentos", "categorias", "contas").
- DASHBOARD: saldo, entradas e saidas do mes, grafico de barras por mes e de pizza por categoria FEITOS EM CSS/SVG (sem lib de grafico), alertas de contas a vencer.
- LANCAMENTOS: tabela filtravel (periodo, tipo, categoria), novo lancamento em MODAL (receita/despesa, valor, categoria, data, pago/pendente, recorrente).
- CATEGORIAS com cor; CONTAS (carteira, banco); RELATORIO por periodo exportavel (CSV gerado no front).
Valores em R$ (Intl.NumberFormat pt-BR). SEMEIE 3 meses de lancamentos plausiveis.`,
  estoque: `Este e um GESTOR DE ESTOQUE (useStore: "produtos", "movimentos", "fornecedores").
- DASHBOARD: total de itens, valor em estoque, produtos abaixo do minimo (alerta vermelho), ultimas movimentacoes.
- PRODUTOS: tabela com SKU, nome, quantidade, minimo, custo e preco; CRUD em MODAL; badge de status (ok / baixo / zerado).
- ENTRADAS e SAIDAS: registrar movimento em modal (atualiza a quantidade do produto) e historico filtravel.
- FORNECEDORES (CRUD). SEMEIE 12 produtos e alguns movimentos.`,
  gerador_imagem: `Este e um GERADOR DE IMAGENS COM IA (funciona DE VERDADE e de graca, sem chave).
- Geracao: monte a URL https://image.pollinations.ai/prompt/{PROMPT_CODIFICADO}?width=W&height=H&seed=SEED&nologo=true&model=flux e use como src de <img> (encodeURIComponent no prompt). A imagem leva alguns segundos: mostre um SKELETON animado ate o onLoad; trate onError com mensagem e botao "Tentar de novo".
- TELA PRINCIPAL: campo de prompt grande, chips de ESTILO (fotorealista, anime, 3D, aquarela, cinematografico, logo minimalista) que acrescentam termos ao prompt, seletor de PROPORCAO (1:1, 16:9, 9:16, 4:3 -> width/height), quantidade (1-4 variacoes com seeds diferentes) e botao "Gerar".
- RESULTADOS em grade; cada imagem com BAIXAR (fetch -> blob -> download), copiar link, "variar" (nova seed) e salvar na GALERIA (useStore "galeria").
- "/galeria" com o historico salvo. Visual de produto de IA moderno (escuro, cards com brilho sutil).`,
  gerador_video: `Este e um GERADOR DE VIDEOS COM IA. Geracao de video exige um provedor pago (ex.: Replicate, fal.ai, Luma, Runway) — NUNCA coloque chave secreta no front.
- Arquitetura: o front chama uma Supabase EDGE FUNCTION ("gerar-video") que guarda a chave do provedor como secret e retorna o id do job; o front faz POLLING do status ate ficar pronto e mostra o <video>. Se o Supabase/chave nao estiver configurado, mostre uma tela clara "Configure sua chave do provedor" com o passo a passo (o app NAO pode quebrar sem a chave).
- TELA: prompt, imagem inicial opcional (upload -> image-to-video), duracao, proporcao, estilo; botao "Gerar video"; barra de progresso com etapas; resultado com player, baixar e salvar na galeria (useStore "videos").
- Inclua tambem um modo GRATIS que funciona sem chave: "Slideshow com IA" — gera 4-6 imagens pelo Pollinations (https://image.pollinations.ai/prompt/...) e anima como video (transicoes CSS Ken Burns) com texto sobreposto.`,
  chat_ia: `Este e um ASSISTENTE / CHATBOT COM IA (atendimento, tira-duvidas, agente de vendas).
- Interface de chat moderna: bolhas, digitando..., markdown basico, sugestoes de perguntas, historico de conversas na lateral (useStore "conversas").
- A IA responde via uma Supabase EDGE FUNCTION ("chat") que guarda a chave do modelo como secret (nunca no front). Sem Supabase/chave: modo DEMO com respostas pre-programadas por palavra-chave para o app funcionar na hora.
- CONFIG do assistente: nome, persona, base de conhecimento (texto/FAQ que vai no system prompt), cor; e um WIDGET embutivel (botao flutuante) para colocar em outros sites.`,
  link_bio: `Este e um LINK NA BIO (estilo Linktree premium). Pagina unica mobile-first: avatar, nome, bio, icones sociais, botoes de link grandes com icone (WhatsApp, Instagram, loja, agenda), destaque de oferta, galeria/embed de video e rodape. Painel "/admin" para editar links (CRUD em modal, reordenar, ativar/desativar) e tema (cores, fundo com gradiente/foto). Dados em useStore "perfil" e "links".`,
  portfolio: `Este e um PORTFOLIO PROFISSIONAL (designer, fotografo, dev, arquiteto, agencia). Hero com nome e frase forte, sobre, especialidades, PROJETOS em grade com filtro por categoria e pagina de detalhe (galeria, desafio, solucao, resultado), depoimentos, clientes, contato (form + WhatsApp). Direcao editorial premium (tipografia grande, muito respiro, animacao de entrada nos cards). Painel "/admin" opcional para cadastrar projetos (useStore "projetos").`,
  imobiliaria: `Este e um site/sistema de IMOBILIARIA (useStore "imoveis", "leads"). Busca com filtros (comprar/alugar, cidade, bairro, preco, quartos), grade de imoveis (foto, preco, area, quartos, vagas), pagina do imovel (galeria, caracteristicas, mapa por embed, botao WhatsApp/agendar visita que grava um lead), e "/admin" com IMOVEIS (CRUD em modal, destaque, status disponivel/vendido) e LEADS. SEMEIE 9 imoveis.`,
  academia: `Este e um sistema de ACADEMIA / PERSONAL / ESTUDIO FITNESS (useStore "alunos", "planos", "treinos", "checkins", "pagamentos"). Site publico com planos e aula experimental; painel com ALUNOS (ficha, plano, vencimento, status), TREINOS montados por aluno (exercicios, series, repeticoes), CHECK-IN, FINANCEIRO de mensalidades (pago/atrasado) e DASHBOARD (ativos, inadimplentes, check-ins do dia). Area do aluno ve o proprio treino.`,
  quiz: `Este e um QUIZ / FUNIL DE CAPTURA. Fluxo de perguntas uma por tela (barra de progresso, opcoes em cards grandes, animacao entre passos), resultado personalizado por pontuacao/perfil, captura de lead (nome, WhatsApp, email) antes do resultado e CTA final. Painel "/admin" para editar perguntas/resultados e ver os LEADS em tabela exportavel (CSV). Dados em useStore "quiz" e "leads".`,
  eventos: `Este e um site de EVENTO / INGRESSOS (useStore "lotes", "inscricoes"). Landing do evento (data, local com mapa por embed, programacao, palestrantes, contagem regressiva), lotes de ingresso com preco e vagas, inscricao em passos gerando um INGRESSO com QR code (gere o QR via https://api.qrserver.com/v1/create-qr-code/?data=...), e "/admin" com inscritos, check-in por codigo e totais.`
};

// Detecta o nicho pelo pedido e devolve a chave do KIT (ou null). A ordem importa:
// do mais especifico para o mais generico.
export function detectarKit(texto) {
  const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const regras = [
    ["gerador_video", /\b(gera(dor|r)?|criar?|cria|faz|faca)\b[^.]{0,30}\bvideos?\b|\bvideo\s*(com|por)\s*ia\b|\btext[o]?\s*(para|pra|to)\s*video\b/],
    ["gerador_imagem", /\b(gera(dor|r)?|criar?|cria|faz|faca)\b[^.]{0,30}\b(imagens?|fotos?|artes?|logos?)\b[^.]{0,20}\b(ia|inteligencia)\b|\bimagens?\s*(com|por)\s*ia\b|\b(text[o]?\s*(para|pra|to)\s*imagem|ai image)\b/],
    ["chat_ia", /\b(chatbot|chat\s*bot|assistente\s*(virtual|de ia|com ia)?|agente\s*de\s*(ia|atendimento|vendas)|atendimento\s*(com|por)\s*ia)\b/],
    ["agendamento", /\b(agendament|agenda(r|mento)?\b|marcar\s*horario|horarios?\s*disponiveis|barbearia|salao|manicure|clinica|consultorio|estetica|pilates|fisioterap|dentista|psicolog|tatuag)\b/],
    ["delivery", /\b(cardapio|delivery|lanchonete|hamburgueria|pizzaria|restaurante|acai|marmit|doceria|confeitaria|pedido\s*(pelo|no)\s*whats)\b/],
    ["membros", /\b(area\s*de\s*membros|plataforma\s*de\s*cursos?|curso\s*online|ead|aulas?\s*em\s*video|alunos?\s*e\s*aulas)\b/],
    ["imobiliaria", /\b(imobiliaria|imoveis|corretor(a)?\s*de\s*imoveis|aluguel\s*de\s*casas?)\b/],
    ["academia", /\b(academia|personal\s*trainer|crossfit|studio\s*fitness|treinos?\s*de\s*alunos)\b/],
    ["eventos", /\b(evento|ingressos?|inscricoes?\s*(do|para)\s*evento|congresso|workshop\s*presencial)\b/],
    ["quiz", /\b(quiz|funil\s*de\s*captura|questionario|teste\s*de\s*perfil)\b/],
    ["link_bio", /\b(link\s*na\s*bio|linktree|bio\s*do\s*instagram)\b/],
    ["portfolio", /\b(portfolio|portifolio)\b/],
    ["ecommerce", /\b(loja\s*(online|virtual)?|e-?commerce|catalogo\s*de\s*produtos|vender\s*produtos)\b/],
    ["crm", /\b(crm|funil\s*de\s*vendas|pipeline|kanban\s*de\s*vendas|leads?\s*e\s*clientes)\b/],
    ["financeiro", /\b(financeiro|financas|fluxo\s*de\s*caixa|controle\s*de\s*gastos|contas\s*a\s*pagar)\b/],
    ["estoque", /\b(estoque|inventario|almoxarifado)\b/]
  ];
  for (const [kit, re] of regras) if (re.test(t)) return kit;
  return null;
}

// Pedido de CLONE de pagina? Devolve a URL a clonar (ou null).
export function urlParaClonar(texto) {
  const t = String(texto || "");
  const m = t.match(/https?:\/\/[^\s"'<>)]+/i);
  if (!m) return null;
  return /\b(clon|copi|igual|replic|recri|inspirad|baseado|parecido|mesmo\s*(estilo|layout|design))/i.test(t) ? m[0] : null;
}

// Le a pagina-alvo como markdown (estrutura, textos, menus, imagens) por um
// leitor publico com CORS liberado. Sem servidor proprio. Falha -> null.
export async function lerPaginaReferencia(url) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch("https://r.jina.ai/" + url, { headers: { "X-Return-Format": "markdown", "X-With-Images-Summary": "true" }, signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const txt = await r.text();
    return txt.slice(0, 14000);
  } catch { return null; }
}

/**
 * Separa a resposta multi-arquivo em { caminho: conteudo }.
 * Cada modelo formata de um jeito, entao aceitamos varios padroes comuns:
 *   ===FILE: caminho===  ...  ===END===
 *   ```jsx path/arquivo.jsx  ...  ```
 *   // File: caminho   /  # File: caminho   /   **caminho**
 * Assim uma resposta boa nao e descartada so por causa do formato.
 */
export function parseFiles(text) {
  const files = {};
  if (!text) return files;
  const bruto = String(text);

  const limpar = p => String(p).trim()
    .replace(/^[`"'*\s]+|[`"'*\s:]+$/g, "")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "");

  const valido = p => p && /\.[a-z0-9]{1,6}$/i.test(p) && p.length < 120 && !/\s{2,}/.test(p);

  // 1) formato preferido: ===FILE: x=== ... ===END===
  let t = bruto.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "");
  const reMarcador = /===\s*FILE:\s*(.+?)\s*===\s*\n([\s\S]*?)\n?===\s*END\s*===/gi;
  let m;
  while ((m = reMarcador.exec(t)) !== null) {
    const p = limpar(m[1]);
    if (valido(p)) files[p] = m[2].replace(/\s+$/, "") + "\n";
  }
  if (Object.keys(files).length) return files;

  // 2) blocos de codigo com o caminho na cerca: ```jsx src/App.jsx
  const reCerca = /```[a-z0-9]*[ \t]+([^\n`]+)\n([\s\S]*?)```/gi;
  while ((m = reCerca.exec(bruto)) !== null) {
    const p = limpar(m[1]);
    if (valido(p)) files[p] = m[2].replace(/\s+$/, "") + "\n";
  }
  if (Object.keys(files).length) return files;

  // 3) caminho anunciado numa linha, seguido de bloco de codigo
  //    (// File: x, # File: x, **x**, ### x, "Arquivo: x")
  const reAnuncio = /(?:^|\n)[ \t]*(?:\/\/|#{1,4}|\*\*|--)?\s*(?:file|arquivo|filename|path)?\s*:? *[`*]*([\w./-]+\.[a-z0-9]{1,6})[`*]*\s*\n+```[a-z0-9]*\n([\s\S]*?)```/gi;
  while ((m = reAnuncio.exec(bruto)) !== null) {
    const p = limpar(m[1]);
    if (valido(p)) files[p] = m[2].replace(/\s+$/, "") + "\n";
  }

  return files;
}

/**
 * Extrai as rotas declaradas no projeto, para mostrar no chat (estilo vibe-code).
 * Entende JSX (<Route path="..."/>) e config de objeto (createBrowserRouter([{path}])).
 * Marca rotas protegidas (ProtectedRoute/PrivateRoute) e o papel (requiredRole).
 * Retorna [{ path, protected, role }].
 */
export function extractRoutes(files) {
  const out = [];
  const seen = new Set();
  const add = (rawPath, prot, role) => {
    let p = String(rawPath || "").trim();
    if (!p) return;
    if (p === "*") p = "*";
    if (seen.has(p)) {
      if (prot) { const e = out.find(r => r.path === p); if (e) { e.protected = true; if (role) e.role = role; } }
      return;
    }
    seen.add(p);
    out.push({ path: p, protected: Boolean(prot), role: role || "" });
  };

  for (const [file, content] of Object.entries(files || {})) {
    if (!/\.(jsx?|tsx?)$/i.test(file)) continue;
    const c = String(content);
    // So arquivos que tem cara de roteador, para nao pegar {path:} de outras coisas.
    if (!/react-router|<Route\b|createBrowserRouter|RouterProvider|useRoutes/i.test(c)) continue;

    // JSX: <Route path="..." element={...} ...>
    const reJsx = /<Route\b([^>]*?)\/?>/gi;
    let m;
    while ((m = reJsx.exec(c)) !== null) {
      const attrs = m[1] || "";
      const pm = attrs.match(/\bpath\s*=\s*["'`]([^"'`]+)["'`]/i);
      if (!pm) continue;
      const prot = /ProtectedRoute|PrivateRoute|RequireAuth|requireAuth|requiredRole/i.test(attrs);
      const rm = attrs.match(/requiredRole\s*=\s*["'`]([^"'`]+)["'`]/i);
      add(pm[1], prot, rm ? rm[1] : "");
    }

    // Config de objeto: { path: "...", element: ... }
    const reObj = /\{[^{}]*\bpath\s*:\s*["'`]([^"'`]+)["'`][^{}]*\}/gi;
    while ((m = reObj.exec(c)) !== null) {
      const block = m[0];
      const prot = /ProtectedRoute|PrivateRoute|RequireAuth|requiredRole/i.test(block);
      const rm = block.match(/requiredRole\s*:\s*["'`]([^"'`]+)["'`]/i);
      add(m[1], prot, rm ? rm[1] : "");
    }
  }
  return out;
}

/**
 * Injeta a URL e a anon key no projeto gerado, para ele ja nascer conectado.
 *
 * Detalhe critico: o .env fica no .gitignore, entao ele NAO vai para o GitHub
 * nem para a Vercel. Se o codigo dependesse so de import.meta.env, o site
 * publicado ficaria sem chave e o Supabase responderia 401 ("No API key found").
 * Por isso gravamos os valores direto no arquivo do cliente, com a env como
 * preferencia. A anon key e publica por natureza — ela e feita para ficar no
 * front; quem protege os dados sao as policies de RLS.
 */
export function injetarCredenciais(files, { url, anonKey }) {
  if (!url && !anonKey) return files;
  const out = { ...files };

  out[".env"] = `VITE_SUPABASE_URL=${url || ""}\nVITE_SUPABASE_ANON_KEY=${anonKey || ""}\n`;
  out[".env.example"] = `VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n`;

  if (url && anonKey) {
    // Procura QUALQUER arquivo que crie o cliente, nao so src/lib/supabase.js.
    for (const [caminho, conteudo] of Object.entries(out)) {
      if (!/\.(js|jsx|ts|tsx)$/i.test(caminho)) continue;
      if (!/createClient\s*\(/.test(conteudo)) continue;

      let novo = conteudo
        .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, `(import.meta.env.VITE_SUPABASE_URL || "${url}")`)
        .replace(/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g, `(import.meta.env.VITE_SUPABASE_ANON_KEY || "${anonKey}")`)
        .replace(/process\.env\.(?:REACT_APP_|NEXT_PUBLIC_)?SUPABASE_URL/g, `"${url}"`)
        .replace(/process\.env\.(?:REACT_APP_|NEXT_PUBLIC_)?SUPABASE_ANON_KEY/g, `"${anonKey}"`);

      // Se o modelo deixou placeholders (SUA_URL, YOUR_SUPABASE_URL, etc), troca.
      novo = novo
        .replace(/["'](?:SUA_URL|YOUR_SUPABASE_URL|SUPABASE_URL|https:\/\/[a-z0-9-]*\.supabase\.co)["']/gi, `"${url}"`)
        .replace(/["'](?:SUA_CHAVE|SUA_ANON_KEY|YOUR_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY|ANON_KEY)["']/gi, `"${anonKey}"`);

      out[caminho] = novo;
    }
  }

  if (out[".gitignore"] && !/(^|\n)\.env(\n|$)/.test(out[".gitignore"])) {
    out[".gitignore"] += "\n.env\n";
  }
  return out;
}

/**
 * Decide sozinha se o pedido e uma pagina simples (HTML puro, sem backend) ou
 * um projeto completo com banco de dados. A pessoa nao precisa escolher: pedir
 * "uma pagina com um botao" gera HTML; pedir "um formulario que salve" ou "um
 * app de clientes" gera o projeto React conectado ao Supabase.
 */
export function precisaBackend(texto) {
  const t = " " + String(texto || "").toLowerCase() + " ";

  // O pedido explicito da pessoa manda mais que qualquer deteccao. Se ela diz
  // "um unico arquivo", "index.html", "html puro", e isso que ela quer — mesmo
  // que o texto fale em formulario. Sem esta regra, pediamos projeto e a IA
  // devolvia um arquivo so, e nada era aproveitado.
  const arquivoUnico = [
    /\b[uú]nico arquivo\b/, /\bum s[óo] arquivo\b/, /\barquivo [uú]nico\b/,
    /\bsingle[- ]file\b/, /\bum arquivo\b/, /\bindex\.html\b/,
    /\bhtml puro\b/, /\bapenas html\b/, /\bs[óo] html\b/,
    /\bsem banco\b/, /\bsem backend\b/, /\bsem back[- ]end\b/,
    /\bp[áa]gina est[áa]tica\b/, /\blanding page\b/,
    /\bp[áa]gina de vendas\b/, /\bp[áa]gina de captura\b/, /\bp[áa]gina de aquecimento\b/,
    /\bfunil de vendas\b/, /\bfunil\b/, /\bcopy\b/, /\bcopywriting\b/,
    /\bconvers[aã]o\b/, /\blead\b/, /\bleads\b/, /\bctr\b/,
    /\bultra conversiva\b/, /\baltamente conversiva\b/,
    /\blevando para o bot[aã]o\b/, /\bbot[aã]o whatsapp\b/,
    /\befeito card ao rolar\b/, /\bcards ao rolar\b/
  ];
  if (arquivoUnico.some(re => re.test(t))) return false;

  // Produtos que sao inequivocamente aplicativos, mesmo quando a pessoa nao
  // menciona banco, login ou Supabase. Esta verificacao vem antes dos sinais
  // genericos para que "criar um CRM" nunca caia no gerador de landing page.
  const tiposDeAplicativo = [
    /\bcrm\b/, /\bgest[aã]o de relacionamento\b/, /\bpipeline de vendas\b/,
    /\bkanban\b/, /\bbackoffice\b/, /\bback[- ]office\b/,
    /\berp\b/, /\bhelpdesk\b/, /\bcentral de atendimento\b/, /\bgest[aã]o de clientes\b/,
    /\bgest[aã]o de estoque\b/, /\bgest[aã]o financeira\b/, /\bcontrole financeiro\b/,
    /\bportal do cliente\b/, /\b[aà]rea administrativa\b/, /\b[aà]rea logada\b/,
    /\bworkspace\b/, /\bsoftware\b/, /\bweb app\b/, /\baplicativo web\b/
  ];
  if (tiposDeAplicativo.some(re => re.test(t))) return true;

  // Sinais fortes de que precisa guardar/ler dados ou ter contas de usuario.
  const sinais = [
    /\b(formul[áa]rio|form)\b/, /\bcadastr/, /\bsalv(ar|e)\b/, /\bguard(ar|e)\b/,
    /\barmazen/, /\bbanco de dados\b/, /\bsupabase\b/, /\btabela/, /\bregistr(ar|o|os)\b/,
    /\blogin\b/, /\bautentica/, /\bconta de usu[áa]rio\b/, /\busu[áa]rios?\b/,
    /\bpainel\b/, /\bdashboard\b/, /\badmin\b/, /\bcrud\b/, /\bsaas\b/, /\bapp\b/,
    /\baplicativo\b/, /\bsistema\b/, /\bgerenciad/, /\bcontrole de\b/, /\bpedidos?\b/,
    /\bclientes?\b/, /\bprodutos?\b/, /\bestoque\b/, /\bagendamento\b/, /\breserva/,
    /\bcoment[áa]rios?\b/, /\bavalia[çc]/, /\bcarrinho\b/, /\bassinatura\b/,
    /\blista de espera\b/, /\bnewsletter\b/, /\bcontato que salve\b/
  ];
  if (sinais.some(re => re.test(t))) return true;

  const estatico = [
    /\bs[óo] (uma )?p[áa]gina\b/, /\bp[áa]gina simples\b/,
    /\bs[óo] (com )?bot[ãa]o\b/, /\best[áa]tic/
  ];
  if (estatico.some(re => re.test(t))) return false;

  return false;   // na duvida, o caminho leve: pagina unica
}

// Permite trocar de um projeto para uma pagina de marketing sem precisar
// apertar "reset". Um pedido que menciona CRM, dashboard ou outro aplicativo
// continua tendo prioridade e nunca e reduzido a landing page.
export function pedePaginaUnica(texto) {
  const t = " " + String(texto || "").toLowerCase() + " ";
  if (/\b(crm|dashboard|painel|pipeline|kanban|sistema|aplicativo|web app|saas|erp|helpdesk)\b/.test(t)) {
    return false;
  }
  return /\b(landing page|p[aá]gina de vendas|site institucional|p[aá]gina est[aá]tica|html puro|uma p[aá]gina|um site)\b/.test(t);
}

/**
 * Troca os marcadores IMAGEM_N pelo conteudo real da imagem (data URL), em
 * todos os arquivos do projeto. Resolve a limitacao de a IA nao conseguir
 * gravar arquivos binarios: a foto vai embutida no proprio codigo.
 */
export function injetarImagens(files, imagens) {
  if (!imagens?.length) return files;
  const out = { ...files };
  for (const [caminho, conteudo] of Object.entries(out)) {
    if (!/\.(js|jsx|ts|tsx|html|css)$/i.test(caminho)) continue;
    let novo = conteudo;
    imagens.forEach((dataUrl, i) => {
      const n = i + 1;
      // a declaracao que pedimos no prompt
      novo = novo.replace(new RegExp(`["'\`]IMAGEM_${n}_DATA["'\`]`, "g"), JSON.stringify(dataUrl));
      // usos soltos do marcador, com ou sem aspas
      novo = novo.replace(new RegExp(`["'\`]IMAGEM_${n}["'\`]`, "g"), JSON.stringify(dataUrl));
    });
    out[caminho] = novo;
  }
  return out;
}

/**
 * Ajusta a resposta da IA para encaixar no kit: renomeia App.tsx->App.jsx e,
 * se a IA nao gerou a tela inicial, poe um App.jsx minimo (para o build nunca
 * quebrar por falta de src/App.jsx, que o main.jsx importa).
 */
// Alguns prompts (estilo full-stack) fazem a IA gerar client/ + server/ (API
// Node/Express). O SaaS e SO front + Supabase. SO agimos quando REALMENTE ha
// esse split: tiramos o prefixo client/ e descartamos o backend (server/ etc.)
// e os configs do cliente (o starter tem os certos). No caso NORMAL (sem split)
// nao mexemos em NADA — pra nunca descartar um arquivo legitimo por engano.
export function normalizarCaminhos(files) {
  const temSplit = Object.keys(files).some(p => /^(\.?\/)?(client|server|backend)\//i.test(p));
  if (!temSplit) return files;
  const out = {};
  for (const [p0, c] of Object.entries(files)) {
    let p = String(p0).replace(/\\/g, "/").replace(/^\.?\//, "");
    if (/^(server|backend|api)\//i.test(p)) continue;                 // backend: fora
    p = p.replace(/^client\//i, "");                                   // tira o prefixo client/
    if (!p) continue;
    // configs do cliente saem (o starter fornece os certos)
    if (/^package\.json$/i.test(p) || /\.config\.(js|ts|cjs|mjs)$/i.test(p) || /^tsconfig/i.test(p) || /^vercel\.json$/i.test(p)) continue;
    out[p] = c;
  }
  return out;
}

export function normalizarParaKit(files) {
  const out = { ...files };
  if (!out["src/App.jsx"] && out["src/App.tsx"]) { out["src/App.jsx"] = out["src/App.tsx"]; delete out["src/App.tsx"]; }
  if (out["src/App.jsx"]) return out;

  // A IA nao entregou o App.jsx (comum com alguns modelos). Se ela criou paginas,
  // MONTAMOS o roteador a partir delas — assim o sistema nao fica quebrado.
  const pages = Object.keys(out)
    .filter(p => /^src\/pages\/[^/]+\.(jsx?|tsx?)$/i.test(p))
    .map(p => p.split("/").pop().replace(/\.[jt]sx?$/, ""))
    .filter((n, i, a) => a.indexOf(n) === i);

  if (pages.length) {
    const rota = n => /^(home|index|dashboard|inicio|in[ií]cio)$/i.test(n) ? "/" : "/" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    let rotas = pages.map(n => ({ n, path: rota(n) }));
    // Garante exatamente uma rota "/" (a primeira, se nenhuma bater).
    if (!rotas.some(r => r.path === "/")) rotas[0].path = "/";
    const vistos = new Set();
    rotas = rotas.filter(r => (vistos.has(r.path) ? false : vistos.add(r.path)));
    const imports = rotas.map(r => `import ${r.n} from "./pages/${r.n}";`).join("\n");
    const routeEls = rotas.map(r => `      <Route path="${r.path}" element={<${r.n} />} />`).join("\n");
    out["src/App.jsx"] =
`import { Routes, Route } from "react-router-dom";
${imports}

export default function App(){
  return (
    <Routes>
${routeEls}
    </Routes>
  );
}
`;
    return out;
  }

  // Nem paginas vieram: placeholder minimo (para o build nao quebrar).
  out["src/App.jsx"] =
`import { Routes, Route } from "react-router-dom";
function Home(){
  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Projeto</h1>
        <p className="text-muted-foreground">A tela inicial nao foi gerada. Peca um ajuste no chat.</p>
      </div>
    </div>
  );
}
export default function App(){
  return <Routes><Route path="/" element={<Home/>} /></Routes>;
}
`;
  return out;
}

/**
 * Rede de seguranca contra "Could not resolve ./pages/X": se a IA importa um
 * arquivo local (pagina/componente/css) que ela NAO criou, geramos um stub
 * minimo para o build nunca quebrar por arquivo faltando. O stub vira uma tela
 * "Em construcao" (para paginas) — melhor que o site inteiro nao subir.
 */
// Pacotes npm que EXISTEM no projeto (package.json do starter). Qualquer import
// de pacote fora desta lista e neutralizado, para o build na Vercel NUNCA quebrar
// com "failed to resolve import" — a causa #1 de deploy com Erro.
const NPM_PERMITIDOS = new Set([
  "react", "react-dom", "react-router-dom", "lucide-react",
  "@supabase/supabase-js", "clsx", "tailwind-merge", "class-variance-authority",
  "date-fns", "framer-motion", "react-day-picker",
  // ferramentas de build (aparecem nos configs) — NUNCA podem virar stub
  "vite", "@vitejs/plugin-react", "tailwindcss", "autoprefixer", "postcss"
]);
function clausulaParaStubs(clause) {
  const decls = [];
  const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (ns) decls.push(`const ${ns[1]} = __nsStub;`);
  const semNs = clause.replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "");
  const def = semNs.match(/^\s*([A-Za-z_$][\w$]*)\s*(?=,|$|\{)/);
  if (def && def[1]) decls.push(`const ${def[1]} = __fxStub;`);
  const bloco = clause.match(/\{([^}]*)\}/);
  if (bloco) for (const n of bloco[1].split(",")) {
    const nome = n.split(/\s+as\s+/).pop().trim();
    if (nome) decls.push(`const ${nome} = __fxStub;`);
  }
  return decls.join(" ");
}
// Aspas curvas/"inteligentes" no codigo (‘ ’ “ ”) sao um dos
// campeoes de build quebrado — a IA as insere sem querer. Trocamos por aspas
// retas nos arquivos de codigo (seguro: no texto visivel a aspa reta renderiza igual).
export function corrigirSintaxe(files) {
  const out = {};
  for (const [p, c] of Object.entries(files)) {
    if (/\.(jsx?|tsx?|css|html|json)$/i.test(p)) {
      out[p] = String(c)
        .replace(/[‘’‛′]/g, "'")
        .replace(/[“”‟″]/g, '"');
    } else out[p] = c;
  }
  return out;
}

// Ícones lucide-react mais usados pela IA. Se um deles aparece no JSX SEM import,
// a gente adiciona o import sozinho (causa #1 de "X is not defined" = tela branca).
const LUCIDE_COMUNS = new Set(("Scissors ChevronDown ChevronUp ChevronLeft ChevronRight ChevronsRight ChevronsLeft " +
  "ArrowRight ArrowLeft ArrowUp ArrowDown ArrowUpRight MoveRight Menu X Check CheckCircle CheckCircle2 Star Heart " +
  "Home User Users UserPlus UserCheck UserX Settings Search Calendar CalendarDays Clock MapPin Phone PhoneCall Mail " +
  "MessageCircle MessageSquare Send Plus Minus PlusCircle MinusCircle Trash Trash2 Edit Edit2 Edit3 Pencil Save " +
  "Download Upload Share Share2 ExternalLink Link Link2 Eye EyeOff Lock Unlock Bell BellOff Bookmark Tag Tags Filter " +
  "Grid List LayoutGrid LayoutDashboard ShoppingCart ShoppingBag CreditCard DollarSign Wallet Package Truck Gift " +
  "Camera Image ImageIcon Video Music Play Pause Volume2 VolumeX Mic MicOff Wifi Zap Sun Moon Cloud Droplet Flame " +
  "Wind Thermometer Globe Map Navigation Compass Flag Award Trophy Target TrendingUp TrendingDown BarChart BarChart2 " +
  "BarChart3 PieChart LineChart Activity Briefcase Building Building2 Store Factory Coffee Utensils UtensilsCrossed " +
  "Pizza Wine Beer Dumbbell Bike Car Plane Train Bus Ship Rocket Smile Frown ThumbsUp ThumbsDown HelpCircle Info " +
  "AlertCircle AlertTriangle XCircle Loader Loader2 RefreshCw RotateCw MoreHorizontal MoreVertical Copy Clipboard " +
  "File FileText Files Folder FolderOpen Database Server Code Code2 Terminal Cpu Smartphone Tablet Monitor Laptop " +
  "Printer Headphones Watch Key Shield ShieldCheck Fingerprint LogIn LogOut Sparkles Gem Crown Palette Brush Ruler " +
  "Wrench Hammer Lightbulb BookOpen Book GraduationCap Newspaper Megaphone Quote Hash AtSign Percent Instagram " +
  "Facebook Twitter Youtube Linkedin Github Dribbble Figma Chrome Slack Circle Square Triangle Dot CircleDot " +
  "CalendarCheck CalendarClock Timer Hourglass Sunrise Sunset Umbrella Snowflake Leaf Flower Flower2 TreePine " +
  "Sprout Apple Carrot Cake CupSoda Soup Salad IceCream Candy Croissant Egg Fish Beef Drumstick Milk Wheat Scale " +
  "Stethoscope Pill Syringe HeartPulse Activity Baby Accessibility Glasses Shirt ShoppingBasket Receipt BadgeCheck " +
  "BadgePercent Ticket Tickets Armchair Bed BedDouble Bath ShowerHead Sofa Lamp DoorOpen DoorClosed KeyRound " +
  "ParkingCircle Fuel Wrench Cog Settings2 SlidersHorizontal Sliders Power PowerOff Plug PlugZap Wand Wand2 " +
  "Paintbrush Paintbrush2 PaintBucket Pipette Eraser Highlighter Type Bold Italic Underline AlignLeft AlignCenter " +
  "AlignRight AlignJustify ListOrdered ListChecks CheckSquare XSquare PlusSquare Columns Rows Table Kanban " +
  "GanttChart Workflow GitBranch GitCommit GitMerge GitPullRequest Boxes Box Container Component Puzzle Blocks " +
  "Layers Layout PanelLeft PanelRight Sidebar Maximize Maximize2 Minimize Minimize2 Expand Shrink Move Move3d " +
  "MousePointer MousePointer2 Hand Grab Pointer Crosshair Focus Scan ScanLine QrCode Barcode").split(/\s+/).filter(Boolean));
const ROUTER_NOMES = new Set(["Routes", "Route", "Navigate", "Outlet", "NavLink", "Link", "BrowserRouter", "HashRouter"]);

// Nomes que o arquivo "conhece": imports (default/namespace/nomeados) + definidos
// localmente (function/const/let/class). Usado para achar o que foi USADO sem import.
function nomesConhecidos(txt) {
  const set = new Set(["React", "Fragment", "Suspense", "StrictMode", "Children", "Profiler"]);
  for (const m of txt.matchAll(/import\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g)) {
    const clausula = m[1];
    for (const d of clausula.matchAll(/(?:^|,)\s*(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?=,|$|\{)/g)) if (d[1]) set.add(d[1]);
    const bloco = clausula.match(/\{([\s\S]*?)\}/);
    if (bloco) for (const n of bloco[1].split(",")) { const nome = n.split(/\s+as\s+/).pop().trim(); if (nome) set.add(nome); }
  }
  for (const m of txt.matchAll(/\b(?:function|class)\s+([A-Z][\w$]*)/g)) set.add(m[1]);
  for (const m of txt.matchAll(/\b(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) set.add(m[1]);
  // TypeScript: tipos/interfaces/enums tambem contam (ex.: useState<User>).
  for (const m of txt.matchAll(/\b(?:interface|type|enum)\s+([A-Z][\w$]*)/g)) set.add(m[1]);
  ["Array", "Record", "Partial", "Promise", "Map", "Set", "Omit", "Pick", "ReturnType", "HTMLElement", "HTMLDivElement",
   "HTMLInputElement", "HTMLButtonElement", "HTMLFormElement", "HTMLTextAreaElement", "HTMLSelectElement"].forEach(n => set.add(n));
  return set;
}

// Garante que todo <CamelCase> usado no JSX exista: adiciona o import do lucide
// (icones), do react-router-dom (Link/Routes/etc.) ou, se for desconhecido,
// cria um stub local — pra NUNCA mais dar "X is not defined" / tela branca.
export function garantirIconesEComponentes(files) {
  const out = { ...files };
  for (const [path, content] of Object.entries(out)) {
    if (!/\.(jsx|tsx)$/i.test(path)) continue;
    let txt = String(content);
    const conhecidos = nomesConhecidos(txt);
    const usados = new Set();
    for (const m of txt.matchAll(/<([A-Z][A-Za-z0-9]*)(?=[\s/>])/g)) usados.add(m[1]);
    const faltando = [...usados].filter(n => !conhecidos.has(n));
    if (!faltando.length) continue;

    const icones = faltando.filter(n => LUCIDE_COMUNS.has(n) && !ROUTER_NOMES.has(n));
    const router = faltando.filter(n => ROUTER_NOMES.has(n));
    const desconhecidos = faltando.filter(n => !LUCIDE_COMUNS.has(n) && !ROUTER_NOMES.has(n));

    // 1) adiciona icones ao import existente de lucide-react, ou cria um
    if (icones.length) {
      const re = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["'];?/;
      if (re.test(txt)) {
        txt = txt.replace(re, (full, nomes) => `import {${nomes.replace(/\s*$/, "")}, ${icones.join(", ")} } from "lucide-react";`);
      } else {
        txt = `import { ${icones.join(", ")} } from "lucide-react";\n` + txt;
      }
    }
    // 2) adiciona nomes de rota ao import do react-router-dom, ou cria um
    if (router.length) {
      const re = /import\s*\{([^}]*)\}\s*from\s*["']react-router-dom["'];?/;
      if (re.test(txt)) {
        txt = txt.replace(re, (full, nomes) => `import {${nomes.replace(/\s*$/, "")}, ${router.join(", ")} } from "react-router-dom";`);
      } else {
        txt = `import { ${router.join(", ")} } from "react-router-dom";\n` + txt;
      }
    }
    // 3) desconhecidos viram stub local (nao crasha; so nao renderiza nada)
    if (desconhecidos.length) {
      const stubs = desconhecidos.map(n => `const ${n} = (p) => (p && p.children != null ? p.children : null);`).join(" ");
      txt = stubs + "\n" + txt;
    }
    out[path] = txt;
  }
  return out;
}

export function blindarImportsNpm(files, extras = null) {
  const out = { ...files };
  const permitido = (spec) => {
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/") || spec.startsWith("~/")) return true; // local
    const base = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    // extras = dependencias REAIS do package.json do repo (usado nas edicoes)
    return NPM_PERMITIDOS.has(base) || Boolean(extras && extras.has(base));
  };
  for (const [path, content] of Object.entries(out)) {
    // SO arquivos de codigo dentro de src/. NUNCA tocar nos configs da raiz
    // (vite.config.js, tailwind.config.js, etc.) — eles importam ferramentas de
    // build e o stub quebraria o build inteiro (foi exatamente o que aconteceu).
    if (!/^src\//i.test(path)) continue;
    if (!/\.(jsx?|tsx?)$/i.test(path)) continue;
    let txt = String(content), mexeu = false;
    txt = txt.replace(/import\s+([^;]*?)\s+from\s+["']([^"']+)["'];?/g, (full, clause, spec) => {
      if (permitido(spec)) return full;
      mexeu = true;
      return clausulaParaStubs(clause.trim());
    });
    txt = txt.replace(/import\s+["']([^"']+)["'];?/g, (full, spec) => {
      if (permitido(spec)) return full;
      mexeu = true;
      return "";
    });
    if (mexeu) {
      out[path] = `const __fxStub = (p) => (p && p.children != null ? p.children : null);\nconst __nsStub = new Proxy(function(){return null;}, { get: () => __fxStub });\n` + txt;
    }
  }
  return out;
}

// Corrige o ESTILO do import de arquivos LOCAIS para bater com o que o arquivo
// realmente exporta. Causa #1 nova de build quebrado: a IA faz
//   import Button from "./ui/button"   (default)
// mas o arquivo exporta NOMEADO (export function Button). Rollup quebra com
// '"default" is not exported'. Aqui detectamos os exports de cada arquivo e
// convertemos default<->nomeado conforme o necessario.
export function corrigirEstiloImports(files) {
  const norm = (p) => { const parts = []; for (const seg of String(p).split("/")) { if (seg === "." || seg === "") continue; if (seg === "..") parts.pop(); else parts.push(seg); } return parts.join("/"); };
  // 1) mapa de exports por arquivo
  const exp = {};
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(jsx?|tsx?)$/i.test(path)) continue;
    const txt = String(content);
    const named = new Set();
    for (const m of txt.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) named.add(m[1]);
    for (const m of txt.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) named.add(m[1]);
    for (const m of txt.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) named.add(m[1]);
    let hasDefault = false, defaultName = null;
    for (const m of txt.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const n of m[1].split(",")) {
        const parts = n.split(/\s+as\s+/).map(s => s.trim());
        const exported = parts[1] || parts[0];
        if (exported === "default") hasDefault = true;
        else if (exported) named.add(exported);
      }
    }
    const dm = txt.match(/export\s+default\s+(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*))/);
    if (/export\s+default/.test(txt)) { hasDefault = true; defaultName = dm ? (dm[1] || dm[2] || dm[3] || null) : null; }
    exp[path] = { hasDefault, defaultName, named };
  }
  const resolve = (fromPath, spec) => {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
    let base;
    if (spec.startsWith("@/")) base = norm("src/" + spec.slice(2));
    else { const dir = fromPath.split("/").slice(0, -1).join("/"); base = norm((dir ? dir + "/" : "") + spec); }
    for (const v of ["", ".jsx", ".js", ".tsx", ".ts", "/index.jsx", "/index.js", "/index.tsx"]) if (exp[base + v]) return base + v;
    return null;
  };
  // 2) corrige imports
  const out = {};
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(jsx?|tsx?)$/i.test(path)) { out[path] = content; continue; }
    let txt = String(content);
    // default -> nomeado, quando o alvo NAO tem default mas tem o nomeado
    txt = txt.replace(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](\.[^"']+|@\/[^"']+)["'];?/g, (full, name, spec) => {
      const t = resolve(path, spec); const e = t && exp[t];
      if (e && !e.hasDefault && e.named.has(name)) return `import { ${name} } from "${spec}";`;
      return full;
    });
    // nomeado -> default, para o(s) nome(s) que na verdade sao o default do alvo
    txt = txt.replace(/import\s*\{([^}]*)\}\s*from\s+["'](\.[^"']+|@\/[^"']+)["'];?/g, (full, inner, spec) => {
      const t = resolve(path, spec); const e = t && exp[t];
      if (!e) return full;
      const names = inner.split(",").map(s => s.trim()).filter(Boolean);
      const keep = [], asDefault = [];
      for (const n of names) {
        const bare = n.split(/\s+as\s+/)[0].trim();
        if (e.named.has(bare)) keep.push(n);
        else if (e.hasDefault && (e.defaultName === bare || names.length === 1)) asDefault.push(bare);
        else keep.push(n);
      }
      if (!asDefault.length) return full;
      let res = `import ${asDefault[0]} from "${spec}";`;
      if (keep.length) res += `\nimport { ${keep.join(", ")} } from "${spec}";`;
      return res;
    });
    out[path] = txt;
  }
  return out;
}

export function garantirImportsLocais(files) {
  const out = { ...files };
  const norm = (p) => {
    const parts = [];
    for (const seg of p.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  };
  const resolver = (fromPath, spec) => {
    if (spec.startsWith("@/")) return norm("src/" + spec.slice(2));
    if (spec.startsWith("./") || spec.startsWith("../")) {
      const dir = fromPath.split("/").slice(0, -1).join("/");
      return norm((dir ? dir + "/" : "") + spec);
    }
    return null; // dependencia externa (react, lucide-react, etc.)
  };
  const existeJs = (base) =>
    ["", ".jsx", ".js", ".tsx", ".ts", "/index.jsx", "/index.js", "/index.tsx"]
      .some(v => out[base + v] !== undefined);

  const stubs = new Map(); // base -> { default, named:Set }
  for (const [path, content] of Object.entries(out)) {
    if (!/\.(jsx?|tsx?)$/i.test(path)) continue;
    const re = /import\s+([^;]*?)\s+from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(String(content))) !== null) {
      const clause = (m[1] || "").trim();
      const spec = m[2] || m[3];
      const base = resolver(path, spec);
      if (!base) continue;
      if (/\.css$/i.test(spec)) { if (out[base] === undefined) out[base] = ""; continue; }
      if (existeJs(base)) continue;
      const info = stubs.get(base) || { default: false, named: new Set() };
      const named = clause.match(/\{([^}]*)\}/);
      const semNamed = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
      if (semNamed && !semNamed.startsWith("*")) info.default = true;
      if (named) for (const n of named[1].split(",")) {
        const nn = n.trim().split(/\s+as\s+/i)[0].trim();
        if (nn) info.named.add(nn);
      }
      stubs.set(base, info);
    }
  }
  for (const [base, info] of stubs) {
    const p = base + ".jsx";
    if (out[p] !== undefined) continue;
    let stub = "";
    if (info.default) stub += `export default function Placeholder(){ return <div style={{padding:24,fontFamily:"system-ui"}}>Em construção.</div>; }\n`;
    for (const n of info.named) if (n !== "default") stub += `export const ${n} = () => null;\n`;
    out[p] = stub || `export default function Placeholder(){ return null; }\n`;
  }
  return out;
}

/** Gera o projeto micro-SaaS completo. */
// Regras somadas a TODO prompt de criacao. Reduzem a causa #1 de build quebrado
// (sintaxe) e deixam o resultado mais profissional.
const REGRAS_QUALIDADE = `

REGRAS QUE EVITAM BUILD QUEBRADO (siga a risca):
- ASPAS RETAS SEMPRE: use SO ' e " comuns. NUNCA use aspas curvas/"inteligentes" (‘ ’ “ ”) em lugar nenhum do codigo — elas quebram o build. Em palavras com apostrofo escreva reto.
- ARQUIVO COMPLETO: cada arquivo do primeiro ao ultimo caractere, sem "..." nem "resto igual ao anterior". Feche TODAS as tags e, no formato multi-arquivo, o ultimo ===END===.
- SO IMPORTE O QUE EXISTE: react, react-router-dom, lucide-react, @supabase/supabase-js, framer-motion, date-fns e os componentes de src/components/ui/ e src/components/fx/. Todo nome em CamelCase usado no JSX PRECISA ter import no topo do MESMO arquivo (icone sem import = tela branca).
- NAO recrie arquivos de config (package.json, vite.config.js, tailwind.config.js, etc.) — ja existem.

ESTILO (deixa com cara profissional, nao de template):
- Estilize com Tailwind. Use style inline SO para valor dinamico (ex.: uma cor calculada). NUNCA CSS-in-JS nem arquivo .css por componente (o unico CSS e o theme.css/index.css ja existente).
- Responsivo MOBILE-FIRST de verdade (sm: / md: / lg:); nada estoura a tela no celular (320px+).
- Em sistemas/CRM: cadastrar/editar abre em MODAL (pop-up), nao numa tela crua; use badges de status coloridos, estados vazios bonitos ("nenhum X ainda"), e acoes claras. Nada de tela "pelada".

PADRAO DE PRODUTO PRONTO PRA VENDER (o que separa um app de verdade de um rascunho):
- ESTADOS: toda lista/tela tem estado de CARREGANDO (skeleton), VAZIO (icone + frase + botao de acao) e ERRO (mensagem clara + tentar de novo).
- FEEDBACK: toda acao confirma (toast discreto "Salvo!", "Removido" — faca um Toast simples com useState, SEM biblioteca) e acoes destrutivas pedem confirmacao em modal.
- FORMULARIOS: labels visiveis, placeholders uteis, validacao com mensagem embaixo do campo, botao com estado "Salvando..." desabilitado.
- DADOS DE EXEMPLO REALISTAS em pt-BR (nomes, valores, datas) — nunca lorem ipsum. Moeda em R$ com Intl.NumberFormat("pt-BR"), datas em dd/mm/aaaa.
- PERSISTENCIA: o que a pessoa cria NAO some ao recarregar (useStore de src/lib/useStore.js, ou Supabase se ligado).
- ACESSIVEL: contraste bom, foco visivel (focus-visible:ring), botoes com aria-label quando so tem icone, alvos de toque >= 44px.
- MOVIMENTO com proposito: transicoes de 150-300ms em hover/abrir modal; entrada suave dos cards; respeite prefers-reduced-motion.
- Em apps com produtos/servicos/imoveis/pratos, use FOTOS do tema geradas por IA: https://image.pollinations.ai/prompt/DESCRICAO_EM_INGLES?width=800&height=600&nologo=true&seed=N com onError trocando para https://picsum.photos/seed/N/800/600.`;

export async function generateProject({ history, userMessage, images, embedImages = [], providerId = "", mode = "create", currentFiles = null, supabase = {}, kind = "app", brief = "" }, onEvent = () => {}) {
  const baseHistory = [...(history || [])];
  // "site" = pagina de vendas/landing; "app" = sistema/micro-SaaS. Muda so o prompt.
  const systemBase = (kind === "site" ? SYSTEM_SITE_KIT : SYSTEM_MICROSAAS) + REGRAS_QUALIDADE;

  // Imagens que a pessoa quer DENTRO do projeto. A IA nao consegue gravar
  // arquivo binario, entao ela usa marcadores e nos trocamos pelo conteudo
  // real da imagem depois. Assim a foto entra no projeto de verdade, sem a
  // pessoa precisar copiar nada para a pasta public.
  let instrucaoImagens = "";
  if (embedImages.length) {
    const nomes = embedImages.map((_, i) => `IMAGEM_${i + 1}`);
    instrucaoImagens =
`\n\nIMAGENS DA PESSOA: ela anexou ${embedImages.length} imagem(ns) para usar no projeto (logo, foto de capa, banner). Use exatamente estes marcadores como valor de src, entre chaves no JSX: ${nomes.map(n => `src={${n}}`).join(", ")}. Exemplo: <img src={IMAGEM_1} alt="..." className="hero__imagem" />.
Declare os marcadores no topo do arquivo que os usa, assim: const IMAGEM_1 = "IMAGEM_1_DATA";
NUNCA aponte para arquivos como "/foto.jpg" ou "public/imagem.png" para essas imagens — elas nao existem no disco. Use somente os marcadores, que serao trocados pela imagem real.`;
  }

  let userContent = userMessage;
  if (mode === "edit" && currentFiles && Object.keys(currentFiles).length) {
    // So mostramos os arquivos que a IA controla (App, paginas, componentes,
    // theme, supabase). Os arquivos fixos do kit ficam de fora do dump — a IA
    // nao deve reescreve-los e mostra-los so gastaria tokens.
    const dump = Object.entries(currentFiles)
      .filter(([p]) => !(p in STARTER_FILES) || p === "src/theme.css")
      .map(([p, c]) => `===FILE: ${p}===\n${c}===END===`).join("\n\n");
    // O pedido ORIGINAL volta junto. Sem ele, um "conserta isso" num projeto
    // que so tem o placeholder virava uma pagina de outro tema inteiro (foi o
    // caso da pagina de salao que virou loja de computador): o modelo nao tinha
    // nem ideia do que o projeto deveria ser e inventava um do zero.
    const origem = brief && brief.trim()
      ? `PEDIDO ORIGINAL DA PESSOA (este e o tema/negocio do projeto — NUNCA troque por outro):\n${brief.trim()}\n\n`
      : "";
    userContent =
`${origem}Aqui esta o PROJETO ATUAL, que ja existe e funciona:

${dump}

TAREFA: aplique APENAS a mudanca pedida, preservando todo o resto (mesmo tema, mesmas cores, mesmos textos do negocio). Devolva TODOS os arquivos novamente no mesmo formato.

Mudanca pedida: "${userMessage}"`;
  }

  let contexto = supabase.url
    ? `\n\nO projeto Supabase da pessoa ja esta ligado. Escreva o cliente lendo as variaveis de ambiente normalmente; a URL e a chave serao injetadas automaticamente.`
    : `\n\nNao ha Supabase ligado ainda. Escreva o cliente lendo as variaveis de ambiente e deixe o .env.example pronto para a pessoa preencher.`;

  // KIT DO NICHO: blueprint completo (telas, dados, fluxo) para o app nascer
  // certo sem a pessoa descrever tudo. So na CRIACAO de apps.
  if (mode === "create") {
    // Site usa so kits de pagina (uma landing "com agendamento" nao deve
    // virar o sistema completo com painel admin); app usa qualquer kit.
    const KITS_DE_SITE = ["portfolio", "imobiliaria", "link_bio", "eventos", "quiz"];
    const achado = detectarKit(userMessage);
    const kit = kind === "app" || KITS_DE_SITE.includes(achado) ? achado : null;
    if (kit && KITS[kit]) {
      onEvent({ type: "kit", kit });
      contexto += `\n\nKIT DO NICHO (blueprint — siga as telas, dados e fluxos abaixo, adaptando ao negocio da pessoa):\n${KITS[kit]}`;
    }
    // CLONADOR: "clone/igual a https://..." -> le a pagina e usa como referencia.
    const alvo = urlParaClonar(userMessage);
    if (alvo) {
      onEvent({ type: "status", text: `Lendo a página de referência (${alvo.replace(/^https?:\/\//, "").slice(0, 40)})…` });
      const ref = await lerPaginaReferencia(alvo);
      if (ref) {
        onEvent({ type: "clone", url: alvo });
        contexto += `\n\nPAGINA DE REFERENCIA PARA RECRIAR (conteudo lido de ${alvo}):\n"""\n${ref}\n"""\nRECRIE essa pagina em React com a MESMA estrutura de secoes, ordem, hierarquia, tom e tipo de layout (header, hero, blocos, cards, rodape), com visual moderno e acabado. Use os textos da referencia como base, adaptando ao pedido da pessoa. NAO copie logotipos nem marcas registradas de terceiros: use o nome/marca da pessoa (ou um nome generico) e imagens placeholder. Se a pessoa pediu mudancas, aplique-as por cima.`;
      } else {
        onEvent({ type: "notice", text: "Não consegui ler essa página (pode estar bloqueada). Vou criar inspirado no que você descreveu. Dica: anexe um print da página que eu recrio pelo visual." });
      }
    }
  }

  const messages = [...baseHistory, { role: "user", text: userContent, images: images || [] }];

  // GERACAO AO VIVO (streaming): mostra os arquivos surgindo em tempo real.
  // Conforme o texto chega, detecta cada novo bloco ===FILE: caminho=== e avisa
  // a interface ("escrevendo X"). Se o 1o provedor nao for openai-compat ou o
  // stream falhar, cai no complete() normal (sem stream).
  const argsGer = { system: systemBase + contexto + instrucaoImagens, messages, tools: [], preferredProviderId: providerId };
  let reply;
  try {
    let acc = "", ultimoArq = null, nArq = 0;
    const onDelta = (chunk) => {
      acc += chunk;
      const re = /===\s*FILE:\s*([^\n=]+?)\s*===/g;
      let m, ultimo = null;
      while ((m = re.exec(acc)) !== null) ultimo = m[1].trim();
      if (ultimo && ultimo !== ultimoArq) {
        ultimoArq = ultimo; nArq++;
        onEvent({ type: "arquivo_stream", path: ultimo, n: nArq });
      }
    };
    reply = await streamComplete(argsGer, onEvent, onDelta);
  } catch {
    reply = await complete(argsGer, onEvent);
  }

  const semTelasF = f => !f["src/App.jsx"] && !f["src/App.tsx"] &&
    !Object.keys(f).some(p => /^src\/pages\//i.test(p));

  // CONTINUIDADE ENTRE PROVEDORES: se a resposta veio CORTADA (nao fechou o
  // ultimo ===END=== ou ainda faltam telas), pedimos para CONTINUAR de onde
  // parou — SEM recomecar. Como o complete() faz rodizio, a continuacao pode
  // cair em OUTRO provedor: ele recebe tudo que ja foi escrito e completa o
  // projeto a partir dali. Assim um provedor complementa o outro ate terminar.
  const fechouBloco = t => /===END===\s*$/.test(String(t).trimEnd());
  let fullText = reply.text || "";
  let files = normalizarCaminhos(parseFiles(fullText));
  let voltas = 0;
  while (voltas < 3 && (semTelasF(files) || !fechouBloco(fullText))) {
    voltas++;
    onEvent({ type: "continuacao", parte: voltas });
    let cont;
    try {
      cont = await complete(
        {
          system: systemBase + contexto +
            "\n\nCONTINUACAO: voce (ou outra IA) estava gerando um projeto React em blocos ===FILE: caminho=== ... ===END=== e a resposta FOI CORTADA. Continue EXATAMENTE de onde parou, SEM repetir nenhum caractere do que ja foi escrito e SEM comentarios nem introducao. Se parou no meio de um arquivo, termine aquele arquivo primeiro; depois gere os que ainda faltam (src/App.jsx com TODAS as rotas, src/theme.css, e as paginas em src/pages/ — uma por rota, cada uma completa). Feche cada bloco com ===END===. NAO reescreva blocos ja completos.",
          messages: [...messages, { role: "assistant", text: fullText }, { role: "user", text: "Continue de onde parou, sem repetir, ate fechar o ultimo ===END===." }],
          tools: [], preferredProviderId: providerId
        },
        onEvent
      );
    } catch { break; }
    const extra = (cont.text || "").trim();
    if (!extra) break;
    fullText += (fullText.endsWith("\n") ? "" : "\n") + extra;
    files = normalizarCaminhos(parseFiles(fullText));
  }
  reply.text = fullText;

  // ULTIMO RECURSO: se mesmo continuando nao vieram telas, regenera do zero 1x.
  if (semTelasF(files)) {
    onEvent({ type: "html_retry", mode: "projeto" });
    const retry = await complete(
      {
        system: systemBase + contexto + "\n\nRETRY: a resposta anterior veio incompleta (sem as telas). Gere o sistema COMPLETO (4 a 6 telas), bem ordenado. Escreva PRIMEIRO ===FILE: src/App.jsx=== com TODAS as rotas, depois ===FILE: src/theme.css===, depois as paginas em src/pages/ — uma por rota, cada uma completa. Use exatamente ===FILE: caminho=== e ===END===, nada fora dos blocos, e feche o ultimo ===END===.",
        messages, tools: [], preferredProviderId: providerId
      },
      onEvent
    );
    const f2 = normalizarCaminhos(parseFiles(retry.text));
    if (!semTelasF(f2) || Object.keys(f2).length > Object.keys(files).length) {
      files = f2;
      reply.text = retry.text;
    } else if (!Object.keys(files).length) reply.text = retry.text;
  }

  // A IA gerou o essencial? (App.jsx de verdade OU alguma pagina). Se nao, o
  // projeto seria SO o placeholder mudo ("A tela inicial nao foi gerada").
  const semTelas = semTelasF(files);

  // Rede de seguranca: quando faltam telas, mas a resposta veio como uma pagina
  // HTML completa, entregamos a pagina em vez de um projeto sem tela nenhuma.
  // Antes so acontecia se viessem ZERO arquivos — se vinham so package.json e
  // main.jsx, o placeholder ia parar no preview e no deploy.
  if (semTelas) {
    const html = repairGeneratedHtml(extractHtml(reply.text));
    if (isCompleteHtml(html)) {
      return { paginaUnica: true, html, complete: true, provider: reply.providerLabel, model: reply.model };
    }
    onEvent({ type: "notice", text: "A IA nao gerou as telas do sistema — a resposta pode ter sido cortada. Peca de novo, ou troque para Gemini ou gpt-4o (geram projetos maiores sem cortar)." });
  }

  // Encaixa os arquivos da IA no kit estiloso (Tailwind + componentes prontos).
  files = normalizarParaKit(files);
  files = mergeStarter(files);
  files = corrigirEstiloImports(files);   // corrige default<->nomeado conforme o export real
  files = garantirImportsLocais(files);   // cria stubs para imports LOCAIS que faltarem
  files = garantirIconesEComponentes(files); // icone/componente usado sem import -> importa ou stub (evita tela branca)
  files = blindarImportsNpm(files);       // neutraliza imports de pacotes npm nao instalados
  files = corrigirSintaxe(files);         // aspas curvas -> retas (evita build quebrado)
  files = injetarCredenciais(files, supabase);
  files = injetarImagens(files, embedImages);

  return {
    files,
    complete: Boolean(files["src/App.jsx"]) && !semTelas,
    incompleto: semTelas,
    provider: reply.providerLabel,
    model: reply.model
  };
}

/** Extrai o HTML da resposta, tolerando cercas de markdown se a IA insistir. */
export function extractHtml(text) {
  if (!text) return "";
  let t = String(text).trim();
  // Bloco de codigo fechado: pega o conteudo entre as crases.
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) {
    t = fence[1].trim();
  } else {
    // Bloco aberto mas nao fechado (resposta cortada no meio): remove as crases
    // de abertura e segue com o que veio, para nao perder o HTML.
    t = t.replace(/```(?:html)?\s*/i, "").replace(/```\s*$/,"");
  }
  const i = t.search(/<!doctype html>|<html[\s>]/i);
  if (i > 0) t = t.slice(i);
  return t.trim();
}

const SAFETY_CSS = `<style id="copilot-safety-style">
  form { display: grid; gap: 12px; max-width: 620px; }
  form label { display: grid; gap: 6px; font-weight: 650; }
  form input, form select, form textarea { width: 100%; min-height: 44px; padding: 11px 13px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 10px; background: color-mix(in srgb, currentColor 5%, transparent); color: inherit; font: inherit; }
  form textarea { min-height: 110px; resize: vertical; }
  form input:focus, form select:focus, form textarea:focus { outline: 3px solid color-mix(in srgb, currentColor 25%, transparent); outline-offset: 2px; }
  .copilot-embed-fallback { min-height: 240px; display: grid; place-content: center; gap: 8px; padding: 24px; border: 1px dashed color-mix(in srgb, currentColor 30%, transparent); border-radius: 16px; text-align: center; opacity: .82; }
  .copilot-embed-fallback small { opacity: .75; }
  .copilot-avatar-fallback { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, currentColor 16%, transparent); font-weight: 800; }
  .stars, .rating, [class*="stars"], [class*="rating"] { display: flex !important; align-items: center; gap: 4px !important; flex-wrap: wrap; }
  .stars > *, .rating > *, [class*="stars"] > *, [class*="rating"] > * { margin: 0 !important; line-height: 1 !important; }
  .star, .stars, .rating-star, [class*="star"] { color: #d4af37 !important; }
  .stars svg, .rating svg, [class*="star"] svg { width: 18px !important; height: 18px !important; display: inline-block !important; }
  .stars svg *, .rating svg *, [class*="star"] svg * { fill: currentColor !important; stroke: currentColor !important; }
  @media (max-width: 640px) { form { max-width: none; } }
</style>`;

export function repairGeneratedHtml(html) {
  if (!html) return "";
  let repaired = html
    // Placeholders de modelos menores não podem chegar ao cliente final.
    .replace(/\[(?:nome(?:\s+da)?\s+(?:barbearia|empresa|marca)|nome\s+do\s+(?:negócio|negocio|produto)|sua\s+marca)\]/gi, "Sua marca")
    .replace(/\{\{\s*(?:nome|marca|empresa|neg[oó]cio)\s*\}\}/gi, "Sua marca")
    .replace(/\bmapa\s+(?:da|do)\s+(?:barbearia|neg[oó]cio|estabelecimento)\b/gi, "Veja como chegar")
    .replace(/\b(?:selecione|escolha)\s+um\s+servi[cç]o\b/gi, "Selecione uma opção")
    // Remove scripts externos DESCONHECIDOS, mas preserva os seguros e comuns
    // (Tailwind, Google Fonts, AOS) que deixam o site mais bonito. So tiramos
    // o que costuma quebrar: widgets, trackers e fontes de origem duvidosa.
    .replace(/<script\b[^>]*\bsrc=["']([^"']*)["'][^>]*>\s*<\/script>/gi, (full, src) => {
      const seguro = /(cdn\.tailwindcss\.com|unpkg\.com\/aos|fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare\.com|jsdelivr\.net)/i.test(src);
      return seguro ? full : "";
    })
    .replace(/<iframe\b[^>]*(?:google\.com\/maps|maps\.google|youtube\.com|youtube-nocookie)[^>]*>\s*<\/iframe>/gi, '<div class="copilot-embed-fallback" role="img" aria-label="Conteúdo externo indisponível">Conteúdo externo indisponível<small>Use o botão de ação para continuar.</small></div>')
    .replace(/<img\b[^>]*\bsrc=["'][^"']*randomuser\.me[^"']*["'][^>]*>/gi, '<span class="copilot-avatar-fallback" aria-hidden="true">•</span>')
    .replace(/<i\b[^>]*class=["'][^"']*(?:fab|fa-[^"']+|fontawesome|icon)["'][^>]*>\s*<\/i>/gi, '<span class="copilot-avatar-fallback" aria-hidden="true">•</span>');

  if (/<form\b|<input\b|<select\b|<textarea\b/i.test(repaired) && !/copilot-safety-style/i.test(repaired)) {
    repaired = repaired.replace(/<\/head>/i, `${SAFETY_CSS}</head>`);
  }
  return repaired;
}

function isCompleteHtml(html) {
  if (!html) return false;
  const normalized = html.toLowerCase();
  return /<!doctype\s+html\b/.test(normalized) &&
    /<html\b/.test(normalized) &&
    /<head\b/.test(normalized) &&
    /<body\b/.test(normalized) &&
    /<\/body>/.test(normalized) &&
    /<\/html>/.test(normalized);
}

/** Gera ou edita a landing usando o histórico da conversa. */
// Prompt para um UNICO arquivo HTML que NAO e pagina de vendas: jogo, ferramenta,
// animacao, calculadora, etc. (o "faca em html" que a pessoa espera — igual ao
// DeepSeek no chat, que devolve um HTML so, nao 40 arquivos).
export const SYSTEM_HTML_APP = `Voce e um engenheiro front-end senior. Crie um UNICO arquivo HTML completo, funcional e bonito, que roda sozinho ao abrir no navegador — sem build e sem dependencias externas (no maximo um <script src> de CDN publica se for mesmo necessario). Todo o HTML + CSS + JS no MESMO arquivo.

O QUE CONSTRUIR: exatamente o que a pessoa pediu (um jogo, uma ferramenta, uma animacao, uma calculadora...). Se for um JOGO, use <canvas> e requestAnimationFrame, com loop de jogo, controles (teclado e tambem toque no celular), fisica/colisoes, pontuacao, estados (inicio, jogando, game over) e reinicio — tudo funcionando de verdade, jogavel.

QUALIDADE:
- Codigo COMPLETO e sem erro: nada de "// TODO" nem funcao vazia; se usar, defina.
- Visual caprichado: bom contraste, fonte legivel, layout centralizado e responsivo (desktop e celular).
- Mostre os controles/instrucoes na tela.
- Eficiente: canvas/JS que nao trava.

SAIDA (obrigatorio): devolva SOMENTE o documento HTML completo, do <!doctype html> ate </html>. Sem markdown, sem crases, sem texto antes ou depois. Todas as tags fechadas e chaves/parenteses balanceados.

Ao editar, mantenha o resto igual e aplique so a mudanca pedida, devolvendo o documento inteiro.`;

export async function generateSite({ history, userMessage, images, providerId = "", mode = "create", currentHtml = "", embedImages = [], htmlApp = false }, onEvent = () => {}) {
  const systemBase = htmlApp ? SYSTEM_HTML_APP : SYSTEM_SITE;
  const baseHistory = [...(history || [])];

  // Imagens que a pessoa quer DENTRO do site (nao so como referencia visual).
  // Damos placeholders para a IA usar no HTML; depois trocamos pelos data URLs
  // reais. Assim a imagem aparece no site sem inchar o prompt com base64 gigante.
  let instrucaoImagens = "";
  if (embedImages.length) {
    const nomes = embedImages.map((_, i) => `IMAGEM_${i + 1}`);
    instrucaoImagens =
`\n\nIMAGENS DA PESSOA: ela anexou ${embedImages.length} imagem(ns) para USAR no site (logo, foto de produto, banner, etc). Coloque-as onde fizer sentido no layout usando exatamente estes marcadores como src: ${nomes.map(n => `src="${n}"`).join(", ")}. Exemplo: <img src="IMAGEM_1" alt="...">. Nao invente URLs de imagem para essas — use os marcadores, que serao trocados pelas imagens reais depois.`;
  }

  // A mensagem que o modelo recebe. No modo edicao, embutimos o site atual
  // INTEIRO na propria mensagem, com marcadores claros, e pedimos para devolver
  // a pagina modificada. Isso e muito mais confiavel do que deixar o HTML solto
  // no historico — era isso que fazia modelos menores gerarem uma pagina nova.
  let userContent;
  if (mode === "edit" && currentHtml) {
    userContent =
`Aqui esta o SITE ATUAL, entre marcadores. Ele ja existe e esta funcionando:

===SITE_ATUAL_INICIO===
${currentHtml}
===SITE_ATUAL_FIM===

TAREFA DE EDICAO: aplique APENAS esta mudanca pedida pela pessoa, mantendo todo o resto exatamente como esta (mesmo layout, mesmas cores, mesmos textos, mesma identidade). NAO crie um site novo, NAO troque o tema, NAO reescreva secoes que nao foram citadas.

Mudanca pedida: "${userMessage}"

Devolva a PAGINA INTEIRA modificada (documento HTML completo, do <!doctype html> ao </html>), com a mudanca aplicada e todo o resto preservado.`;
  } else {
    userContent = userMessage;
  }

  const messages = [
    ...baseHistory,
    { role: "user", text: userContent, images: images || [] }
  ];

  const operationPrompt = mode === "edit"
    ? "\n\nVOCE ESTA EDITANDO um site que ja existe e foi enviado na mensagem entre ===SITE_ATUAL_INICIO=== e ===SITE_ATUAL_FIM===. Sua tarefa e aplicar SO a mudanca pedida e devolver a mesma pagina modificada. E proibido: criar um site diferente, trocar o tema/cores/fontes sem pedido, reescrever textos que ninguem mandou mudar, ou remover secoes existentes. Preserve tudo que nao foi citado. Devolva o documento HTML inteiro."
    : "\n\nMODO DE CRIAÇÃO: construa a primeira versão completa e profissional a partir do briefing.";

  const reply = await complete(
    { system: systemBase + operationPrompt + instrucaoImagens, messages, tools: [], preferredProviderId: providerId },
    onEvent
  );

  let html = repairGeneratedHtml(extractHtml(reply.text));
  let assistantText = reply.text;

  if (!isCompleteHtml(html)) {
    onEvent({ type: "html_retry", mode });

    // Se o HTML comecou certo mas foi cortado (tem <html mas nao </html>),
    // pedimos para CONTINUAR de onde parou e juntamos as partes. Isso resolve
    // paginas grandes que nao cabem numa resposta so.
    const comecouCerto = /<html\b/i.test(html) && !/<\/html>/i.test(html);
    if (comecouCerto) {
      const continuacao = await complete(
        {
          system: "Voce estava escrevendo um documento HTML e a resposta foi cortada. Continue EXATAMENTE de onde parou, sem repetir nada do que ja foi escrito, sem comentarios, ate fechar </body> e </html>. Responda apenas com a continuacao crua do HTML.",
          messages: [
            ...messages,
            { role: "assistant", text: html },
            { role: "user", text: "Continue o HTML exatamente de onde parou, ate fechar </body></html>. Nao repita o que ja escreveu." }
          ],
          tools: [], preferredProviderId: providerId
        },
        onEvent
      );
      let extra = continuacao.text || "";
      // remove cercas de codigo que possam vir na continuacao
      extra = extra.replace(/```(?:html)?/gi, "").trim();
      html = repairGeneratedHtml(html + extra);
    }

    // Se ainda assim nao fechou, uma tentativa limpa de regenerar.
    if (!isCompleteHtml(html)) {
      const retry = await complete(
        {
          system: systemBase + operationPrompt + "\n\nRETRY OBRIGATORIO: a resposta anterior nao era um HTML completo. Devolva somente o documento inteiro, do <!doctype html> ao </html>, com conteudo visivel no body e todas as tags fechadas. Seja um pouco mais enxuto para caber inteiro.",
          messages,
          tools: [], preferredProviderId: providerId
        },
        onEvent
      );
      assistantText = retry.text;
      html = repairGeneratedHtml(extractHtml(retry.text));
    }
  }

  // Troca os marcadores IMAGEM_N pelos data URLs reais das imagens anexadas.
  if (embedImages.length && html) {
    embedImages.forEach((dataUrl, i) => {
      const marcador = new RegExp(`IMAGEM_${i + 1}`, "g");
      html = html.replace(marcador, dataUrl);
    });
  }

  return {
    html,
    complete: isCompleteHtml(html),
    provider: reply.providerLabel,
    model: reply.model,
    assistantText
  };
}
