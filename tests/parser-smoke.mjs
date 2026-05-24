import fs from "node:fs";
import vm from "node:vm";

function elementStub() {
  return {
    addEventListener() {},
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {} },
    click() {},
    querySelectorAll() { return []; },
    remove() {},
    reset() {},
    setAttribute() {},
    style: { setProperty() {} },
    value: "",
  };
}

const context = {
  console,
  crypto: { randomUUID: () => "test-id" },
  Date,
  FileReader: function FileReader() {},
  Image: function Image() {},
  Intl,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  Number,
  String,
  document: {
    createElement() {
      return { getContext: () => ({ drawImage() {} }) };
    },
    querySelector() {
      return elementStub();
    },
    querySelectorAll() {
      return [];
    },
  },
  window: {},
};

context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);

const samples = [
  {
    name: "MXM simple",
    total: 6650,
    merchant: "MXM Tibas",
    text: "MXM TIBAS\nPAT MULTIGRA 2,380 G\nYOG GRG YOPL 4,270 G\nSubtotal ₡ 6,650\nTotal ₡ 6,650\nTARJETAS ON ₡ 6,650\n22/05/26 18:32:04",
  },
  {
    name: "MXM grande",
    total: 22080,
    merchant: "MXM Tibas",
    text: "MXM TIBAS\nBOLSA MED 460 G\nPOZUELO SURT 2,140 G\nGALLETA CLUB 1,320 G\nVOLIO FINO 2 X ₡9,080 18,160 G\nSubtotal ₡ 22,080\nTotal ₡ 22,080\nTARJETAS ON ₡ 22,080\n30/03/26 15:07:35",
  },
  {
    name: "FM Tibas",
    total: 2750,
    merchant: "FM Tibas Vive",
    text: "INVERSIONES AMPM, S.A\nFM TIBAS VIVE\nComprobante 374272 15/04/2026 08:03 PM\nALPINA AGUA TAPA ROSCA 2L BOT\n2.000 1375.00 2750.00\nTotal a Pagar : 2750.00\nMonto Cancelado : 2750.00",
  },
  {
    name: "Farmavalue",
    total: 5980,
    merchant: "Farmavalue",
    text: "Farmavalue Costa Rica S.A\n2026-05-18 16:36:13\nNorbyl 21 tabletas\nSubtotal CRC 5,862.75\nIVA CRC 117.26\nTotal CRC 5,980.01\nTarjeta CRC 5,980.01",
  },
  {
    name: "Super Avenida",
    total: 13780,
    merchant: "Supermercado Avenida 10",
    text: "SUPERMERCADO AVENIDA 10\nFecha:19-04-2026 Hora:18:39:10\naguacate dominicano und 1790.00 S\nqueso semiduro kg 2140.00 S\nTotal:₡ 13,780.00\nTarjeta₡ 13,780.00",
  },
  {
    name: "Kiss Makeup",
    total: 12500,
    merchant: "Kiss Makeup",
    text: "Kiss Makeup\nFecha: 2026-05-17 Hora: 12:19:34\nBE 038 Termoprotector Liso Keratina 250ml\n11.061,95\nTOTAL 12.500,00\nTARJETA CRC 12.500,00",
  },
];

const results = samples.map((sample) => ({
  name: sample.name,
  parsed: context.window.cuentaClaraDebug.parseReceiptText(sample.text),
  expected: { total: sample.total, merchant: sample.merchant },
}));

let failed = false;
for (const result of results) {
  const parsedTotal = result.parsed.amount;
  const expectedTotal = result.expected.total;
  const totalOk = Math.abs(parsedTotal - expectedTotal) <= 1;
  const merchantOk = result.parsed.merchant === result.expected.merchant;
  if (!totalOk || !merchantOk) failed = true;
  console.log(`${result.name}:`, JSON.stringify(result.parsed));
}

if (failed) {
  process.exitCode = 1;
}
