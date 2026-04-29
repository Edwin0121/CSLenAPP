// Importar SheetJS en el worker
// La librería debe estar accesible en la misma ruta o desde la CDN
self.importScripts(
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
);

// ===== Funciones de Ayuda (Helpers) del Worker =====
function toText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isFinite(v))
    return Math.abs(v - Math.trunc(v)) < 1e-9
      ? String(Math.trunc(v))
      : String(v);
  return String(v).trim();
}

function toNum(v) {
  if (typeof v === "string") {
    v = v.replace(/[^\d.-]/g, "");
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(val) {
  if (!val && val !== 0) return "";
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return "";
    return `${String(d.m).padStart(2, "0")}/${String(d.d).padStart(2, "0")}/${
      d.y
    }`;
  }
  const s = String(val).replace(/-/g, "/");
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return String(val);
  return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(
    dt.getDate()
  ).padStart(2, "0")}/${dt.getFullYear()}`;
}

function pick(row, keys) {
  for (const k of keys) {
    if (k in row && row[k] != null) return row[k];
  }
  return "";
}

async function readFirstSheetToJson(file) {
  try {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return ws ? XLSX.utils.sheet_to_json(ws) : [];
  } catch (error) {
    console.error("Error reading Excel file in worker:", error);
    throw new Error("No se pudo leer el archivo Excel.");
  }
}

// ===== Lógica de Consolidación (en el Worker) =====
function consolidar(datosSAP, datosYpack) {
  if (!datosSAP.length || !datosYpack.length) {
    throw new Error("Faltan datos de SAP o Ypack.");
  }

  // Enviar actualización de estado al hilo principal
  self.postMessage({ type: "status", message: "Mapeando Ypack..." });

  const dictY = {};
  for (const row of datosYpack) {
    const so = toText(
      pick(row, [
        "Sales_Ordes",
        "Sales_Orders",
        "Sales Order #",
        "SO",
        "SalesOrder",
        "SalesOrder#",
      ])
    );
    const matY = toText(pick(row, ["MATERIAL", "Material #", "Material"]));
    const qty = toNum(pick(row, ["QTY", "Qty", "Shipped Qty", "Ship Qty pcs"]));
    if (!so || !matY) continue;
    const key = `${so}|${matY}`;
    dictY[key] = (dictY[key] || 0) + qty;
  }

  self.postMessage({ type: "status", message: "Procesando SAP..." });

  const out = [];
  for (const row of datosSAP) {
    const cliente = toText(
      pick(row, ["Soldto Name", "Cliente", "Customer", "Sold-to Name"])
    );
    const shipS = fmtDate(
      pick(row, ["Ship Start date", "Ship Start", "Start Ship D"])
    );
    const cancel = fmtDate(
      pick(row, ["Cancel date", "Cancel Date", "Cancel D"])
    );
    const mABD = fmtDate(pick(row, ["MABD", "MABD date"]));
    const plant = toText(pick(row, ["Plant", "PLANT"]));
    const po = toText(pick(row, ["Customer PO #", "PO", "P.O #"]));
    const so = toText(pick(row, ["Sales Order #", "SO #", "SO", "SalesOrder"]));
    const materialNew = toText(
      pick(row, ["Material #", "Material", "MATERIAL"])
    );
    const materialOld = toText(
      pick(row, [
        "Old Material Num",
        "Old Material Number",
        "Old Material",
        "Old Mat #",
      ])
    );
    const color = toText(pick(row, ["Color Description", "Color"]));
    const size = toText(pick(row, ["Size Description", "Size"]));
    const line = toText(pick(row, ["Line item #", "Line Item", "Item"]));
    const credit = toText(pick(row, ["Overall CreditStatus", "Credit Status"]));
    const uom = toText(pick(row, ["Base unit of measure", "UoM", "Base"]));
    const netTTL = toNum(pick(row, ["Net Value", "Net Value TTL"]));
    const ordQty = toNum(pick(row, ["Ordered Qty", "Open Qty", "Order Qty"]));

    const shipped = toNum(dictY[`${so}|${materialNew}`] || 0);
    const netEA = ordQty ? netTTL / ordQty : 0;
    const diff = ordQty - shipped;

    out.push({
      Cliente: cliente,
      "Ship Start date": shipS,
      "Cancel date": cancel,
      MABD: mABD,
      Plant: plant,
      "Customer PO #": po,
      "Sales Order #": so,
      "Old Material Num": materialOld || "",
      Color: color,
      Size: size,
      "Line item #": line,
      "Material #": materialNew || "",
      "Credit Status": credit,
      UoM: uom,
      "Net Value EA": netEA.toFixed(2),
      "Net Value TTL": netTTL,
      "Ordered Qty": ordQty,
      "Shipped Qty": shipped,
      Diferencia: diff,
    });
  }
  return out;
}

// ===== Manejador de eventos del Worker =====
self.onmessage = async (e) => {
  const { fSAP, fYPK } = e.data;
  try {
    self.postMessage({ type: "status", message: "Leyendo SAP..." });
    const datosSAP = await readFirstSheetToJson(fSAP);

    self.postMessage({ type: "status", message: "Leyendo Ypack..." });
    const datosYpack = await readFirstSheetToJson(fYPK);

    self.postMessage({ type: "status", message: "Consolidando datos..." });
    const resumenData = consolidar(datosSAP, datosYpack);

    // Enviar el resultado final al hilo principal
    self.postMessage({ type: "success", data: resumenData });
  } catch (error) {
    // Enviar cualquier error al hilo principal
    self.postMessage({ type: "error", message: error.message });
  }
};
