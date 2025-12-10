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
    raw.maxFlow ?? raw.qmax ?? raw.Qmax ?? raw.max_flow ?? raw.max_flow_lh ?? raw.flowMax ?? raw.maxVazao ?? raw.maxVazaoLh ?? null;

  const maxHead =
    raw.maxHead ?? raw.hmax ?? raw.Hmax ?? raw.max_head ?? raw.headMax ?? raw.maxAltura ?? raw.maxAlturaM ?? null;

  const price =
    raw.price ?? raw.preco ?? raw.valor ?? null;

  // “curvePoints” opcional (se vocês usarem)
  const curvePoints = raw.curvePoints ?? raw.curva ?? raw.pontosCurva ?? null;

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
  return arr
    .filter(Boolean)
    .map(normalizeBomba)
    // mantém itens minimamente úteis (com capacidade numérica)
    .filter(b => Number.isFinite(b.maxFlow) && Number.isFinite(b.maxHead));
}

// ====================== DOM READY ======================
document.addEventListener('DOMContentLoaded', () => {
  // Inputs de demanda
  const pessoasQtd = document.getElementById('pessoasQtd');
  const bovinosQtd = document.getElementById('bovinosQtd');
  const suinosQtd = document.getElementById('suinosQtd');
  const hortasQtd = document.getElementById('hortasQtd');
  const pastagemQtd = document.getElementById('pastagemQtd');

  // Saídas demanda
  const totalLitrosDiaEl = document.getElementById('totalLitrosDia');
  const totalM3DiaEl = document.getElementById('totalM3Dia');

  // Inputs hidráulica
  const pocoProf = document.getElementById('pocoProfundidade');
  const reservAlt = document.getElementById('reservatorioAltura');
  const distTubo = document.getElementById('distanciaTubulacao');

  // Saídas hidráulica
  const distKmEl = document.getElementById('distanciaKm');
  const perdasEl = document.getElementById('perdasCarga');
  const amtEl = document.getElementById('amtResultado');
  const avisosEl = document.getElementById('avisos');

  // Vazão / potência
  const horasBomb = document.getElementById('horasBombeamento');
  const eficienciaEl = document.getElementById('eficienciaBomba');
  const habilitarPotenciaEl = document.getElementById('habilitarPotencia');

  const vazaoLhEl = document.getElementById('vazaoLh');
  const vazaoLminEl = document.getElementById('vazaoLmin');
  const vazaoM3hEl = document.getElementById('vazaoM3h');
  const vazaoM3diaEl = document.getElementById('vazaoM3dia');
  const potHidEl = document.getElementById('potenciaHidraulica');
  const potElecEl = document.getElementById('potenciaEletrica');

  // Catálogo / filtros
  const margemVazaoEl = document.getElementById('margemVazao');
  const margemAmtEl = document.getElementById('margemAMT');
  const filtroTipoEl = document.getElementById('filtroTipo');
  const filtroTensaoEl = document.getElementById('filtroTensao');
  const catalogoJsonEl = document.getElementById('catalogoJson');
  const tabelaBombasEl = document.getElementById('tabelaBombas');
  const bombaRecomendadaEl = document.getElementById('bombaRecomendada');

  // Botões catálogo
  const fileCatalogoEl = document.getElementById('fileCatalogo');
  const btnImportCatalogo = document.getElementById('btnImportCatalogo');
  const btnExportCatalogo = document.getElementById('btnExportCatalogo');
  const btnAplicarCatalogo = document.getElementById('btnAplicarCatalogo');

  // Resumo / projeto / PDF
  const resumoTextoEl = document.getElementById('resumoTexto');
  const btnSalvarProjeto = document.getElementById('btnSalvarProjeto');
  const btnCarregarProjeto = document.getElementById('btnCarregarProjeto');
  const btnGerarPdf = document.getElementById('btnGerarPdf');
  const btnCopiarResumo = document.getElementById('btnCopiarResumo');

  // Mapa
  const distanciaMapaInfoEl = document.getElementById('distanciaMapaInfo');
  const btnResetMapa = document.getElementById('btnResetMapa');

  // Normaliza catálogo inicial e preenche textarea
  catalogoBombas = normalizeCatalogo(catalogoBombas);
  catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);

  // ---------- MAPA ----------
  let map, markers = [];

  function initMap() {
    map = L.map('map').setView([-15.94, -48.26], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    map.on('click', onMapClick);
  }

  function onMapClick(e) {
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
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    distanciaMapaInfoEl.textContent = '0';
  }

  // ---------- CÁLCULOS PRINCIPAIS ----------
  function calcularDemandaTotal() {
    const qtdPessoas = parseNumber(pessoasQtd.value);
    const qtdBovinos = parseNumber(bovinosQtd.value);
    const qtdSuinos = parseNumber(suinosQtd.value);
    const qtdHortas = parseNumber(hortasQtd.value);
    const qtdPastagem = parseNumber(pastagemQtd.value);

    const total =
      qtdPessoas * consumoPorUnidade.pessoas +
      qtdBovinos * consumoPorUnidade.bovinos +
      qtdSuinos * consumoPorUnidade.suinos +
      qtdHortas * consumoPorUnidade.hortas +
      qtdPastagem * consumoPorUnidade.pastagem;

    totalLitrosDiaEl.textContent = arred(total, 2);
    totalM3DiaEl.textContent = arred(total / 1000, 3);

    return total;
  }

  function calcularAMT() {
    let hSuc = Math.max(0, parseNumber(pocoProf.value));
    let hElev = Math.max(0, parseNumber(reservAlt.value));
    let dist = Math.max(0, parseNumber(distTubo.value));

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

    const vazaoLh = horas > 0 ? totalDia / horas : 0;
    const vazaoLmin = vazaoLh / 60;
    const vazaoM3h = vazaoLh / 1000;
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
        alert('O JSON do catálogo deve ser um array de bombas.');
        return;
      }
      catalogoBombas = normalizeCatalogo(data);
      catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);
      alert('Catálogo aplicado com sucesso!');
      recalcAll();
    } catch (e) {
      console.error(e);
      alert('JSON inválido. Verifique a sintaxe.');
    }
  }

  function importarCatalogoArquivo() {
    const file = fileCatalogoEl.files[0];
    if (!file) {
      alert('Selecione um arquivo JSON primeiro.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) {
          alert('O JSON do catálogo deve ser um array de bombas.');
          return;
        }
        catalogoBombas = normalizeCatalogo(data);
        catalogoJsonEl.value = JSON.stringify(catalogoBombas, null, 2);
        alert('Catálogo importado com sucesso!');
        recalcAll();
      } catch (e) {
        console.error(e);
        alert('Erro ao ler o JSON. Verifique o arquivo.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function exportarCatalogoArquivo() {
    const blob = new Blob([JSON.stringify(catalogoBombas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'catalogo_bombas.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      const b = normalizeBomba(b0); // garante canônico mesmo se vier “sujo”
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

    if (melhor) {
      bombaRecomendadaEl.textContent = `${melhor.nome} (${melhor.tipo}, ${melhor.tensao})`;
    } else {
      bombaRecomendadaEl.textContent = 'Nenhuma bomba atende às metas atuais.';
    }

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
  }

  function carregarProjeto() {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      alert('Nenhum projeto salvo encontrado.');
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
      alert('Erro ao carregar o projeto salvo.');
    }
  }

  function gerarPdf() {
    if (!lastResults) {
      alert('Calcule os resultados antes de gerar o PDF.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const hoje = new Date();
    const dataStr = hoje.toLocaleString('pt-BR');

    doc.setFontSize(14);
    doc.text('Universidade Estadual de Goiás - UEG', 10, 15);
    doc.setFontSize(12);
    doc.text('Gerência de Projeto de Software', 10, 22);
    doc.text('Relatório de Dimensionamento de Bombeamento Solar', 10, 29);
    doc.setFontSize(10);
    doc.text(`Data/Hora: ${dataStr}`, 10, 36);

    let y = 44;
    doc.setFontSize(11);
    doc.text('1. Entradas do Sistema', 10, y); y += 6;

    doc.setFontSize(9);
    doc.text(`Demanda total: ${arred(lastResults.totalDia, 2)} L/dia (${arred(lastResults.totalDia / 1000, 3)} m³/dia)`, 10, y); y += 5;
    doc.text(`Profundidade do poço: ${arred(parseNumber(pocoProf.value), 2)} m`, 10, y); y += 5;
    doc.text(`Altura do reservatório: ${arred(parseNumber(reservAlt.value), 2)} m`, 10, y); y += 5;
    doc.text(`Distância da tubulação: ${arred(lastResults.dist, 2)} m (${arred(lastResults.dist / 1000, 3)} km)`, 10, y); y += 5;
    doc.text(`Horas de bombeamento: ${arred(lastResults.horas, 2)} h/dia`, 10, y); y += 5;
    doc.text(`Margem vazão: ${arred(parseNumber(margemVazaoEl.value), 2)}`, 10, y); y += 5;
    doc.text(`Margem AMT: ${arred(parseNumber(margemAmtEl.value), 2)}`, 10, y); y += 7;

    doc.setFontSize(11);
    doc.text('2. Resultados de Cálculo', 10, y); y += 6;
    doc.setFontSize(9);
    doc.text(`Perdas de carga (10%): ${arred(lastResults.perdas, 2)} m`, 10, y); y += 5;
    doc.text(`AMT total: ${arred(lastResults.amt, 2)} m`, 10, y); y += 5;
    doc.text(`Vazão necessária: ${arred(lastResults.vazaoLh, 2)} L/h (${arred(lastResults.vazaoLmin, 2)} L/min)`, 10, y); y += 5;
    doc.text(`Vazão em m³: ${arred(lastResults.vazaoM3h, 3)} m³/h (${arred(lastResults.vazaoM3dia, 3)} m³/dia)`, 10, y); y += 5;
    doc.text(`Meta com margens: ${arred(lastResults.metaFlow, 2)} L/h @ ${arred(lastResults.metaAmt, 2)} m`, 10, y); y += 7;

    doc.setFontSize(11);
    doc.text('3. Recomendação de Bomba', 10, y); y += 6;
    doc.setFontSize(9);

    if (lastResults.melhor) {
      doc.text(
        `Recomendada: ${lastResults.melhor.nome} (${lastResults.melhor.tipo}, ${lastResults.melhor.tensao}) - Potência: ${lastResults.melhor.potencia ?? '-'} W`,
        10, y
      );
      y += 6;
    } else {
      doc.text('Nenhuma bomba atende às metas atuais.', 10, y); y += 6;
    }

    doc.text('Top 5 bombas avaliadas:', 10, y); y += 5;
    lastResults.top5.forEach((b, idx) => {
      if (y > 280) { doc.addPage(); y = 20; }
      const status = b.atende ? 'Atende meta' : 'Não atende';
      const linha = `${idx + 1}. ${b.nome} (${b.tipo}, ${b.tensao}) - Qmax:${b.maxFlow} L/h, Hmax:${b.maxHead} m - ${status}`;
      doc.text(linha, 10, y);
      y += 5;
    });

    doc.save('relatorio_bombeamento_solar.pdf');
  }

  function copiarResumoClipboard() {
    const texto = resumoTextoEl.textContent;
    if (!texto.trim()) {
      alert('Não há resumo para copiar.');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(() => {
        alert('Resumo copiado para a área de transferência.');
      }).catch(() => {
        alert('Não foi possível copiar automaticamente. Copie manualmente.');
      });
    } else {
      alert('Navegador sem suporte a clipboard API. Copie manualmente.');
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
  btnGerarPdf.addEventListener('click', gerarPdf);
  btnCopiarResumo.addEventListener('click', copiarResumoClipboard);

  btnResetMapa.addEventListener('click', () => {
    resetMapa();
    recalcAll();
  });

  // Inicialização
  initMap();
  recalcAll();
});
