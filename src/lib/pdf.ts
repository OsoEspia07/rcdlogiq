export type CertificateInput = {
  serviceId: string;
  passportId: string;
  qrCode: string;
  client: string;
  project: string;
  address: string;
  plant: string;
  transporter: string;
  residueType: string;
  netWeight: string;
  photos: string[];
  timeline: string[];
};

function escapePdf(text: string) {
  return text.replace(/[^\x20-\x7E]/g, " ").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

export function createCertificatePdf(input: CertificateInput) {
  const lines = [
    "RCDlogiq - Certificado de disposicion",
    `Servicio: ${input.serviceId}`,
    `ID trazabilidad: ${input.passportId}`,
    `QR: ${input.qrCode}`,
    `Cliente: ${input.client}`,
    `Obra: ${input.project}`,
    `Direccion: ${input.address}`,
    `Transportador: ${input.transporter}`,
    `Destino receptor: ${input.plant}`,
    `Residuo: ${input.residueType}`,
    `Peso neto: ${input.netWeight}`,
    "Timeline:",
    ...input.timeline.slice(0, 8).map((event) => `- ${event}`),
    "Evidencias:",
    ...input.photos.slice(0, 8).map((photo) => `- ${photo}`),
    `Verificacion: ${Buffer.from(input.serviceId + input.passportId + input.netWeight).toString("hex").slice(0, 32)}`,
  ];

  const text = lines
    .slice(0, 24)
    .map((line, index) => `BT /F1 11 Tf 42 ${760 - index * 26} Td (${escapePdf(line).slice(0, 105)}) Tj ET`)
    .join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(text)} >> stream\n${text}\nendstream endobj`,
  ];

  let offset = 9;
  const xref = ["0000000000 65535 f "];
  const body = objects
    .map((object) => {
      const entry = `${offset.toString().padStart(10, "0")} 00000 n `;
      xref.push(entry);
      offset += Buffer.byteLength(object) + 1;
      return object;
    })
    .join("\n");

  const trailer = ["xref", `0 ${xref.length}`, ...xref, "trailer << /Size 6 /Root 1 0 R >>", "startxref", String(offset), "%%EOF"].join("\n");

  return Buffer.from(`%PDF-1.4\n${body}\n${trailer}`);
}
