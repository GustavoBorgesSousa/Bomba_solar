(() => {
  // ================== DADOS DEMANDA ==================
  const demandItems = [
    { id: "people",  label: "Pessoas",   unit: "pessoa(s)", lpd: 84 },
    { id: "cattle",  label: "Bovino",    unit: "cabeça(s)", lpd: 45 },
    { id: "pigs",    label: "Suínos",    unit: "cabeça(s)", lpd: 12.5 },
    { id: "garden",  label: "Hortas",    unit: "horta(s)",  lpd: 7 },
    { id: "pasture", label: "Pastagem",  unit: "área(s)",   lpd: 50000 }
  ];

  // ================== CATÁLOGO (EXEMPLO) ==================
  const SAMPLE_CATALOG = [
    {
      name: "Solar DC 24V - Modelo A (superficial)",
      type: "solar_dc",
      voltage: 24,
      powerW: 180,
      price: 690,
      maxFlowLh: 1200,
      maxHeadM: 18
    },
    {
      name: "Solar DC 24V - Modelo B (submersa)",
      type: "submersa",
      voltage: 24,
      powerW: 350,
      price: 1200,
      maxFlowLh: 1800,
      maxHeadM: 35
    },
    {
      name: "Solar DC 48V - Modelo C (submersa)",
      type: "solar_dc",
      voltage: 48,
      powerW: 600,
      price: 2100,
      maxFlowLh: 2600,
      maxHeadM: 55
    },
    {
      name: "AC 220V + Inversor - Bomba D (superficial)",
      type: "ac_inversor",
      voltage: 220,
      powerW: 750,
      price: 1600,
      maxFlowLh: 3200,
      maxHeadM: 40
    },
    {
      name: "Solar DC 12V - Modelo E (pequena)",
      type: "solar_dc",
      voltage: 12,
      powerW: 90,
      price: 390,
      maxFlowLh: 700,
      maxHeadM: 10
    },
    {
      name: "Solar DC 48V - Modelo F (curva por pontos)",
      type: "solar_dc",
      voltage: 48,
      powerW: 800,
      price: 2600,
      curvePoints: [
        { flowLh: 0,    headM: 70 },
        { flowLh: 800,  headM: 62 },
        { flowLh: 1400, headM: 50 },
        { flowLh: 2000, headM: 38 },
        { flowLh: 2600, headM: 24 },
        { flowLh: 3200, headM: 10 }
      ]
    }
  ];

  // Deep clone compatível
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
  let pumpCatalog = deepClone(SAMPLE_CATALOG);

  const state = {
    quantities: Object.fromEntries(demandItems.map(i => [i.id, 0])),
    totalLitersPerDay: 0,
    wellDepth: 0,
    tankHeight: 0,
    pipeDistance: 0,
    headLoss: 0,
    amt: 0,
    pumpHours: 5.5,
    flowLh: 0,
    flowLm: 0,
    powerEnabled: true,
    efficiency: 0.35,
    powerW: 0,
    flowMargin: 1.20,
    headMargin: 1.10
  };

  // ================== HELPERS ==================
  function $(id) { return document.getElementById(id); }

  function clampNumber(v, min = 0, max = Number.POSITIVE_INFINITY) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  }

  function format(n) {
    const x = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return x.toLocaleString("pt-BR");
  }

  // ================== DEMANDA UI ==================
  function renderDemandTable() {
    const container = $("demandTable");
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th class="right">L/dia por unidade</th>
            <th class="right">Quantidade</th>
            <th class="right">Subtotal (L/dia)</th>
          </tr>
        </thead>
        <tbody>
          ${demandItems.map(item => `
            <tr>
              <td>${item.label} <span class="small">(${item.unit})</span></td>
              <td class="right">${format(item.lpd)}</td>
              <td class="right" style="width:140px">
                <input type="number" min="0" step="1" value="${state.quantities[item.id]}" data-demand="${item.id}" style="text-align:right" />
              </td>
              <td class="right"><span id="sub_${item.id}">0</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    container.querySelectorAll('input[data-demand]').forEach(inp => {
      inp.addEventListener("input", (e) => {
        const id = e.target.getAttribute("data-demand");
        const v = clampNumber(e.target.value, 0);
        state.quantities[id] = Math.floor(v);
        e.target.value = state.quantities[id];
        recalcAll();
      });
    });
  }

  // ================== CÁLCULOS BASE ==================
  function recalcDemand() {
    let total = 0;
    for (const item of demandItems) {
      const qty = state.quantities[item.id] || 0;
      const sub = qty * item.lpd;
      total += sub;
      const el = $(`sub_${item.id}`);
      if (el) el.textContent = format(sub);
    }
    state.totalLitersPerDay = total;
    $("totalLiters").textContent = format(total);
  }

  function recalcHydro() {
    state.wellDepth = clampNumber($("wellDepth").value, 0);
    state.tankHeight = clampNumber($("tankHeight").value, 0);
    state.pipeDistance = clampNumber($("pipeDistance").value, 0);

    state.headLoss = 0.10 * state.pipeDistance;
    state.amt = state.wellDepth + state.tankHeight + state.headLoss;

    $("headLoss").value = `${format(state.headLoss)} m`;
    $("amt").textContent = format(state.amt);
  }

  function recalcFlow() {
    state.pumpHours = clampNumber($("pumpHours").value, 0.1);
    const flowLh = state.totalLitersPerDay / state.pumpHours;

    state.flowLh = Number.isFinite(flowLh) ? flowLh : 0;
    state.flowLm = state.flowLh / 60;

    $("flowLh").textContent = format(state.flowLh);
    $("flowLm").textContent = format(state.flowLm);
  }

  function recalcPower() {
    state.powerEnabled = $("powerToggle").checked;
    state.efficiency = clampNumber($("efficiency").value, 0.05, 0.95);

    let powerW = 0;
    if (state.powerEnabled && state.amt > 0 && state.flowLh > 0) {
      const rho = 1000;
      const g = 9.81;
      const Q = state.flowLh / 3600000; // L/h -> m³/s
      const Ph = rho * g * Q * state.amt; // W hidráulica
      powerW = Ph / state.efficiency;      // W elétrica aprox.
    }

    state.powerW = Number.isFinite(powerW) ? powerW : 0;
    $("powerW").textContent = format(state.powerW);
    $("powerKW").textContent = format(state.powerW / 1000);
  }

  // ================== RECOMENDAÇÃO ==================
  function getTarget() {
    state.flowMargin = clampNumber($("flowMargin").value, 1.0, 10.0);
    state.headMargin = clampNumber($("headMargin").value, 1.0, 10.0);

    const targetFlow = state.flowLh * state.flowMargin;
    const targetHead = state.amt * state.headMargin;

    $("targetFlow").textContent = format(targetFlow);
    $("targetHead").textContent = format(targetHead);

    return { targetFlow, targetHead };
  }

  function pumpHeadAtFlow(pump, flowLh) {
    // 1) Curva por pontos -> interpolação
    if (Array.isArray(pump.curvePoints) && pump.curvePoints.length >= 2) {
      const pts = [...pump.curvePoints].sort((a, b) => a.flowLh - b.flowLh);

      if (flowLh <= pts[0].flowLh) return pts[0].headM;
      if (flowLh >= pts[pts.length - 1].flowLh) return pts[pts.length - 1].headM;

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (flowLh >= a.flowLh && flowLh <= b.flowLh) {
          const t = (flowLh - a.flowLh) / (b.flowLh - a.flowLh);
          return a.headM + t * (b.headM - a.headM);
        }
      }
    }

    // 2) Curva linear aprox: (0, Hmax) -> (Qmax, 0)
    const Qmax = pump.maxFlowLh ?? 0;
    const Hmax = pump.maxHeadM ?? 0;
    if (Qmax <= 0 || Hmax <= 0) return 0;

    const frac = 1 - (flowLh / Qmax);
    return Math.max(0, Hmax * frac);
  }

  function recommendPumps() {
    const { targetFlow, targetHead } = getTarget();

    const typeFilter = $("typeFilter").value;
    const voltageFilter = $("voltageFilter").value;

    const filtered = pumpCatalog.filter(p => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (voltageFilter && String(p.voltage ?? "") !== voltageFilter) return false;
      return true;
    });

    const results = filtered.map(p => {
      const headAtTargetFlow = pumpHeadAtFlow(p, targetFlow);
      const meets = headAtTargetFlow >= targetHead;
      const headMarginM = headAtTargetFlow - targetHead;

      const powerCandidateW = (p.powerW ?? null);
      const estimatedNeededW = state.powerW > 0 ? state.powerW : 0;

      const baseW = Math.max(powerCandidateW ?? 0, estimatedNeededW);
      const pvWp = baseW * 1.3;

      const scorePower = (powerCandidateW ?? baseW) || 999999;
      const scorePrice = (p.price ?? 999999);

      const score = (meets ? 0 : 1e9) + scorePower * 1.0 + scorePrice * 0.05 - headMarginM * 2;

      return { pump: p, meets, headAtTargetFlow, headMarginM, pvWp, score };
    }).sort((a, b) => a.score - b.score);

    renderRecommendation(results, targetFlow, targetHead);
  }

  function renderRecommendation(results, targetFlow, targetHead) {
    const good = results.filter(r => r.meets);

    if (good.length === 0 || targetFlow <= 0 || targetHead <= 0) {
      $("bestPumpName").textContent = "—";
      $("bestPumpReason").textContent =
        (targetFlow <= 0 || targetHead <= 0)
          ? "Informe consumo/AMT para recomendar."
          : "Nenhuma bomba do catálogo atende a meta. Aumente o catálogo ou reduza filtros.";
      $("pvWp").textContent = "0";
    } else {
      const best = good[0];
      const p = best.pump;
      $("bestPumpName").textContent = p.name;
      $("bestPumpReason").textContent =
        `Atende ${format(targetFlow)} L/h @ ${format(targetHead)} m. Head estimado na vazão: ${format(best.headAtTargetFlow)} m.`;
      $("pvWp").textContent = format(best.pvWp);
    }

    const container = $("recommendTable");
    if (results.length === 0) {
      container.innerHTML = `<div class="muted">Sem itens no catálogo (ou filtros muito restritos).</div>`;
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Bomba</th>
            <th>Tipo / Tensão</th>
            <th class="right">Head em ${format(targetFlow)} L/h</th>
            <th class="right">Potência</th>
            <th class="right">Preço</th>
            <th class="right">Status</th>
          </tr>
        </thead>
        <tbody>
          ${results.slice(0, 8).map(r => {
            const p = r.pump;
            const status = r.meets ? `<span class="ok">OK</span>` : `<span class="bad">Não atende</span>`;
            const rowClass = r.meets ? "goodRow" : "warnRow";
            const powerTxt = (p.powerW != null) ? `${format(p.powerW)} W` : `<span class="muted">—</span>`;
            const priceTxt = (p.price != null) ? `R$ ${format(p.price)}` : `<span class="muted">—</span>`;
            return `
              <tr class="${rowClass}">
                <td>
                  <b>${p.name}</b><br>
                  <span class="small">${p.curvePoints ? "Curva por pontos" : "Curva linear aprox."}</span>
                </td>
                <td>${p.type ?? "—"}<br><span class="small">${p.voltage ?? "—"} V</span></td>
                <td class="right">${format(r.headAtTargetFlow)} m<br><span class="small">sobra: ${format(r.headMarginM)} m</span></td>
                <td class="right">${powerTxt}</td>
                <td class="right">${priceTxt}</td>
                <td class="right">${status}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      <div class="small" style="margin-top:8px">
        Mostrando top 8 do ranking. Critério: atender meta → menor potência → menor preço → maior folga de head.
      </div>
    `;
  }

  // ================== CATÁLOGO (JSON textarea) ==================
  function syncCatalogTextarea() {
    $("catalogJson").value = JSON.stringify(pumpCatalog, null, 2);
  }

  function loadCatalogFromTextarea() {
    const txt = $("catalogJson").value.trim();
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed)) throw new Error("JSON deve ser uma lista de bombas.");
      pumpCatalog = parsed;
      recommendPumps();
    } catch (e) {
      alert("JSON inválido: " + e.message);
    }
  }

  function resetCatalog() {
    pumpCatalog = deepClone(SAMPLE_CATALOG);
    syncCatalogTextarea();
    recommendPumps();
  }

  // ================== MAPA (Leaflet) ==================
  let map, markerA = null, markerB = null, line = null;

  function initMap() {
    map = L.map("map").setView([-15.8, -47.9], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    map.on("click", (e) => {
      if (!markerA) {
        markerA = L.marker(e.latlng).addTo(map).bindPopup("Captação").openPopup();
        return;
      }

      if (!markerB) {
        markerB = L.marker(e.latlng).addTo(map).bindPopup("Entrega").openPopup();
        line = L.polyline([markerA.getLatLng(), markerB.getLatLng()]).addTo(map);

        const d = map.distance(markerA.getLatLng(), markerB.getLatLng()); // metros
        $("mapDistance").textContent = format(d);
        $("pipeDistance").value = d.toFixed(1);
        recalcAll();
      }
    });

    $("resetMap").addEventListener("click", resetMapPoints);
  }

  function resetMapPoints() {
    if (markerA) { map.removeLayer(markerA); markerA = null; }
    if (markerB) { map.removeLayer(markerB); markerB = null; }
    if (line) { map.removeLayer(line); line = null; }
    $("mapDistance").textContent = "0";
  }

  // ================== PDF (jsPDF) ==================
  function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
    return y + lines.length * lineHeight;
  }

  function getTopRecommendationsForPdf(limit = 5) {
    const { targetFlow, targetHead } = getTarget();

    const typeFilter = $("typeFilter").value;
    const voltageFilter = $("voltageFilter").value;

    const filtered = pumpCatalog.filter(p => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (voltageFilter && String(p.voltage ?? "") !== voltageFilter) return false;
      return true;
    });

    const results = filtered.map(p => {
      const headAtTargetFlow = pumpHeadAtFlow(p, targetFlow);
      const meets = headAtTargetFlow >= targetHead;
      const headMarginM = headAtTargetFlow - targetHead;

      const powerCandidateW = (p.powerW ?? null);
      const scorePower = (powerCandidateW ?? 999999);
      const scorePrice = (p.price ?? 999999);
      const score = (meets ? 0 : 1e9) + scorePower * 1.0 + scorePrice * 0.05 - headMarginM * 2;

      return {
        name: p.name,
        type: p.type ?? "—",
        voltage: p.voltage ?? "—",
        powerW: p.powerW ?? null,
        price: p.price ?? null,
        headAtTargetFlow,
        meets,
        score
      };
    }).sort((a, b) => a.score - b.score);

    const best = results.find(r => r.meets) ?? null;
    return { best, results: results.slice(0, limit), targetFlow, targetHead };
  }

  function generatePdfReport() {
    if (!window.jspdf?.jsPDF) {
      alert("Biblioteca jsPDF não carregou. Verifique sua internet e as tags <script> no index.html.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const marginX = 14;
    const pageW = 210;
    const maxW = pageW - marginX * 2;

    let y = 16;

    // Cabeçalho
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Relatório de Dimensionamento - Bombeamento Solar", marginX, y);
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const now = new Date();
    doc.text(`Gerado em: ${now.toLocaleString("pt-BR")}`, marginX, y);
    y += 8;

    // 1) Demanda
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("1) Demanda diária", marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // detalhar categorias (mais profissional)
    const demandLines = demandItems.map(it => {
      const qty = state.quantities[it.id] || 0;
      const sub = qty * it.lpd;
      return `- ${it.label}: ${qty} × ${format(it.lpd)} = ${format(sub)} L/dia`;
    }).join("\n");

    y = addWrappedText(
      doc,
      `${demandLines}\n\nConsumo total diário: ${format(state.totalLitersPerDay)} L/dia`,
      marginX, y, maxW, 5
    );
    y += 2;

    // 2) Hidrodinâmica
    if (y > 255) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("2) Hidrodinâmica (AMT)", marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const hydroText =
      `Profundidade do poço (sucção): ${format(state.wellDepth)} m\n` +
      `Altura do reservatório (elevação): ${format(state.tankHeight)} m\n` +
      `Distância da tubulação: ${format(state.pipeDistance)} m\n` +
      `Perdas (≈ 10% da distância): ${format(state.headLoss)} m\n` +
      `AMT (total): ${format(state.amt)} m`;
    y = addWrappedText(doc, hydroText, marginX, y, maxW, 5);
    y += 2;

    // 3) Vazão
    if (y > 255) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("3) Vazão mínima necessária", marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const flowText =
      `Horas de bombeamento/dia: ${format(state.pumpHours)} h\n` +
      `Vazão necessária: ${format(state.flowLh)} L/h (${format(state.flowLm)} L/min)`;
    y = addWrappedText(doc, flowText, marginX, y, maxW, 5);
    y += 2;

    // 4) Potência
    if (y > 255) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("4) Potência aproximada (opcional)", marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const powerText = state.powerEnabled
      ? `Eficiência considerada: ${format(state.efficiency)}\nPotência elétrica estimada: ${format(state.powerW)} W (${format(state.powerW/1000)} kW)`
      : `Cálculo de potência desativado pelo usuário.`;
    y = addWrappedText(doc, powerText, marginX, y, maxW, 5);
    y += 2;

    // 5) Recomendação
    const rec = getTopRecommendationsForPdf(5);

    if (y > 245) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("5) Recomendação de bomba (catálogo)", marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const metaText =
      `Margem vazão: ${format(state.flowMargin)} | Margem AMT: ${format(state.headMargin)}\n` +
      `Meta: ${format(rec.targetFlow)} L/h @ ${format(rec.targetHead)} m`;
    y = addWrappedText(doc, metaText, marginX, y, maxW, 5);
    y += 2;

    if (!rec.best) {
      y = addWrappedText(
        doc,
        "Nenhuma bomba do catálogo atende a meta atual (considere ampliar o catálogo ou remover filtros).",
        marginX, y, maxW, 5
      );
      y += 2;
    } else {
      y = addWrappedText(
        doc,
        `Bomba recomendada: ${rec.best.name}\n` +
        `Tipo/Tensão: ${rec.best.type} / ${rec.best.voltage} V\n` +
        `Head estimado na meta de vazão: ${format(rec.best.headAtTargetFlow)} m`,
        marginX, y, maxW, 5
      );
      y += 2;
    }

    // Top opções
    if (y > 245) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Top opções (ranking)", marginX, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    rec.results.forEach((r, idx) => {
      if (y > 285) { doc.addPage(); y = 16; }
      const line =
        `${idx + 1}. ${r.meets ? "OK" : "NÃO"} | ${r.name} | ` +
        `${r.type}/${r.voltage}V | Head: ${format(r.headAtTargetFlow)} m` +
        `${r.powerW != null ? ` | ${format(r.powerW)} W` : ""}` +
        `${r.price != null ? ` | R$ ${format(r.price)}` : ""}`;
      y = addWrappedText(doc, line, marginX, y, maxW, 4.5);
      y += 1;
    });

    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      "Observação: modelo simplificado (perdas aproximadas). Para projeto real, considerar diâmetro, material e conexões.",
      marginX, 292
    );
    doc.setTextColor(0);

    doc.save("relatorio-bombeamento-solar.pdf");
  }

  // ================== ORQUESTRAÇÃO ==================
  function recalcAll() {
    recalcDemand();
    recalcHydro();
    recalcFlow();
    recalcPower();
    recommendPumps();
  }

  function attachListeners() {
    [
      "wellDepth","tankHeight","pipeDistance","pumpHours",
      "efficiency","powerToggle","flowMargin","headMargin",
      "typeFilter","voltageFilter"
    ].forEach(id => {
      $(id).addEventListener("input", recalcAll);
      $(id).addEventListener("change", recalcAll);
    });

    $("recalcRecommend").addEventListener("click", recommendPumps);
    $("loadCatalog").addEventListener("click", loadCatalogFromTextarea);
    $("resetCatalog").addEventListener("click", resetCatalog);
  }

  // ================== INIT ==================
  document.addEventListener("DOMContentLoaded", () => {
    renderDemandTable();
    attachListeners();
    initMap();
    resetCatalog();
    recalcAll();

    // ✅ PDF
    $("btnPdf").addEventListener("click", generatePdfReport);
  });
})();
