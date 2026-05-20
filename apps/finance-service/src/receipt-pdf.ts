import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

type ReceiptStudent = {
  fullName?: string | null;
  registrationNumber?: string | null;
  admissionNo?: string | null;
  className?: string | null;
  sectionName?: string | null;
};

type ReceiptFeeHeadLine = {
  feeHeadId?: string | null;
  feeHeadName?: string | null;
  amount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
};

type ReceiptOrder = {
  orderId?: string | null;
  orderNo?: string | null;
  installmentTitle?: string | null;
  paidAmount?: number | null;
  grossAmount?: number | null;
  balanceAmount?: number | null;
  feeHeads?: ReceiptFeeHeadLine[] | null;
};

export type ReceiptPdfContext = {
  receiptNumber?: string | null;
  amount?: number | null;
  method?: string | null;
  referenceNumber?: string | null;
  remarks?: string | null;
  paidAt?: string | null;
  status?: string | null;
  student?: ReceiptStudent | null;
  orders?: ReceiptOrder[] | null;
  academicYearId?: string | null;
};

export type ReceiptPdfOptions = {
  tenantName?: string | null;
  academicYearLabel?: string | null;
  receiverName?: string | null;
  logoUrl?: string | null;
  logoDataUrl?: string | null;
  address?: string | null;
  affiliation?: string | null;
  accreditation?: string | null;
};

export type ReceiptPdfRequest = {
  receipt: ReceiptPdfContext;
  options?: ReceiptPdfOptions;
};

export type ReceiptPdfResult = {
  fileName: string;
  contentType: 'application/pdf';
  pdfBase64: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function dateLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function academicYearCode(label?: string | null) {
  const normalized = (label || '').trim();
  if (!normalized) return '';
  const rangeMatch = normalized.match(/(\d{2,4})\s*[-/]\s*(\d{2,4})/);
  if (rangeMatch) {
    return `${rangeMatch[1]!.slice(-2)}-${rangeMatch[2]!.slice(-2)}`;
  }
  const yearMatch = normalized.match(/(\d{4})/);
  if (!yearMatch) return '';
  const start = yearMatch[1]!;
  const next = String((Number(start) + 1) % 100).padStart(2, '0');
  return `${start.slice(-2)}-${next}`;
}

function formatReceiptNumber(receiptNumber?: string | null, academicYearLabel?: string | null) {
  const raw = (receiptNumber || '').trim();
  if (!raw) return '-';
  if (/^RCP\/\d{2}-\d{2}\/\d{5,}$/.test(raw)) return raw;
  const code = academicYearCode(academicYearLabel);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const serial = digits.padStart(5, '0').slice(-5);
  return code ? `RCP/${code}/${serial}` : `RCP/${serial}`;
}

async function logoToDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (/^data:image\//i.test(url)) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function buildFeeRows(receipt: ReceiptPdfContext) {
  const rows: Array<{ name: string; note?: string; amount: number }> = [];
  for (const order of receipt.orders ?? []) {
    const feeHeads = order.feeHeads ?? [];
    if (feeHeads.length > 0) {
      for (const head of feeHeads) {
        rows.push({
          name: head.feeHeadName || 'Fee Head',
          note: order.installmentTitle || order.orderNo || undefined,
          amount: Number(head.amount ?? 0),
        });
      }
    } else {
      rows.push({
        name: order.installmentTitle || order.orderNo || 'Fee Payment',
        note: order.orderNo || undefined,
        amount: Number(order.grossAmount ?? receipt.amount ?? 0),
      });
    }
  }

  if (rows.length === 0) {
    rows.push({ name: 'Fee Payment', amount: Number(receipt.amount ?? 0) });
  }

  return rows;
}

function buildHtml(receipt: ReceiptPdfContext, options: ReceiptPdfOptions, logoDataUrl: string | null) {
  const tenantName = options.tenantName?.trim() || 'School';
  const academicYearLabel = options.academicYearLabel?.trim() || '-';
  const receiverName = options.receiverName?.trim() || '-';
  const receiptNo = formatReceiptNumber(receipt.receiptNumber, academicYearLabel);
  const studentName = receipt.student?.fullName?.trim() || '-';
  const admissionNo = receipt.student?.admissionNo?.trim() || '-';
  const regNo = receipt.student?.registrationNumber?.trim() || '-';
  const classSection = [receipt.student?.className, receipt.student?.sectionName].filter(Boolean).join(' / ') || '-';
  const paymentDate = dateLabel(receipt.paidAt);
  const paymentMode = (receipt.method || '-').replace(/_/g, ' ');
  const refNo = receipt.referenceNumber || receipt.remarks || '-';
  const grossAmount = (receipt.orders ?? []).reduce((sum, order) => sum + Number(order.grossAmount ?? 0), 0) || Number(receipt.amount ?? 0);
  const paidAmount = Number(receipt.amount ?? 0);
  const balanceAmount = Math.max(0, (receipt.orders ?? []).reduce((sum, order) => sum + Number(order.balanceAmount ?? 0), 0));
  const feeRows = buildFeeRows(receipt);
  const headerLogo = logoDataUrl ? `<img class="header-logo" src="${logoDataUrl}" alt="" />` : '';
  const watermark = logoDataUrl
    ? `<img class="watermark" src="${logoDataUrl}" alt="" />`
    : `<div class="watermark watermark-text">${escapeHtml(tenantName)}</div>`;

  const feeRowsHtml = feeRows.map((row, index) => `
    <tr>
      <td class="col-sno">${String(index + 1).padStart(2, '0')}</td>
      <td class="col-particular">
        <div class="particular">${escapeHtml(row.name)}</div>
        ${row.note ? `<div class="particular-note">${escapeHtml(row.note)}</div>` : ''}
      </td>
      <td class="col-amount">${money(row.amount)}</td>
    </tr>
  `).join('');

  function copyMarkup(copyLabel: string) {
    return `
      <div class="copy">
        ${watermark}
        <div class="content">
          <div class="header">
            <div class="header-logo-wrap">${headerLogo}</div>
            <div class="header-main">
              <div class="tenant">${escapeHtml(tenantName)}</div>
              ${options.address ? `<p class="subline">${escapeHtml(options.address)}</p>` : ''}
              ${options.affiliation ? `<p class="subline">${escapeHtml(options.affiliation)}</p>` : ''}
              ${options.accreditation ? `<p class="subline">${escapeHtml(options.accreditation)}</p>` : ''}
            </div>
            <div class="header-meta">
              <div><strong>Receipt No.</strong><br>${escapeHtml(receiptNo)}</div>
              <div style="margin-top: 2mm;"><strong>Academic Year</strong><br>${escapeHtml(academicYearLabel)}</div>
            </div>
          </div>

          <hr class="header-line" />

          <div class="title-row">
            <div class="title">FEE RECEIPT</div>
            <div class="receipt-no">${escapeHtml(copyLabel)}</div>
          </div>

          <table class="details">
            <tr>
              <td class="label">Student Name</td>
              <td class="value">${escapeHtml(studentName)}</td>
              <td class="label">Admission No.</td>
              <td class="value">${escapeHtml(admissionNo)}</td>
            </tr>
            <tr>
              <td class="label">Reg. No.</td>
              <td class="value">${escapeHtml(regNo)}</td>
              <td class="label">Class / Section</td>
              <td class="value">${escapeHtml(classSection)}</td>
            </tr>
            <tr>
              <td class="label">Payment Mode</td>
              <td class="value">${escapeHtml(paymentMode)}</td>
              <td class="label">Payment Date</td>
              <td class="value">${escapeHtml(paymentDate)}</td>
            </tr>
            <tr>
              <td class="label">Reference No.</td>
              <td class="value">${escapeHtml(refNo)}</td>
              <td class="label">Receiver</td>
              <td class="value">${escapeHtml(receiverName)}</td>
            </tr>
          </table>

          <div class="panel-title">PARTICULARS</div>
          <table class="fees">
            <thead>
              <tr>
                <th class="col-sno">#</th>
                <th class="col-particular">Particular</th>
                <th class="col-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${feeRowsHtml}
            </tbody>
          </table>

          <div class="summary-wrap">
            <div class="summary-box">
              <div class="panel-title">SUMMARY</div>
              <table class="summary">
                <tr>
                  <td class="label">Gross Amount</td>
                  <td class="amount">${money(grossAmount)}</td>
                </tr>
                <tr>
                  <td class="label">Paid Amount</td>
                  <td class="amount">${money(paidAmount)}</td>
                </tr>
                <tr>
                  <td class="label">Balance Amount</td>
                  <td class="amount">${money(balanceAmount)}</td>
                </tr>
              </table>
            </div>
            <div class="payment-box">
              <div class="panel-title">PAYMENT DETAILS</div>
              <table class="payment">
                <tr>
                  <td class="label">Mode</td>
                  <td>${escapeHtml(paymentMode)}</td>
                </tr>
                <tr>
                  <td class="label">Receipt No.</td>
                  <td>${escapeHtml(receiptNo)}</td>
                </tr>
                <tr>
                  <td class="label">Academic Year</td>
                  <td>${escapeHtml(academicYearLabel)}</td>
                </tr>
                <tr>
                  <td class="label">Date</td>
                  <td>${escapeHtml(paymentDate)}</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="fine">
            <div class="footer-line">
              This is a computer generated receipt and does not require a signature.
            </div>
            <div class="sign">Authorized Signatory</div>
          </div>
        </div>
      </div>
    `;
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page {
      position: relative;
      width: 285mm;
      min-height: 192mm;
      box-sizing: border-box;
      overflow: hidden;
    }
    .copies {
      display: flex;
      gap: 4mm;
      width: 100%;
    }
    .copy {
      position: relative;
      flex: 1;
      min-width: 0;
      min-height: 184mm;
      padding: 5mm 4mm 5mm;
      box-sizing: border-box;
      overflow: hidden;
      border: 1px solid #000;
    }
    .watermark {
      position: absolute;
      left: 50%;
      top: 54%;
      transform: translate(-50%, -50%);
      width: 62mm;
      height: 62mm;
      opacity: 0.07;
      pointer-events: none;
      object-fit: contain;
      z-index: 0;
    }
    .watermark-text {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      font-weight: 700;
      text-align: center;
    }
    .content { position: relative; z-index: 1; }
    .header {
      display: flex;
      align-items: center;
      gap: 5mm;
      min-height: 16mm;
    }
    .header-logo-wrap { width: 16mm; flex: 0 0 16mm; }
    .header-logo {
      width: 16mm;
      height: 16mm;
      object-fit: contain;
      display: block;
    }
    .header-main {
      flex: 1;
      text-align: center;
      padding: 0 1mm;
    }
    .tenant {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      margin-bottom: 1mm;
    }
    .subline { font-size: 8px; line-height: 1.25; margin: 0; }
    .header-meta {
      width: 38mm;
      flex: 0 0 38mm;
      text-align: right;
      font-size: 8px;
      line-height: 1.35;
    }
    .header-line {
      border: 0;
      border-top: 1px solid #000;
      margin: 2mm 0 3mm;
    }
    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 2mm;
    }
    .title {
      font-size: 11px;
      font-weight: 700;
    }
    .receipt-no {
      font-size: 9px;
      font-weight: 700;
    }
    .panel-title {
      margin: 2mm 0 1.5mm;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .details td, .details th, .fees td, .summary td, .payment td {
      border: 1px solid #000;
      padding: 1.4mm 1.8mm;
      font-size: 8px;
      vertical-align: top;
      word-break: break-word;
    }
    .details .label, .payment .label, .summary .label {
      width: 17%;
      font-weight: 700;
      white-space: nowrap;
      background: #f3f3f3;
    }
    .details .value {
      width: 33%;
    }
    .fees thead th {
      font-size: 8px;
      font-weight: 700;
      background: #f3f3f3;
      text-align: left;
    }
    .fees .col-sno { width: 8%; text-align: center; }
    .fees .col-particular { width: 72%; }
    .fees .col-amount { width: 20%; text-align: right; }
    .particular { font-size: 8px; font-weight: 700; line-height: 1.25; }
    .particular-note { margin-top: 0.7mm; font-size: 7px; color: #444; line-height: 1.1; }
    .summary-wrap {
      display: flex;
      gap: 2mm;
      margin-top: 2mm;
      align-items: stretch;
    }
    .summary-box, .payment-box {
      flex: 1;
      min-width: 0;
    }
    .summary td { padding: 1.4mm 1.8mm; }
    .summary .amount { text-align: right; font-weight: 700; width: 35%; }
    .footer-line {
      border-top: 1px solid #000;
      margin-top: 2mm;
      padding-top: 1.8mm;
      font-size: 7px;
      line-height: 1.35;
    }
    .fine {
      margin-top: 2mm;
      display: flex;
      justify-content: space-between;
      gap: 4mm;
      font-size: 7px;
    }
    .sign {
      min-width: 32mm;
      text-align: right;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="copies">
      ${copyMarkup('Office Copy')}
      ${copyMarkup('Student Copy')}
    </div>
  </div>
</body>
</html>`;
}

export async function generateReceiptPdf(input: ReceiptPdfRequest): Promise<ReceiptPdfResult> {
  const logoDataUrl = input.options?.logoDataUrl ?? await logoToDataUrl(input.options?.logoUrl ?? null);
  const html = buildHtml(input.receipt, input.options ?? {}, logoDataUrl);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });

    const receiptNo = formatReceiptNumber(input.receipt.receiptNumber, input.options?.academicYearLabel ?? null);
    return {
      fileName: `fee-receipt-${receiptNo.replace(/[^a-zA-Z0-9/-]+/g, '_')}.pdf`,
      contentType: 'application/pdf',
      pdfBase64: Buffer.from(pdf).toString('base64'),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
