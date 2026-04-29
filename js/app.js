// ===== Estado (UI Thread) =====
const state = {
  resumenData: [],
  filteredData: [],
  datosSAPFile: null,
  datosYpackFile: null,
  appWorker: null,
};

// ===== Elementos DOM (UI Thread) =====
const elements = {
  status: document.getElementById("status"),
  search: document.getElementById("search"),
  count: document.getElementById("count"),
  dropSAP: document.getElementById("dropSAP"),
  dropYpack: document.getElementById("dropYpack"),
  fileSAP: document.getElementById("fileSAP"),
  fileYpack: document.getElementById("fileYpack"),
  fileSAPInfo: document.getElementById("fileSAPInfo"),
  fileYpackInfo: document.getElementById("fileYpackInfo"),
  processBtn: document.getElementById("processBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  exportNA: document.getElementById("exportNA"),
  clearBtn: document.getElementById("clearBtn"),
  loadingOverlay: document.querySelector(".loading-overlay"),
  loadingText: document.getElementById("loadingText"),
  resumenCount: document.getElementById("resumenCount"),
  negativosCount: document.getElementById("negativosCount"),
  naCount: document.getElementById("naCount"),
  sidebar: document.getElementById("sidebar"),
  mainContent: document.getElementById("mainContent"),
  toggleSidebarBtn: document.getElementById("toggleSidebarBtn"),
  tblResumen: {
    thead: document.querySelector("#tblResumen thead"),
    tbody: document.querySelector("#tblResumen tbody"),
    tfoot: document.querySelector("#tblResumen tfoot"),
  },
  tblNeg: {
    thead: document.querySelector("#tblNeg thead"),
    tbody: document.querySelector("#tblNeg tbody"),
    tfoot: document.querySelector("#tblNeg tfoot"),
  },
  tblNA: {
    thead: document.querySelector("#tblNA thead"),
    tbody: document.querySelector("#tblNA tbody"),
    tfoot: document.querySelector("#tblNA tfoot"), // Corregido: tfoot también puede existir aquí
  },
};

// ===== Helpers (UI Thread) =====
function setStatus(message, type = "default") {
  const statusIcon = elements.status.querySelector("i");
  elements.status.querySelector("span").textContent = message;
  elements.status.className = "status-badge ";

  switch (type) {
    case "success":
      elements.status.classList.add("status-ready");
      statusIcon.className = "fas fa-check-circle";
      break;
    case "warning":
      elements.status.classList.add("status-waiting");
      statusIcon.className = "fas fa-clock";
      break;
    case "error":
      elements.status.classList.add("status-error");
      statusIcon.className = "fas fa-exclamation-circle";
      break;
    default:
      elements.status.classList.add("status-waiting");
      statusIcon.className = "fas fa-clock";
  }
}

function showLoading(show, message = "Procesando archivos...") {
  elements.loadingOverlay.style.display = show ? "flex" : "none";
  if (show) {
    elements.loadingText.textContent = message;
  }
}

function toNum(v) {
  // Versión simple para el hilo UI
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ===== Render (UI Thread) =====
function filtrar(arr) {
  const q = elements.search.value.trim().toLowerCase();
  if (!q) return arr;
  return arr.filter((r) =>
    Object.values(r).some((v) => String(v).toLowerCase().includes(q))
  );
}

function renderResumen() {
  const { thead, tbody, tfoot } = elements.tblResumen;
  thead.innerHTML = tbody.innerHTML = tfoot.innerHTML = "";

  if (!state.filteredData.length) {
    thead.innerHTML =
      "<tr><th colspan='20' class='text-center py-4'>No hay datos para mostrar.</th></tr>";
    elements.resumenCount.textContent = "0";
    return;
  }

  const data = state.filteredData;
  const keys = Object.keys(state.filteredData[0]);

  // Crear encabezados
  const trH = document.createElement("tr");
  keys.forEach((k) => {
    const th = document.createElement("th");
    th.textContent = k;
    th.title = k;
    trH.appendChild(th);
  });
  thead.appendChild(trH);

  // Crear filas de datos (usando DocumentFragment para mejor performance)
  const fragment = document.createDocumentFragment();
  data.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "fade-in";
    keys.forEach((k) => {
      const v = r[k];
      const td = document.createElement("td");
      if (
        ["Net Value TTL", "Ordered Qty", "Shipped Qty", "Diferencia"].includes(
          k
        )
      ) {
        td.className = "num";
        const numVal = toNum(v);
        if (k === "Diferencia") {
          td.classList.add(numVal < 0 ? "negative-diff" : "positive-diff");
        }
        td.textContent = numVal.toFixed(2);
      } else {
        td.textContent = v ?? "";
      }
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);

  // Crear pie de tabla
  const sum = {
    "Net Value TTL": 0,
    "Ordered Qty": 0,
    "Shipped Qty": 0,
    Diferencia: 0,
  };
  data.forEach((r) => {
    sum["Net Value TTL"] += toNum(r["Net Value TTL"]);
    sum["Ordered Qty"] += toNum(r["Ordered Qty"]);
    sum["Shipped Qty"] += toNum(r["Shipped Qty"]);
    sum["Diferencia"] += toNum(r["Diferencia"]);
  });

  const trF = document.createElement("tr");
  keys.forEach((k, i) => {
    const td = document.createElement("td");
    if (k in sum) {
      td.className = "num";
      td.textContent = sum[k].toFixed(2);
      if (k === "Diferencia")
        td.classList.add(sum[k] < 0 ? "negative-diff" : "positive-diff");
    } else if (i === 0) {
      td.textContent = `Total: ${data.length} filas`;
    }
    trF.appendChild(td);
  });
  tfoot.appendChild(trF);

  elements.count.textContent = data.length.toLocaleString();
  elements.resumenCount.textContent = data.length.toLocaleString();
}

function renderNegativos() {
  const { thead, tbody, tfoot } = elements.tblNeg;
  thead.innerHTML = tbody.innerHTML = tfoot.innerHTML = "";

  const cols = [
    "Cliente",
    "Customer PO #",
    "Sales Order #",
    "Old Material Num",
    "Color",
    "Size",
    "Line item #",
    "Material #",
    "Ordered Qty",
    "Shipped Qty",
    "Diferencia",
  ];
  const data = state.filteredData.filter((r) => toNum(r.Diferencia) < 0);

  if (!data.length) {
    thead.innerHTML =
      "<tr><th colspan='11' class='text-center py-4'>No hay diferencias negativas</th></tr>";
    elements.negativosCount.textContent = "0";
    return;
  }

  const trH = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trH.appendChild(th);
  });
  thead.appendChild(trH);

  const fragment = document.createDocumentFragment();
  data.forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "fade-in";
    cols.forEach((c) => {
      const v = r[c];
      const td = document.createElement("td");
      if (["Ordered Qty", "Shipped Qty", "Diferencia"].includes(c)) {
        td.className = "num";
        const numVal = toNum(v);
        if (c === "Diferencia") td.classList.add("negative-diff");
        td.textContent = numVal.toFixed(2);
      } else {
        td.textContent = v ?? "";
      }
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);

  const totals = { "Ordered Qty": 0, "Shipped Qty": 0, Diferencia: 0 };
  data.forEach((r) => {
    totals["Ordered Qty"] += toNum(r["Ordered Qty"]);
    totals["Shipped Qty"] += toNum(r["Shipped Qty"]);
    totals["Diferencia"] += toNum(r["Diferencia"]);
  });

  const trF = document.createElement("tr");
  cols.forEach((c, i) => {
    const td = document.createElement("td");
    if (i === 0) {
      td.textContent = `Total: ${data.length} filas`;
    } else if (c in totals) {
      td.className = "num";
      td.textContent = totals[c].toFixed(2);
      if (c === "Diferencia") td.classList.add("negative-diff");
    }
    trF.appendChild(td);
  });
  tfoot.appendChild(trF);

  elements.negativosCount.textContent = data.length.toLocaleString();
}

function renderNA() {
  const { thead, tbody, tfoot } = elements.tblNA;
  thead.innerHTML = tbody.innerHTML = "";
  if (tfoot) tfoot.innerHTML = ""; // Limpiar tfoot si existe

  const filtered = state.filteredData.filter(
    (r) => String(r["Credit Status"]).toLowerCase() === "not approved"
  );

  if (!filtered.length) {
    thead.innerHTML =
      "<tr><th colspan='12' class='text-center py-4'>No hay órdenes con 'Not approved'</th></tr>";
    elements.naCount.textContent = "0";
    return;
  }

  const bySO = {};
  for (const r of filtered) {
    const so = String(r["Sales Order #"]).trim();
    if (!bySO[so]) {
      bySO[so] = {
        Customer: r.Cliente,
        "Ship Start": r["Ship Start date"],
        Cancel: r["Cancel date"],
        Plant: r.Plant,
        PO: r["Customer PO #"],
        "SO #": so,
        Credit: r["Credit Status"],
        Base: r["UoM"],
        "Order Qty": 0,
        "Ship Qty pcs": 0,
        "Net Value": 0,
        "Ship Value": 0,
      };
    }
    const g = bySO[so];
    const oq = toNum(r["Ordered Qty"]),
      sq = toNum(r["Shipped Qty"]),
      nv = toNum(r["Net Value TTL"]);
    g["Order Qty"] += oq;
    g["Ship Qty pcs"] += sq;
    g["Net Value"] += nv;
    g["Ship Value"] += oq > 0 ? (sq / oq) * nv : 0;
  }

  const cols = [
    "Customer",
    "Ship Start",
    "Cancel",
    "Plant",
    "PO",
    "SO #",
    "Credit",
    "Base",
    "Order Qty",
    "Ship Qty pcs",
    "Net Value",
    "Ship Value",
  ];

  const trH = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trH.appendChild(th);
  });
  thead.appendChild(trH);

  const fragment = document.createDocumentFragment();
  Object.values(bySO).forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "fade-in";
    cols.forEach((c) => {
      const td = document.createElement("td");
      if (
        ["Order Qty", "Ship Qty pcs", "Net Value", "Ship Value"].includes(c)
      ) {
        td.className = "num";
        td.textContent = toNum(r[c]).toFixed(2);
      } else {
        td.textContent = r[c] ?? "";
      }
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);

  elements.naCount.textContent = Object.keys(bySO).length.toLocaleString();
}

function renderTodo() {
  state.filteredData = filtrar(state.resumenData);
  renderResumen();
  renderNegativos();
  renderNA();

  elements.exportAllBtn.disabled = state.resumenData.length === 0;
  elements.exportNA.disabled =
    state.resumenData.filter(
      (r) => String(r["Credit Status"]).toLowerCase() === "not approved"
    ).length === 0;
}

// ===== Export (UI Thread) =====
function exportResumen() {
  if (!state.resumenData.length) {
    alert("No hay datos para exportar.");
    return;
  }
  const data = state.filteredData;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumen");
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `Resumen_Consolidado_${ts}.xlsx`);
}

function exportNotApproved() {
  // La lógica es idéntica a la de renderNA, solo que exporta
  const filtered = state.filteredData.filter(
    (r) => String(r["Credit Status"]).toLowerCase() === "not approved"
  );
  if (!filtered.length) {
    alert("No hay órdenes con Credit Status 'Not approved'.");
    return;
  }
  const bySO = {};
  filtered.forEach((r) => {
    const so = String(r["Sales Order #"]).trim();
    if (!bySO[so])
      bySO[so] = {
        Customer: r.Cliente,
        "Ship Start": r["Ship Start date"],
        Cancel: r["Cancel date"],
        Plant: r.Plant,
        PO: r["Customer PO #"],
        "SO #": so,
        Credit: r["Credit Status"],
        Base: r["UoM"],
        "Order Qty": 0,
        "Ship Qty pcs": 0,
        "Net Value": 0,
        "Ship Value": 0,
      };
    const g = bySO[so];
    const oq = toNum(r["Ordered Qty"]),
      sq = toNum(r["Shipped Qty"]),
      nv = toNum(r["Net Value TTL"]);
    g["Order Qty"] += oq;
    g["Ship Qty pcs"] += sq;
    g["Net Value"] += nv;
    g["Ship Value"] += oq > 0 ? (sq / oq) * nv : 0;
  });
  const ws = XLSX.utils.json_to_sheet(Object.values(bySO));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumen Not Approved");
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `Resumen_PO_Not_Approved_${ts}.xlsx`);
}

// ===== Eventos UI (UI Thread) =====
function setupEventListeners() {
  elements.dropSAP.addEventListener("click", () => elements.fileSAP.click());
  elements.dropYpack.addEventListener("click", () =>
    elements.fileYpack.click()
  );

  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ["dragenter", "dragover"].forEach((ev) => {
    elements.dropSAP.addEventListener(ev, (e) => {
      prevent(e);
      elements.dropSAP.classList.add("dragover");
    });
    elements.dropYpack.addEventListener(ev, (e) => {
      prevent(e);
      elements.dropYpack.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    elements.dropSAP.addEventListener(ev, (e) => {
      prevent(e);
      elements.dropSAP.classList.remove("dragover");
    });
    elements.dropYpack.addEventListener(ev, (e) => {
      prevent(e);
      elements.dropYpack.classList.remove("dragover");
    });
  });

  elements.dropSAP.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files?.[0];
    if (f && /\.(xls|xlsx|xlsm)$/i.test(f.name)) {
      elements.fileSAP.files = e.dataTransfer.files;
      handleFileSelect(f, "SAP");
    }
  });
  elements.dropYpack.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files?.[0];
    if (f && /\.(xls|xlsx|xlsm)$/i.test(f.name)) {
      elements.fileYpack.files = e.dataTransfer.files;
      handleFileSelect(f, "Ypack");
    }
  });

  elements.fileSAP.addEventListener("change", () => {
    const f = elements.fileSAP.files?.[0];
    if (f) handleFileSelect(f, "SAP");
  });
  elements.fileYpack.addEventListener("change", () => {
    const f = elements.fileYpack.files?.[0];
    if (f) handleFileSelect(f, "Ypack");
  });

  elements.processBtn.addEventListener("click", processFiles);
  elements.exportAllBtn.addEventListener("click", exportResumen);
  elements.exportNA.addEventListener("click", exportNotApproved);
  elements.clearBtn.addEventListener("click", clearAll);
  elements.search.addEventListener("input", debounce(renderTodo, 300));

  // Evento para el botón del sidebar
  elements.toggleSidebarBtn.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-closed");
    const icon = elements.toggleSidebarBtn.querySelector("i");
    if (document.body.classList.contains("sidebar-closed")) {
      icon.classList.remove("fa-chevron-left");
      icon.classList.add("fa-chevron-right");
    } else {
      icon.classList.remove("fa-chevron-right");
      icon.classList.add("fa-chevron-left");
    }
  });

  // Lógica para cerrar/abrir sidebar en responsive
  if (window.innerWidth <= 992) {
    document.body.classList.add("sidebar-closed");
  } else {
    document.body.classList.remove("sidebar-closed");
  }
}

function handleFileSelect(file, type) {
  const dropzone = type === "SAP" ? elements.dropSAP : elements.dropYpack;
  const fileInfo =
    type === "SAP" ? elements.fileSAPInfo : elements.fileYpackInfo;

  dropzone.classList.add("has-file");
  fileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;

  if (type === "SAP") {
    state.datosSAPFile = file;
  } else {
    state.datosYpackFile = file;
  }

  if (state.datosSAPFile && state.datosYpackFile) {
    setStatus("Archivos listos. Haz clic en Procesar", "success");
  } else {
    setStatus(`Archivo ${type} cargado. Esperando el otro.`, "warning");
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " bytes";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / 1048576).toFixed(1) + " MB";
}

function processFiles() {
  if (!state.datosSAPFile || !state.datosYpackFile) {
    setStatus("Selecciona ambos archivos (SAP y Ypack).", "error");
    return;
  }
  showLoading(true, "Iniciando procesamiento...");

  // Enviar archivos al worker
  // Nota: Los objetos File se pueden transferir, son 'Transferable'
  state.appWorker.postMessage({
    fSAP: state.datosSAPFile,
    fYPK: state.datosYpackFile,
  });
}

function clearAll() {
  state.resumenData = [];
  state.filteredData = [];
  state.datosSAPFile = null;
  state.datosYpackFile = null;

  elements.fileSAP.value = "";
  elements.fileYpack.value = "";
  elements.fileSAPInfo.textContent = "Arrastra o haz clic aquí";
  elements.fileYpackInfo.textContent = "Arrastra o haz clic aquí";

  elements.dropSAP.classList.remove("has-file");
  elements.dropYpack.classList.remove("has-file");
  elements.search.value = "";

  ["tblResumen", "tblNeg", "tblNA"].forEach((id) => {
    document.querySelector(`#${id} thead`).innerHTML = "";
    document.querySelector(`#${id} tbody`).innerHTML = "";
    const tfoot = document.querySelector(`#${id} tfoot`);
    if (tfoot) tfoot.innerHTML = "";
  });

  elements.count.textContent = "0";
  elements.resumenCount.textContent = "0";
  elements.negativosCount.textContent = "0";
  elements.naCount.textContent = "0";

  elements.exportAllBtn.disabled = true;
  elements.exportNA.disabled = true;

  setStatus("Esperando archivos", "warning");
  document.getElementById("resumen-tab").click();
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ===== Inicialización (UI Thread) =====
function initWorker() {
  // ¡Este es el gran cambio!
  // En lugar de leer el script del HTML, simplemente le decimos
  // al navegador que cargue el archivo 'worker.js'
  state.appWorker = new Worker("worker.js");

  // Manejador para mensajes DEL worker
  state.appWorker.onmessage = (e) => {
    const { type, message, data } = e.data;

    if (type === "status") {
      showLoading(true, message);
      setStatus(message, "warning");
    } else if (type === "success") {
      state.resumenData = data;
      setStatus("Datos procesados correctamente", "success");
      renderTodo();
      showLoading(false);
    } else if (type === "error") {
      console.error("Error from worker:", message);
      setStatus(`Error: ${message}`, "error");
      showLoading(false);
    }
  };

  state.appWorker.onerror = (e) => {
    console.error(`Error en el Worker: ${e.message}`, e);
    setStatus("Error fatal en el worker. Revisa la consola.", "error");
    showLoading(false);
  };
}

document.addEventListener("DOMContentLoaded", function () {
  initWorker();
  setupEventListeners();
  setStatus("Esperando archivos", "warning");

  // Lógica inicial del sidebar
  if (window.innerWidth <= 992) {
    document.body.classList.add("sidebar-closed");
    elements.toggleSidebarBtn
      .querySelector("i")
      .classList.add("fa-chevron-right");
    elements.toggleSidebarBtn
      .querySelector("i")
      .classList.remove("fa-chevron-left");
  }
});
