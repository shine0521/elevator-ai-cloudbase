// doc-generator.js — M2 AI 文档生成引擎（2.0 新增）
// 真实生成 PDF + Word（docx），内嵌 Arial 字体解决中文渲染；输出 SHA-256 供完整性校验。
// 依赖（docx / pdfkit）按需懒加载，避免依赖缺失时阻塞服务启动。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const GEN_DIR = path.join(DATA_DIR, 'generated');
const FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'ArialUnicode.ttf');

function ensureGenDir() { if (!fs.existsSync(GEN_DIR)) fs.mkdirSync(GEN_DIR, { recursive: true }); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function genDocNumber() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `DOC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
function genDocId() {
  return 'DOC' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

// 将任意 formData（对象 / [{label,value}]）规整为 sections 结构
function normalizeSections(formData) {
  if (!formData) return [];
  let items = [];
  if (Array.isArray(formData)) {
    items = formData.filter(i => i && (i.label != null || i.value != null))
      .map(i => ({ label: String(i.label != null ? i.label : ''), value: i.value != null ? String(i.value) : '' }));
  } else if (typeof formData === 'object') {
    items = Object.keys(formData).map(k => ({ label: String(k), value: formData[k] != null ? String(formData[k]) : '' }));
  }
  return items.length ? [{ title: '填写内容', items }] : [];
}

function buildModel({ docType, title, device, formData, conclusion }) {
  const sections = normalizeSections(formData);
  return {
    docId: genDocId(),
    docNumber: genDocNumber(),
    docType: docType || 'GENERIC',
    title: title || '未命名文档',
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    deviceName: device ? device.name : null,
    deviceCode: device ? device.device_code : null,
    sections,
    conclusion: conclusion || null,
  };
}

async function renderDocx(model) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
  const children = [];
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: model.title, bold: true })] }));
  children.push(new Paragraph({ children: [new TextRun(`文档编号：${model.docNumber}    类型：${model.docType}`)] }));
  children.push(new Paragraph({ children: [new TextRun(`生成时间：${model.generatedAt}`)] }));
  if (model.deviceName) children.push(new Paragraph({ children: [new TextRun(`关联设备：${model.deviceName}（${model.deviceCode || ''}）`)] }));
  (model.sections || []).forEach(sec => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(sec.title)] }));
    sec.items.forEach(it => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${it.label}：`, bold: true }), new TextRun(it.value || '—')] }));
    });
  });
  if (model.conclusion) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('结论')] }));
    children.push(new Paragraph({ children: [new TextRun(model.conclusion)] }));
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return await Packer.toBuffer(doc);
}

function renderPdf(model) {
  return new Promise((resolve, reject) => {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    if (fs.existsSync(FONT_PATH)) doc.font(FONT_PATH);
    doc.fontSize(18).text(model.title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`文档编号：${model.docNumber}    类型：${model.docType}`);
    doc.text(`生成时间：${model.generatedAt}`);
    if (model.deviceName) doc.text(`关联设备：${model.deviceName}（${model.deviceCode || ''}）`);
    doc.moveDown();
    (model.sections || []).forEach(sec => {
      doc.fontSize(14).text(sec.title, { underline: true });
      sec.items.forEach(it => { doc.fontSize(11).text(`${it.label}：${it.value || '—'}`); });
      doc.moveDown(0.5);
    });
    if (model.conclusion) { doc.fontSize(14).text('结论', { underline: true }); doc.fontSize(11).text(model.conclusion); }
    doc.end();
  });
}

// 生成文档：写盘 PDF+Word，计算 SHA-256，返回产物元数据（DB 写入由调用方完成）
async function generateDocument(model) {
  ensureGenDir();
  const wordBuf = await renderDocx(model);
  const pdfBuf = await renderPdf(model);
  const wordPath = path.join(GEN_DIR, `${model.docId}.docx`);
  const pdfPath = path.join(GEN_DIR, `${model.docId}.pdf`);
  fs.writeFileSync(wordPath, wordBuf);
  fs.writeFileSync(pdfPath, pdfBuf);
  return {
    docId: model.docId,
    docNumber: model.docNumber,
    wordPath,
    pdfPath,
    wordHash: sha256(wordBuf),
    pdfHash: sha256(pdfBuf),
  };
}

module.exports = { buildModel, generateDocument, genDocId, GEN_DIR, FONT_PATH, sha256 };
