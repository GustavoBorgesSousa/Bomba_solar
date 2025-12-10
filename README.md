# Sistema de Bombeamento Solar ☀️💧

Aplicação web (HTML/CSS/JS) para **dimensionamento básico de bombeamento de água com energia solar** e **recomendação de bomba** com base em um **catálogo JSON**.

O sistema calcula:
- **Demanda diária (L/dia e m³/dia)** por categorias
- **AMT (Altura Manométrica Total)** com perdas simplificadas
- **Vazão mínima** (L/h, L/min, m³/h)
- (Opcional) **Potência hidráulica e elétrica estimada**
- **Recomendação de bomba** + ranking (Top 5)
- **Salvar/Carregar projeto (LocalStorage)**
- **Importar/Exportar catálogo JSON (arquivo)**
- **Resumo do projeto + botão copiar**
- **Mapa (Leaflet/OSM)** para medir distância entre dois pontos
- **Relatório em PDF** com entradas, resultados e ranking

---

## 🚀 Como executar
### Rodando localmente
1. Baixe/clique em `index.html` e abra no navegador  
2. Ou use um servidor local (recomendado):
   - VS Code: extensão “Live Server”
   - Python: `python -m http.server`

### Publicando no GitHub Pages
1. Repositório → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / folder: **/(root)**
4. Salve e acesse o link gerado

---

## 🧠 Como o sistema calcula

### 1) Demanda diária (L/dia)
Soma das categorias:  
`Total = Σ (quantidade × consumo_por_unidade)`

### 2) Perdas e AMT
Perdas simplificadas: `perdas = 10% da distância`  
`AMT = poço + reservatório + perdas`

### 3) Vazão mínima
Considerando **horas de bombeamento por dia** (mín. 0,5h):  
`Vazão(L/h) = Total(L/dia) / horas`  
Conversões:
- `L/min = (L/h) / 60`
- `m³/h = (L/h) / 1000`
- `m³/dia = (L/dia) / 1000`

---

## ✅ Funcionalidades (bem claras)
- **Cálculo automático** ao digitar (sem precisar “calcular” manualmente)
- **Validações e avisos** (ex.: AMT 0m, horas mín. 0,5h)
- **Medição de distância no mapa** (2 cliques → preenche distância em metros)
- **Margens de segurança** (vazão e AMT) para definir metas
- **Filtros por tipo e tensão** na recomendação
- **Importar catálogo** via arquivo `.json`
- **Exportar catálogo atual** como arquivo `.json`
- **Salvar/Carregar projeto** no navegador (LocalStorage)
- **Resumo do projeto** pronto para WhatsApp/relatório + botão copiar
- **PDF** com cabeçalho, entradas, resultados, metas e Top 5 bombas

---

## 📦 Catálogo de bombas (JSON)

### Formato exigido
O catálogo deve ser um **ARRAY** (lista) de bombas:

```json
[
  { "nome": "Bomba X", "tipo": "AC", "tensao": "220V", "potencia": 750, "maxFlow": 4500, "maxHead": 40 }
]
