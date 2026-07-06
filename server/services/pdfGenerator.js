const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Vercel's filesystem is read-only except /tmp — use it there, otherwise
// keep writing next to the project like before.
const REPORTS_DIR = process.env.VERCEL
  ? path.join("/tmp", "reports")
  : path.join(__dirname, "..", "data", "reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function safeFileName(name) {
  return (name || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Generates a professional PDF report for a company research result.
 * Returns { filePath, fileName }.
 */
function generateReportPdf(result) {
  const fileName = `${safeFileName(result.companyName)}-report-${Date.now()}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const accent = "#4F46E5";
  const dark = "#111827";
  const gray = "#6B7280";

  // Header
  doc
    .fillColor(accent)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text("Company Research Report", { align: "left" });
  doc
    .fillColor(gray)
    .fontSize(10)
    .font("Helvetica")
    .text(`Generated on ${new Date().toLocaleString()}`, { align: "left" });
  doc.moveDown(1);
  doc.strokeColor(accent).lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  // Company name banner
  doc.fillColor(dark).fontSize(18).font("Helvetica-Bold").text(result.companyName || "Unknown Company");
  if (result.website) {
    doc.fillColor(accent).fontSize(11).font("Helvetica").text(result.website, { link: result.website, underline: true });
  }
  doc.moveDown(1);

  const sectionTitle = (t) => {
    doc.moveDown(0.5);
    doc.fillColor(accent).fontSize(13).font("Helvetica-Bold").text(t);
    doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
    doc.moveDown(0.5);
    doc.fillColor(dark).font("Helvetica").fontSize(11);
  };

  // Company Information
  sectionTitle("Company Information");
  const infoRows = [
    ["Company Name", result.companyName || "N/A"],
    ["Website", result.website || "N/A"],
    ["Phone Number", result.phone || "Not publicly available"],
    ["Address", result.address || "Not publicly available"],
  ];
  infoRows.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(value);
  });

  // Summary
  if (result.summary) {
    sectionTitle("Company Summary");
    doc.text(result.summary, { align: "left" });
  }

  // Products/Services
  sectionTitle("Products / Services");
  if (result.products?.length) {
    result.products.forEach((p) => {
      if (typeof p === "string") {
        doc.font("Helvetica").fontSize(11).fillColor(dark).text(`•  ${p}`);
      } else {
        doc.font("Helvetica-Bold").fontSize(11).fillColor(dark).text(`•  ${p.name || "Unnamed"}`);
        if (p.description) {
          doc.font("Helvetica").fontSize(10).fillColor(gray).text(`   ${p.description}`);
          doc.fillColor(dark);
        }
      }
      doc.moveDown(0.2);
    });
  } else {
    doc.text("No product/service information available.");
  }

  // Pain points
  sectionTitle("AI-Generated Pain Points");
  if (result.painPoints?.length) {
    result.painPoints.forEach((p) => doc.text(`•  ${p}`));
  } else {
    doc.text("No pain points identified.");
  }

  // Competitors
  sectionTitle("Competitor Information");
  if (result.competitors?.length) {
    result.competitors.forEach((c, i) => {
      doc.font("Helvetica-Bold").text(`${i + 1}. ${c.name}`);
      if (c.website) {
        doc.font("Helvetica").fillColor(accent).text(c.website, { link: c.website, underline: true });
        doc.fillColor(dark);
      } else {
        doc.font("Helvetica").text("Website: N/A");
      }
      doc.moveDown(0.3);
    });
  } else {
    doc.text("No competitors identified.");
  }

  // Footer
  doc.moveDown(2);
  doc
    .fontSize(9)
    .fillColor(gray)
    .text("Generated automatically by Company Research Assistant (Serper.dev + OpenRouter AI).", {
      align: "center",
    });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve({ filePath, fileName }));
    stream.on("error", reject);
  });
}

module.exports = { generateReportPdf, REPORTS_DIR };
