'use strict';

// ====================== CONSTANTES BÁSICAS ======================
const consumoPorUnidade = {
  pessoas: 84,
  bovinos: 45,
  suinos: 12.5,
  hortas: 7,
  pastagem: 50000
};

const LOCAL_STORAGE_KEY = 'bombaSolarProjeto';

// Catálogo exemplo (formato canônico)
let catalogoBombas = [
  { nome: "Solar DC 200W", tipo: "Solar DC", tensao: "24V", potencia: 200, maxFlow: 1000, maxHead: 30 },
  { nome: "Solar DC 300W", tipo: "Solar DC", tensao: "24V", potencia: 300, maxFlow: 1500, maxHead: 35 },
  { nome: "Solar DC 500W", tipo: "Solar DC", tensao: "48V", potencia: 500, maxFlow: 2500, maxHead: 45 },
  { nome: "AC 1/2CV",      tipo: "AC",      tensao: "220V", potencia: 370, maxFlow: 3000, maxHead: 28 },
  { nome: "AC 1CV",        tipo: "AC",      tensao: "220V", potencia: 750, maxFlow: 4500, maxHead: 40 }
];

// Guarda últimos resultados para PDF / resumo
let lastResults = null;

// ====================== HELPERS ======================
function parseNumber(input, fallback = 0) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function arred(n, casas = 2) {
  return Number.isFinite(n) ? n.toFixed(casas) : '0';
}

function showAlert(msg) {
  alert(msg);
  console.warn(msg);
}

// --------- NORMALIZAÇÃO DO CATÁLOGO (fallback de chaves) ---------
function normalizeBomba(raw = {}) {
  const nome =
    raw.nome ?? raw.name ?? raw.model ?? raw.title ?? raw.bomba ?? raw.label ?? '';

  const tipo =
    raw.tipo ?? raw.type ?? raw.category ?? raw.kind ?? '';

  const tensao =
    raw.tensao ?? raw.voltage ?? raw.v ?? raw.tensão ?? '';

  const potencia =
    raw.potencia ?? raw.potenciaW ?? raw.powerW ?? raw.power ?? raw.watt ?? raw.watts ?? null;

  // Suporte a variações de nome para Q/H máximos
  const maxFlow =
    raw.maxFlow ?? raw.qmax ?? raw.Qmax ?? raw.max_flow ?? raw.max_flow_lh ?? raw.flowMax ??
    raw.maxVazao ?? raw.maxVazaoLh ?? null;

  const maxHead =
    raw.maxHead ?? raw.hmax ?? raw.Hmax ?? raw.max_head ?? raw.headMax ??
    raw.maxAltura ?? raw.maxAlturaM ?? null;

  const price =
    raw.price ?? raw.preco ?? raw.valor ?? null;

  // “curvePoints” opcional (se vocês usarem)
  const curvePoints =
    raw.curvePoints ?? raw.curva ?? raw.pontosCurva ?? null;

  return {
    nome: String(nome || '').trim() || '-',
    tipo: String(tipo || '').trim() || '-',
    tensao: String(tensao || '').trim() || '-',
    potencia: potencia === null ? null : parseNumber(potencia, null),
    maxFlow: parseNumber(maxFlow, 0),
    maxHead: parseNumber(maxHead, 0),
    price: price === null ? null : parseNumber(price, null),
    curvePoints: Array.isArray(curvePoints) ? curvePoints : null
  };
}

function normalizeCatalogo(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter(Boolean)
    .map(normalizeBomba)
    .filter(b => Number.isFinite(b.maxFlow) && Number.isFinite(b.maxHead));
}

// ====================== jsPDF LOADER + IMG LOADER ======================
function getJsPDF() {
  return (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
}

// Carrega jsPDF automaticamente (caso o SRI esteja bloqueando no HTML)
function ensureJsPdfLoaded() {
  return new Promise((resolve) => {
    if (getJsPDF()) return resolve(true);

    // Evita duplicar
    if (document.querySelector('script[data-autoload="jspdf"]')) {
      // espera um pouco e resolve
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (getJsPDF()) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - t0 > 4000) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
      return;
    }

    const s = document.createElement('script');
    s.dataset.autoload = 'jspdf';

    // Fonte alternativa (sem integrity) — evita erro de hash/SRI
    // (Se uma falhar, você pode trocar por outra CDN)
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.async = true;

    s.onload = () => resolve(!!getJsPDF());
    s.onerror = () => resolve(false);

    document.head.appendChild(s);
  });
}

// Carrega imagem local e devolve DataURL (para addImage no PDF)
async function loadImageAsDataURL(src) {
  try {
    const res = await fetch(src, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Falha ao carregar imagem:', src, e);
    return null;
  }
}

// ====================== DOM READY ======================
document.addEventListener('DOMContentLoaded', () => {
  // ========= Pegadores seguros =========
  const $ = (id) => document.getElementById(id);

  // Inputs de demanda
  const pessoasQtd = $('pessoasQtd');
  const bovinosQtd = $('bovinosQtd');
  const suinosQtd  = $('suinosQtd');
  const hortasQtd  = $('hortasQtd');
  const pastagemQtd = $('pastagemQtd');

  // Saídas demanda
  const totalLitrosDiaEl = $('totalLitrosDia');
  const totalM3DiaEl     = $('totalM3Dia');

  // Inputs hidráulica
  const pocoProf  = $('pocoProfundidade');
  const reservAlt = $('reservatorioAltura');
  const distTubo  = $('distanciaTubulacao');

  // Saídas hidráulica
  const distKmEl = $('distanciaKm');
  const perdasEl = $('perdasCarga');
  const amtEl    = $('amtResultado');
  const avisosEl = $('avisos');

  // Vazão / potência
  const horasBomb           = $('horasBombeamento');
  const eficienciaEl        = $('eficienciaBomba');
  const habilitarPotenciaEl = $('habilitarPotencia');

  const vazaoLhEl   = $('vazaoLh');
  const vazaoLminEl = $('vazaoLmin');
  const vazaoM3hEl  = $('vazaoM3h');
  const vazaoM3diaEl = $('vazaoM3dia');
  const potHidEl    = $('potenciaHidraulica');
  const potElecEl   = $('potenciaEletrica');

  // Catálogo / filtros
  const margemVazaoEl = $('margemVazao');
  const margemAmtEl   = $('margemAMT');
  const filtroTipoEl  = $('filtroTipo');
  const filtroTensaoEl = $('filtroTensao');
  const catalogoJsonEl = $('catalogoJson');
  const tabelaBombasEl = $('tabelaBombas');
  const bombaRecomendadaEl = $('bombaRecomendada');

  // Botões catálogo
  const fileCatalogoEl     = $('fileCatalogo');
  const btnImportCatalogo  = $('btnImportCatalogo');
  const btnExportCatalogo  = $('btnExportCatalogo');
  const btnAplicarCatalogo = $('btnAplicarCatalogo');

  // Resumo / projeto / PDF
  const resumoTextoEl      = $('resumoTexto');
  const btnSalvarProjeto   = $('btnSalvarProjeto');
  const btnCarregarProjeto = $('btnCarregarProjeto');
  const btnGerarPdf        = $('btnGerarPdf');
  const btnCopiarResumo    = $('btnCopiarResumo');

  // Mapa
  const distanciaMapaInfoEl = $('distanciaMapaInfo');
  const btnResetMapa        = $('btnResetMapa');

  // ========= Validação mínima de elementos essenciais =========
  const essenciais = [
    pessoasQtd, bovinosQtd, suinosQtd, hortasQtd, pastagemQtd,
    totalLitrosDiaEl, totalM3DiaEl,
    pocoProf, reservAlt, distTubo,
    distKmEl, perdasEl, amtEl, avisosEl,
    horasBomb, eficienciaEl, habilitarPotenciaEl,
    vazaoLhEl, vazaoLminEl, vazaoM3hEl, vazaoM3diaEl, potHidEl, potElecEl,
    margemVazaoEl, margemAmtEl, filtroTipoEl, filtroTensaoEl,
    catalogoJsonEl, tabelaBombasEl, bombaRecomendadaEl,
    fileCatalogoEl, btnImportCatalogo, btnExportCatalogo, btnAplicarCatalogo,
    resumoTextoEl, btnSalvarProjeto, btnCarregarProjeto, btnGerarPdf, btnCopiarResumo,
    distanciaMapaInfoEl, btnResetMapa
  ];

  if (essenciais.some(x => !x)) {
    showAlert('Erro: faltam elementos no HTML (IDs não encontrados). Confira se o index.html está igual ao esperado.');
    return;
  }

  // Normaliza catálogo inicial e preenche textarea
  catalogoBombas = normalizeCatalogo(catalogoBombas);
  catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);

  // ---------- MAPA ----------
  let map = null, markers = [];

  function initMap() {
    if (!window.L) {
      showAlert('Leaflet não carregou. O mapa ficará indisponível, mas o sistema continua funcionando.');
      return;
    }
    try {
      map = L.map('map').setView([-15.94, -48.26], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      map.on('click', onMapClick);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao iniciar o mapa. Verifique o container #map e conexão.');
      map = null;
    }
  }

  function onMapClick(e) {
    if (!map) return;
    if (markers.length >= 2) return;

    const marker = L.marker(e.latlng).addTo(map);
    markers.push(marker);

    if (markers.length === 2) {
      const d = markers[0].getLatLng().distanceTo(markers[1].getLatLng()); // metros
      distanciaMapaInfoEl.textContent = arred(d, 1);
      distTubo.value = Math.round(d);
      recalcAll();
    }
  }

  function resetMapa() {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    distanciaMapaInfoEl.textContent = '0';
  }

  // ---------- CÁLCULOS PRINCIPAIS ----------
  function calcularDemandaTotal() {
    const qtdPessoas = Math.max(0, parseNumber(pessoasQtd.value));
    const qtdBovinos = Math.max(0, parseNumber(bovinosQtd.value));
    const qtdSuinos  = Math.max(0, parseNumber(suinosQtd.value));
    const qtdHortas  = Math.max(0, parseNumber(hortasQtd.value));
    const qtdPastagem = Math.max(0, parseNumber(pastagemQtd.value));

    // força campos a ficarem >= 0 (UX)
    pessoasQtd.value = qtdPessoas;
    bovinosQtd.value = qtdBovinos;
    suinosQtd.value  = qtdSuinos;
    hortasQtd.value  = qtdHortas;
    pastagemQtd.value = qtdPastagem;

    const total =
      qtdPessoas * consumoPorUnidade.pessoas +
      qtdBovinos * consumoPorUnidade.bovinos +
      qtdSuinos  * consumoPorUnidade.suinos +
      qtdHortas  * consumoPorUnidade.hortas +
      qtdPastagem * consumoPorUnidade.pastagem;

    totalLitrosDiaEl.textContent = arred(total, 2);
    totalM3DiaEl.textContent = arred(total / 1000, 3);

    return total;
  }

  function calcularAMT() {
    let hSuc  = Math.max(0, parseNumber(pocoProf.value));
    let hElev = Math.max(0, parseNumber(reservAlt.value));
    let dist  = Math.max(0, parseNumber(distTubo.value));

    pocoProf.value = hSuc;
    reservAlt.value = hElev;
    distTubo.value = dist;

    const perdas = 0.10 * dist;
    const amt = hSuc + hElev + perdas;

    distKmEl.textContent = arred(dist / 1000, 3);
    perdasEl.textContent = arred(perdas, 2);
    amtEl.textContent = arred(amt, 2);

    return { amt, perdas, dist };
  }

  function calcularVazaoEPotencia(totalDia, amt) {
    let horas = parseNumber(horasBomb.value, 5.5);
    const avisos = [];

    if (horas < 0.5) {
      horas = 0.5;
      horasBomb.value = horas;
      avisos.push('Horas de bombeamento ajustadas para mínimo de 0,5 h/dia por segurança.');
    }

    const vazaoLh   = horas > 0 ? totalDia / horas : 0;
    const vazaoLmin = vazaoLh / 60;
    const vazaoM3h  = vazaoLh / 1000;
    const vazaoM3dia = totalDia / 1000;

    vazaoLhEl.textContent = arred(vazaoLh, 2);
    vazaoLminEl.textContent = arred(vazaoLmin, 2);
    vazaoM3hEl.textContent = arred(vazaoM3h, 3);
    vazaoM3diaEl.textContent = arred(vazaoM3dia, 3);

    let potHid = 0;
    let potElec = 0;

    if (habilitarPotenciaEl.checked && totalDia > 0 && amt > 0) {
      const eficiencia = Math.min(1, Math.max(0.1, parseNumber(eficienciaEl.value, 0.6)));
      eficienciaEl.value = eficiencia;

      const Q_m3s = vazaoLh / 3600000; // L/h -> m³/s
      const rho = 1000;
      const g = 9.81;

      potHid = rho * g * Q_m3s * amt;
      potElec = potHid / eficiencia;
    }

    potHidEl.textContent = arred(potHid, 1);
    potElecEl.textContent = arred(potElec, 1);

    return { vazaoLh, vazaoLmin, vazaoM3h, vazaoM3dia, horas, avisos };
  }

  // ---------- CATÁLOGO / RECOMENDAÇÃO ----------
  function aplicarCatalogoDoTextarea() {
    try {
      const data = JSON.parse(catalogoJsonEl.value);
      if (!Array.isArray(data)) {
        showAlert('O JSON do catálogo deve ser um array de bombas.');
        return;
      }
      catalogoBombas = normalizeCatalogo(data);
      if (!catalogoBombas.length) {
        showAlert('Catálogo aplicado, mas nenhuma bomba válida foi encontrada (verifique maxFlow/maxHead).');
      }
      catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);
      alert('Catálogo aplicado com sucesso!');
      recalcAll();
    } catch (e) {
      console.error(e);
      showAlert('JSON inválido. Verifique a sintaxe.');
    }
  }

  function importarCatalogoArquivo() {
    const file = fileCatalogoEl.files[0];
    if (!file) {
      showAlert('Selecione um arquivo JSON primeiro.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) {
          showAlert('O JSON do catálogo deve ser um array de bombas.');
          return;
        }
        catalogoBombas = normalizeCatalogo(data);
        catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);
        alert('Catálogo importado com sucesso!');
        recalcAll();
      } catch (e) {
        console.error(e);
        showAlert('Erro ao ler o JSON. Verifique o arquivo.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function exportarCatalogoArquivo() {
    try {
      const blob = new Blob([JSON.stringify(catalogoBombas, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'catalogo_bombas.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showAlert('Falha ao exportar o catálogo. Tente novamente.');
    }
  }

  function recomendarBombas(vazaoLh, amt) {
    const margemVazao = Math.max(1, parseNumber(margemVazaoEl.value, 1.2));
    const margemAmt = Math.max(1, parseNumber(margemAmtEl.value, 1.1));

    margemVazaoEl.value = margemVazao;
    margemAmtEl.value = margemAmt;

    const metaFlow = vazaoLh * margemVazao;
    const metaAmt = amt * margemAmt;

    const filtroTipo = filtroTipoEl.value.trim();
    const filtroTensao = filtroTensaoEl.value.trim().toLowerCase();

    const bombasComScore = catalogoBombas.map((b0) => {
      const b = normalizeBomba(b0);
      const atendeTipo = !filtroTipo || b.tipo === filtroTipo;
      const atendeTensao = !filtroTensao || (b.tensao && String(b.tensao).toLowerCase().includes(filtroTensao));

      const atendeCapacidade = (b.maxFlow >= metaFlow) && (b.maxHead >= metaAmt);

      let score = Infinity;
      if (atendeCapacidade && atendeTipo && atendeTensao) {
        const folgaFlow = metaFlow > 0 ? (b.maxFlow - metaFlow) / metaFlow : 0;
        const folgaHead = metaAmt > 0 ? (b.maxHead - metaAmt) / metaAmt : 0;
        const pesoPot = b.potencia ? b.potencia / 1000 : 0;
        score = Math.max(folgaFlow, 0) + Math.max(folgaHead, 0) + pesoPot;
      }

      return { ...b, atende: atendeCapacidade && atendeTipo && atendeTensao, score };
    });

    bombasComScore.sort((a, b) => a.score - b.score);

    const atendem = bombasComScore.filter(b => b.atende && Number.isFinite(b.score));
    const melhor = atendem[0] || null;
    const top5 = bombasComScore.slice(0, 5);

    // Atualiza tabela
    tabelaBombasEl.innerHTML = '';
    top5.forEach((b, idx) => {
      const tr = document.createElement('tr');
      if (b === melhor) tr.style.backgroundColor = '#e6ffe6';

      const status = b.atende ? 'Atende meta' : 'Não atende';
      const statusClass = b.atende ? 'status-ok' : 'status-fail';

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${b.nome || '-'}</td>
        <td>${b.tipo || '-'}</td>
        <td>${b.tensao || '-'}</td>
        <td>${b.potencia ?? '-'}</td>
        <td>${b.maxFlow ?? '-'}</td>
        <td>${b.maxHead ?? '-'}</td>
        <td class="${statusClass}">${status}</td>
      `;
      tabelaBombasEl.appendChild(tr);
    });

    bombaRecomendadaEl.textContent = melhor
      ? `${melhor.nome} (${melhor.tipo}, ${melhor.tensao})`
      : 'Nenhuma bomba atende às metas atuais.';

    return { metaFlow, metaAmt, melhor, top5 };
  }

  // ---------- AVISOS ----------
  function atualizarAvisos(amt, avisosExtras) {
    const avisos = [...(avisosExtras || [])];

    if (amt === 0) {
      avisos.push('AMT ficou 0 m. Verifique profundidade do poço, altura do reservatório e distância da tubulação.');
    }

    if (!avisos.length) {
      avisosEl.innerHTML = '';
      return;
    }

    const ul = avisos.map(a => `<li>${a}</li>`).join('');
    avisosEl.innerHTML = `<strong>Avisos:</strong><ul>${ul}</ul>`;
  }

  // ---------- RESUMO / PDF / LOCALSTORAGE ----------
  function montarResumoTexto(res) {
    if (!res) {
      resumoTextoEl.textContent = 'Preencha os dados para gerar o resumo.';
      return;
    }

    const {
      totalDia, amt, perdas, dist,
      vazaoLh, vazaoLmin, vazaoM3h, vazaoM3dia, horas,
      metaFlow, metaAmt, melhor, top3
    } = res;

    let texto = '';
    texto += '=== RESUMO DO PROJETO DE BOMBEAMENTO ===\n\n';
    texto += `Demanda total: ${arred(totalDia, 2)} L/dia (${arred(totalDia / 1000, 3)} m³/dia)\n`;
    texto += `Profundidade do poço: ${arred(parseNumber(pocoProf.value), 2)} m\n`;
    texto += `Altura do reservatório: ${arred(parseNumber(reservAlt.value), 2)} m\n`;
    texto += `Distância da tubulação: ${arred(dist, 2)} m (${arred(dist / 1000, 3)} km)\n`;
    texto += `Perdas de carga (10%): ${arred(perdas, 2)} m\n`;
    texto += `AMT total: ${arred(amt, 2)} m\n\n`;

    texto += `Horas de bombeamento: ${arred(horas, 2)} h/dia\n`;
    texto += `Vazão necessária: ${arred(vazaoLh, 2)} L/h (${arred(vazaoLmin, 2)} L/min)\n`;
    texto += `Vazão em m³: ${arred(vazaoM3h, 3)} m³/h (${arred(vazaoM3dia, 3)} m³/dia)\n\n`;

    texto += `Meta com margens: ${arred(metaFlow, 2)} L/h @ ${arred(metaAmt, 2)} m\n`;
    texto += '\nBomba recomendada:\n';
    if (melhor) {
      texto += `- ${melhor.nome} (${melhor.tipo}, ${melhor.tensao}) - Potência: ${melhor.potencia ?? '-'} W\n`;
    } else {
      texto += '- Nenhuma bomba atende às metas atuais.\n';
    }

    if (top3 && top3.length) {
      texto += '\nTop 3 opções consideradas:\n';
      top3.forEach((b, i) => {
        texto += `${i + 1}. ${b.nome} (${b.tipo}, ${b.tensao}) - Qmax: ${b.maxFlow} L/h, Hmax: ${b.maxHead} m\n`;
      });
    }

    resumoTextoEl.textContent = texto;
  }

  function salvarProjeto() {
    try {
      const state = {
        demanda: {
          pessoas: parseNumber(pessoasQtd.value),
          bovinos: parseNumber(bovinosQtd.value),
          suinos: parseNumber(suinosQtd.value),
          hortas: parseNumber(hortasQtd.value),
          pastagem: parseNumber(pastagemQtd.value)
        },
        hidraulica: {
          poco: parseNumber(pocoProf.value),
          reservatorio: parseNumber(reservAlt.value),
          distancia: parseNumber(distTubo.value)
        },
        horas: parseNumber(horasBomb.value),
        eficiencia: parseNumber(eficienciaEl.value),
        habilitarPotencia: habilitarPotenciaEl.checked,
        margens: {
          vazao: parseNumber(margemVazaoEl.value),
          amt: parseNumber(margemAmtEl.value)
        },
        filtros: {
          tipo: filtroTipoEl.value,
          tensao: filtroTensaoEl.value
        },
        catalogo: catalogoBombas
      };

      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
      alert('Projeto salvo no navegador (localStorage).');
    } catch (e) {
      console.error(e);
      showAlert('Não foi possível salvar (storage cheio ou bloqueado).');
    }
  }

  function carregarProjeto() {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      showAlert('Nenhum projeto salvo encontrado.');
      return;
    }
    try {
      const state = JSON.parse(raw);

      pessoasQtd.value = state.demanda?.pessoas ?? 0;
      bovinosQtd.value = state.demanda?.bovinos ?? 0;
      suinosQtd.value = state.demanda?.suinos ?? 0;
      hortasQtd.value = state.demanda?.hortas ?? 0;
      pastagemQtd.value = state.demanda?.pastagem ?? 0;

      pocoProf.value = state.hidraulica?.poco ?? 0;
      reservAlt.value = state.hidraulica?.reservatorio ?? 0;
      distTubo.value = state.hidraulica?.distancia ?? 0;

      horasBomb.value = state.horas ?? 5.5;
      eficienciaEl.value = state.eficiencia ?? 0.6;
      habilitarPotenciaEl.checked = !!state.habilitarPotencia;

      margemVazaoEl.value = state.margens?.vazao ?? 1.2;
      margemAmtEl.value = state.margens?.amt ?? 1.1;
      filtroTipoEl.value = state.filtros?.tipo ?? '';
      filtroTensaoEl.value = state.filtros?.tensao ?? '';

      if (Array.isArray(state.catalogo)) {
        catalogoBombas = normalizeCatalogo(state.catalogo);
        catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);
      }

      recalcAll();
      alert('Projeto carregado com sucesso.');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar o projeto salvo.');
    }
  }

  // ======= PDF (COM TRATATIVAS + AUTOLOAD jsPDF + LOGO) =======
  async function gerarPdf() {
    try {
      if (!lastResults) {
        showAlert('Calcule os resultados antes de gerar o PDF.');
        return;
      }

      // UX: desabilita enquanto gera
      const oldText = btnGerarPdf.textContent;
      btnGerarPdf.disabled = true;
      btnGerarPdf.textContent = 'Gerando PDF...';

      // garante jsPDF
      const ok = await ensureJsPdfLoaded();
      const JsPDF = getJsPDF();

      if (!ok || !JsPDF) {
        showAlert(
          'Não foi possível carregar o jsPDF.\n\n' +
          '⚠️ Se você colocou "integrity" no script do jsPDF no HTML e ele está bloqueando, REMOVA o integrity.\n' +
          'Depois recarregue a página.'
        );
        btnGerarPdf.disabled = false;
        btnGerarPdf.textContent = oldText;
        return;
      }

      const doc = new JsPDF({ unit: 'mm', format: 'a4' });

      const hoje = new Date();
      const dataStr = hoje.toLocaleString('pt-BR');

      // tenta inserir logo (se estiver na mesma pasta do index.html)
      // Nome que você me mandou:
      const logoData = await loadImageAsDataURL('Marca_UEG_horizontal_extenso_cromia(1).png');

      let y = 12;

      if (logoData) {
        try {
          // largura 120mm, mantém proporção aproximada
          doc.addImage(logoData, 'PNG', 10, y, 120, 0);
          y += 22;
        } catch (e) {
          console.warn('Falha ao inserir logo no PDF:', e);
        }
      }

      doc.setFontSize(14);
      doc.text('Universidade Estadual de Goiás - UEG', 10, y); y += 7;

      doc.setFontSize(12);
      doc.text('Gerência de Projeto de Software', 10, y); y += 7;

      doc.setFontSize(12);
      doc.text('Relatório de Dimensionamento de Bombeamento Solar', 10, y); y += 7;

      doc.setFontSize(10);
      doc.text(`Data/Hora: ${dataStr}`, 10, y); y += 10;

      doc.setFontSize(11);
      doc.text('1. Entradas do Sistema', 10, y); y += 6;

      doc.setFontSize(9);
      const linhas1 = [
        `Demanda total: ${arred(lastResults.totalDia, 2)} L/dia (${arred(lastResults.totalDia / 1000, 3)} m³/dia)`,
        `Profundidade do poço: ${arred(parseNumber(pocoProf.value), 2)} m`,
        `Altura do reservatório: ${arred(parseNumber(reservAlt.value), 2)} m`,
        `Distância da tubulação: ${arred(lastResults.dist, 2)} m (${arred(lastResults.dist / 1000, 3)} km)`,
        `Horas de bombeamento: ${arred(lastResults.horas, 2)} h/dia`,
        `Margem vazão: ${arred(parseNumber(margemVazaoEl.value), 2)}`,
        `Margem AMT: ${arred(parseNumber(margemAmtEl.value), 2)}`
      ];

      linhas1.forEach((t) => {
        doc.text(t, 10, y);
        y += 5;
      });

      y += 4;
      doc.setFontSize(11);
      doc.text('2. Resultados de Cálculo', 10, y); y += 6;

      doc.setFontSize(9);
      const linhas2 = [
        `Perdas de carga (10%): ${arred(lastResults.perdas, 2)} m`,
        `AMT total: ${arred(lastResults.amt, 2)} m`,
        `Vazão necessária: ${arred(lastResults.vazaoLh, 2)} L/h (${arred(lastResults.vazaoLmin, 2)} L/min)`,
        `Vazão em m³: ${arred(lastResults.vazaoM3h, 3)} m³/h (${arred(lastResults.vazaoM3dia, 3)} m³/dia)`,
        `Meta com margens: ${arred(lastResults.metaFlow, 2)} L/h @ ${arred(lastResults.metaAmt, 2)} m`
      ];

      linhas2.forEach((t) => {
        doc.text(t, 10, y);
        y += 5;
      });

      y += 4;
      doc.setFontSize(11);
      doc.text('3. Recomendação de Bomba', 10, y); y += 6;

      doc.setFontSize(9);
      if (lastResults.melhor) {
        const linha = `Recomendada: ${lastResults.melhor.nome} (${lastResults.melhor.tipo}, ${lastResults.melhor.tensao}) - Potência: ${lastResults.melhor.potencia ?? '-'} W`;
        const split = doc.splitTextToSize(linha, 190);
        doc.text(split, 10, y);
        y += 5 * split.length;
      } else {
        doc.text('Nenhuma bomba atende às metas atuais.', 10, y); y += 6;
      }

      y += 2;
      doc.text('Top 5 bombas avaliadas:', 10, y); y += 5;

      lastResults.top5.forEach((b, idx) => {
        if (y > 285) { doc.addPage(); y = 20; }
        const status = b.atende ? 'Atende meta' : 'Não atende';
        const linha = `${idx + 1}. ${b.nome} (${b.tipo}, ${b.tensao}) - Qmax:${b.maxFlow} L/h, Hmax:${b.maxHead} m - ${status}`;
        const split = doc.splitTextToSize(linha, 190);
        doc.text(split, 10, y);
        y += 5 * split.length;
      });

      doc.save('relatorio_bombeamento_solar.pdf');

      // volta UX
      btnGerarPdf.disabled = false;
      btnGerarPdf.textContent = oldText;
    } catch (e) {
      console.error(e);
      showAlert('Ocorreu um erro ao gerar o PDF. Veja o console para detalhes.');
      btnGerarPdf.disabled = false;
      btnGerarPdf.textContent = 'Gerar Relatório (PDF)';
    }
  }

  function copiarResumoClipboard() {
    const texto = resumoTextoEl.textContent;
    if (!texto.trim()) {
      showAlert('Não há resumo para copiar.');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(() => {
        alert('Resumo copiado para a área de transferência.');
      }).catch(() => {
        showAlert('Não foi possível copiar automaticamente. Copie manualmente.');
      });
    } else {
      showAlert('Navegador sem suporte a clipboard API. Copie manualmente.');
    }
  }

  // ---------- RE-CÁLCULO GERAL ----------
  function recalcAll() {
    const totalDia = calcularDemandaTotal();
    const { amt, perdas, dist } = calcularAMT();
    const { vazaoLh, vazaoLmin, vazaoM3h, vazaoM3dia, horas, avisos } = calcularVazaoEPotencia(totalDia, amt);
    const { metaFlow, metaAmt, melhor, top5 } = recomendarBombas(vazaoLh, amt);

    atualizarAvisos(amt, avisos);

    lastResults = {
      totalDia, amt, perdas, dist,
      vazaoLh, vazaoLmin, vazaoM3h, vazaoM3dia, horas,
      metaFlow, metaAmt, melhor, top5,
      top3: top5.slice(0, 3)
    };

    montarResumoTexto(lastResults);
  }

  // ---------- EVENTOS ----------
  [
    pessoasQtd, bovinosQtd, suinosQtd, hortasQtd, pastagemQtd,
    pocoProf, reservAlt, distTubo,
    horasBomb, eficienciaEl, habilitarPotenciaEl,
    margemVazaoEl, margemAmtEl,
    filtroTipoEl, filtroTensaoEl
  ].forEach(el => {
    el.addEventListener('input', recalcAll);
    el.addEventListener('change', recalcAll);
  });

  btnAplicarCatalogo.addEventListener('click', aplicarCatalogoDoTextarea);
  btnImportCatalogo.addEventListener('click', importarCatalogoArquivo);
  btnExportCatalogo.addEventListener('click', exportarCatalogoArquivo);

  btnSalvarProjeto.addEventListener('click', salvarProjeto);
  btnCarregarProjeto.addEventListener('click', carregarProjeto);

  // PDF (async safe)
  btnGerarPdf.addEventListener('click', () => { gerarPdf(); });

  btnCopiarResumo.addEventListener('click', copiarResumoClipboard);

  btnResetMapa.addEventListener('click', () => {
    resetMapa();
    recalcAll();
  });

  // Inicialização
  initMap();
  recalcAll();
});
