import { ISSUE_DETAILS } from './crmConstants';

// Turns an audited lead's real findings into a tangible, brandable
// "Website Audit Report" instead of the findings only ever existing as
// prose in an email — a physical/downloadable artifact reads as far more
// credible and effort-ful in cold outreach than a paragraph of text.
// Uses the browser's native print-to-PDF (window.print()) rather than a
// PDF-generation library: no ~200KB dependency, no font/image rendering
// edge cases, and "Save as PDF" in the print dialog is one click for the
// person using it.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function openAuditReportPrintWindow(lead) {
  const win = window.open('', '_blank');
  if (!win) return; // popup blocked — nothing more we can do here

  const issues = lead.issuesChecklist ?? [];
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const issuesHtml = issues.length > 0
    ? issues.map((issue) => `
        <div class="issue">
          <div class="issue-title">${escapeHtml(issue)}</div>
          ${ISSUE_DETAILS[issue] ? `<div class="issue-detail">${escapeHtml(ISSUE_DETAILS[issue])}</div>` : ''}
        </div>
      `).join('')
    : '<p class="muted">No major issues found in the automated checks.</p>';

  const scoreHtml = typeof lead.websiteScore === 'number'
    ? `<div class="score"><div class="score-number">${lead.websiteScore}</div><div class="score-label">/ 100<br>Page Speed Score</div></div>`
    : '';

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Website Audit — ${escapeHtml(lead.businessName ?? 'Report')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 720px; margin: 0 auto; padding: 48px 32px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 28px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; }
  .header .sub { color: #666; font-size: 13px; }
  .score { text-align: center; }
  .score-number { font-size: 36px; font-weight: 800; color: #2563eb; line-height: 1; }
  .score-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; margin: 28px 0 12px; }
  .issue { border-left: 3px solid #dc2626; padding: 8px 0 8px 14px; margin-bottom: 10px; }
  .issue-title { font-weight: 700; font-size: 14px; }
  .issue-detail { font-size: 13px; color: #444; margin-top: 2px; }
  .impression { font-size: 13px; color: #333; background: #f5f7fa; border-radius: 8px; padding: 14px; }
  .muted { color: #888; font-size: 13px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Website Audit — ${escapeHtml(lead.businessName ?? 'Business')}</h1>
      <div class="sub">${escapeHtml(lead.website ?? '')}${lead.website ? ' · ' : ''}${date}</div>
    </div>
    ${scoreHtml}
  </div>

  <h2>Issues Found</h2>
  ${issuesHtml}

  ${lead.overallImpression ? `<h2>Overall Impression</h2><div class="impression">${escapeHtml(lead.overallImpression)}</div>` : ''}

  <div class="footer">
    Prepared by Dean Burt — dean-da-dev.co.uk<br>
    This audit is a starting point, not an exhaustive review — happy to walk through any of this in more detail.
  </div>

  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>
  `);
  win.document.close();
}
