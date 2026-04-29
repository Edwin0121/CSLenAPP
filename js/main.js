import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPA_URL = "https://aawqcgapxdqemjqzwcsy.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhd3FjZ2FweGRxZW1qcXp3Y3N5Iiwicm" +
  "9sZSI6ImFub24iLCJpYXQiOjE3NTM4MDcyMzAsImV4cCI6MjA2OTM4MzIzMH0." +
  "LH0_ROcN1-foBkUZFwL4xAcuG68FJz-ReTxsYZFoXss";

const supabase = createClient(SUPA_URL, SUPA_KEY);
const sizeColsIdx = Array.from({ length: 8 }, (_, i) => 30 + i);

let normalized = []; // WIP “long”
let diffs = []; // comparativa WIP vs Supabase
let salesOnly = []; // registros Supabase usados en la comparación

let fase = "norm"; // 'norm' → normalizar, 'diff' → comparar

const btn = document.getElementById("btn-procesar");
const input = document.getElementById("input-file");

// Configuración de tablas y controles
const cfgNorm = {
  container: document.getElementById("resultado-normalizado"),
  searchInput: document.getElementById("search-normalizado"),
  firstBtn: document.getElementById("first-normalizado"),
  prevBtn: document.getElementById("prev-normalizado"),
  nextBtn: document.getElementById("next-normalizado"),
  lastBtn: document.getElementById("last-normalizado"),
  cols: ["po", "style", "color", "size", "qty", "fob_surcharge"],
};
const cfgDiff = {
  container: document.getElementById("resultado-cambios"),
  searchInput: document.getElementById("search-cambios"),
  firstBtn: document.getElementById("first-cambios"),
  prevBtn: document.getElementById("prev-cambios"),
  nextBtn: document.getElementById("next-cambios"),
  lastBtn: document.getElementById("last-cambios"),
  cols: [
    "po",
    "style",
    "color",
    "size",
    "sales_order",
    "qty_wip",
    "qty_supabase",
    "fob_surcharge_w",
    "sales_price_s",
  ],
};
const cfgSupabase = {
  container: document.getElementById("resultado-supabase"),
  searchInput: document.getElementById("search-supabase"),
  firstBtn: document.getElementById("first-supabase"),
  prevBtn: document.getElementById("prev-supabase"),
  nextBtn: document.getElementById("next-supabase"),
  lastBtn: document.getElementById("last-supabase"),
  cols: ["po", "style", "color", "size", "SALES PRICE", "qty"],
};

btn.addEventListener("click", async () => {
  if (fase === "norm") {
    if (!input.files.length) {
      return alert("Selecciona primero un archivo .xlsx");
    }

    // 1. Leer y parsear Excel
    const buf = await input.files[0].arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets["Production"];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 });
    const headers = rows.shift();

    // 2. Wide → agrupar tallas
    const wide = rows.map((r) => ({
      po: r[9],
      style: r[10],
      color: r[13],
      fob_surcharge: parseFloat(r[17]) || 0,
      sizes: sizeColsIdx.map((idx) => ({
        name: headers[idx],
        qty: Number(r[idx] || 0),
      })),
    }));

    // 3. Long → un registro por talla (qty > 0)
    normalized = wide.flatMap((item) =>
      item.sizes
        .filter((s) => s.qty > 0)
        .map((s) => ({
          po: item.po,
          style: item.style,
          color: item.color,
          size: s.name,
          qty: s.qty,
          fob_surcharge: item.fob_surcharge,
        }))
    );

    // 4. Mostrar tabla normalizada
    setupTable({ ...cfgNorm, data: normalized, pageSize: 15 });

    fase = "diff";
    btn.textContent = "Mostrar tabla de comparación";
  } else {
    // 5. Traer SalesOrder filtrando por cliente Brooks
    const { data: sales = [], error } = await supabase
      .from("SalesOrder")
      .select("*")
      .ilike("CUSTOMER", "%Brooks%");
    if (error) {
      console.error("Supabase error:", error);
      return;
    }

    // 6. Generar diffs
    diffs = normalized.map((r) => {
      const so =
        sales.find(
          (s) =>
            s.po === r.po &&
            String(s.size).trim().toUpperCase() === r.size.trim().toUpperCase()
        ) || {};

      return {
        po: r.po,
        style: r.style,
        color: r.color,
        size: r.size,
        sales_order: so.sales_order || "",
        qty_wip: r.qty,
        qty_supabase: so.qty || 0,
        fob_surcharge_w: r.fob_surcharge,
        sales_price_s: so["SALES PRICE"] || 0,
      };
    });

    // 7. Preparar Supabase Only: registros usados en la comparación
    const mapOnly = new Map();
    normalized.forEach((r) => {
      const match = sales.find(
        (s) =>
          s.po === r.po &&
          String(s.size).trim().toUpperCase() === r.size.trim().toUpperCase()
      );
      if (match) {
        const key = `${match.po}|${match.size}`;
        if (!mapOnly.has(key)) {
          mapOnly.set(key, {
            po: match.PO,
            style: match.STYLE,
            color: match.COLOR,
            size: match.SIZE,
            "SALES PRICE": match["SALES PRICE"],
            qty: match.QTY,
          });
        }
      }
    });
    salesOnly = Array.from(mapOnly.values());

    // 8. Renderizar comparativa y Supabase Only
    setupTable({ ...cfgDiff, data: diffs, pageSize: 15 });
    setupTable({ ...cfgSupabase, data: salesOnly, pageSize: 15 });

    btn.disabled = true;
  }
});

/**
 * setupTable: búsqueda + paginación + render de tabla
 */
function setupTable({
  container,
  searchInput,
  firstBtn,
  prevBtn,
  nextBtn,
  lastBtn,
  cols,
  data,
  pageSize,
}) {
  let currentPage = 1;
  let filtered = [...data];

  const totalPages = () => Math.ceil(filtered.length / pageSize);

  function render() {
    const start = (currentPage - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);
    container.innerHTML = buildTableHTML(rows, cols);
    updateButtons();
  }

  function updateButtons() {
    firstBtn.disabled = currentPage === 1;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages();
    lastBtn.disabled = currentPage === totalPages();
  }

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    filtered = data.filter((row) =>
      cols.some((key) =>
        String(row[key] ?? "")
          .toLowerCase()
          .includes(term)
      )
    );
    currentPage = 1;
    render();
  });

  firstBtn.addEventListener("click", () => {
    currentPage = 1;
    render();
  });
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) currentPage--;
    render();
  });
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages()) currentPage++;
    render();
  });
  lastBtn.addEventListener("click", () => {
    currentPage = totalPages();
    render();
  });

  render();
}

/**
 * buildTableHTML: crea el HTML de la tabla dados rows y cols
 */
function buildTableHTML(rows, cols) {
  if (!rows.length) {
    return '<p class="text-secondary">No hay datos para mostrar.</p>';
  }
  let html = '<table class="table table-striped table-bordered"><thead><tr>';
  cols.forEach((c) => (html += `<th>${c}</th>`));
  html += "</tr></thead><tbody>";

  rows.forEach((row) => {
    html += "<tr>";
    cols.forEach((c) => (html += `<td>${row[c] ?? ""}</td>`));
    html += "</tr>";
  });

  html += "</tbody></table>";
  return html;
}
