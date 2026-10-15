# Gera as imagens que o console da Vercel exige, a partir de public/brand/logo.png.
# Sem dependencias: decodifica o PNG de paleta na mao, compoe e reescreve em RGB
# (sem canal alfa, que e o que a Vercel pede).
import zlib, struct, math, os

REPO = r"C:\Users\victo\OneDrive\Documentos\copilot-code-saas"
LOGO = os.path.join(REPO, "public", "brand", "logo.png")
SAIDA = os.path.join(REPO, "public", "brand")

# ---------------------------------------------------------------- decodificar
def ler_png(caminho):
    d = open(caminho, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", "nao e PNG"
    pos, plte, trns, idat = 8, None, b"", b""
    w = h = bits = ct = None
    while pos < len(d):
        (tam,) = struct.unpack(">I", d[pos:pos + 4])
        tipo = d[pos + 4:pos + 8]
        dados = d[pos + 8:pos + 8 + tam]
        if tipo == b"IHDR":
            w, h, bits, ct, _, _, entrelace = struct.unpack(">IIBBBBB", dados)
            assert entrelace == 0, "PNG entrelacado nao suportado"
        elif tipo == b"PLTE": plte = dados
        elif tipo == b"tRNS": trns = dados
        elif tipo == b"IDAT": idat += dados
        elif tipo == b"IEND": break
        pos += 12 + tam
    assert bits == 8 and ct == 3, f"esperava paleta 8 bits, veio bits={bits} ct={ct}"

    cru = zlib.decompress(idat)
    bpp = 1
    linhas, prev, p = [], bytearray(w), 0
    for _ in range(h):
        filtro = cru[p]; p += 1
        linha = bytearray(cru[p:p + w]); p += w
        if filtro == 1:
            for i in range(bpp, w): linha[i] = (linha[i] + linha[i - bpp]) & 255
        elif filtro == 2:
            for i in range(w): linha[i] = (linha[i] + prev[i]) & 255
        elif filtro == 3:
            for i in range(w):
                a = linha[i - bpp] if i >= bpp else 0
                linha[i] = (linha[i] + ((a + prev[i]) >> 1)) & 255
        elif filtro == 4:
            for i in range(w):
                a = linha[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                linha[i] = (linha[i] + pr) & 255
        linhas.append(linha); prev = linha

    # indice -> RGBA
    pal = [(plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2]) for i in range(len(plte) // 3)]
    alfa = [trns[i] if i < len(trns) else 255 for i in range(len(pal))]
    px = []
    for linha in linhas:
        fila = []
        for idx in linha:
            r, g, b = pal[idx]
            fila.append((r, g, b, alfa[idx]))
        px.append(fila)
    return w, h, px

# ------------------------------------------------------------------ redimensionar
def reduzir(px, w, h, novo):
    """Media por area — downscale sem serrilhado. Pre-multiplica o alfa para a
    borda do logo nao puxar a cor de fundo da paleta."""
    fator = w / novo
    saida = []
    for y in range(novo):
        y0, y1 = int(y * fator), max(int(y * fator) + 1, int((y + 1) * fator))
        fila = []
        for x in range(novo):
            x0, x1 = int(x * fator), max(int(x * fator) + 1, int((x + 1) * fator))
            sr = sg = sb = sa = n = 0
            for yy in range(y0, min(y1, h)):
                linha = px[yy]
                for xx in range(x0, min(x1, w)):
                    r, g, b, a = linha[xx]
                    sr += r * a; sg += g * a; sb += b * a; sa += a; n += 1
            if sa:
                fila.append((sr // sa, sg // sa, sb // sa, sa // n))
            else:
                fila.append((0, 0, 0, 0))
        saida.append(fila)
    return saida

# ---------------------------------------------------------------------- fundo
def fundo(w, h, brilho=1.0):
    """Fundo escuro da marca com um brilho rosa/laranja atras do logo e vinheta
    nos cantos. As cores sao as do BorderGlow do app (#e11d48, #f97316)."""
    base = (11, 6, 9)
    cx, cy = w / 2, h * 0.46
    raio = max(w, h) * 0.42
    diag = math.hypot(w / 2, h / 2)
    tela = []
    for y in range(h):
        dy2 = (y - cy) ** 2
        fila = []
        for x in range(w):
            d = math.sqrt((x - cx) ** 2 + dy2)
            # Fraco de proposito: o logo ja e vermelho, entao um fundo vermelho
            # forte o engole. O brilho so tira o chapado do preto.
            g = math.exp(-((d / raio) ** 2)) * 0.085 * brilho         # nucleo rosa
            o = math.exp(-((d / (raio * 1.9)) ** 2)) * 0.045 * brilho # halo laranja
            r = base[0] + 225 * g + 249 * o
            gr = base[1] + 29 * g + 115 * o
            b = base[2] + 72 * g + 22 * o
            v = 1 - 0.45 * (math.hypot(x - w / 2, y - h / 2) / diag) ** 2  # vinheta
            fila.append((min(255, int(r * v)), min(255, int(gr * v)), min(255, int(b * v))))
        tela.append(fila)
    return tela

def colar(tela, logo, n, cx, cy):
    x0, y0 = int(cx - n / 2), int(cy - n / 2)
    H, W = len(tela), len(tela[0])
    for y in range(n):
        ty = y0 + y
        if not (0 <= ty < H): continue
        for x in range(n):
            tx = x0 + x
            if not (0 <= tx < W): continue
            r, g, b, a = logo[y][x]
            if not a: continue
            pr, pg, pb = tela[ty][tx]
            k = a / 255
            tela[ty][tx] = (int(r * k + pr * (1 - k)),
                            int(g * k + pg * (1 - k)),
                            int(b * k + pb * (1 - k)))

# ------------------------------------------------------------------- escrever
def gravar_png(caminho, tela):
    h, w = len(tela), len(tela[0])
    cru = bytearray()
    for fila in tela:
        cru.append(0)                      # filtro None
        for r, g, b in fila:
            cru += bytes((r, g, b))
    def chunk(tipo, dados):
        return (struct.pack(">I", len(dados)) + tipo + dados
                + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF))
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))  # ct=2 RGB, sem alfa
           + chunk(b"IDAT", zlib.compress(bytes(cru), 9))
           + chunk(b"IEND", b""))
    open(caminho, "wb").write(png)
    return len(png)

# ----------------------------------------------------------------------- roda
w, h, logo = ler_png(LOGO)
print(f"logo lido: {w}x{h}")

# 1) Featured image 16:9 exigida pelo console (1920x1080, sem transparencia)
tela = fundo(1920, 1080)
n = 660
colar(tela, reduzir(logo, w, h, n), n, 960, 1080 * 0.46)
p1 = os.path.join(SAIDA, "vercel-featured-1920x1080.png")
print("featured:", p1, gravar_png(p1, tela) // 1024, "KB")

# 2) Logo quadrado sem transparencia (a Vercel recusa PNG transparente)
tela = fundo(512, 512, brilho=0.85)
n = 330
colar(tela, reduzir(logo, w, h, n), n, 256, 256)
p2 = os.path.join(SAIDA, "vercel-logo-512.png")
print("logo:    ", p2, gravar_png(p2, tela) // 1024, "KB")
