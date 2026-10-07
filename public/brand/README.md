# Logo / marca

Coloque aqui o arquivo da sua logo. Esta pasta é servida pela Vercel na raiz do
site, então um arquivo `public/brand/logo.svg` fica acessível em `/brand/logo.svg`.

## O que colocar (ideal)

- **`logo.svg`** — logo principal (vetor, escala em qualquer tamanho). Melhor opção.
- Se não tiver SVG, use **`logo.png`** com fundo transparente, pelo menos **512×512**
  (ou, se for horizontal, altura ~128px).
- Opcional: **`icon.svg`** / **`icon.png`** — só o símbolo (sem texto), pra ícone/favicon.
- Opcional: **`logo-light.svg`** e **`logo-dark.svg`** se a logo precisar de versão
  diferente em fundo claro e escuro.

## Onde ela vai aparecer

- No cabeçalho / sidebar do app (hoje é o `IconLogo` desenhado em `src/App.jsx`,
  linha ~1192, exibido no `.brand` por volta da linha 557).
- Dá pra usar também no favicon (hoje `public/favicon.svg`).

## Depois de colocar o arquivo

Me diga o **nome e o formato** do arquivo que você colocou (ex.: `logo.svg`) que eu
troco a logo desenhada pela sua imagem no cabeçalho e aplico os efeitos.
