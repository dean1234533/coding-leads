const APP_MVP_TYPES = ['App Developer', 'Mobile App', 'Web App'];
const SAAS_MVP_TYPES = ['SaaS', 'MVP'];
const WEBSITE_TYPES = ['Website', 'Website Redesign', 'Web Developer', 'Shopify', 'WordPress', 'Ecommerce', 'SEO Help', 'Technical Fix'];

export function computeAnalytics(leads) {
  const total       = leads.length;
  const newLeads    = leads.filter((l) => l.status === 'New').length;
  const highIntent  = leads.filter((l) => (l.intentScore ?? 0) >= 70).length;
  const contacted   = leads.filter((l) => l.status && l.status !== 'New' && l.status !== 'Saved').length;
  const replies     = leads.filter((l) => l.status === 'Replied' || l.status === 'Won').length;
  const won         = leads.filter((l) => l.status === 'Won').length;
  const websiteLeads = leads.filter((l) => WEBSITE_TYPES.includes(l.leadType)).length;
  const appLeads     = leads.filter((l) => APP_MVP_TYPES.includes(l.leadType)).length;
  const saasMvpLeads = leads.filter((l) => SAAS_MVP_TYPES.includes(l.leadType) || l.leadType === 'Booking System').length;

  const sourceCounts = {};
  const keywordCounts = {};
  for (const lead of leads) {
    if (lead.source) sourceCounts[lead.source] = (sourceCounts[lead.source] ?? 0) + 1;
    for (const kw of lead.detectedKeywords ?? []) {
      keywordCounts[kw] = (keywordCounts[kw] ?? 0) + 1;
    }
  }
  const bestSource  = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0]  ?? '—';
  const bestKeyword = Object.entries(keywordCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return {
    total, newLeads, highIntent, contacted, replies, won,
    websiteLeads, appLeads, saasMvpLeads, bestSource, bestKeyword,
  };
}
