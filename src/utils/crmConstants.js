// ─── Lead statuses (pipeline stages) ───────────────────────────────────────
export const STATUSES = [
  'New',
  'Researching',
  'Ready To Contact',
  'Email Sent',
  'Follow Up Due',
  'Replied',
  'Meeting Booked',
  'Quote Sent',
  'Negotiating',
  'Won',
  'Lost',
  'Archive',
];

export const STATUS_COLORS = {
  'New':               { dot: 'bg-gray-400',    text: 'text-gray-300',    bg: 'bg-gray-400/10 ring-gray-400/20' },
  'Researching':       { dot: 'bg-sky-400',      text: 'text-sky-400',     bg: 'bg-sky-400/10 ring-sky-400/20' },
  'Ready To Contact':  { dot: 'bg-cyan-400',     text: 'text-cyan-400',    bg: 'bg-cyan-400/10 ring-cyan-400/20' },
  'Email Sent':        { dot: 'bg-blue-400',     text: 'text-blue-400',    bg: 'bg-blue-400/10 ring-blue-400/20' },
  'Follow Up Due':     { dot: 'bg-amber-400',    text: 'text-amber-400',   bg: 'bg-amber-400/10 ring-amber-400/20' },
  'Replied':           { dot: 'bg-violet-400',   text: 'text-violet-400', bg: 'bg-violet-400/10 ring-violet-400/20' },
  'Meeting Booked':    { dot: 'bg-fuchsia-400',  text: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10 ring-fuchsia-400/20' },
  'Quote Sent':        { dot: 'bg-purple-400',   text: 'text-purple-400', bg: 'bg-purple-400/10 ring-purple-400/20' },
  'Negotiating':       { dot: 'bg-orange-400',   text: 'text-orange-400', bg: 'bg-orange-400/10 ring-orange-400/20' },
  'Won':                { dot: 'bg-emerald-400',  text: 'text-emerald-400', bg: 'bg-emerald-400/10 ring-emerald-400/20' },
  'Lost':               { dot: 'bg-red-400',      text: 'text-red-400',    bg: 'bg-red-400/10 ring-red-400/20' },
  'Archive':            { dot: 'bg-gray-600',     text: 'text-gray-500',   bg: 'bg-gray-600/10 ring-gray-600/20' },
};

export const PRIORITIES = ['Low', 'Medium', 'High'];

export const INDUSTRIES = [
  'Salon', 'Gym', 'Law Firm', 'Restaurant', 'Trades', 'Dentist',
  'Electrician', 'Plumber', 'Retail', 'Real Estate', 'Other',
];

export const SOURCES = ['Google Maps', 'Referral', 'RSS Scout', 'Cold Search', 'Inbound', 'Other'];

// ─── Website issues checklist ──────────────────────────────────────────────
export const WEBSITE_ISSUES = [
  'Outdated Design',
  'Slow Loading',
  'Not Mobile Friendly',
  'Broken Links',
  'Broken Images',
  'Missing SSL',
  'Poor Navigation',
  'No Booking System',
  'No Contact Form',
  'Poor CTA',
  'Text Hard To Read',
  'Low Quality Images',
  'No Testimonials',
  'No Portfolio',
  'No Google Reviews',
  'Old Branding',
  'Confusing Layout',
  'Other',
];

// ─── Portfolio demos (seed data — Dean fills in real URLs) ────────────────
export const DEFAULT_PORTFOLIO = [
  { name: 'Beauty Studio', url: 'https://dean1234533.github.io/The-Beauty-Studio-Premium-Booking-Website-Demo/' },
  { name: 'Gym',           url: 'https://dean1234533.github.io/Da-Gym-Premium-Fitness-Website-Mockup/' },
  { name: 'Law Firm',      url: 'https://dean1234533.github.io/Da-Law-Firm-Premium-Law-Firm-Website-Mockup/' },
  { name: 'Boxing Club',   url: 'https://dean1234533.github.io/Apex-boxing-club-Premium-Website-Mockup/' },
];

// ─── Email templates ────────────────────────────────────────────────────
// Variables: {{business}} {{contact}} {{website}} {{industry}} {{issue}} {{portfolio}} {{myname}}
// Plus computed fallback-safe variables built from the above (see
// buildTemplateVars() below, used by CrmComposer.jsx / CrmBulkSendModal.jsx):
//   {{portfolio_line}} — a "Website: <MY_WEBSITE>" + "Portfolio example: <demo url>"
//     block (with its own leading blank line). Always includes the main
//     website; the portfolio line only appears once a demo's been picked.
//   {{issue_note}} / {{issue_highlight}} — parenthetical/dash clauses built
//     from {{issue}} so the surrounding sentence still reads as a complete
//     thought when no website issue has been logged for the lead.
//   {{signature}} — the full sign-off block (name, dean-da-dev, email, site).
export const DEFAULT_TEMPLATES = [
  {
    name: 'General Outreach',
    category: 'Outreach',
    subject: 'A quick idea for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I came across {{business}} recently and had a look at your online presence. I noticed a few areas where I believe your website could be improved — whether that's the overall design, how it performs on mobile, page loading speed, or something else that could be quietly costing you enquiries from potential customers.

I'm {{myname}}, and I build premium, mobile-friendly websites for local businesses that are designed to look professional, perform well across all devices, and help turn more visitors into enquiries.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Digital Agency Partner',
    category: 'Partnerships',
    subject: 'Technical partnership inquiry — {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I've been following {{business}}'s work and love the quality of your digital projects — it's clear a lot of care goes into what you put out.

I'm a full-stack developer specialising in building mobile apps and websites, and I handle the full development lifecycle from design and code through to store submission. I'm looking to partner with a small number of select agencies that need reliable, back-office technical capacity for the projects that fall outside their current bandwidth.{{portfolio_line}}

If you ever have a client project requiring app or dashboard development, I'd love to be a resource you can lean on with confidence.

If you'd be interested in a no-obligation chat about how this could work, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Bookrightly Platform Pitch',
    category: 'Bookrightly',
    subject: `Built something I think you'd find useful — {{business}}`,
    body: `Hi {{contact}},

I hope you're doing well.

I've been building a platform called Bookrightly, and having looked at {{business}}, I think it could genuinely be useful to you.

It gives businesses like yours everything needed to run day-to-day operations properly in one place — your own booking site, online card payments, automated reminders, invoices, and a dashboard to manage all of it. There's trade-specific functionality built in too, like a quote generator with a shareable client link, or workout plans if you train clients.

It's 90 days free to try, no card required, and takes about 10 minutes to set up: https://bookrightly.co.uk

If you'd be interested in a no-obligation chat about whether it's a good fit for {{business}}, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Bookrightly Subscription Pitch',
    category: 'Bookrightly',
    subject: 'Get online with a website and booking system — {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I came across {{business}} and noticed you don't currently have a website. Without one, you're likely missing out on customers who search online before booking — and that can be a significant chunk of new business going elsewhere to a competitor who does show up.

I run a platform called Bookrightly (https://bookrightly.co.uk), built specifically for businesses like yours. For just £29/month you get:

  ✓ Your own professional website
  ✓ Online booking system so clients can book 24/7
  ✓ Card payments built in
  ✓ Client management and appointment reminders
  ✓ Calendar sync with Google Calendar
  ✓ No setup fees — up and running within days

Most customers tell us it pays for itself with just one or two extra bookings a month.{{portfolio_line}}

If you'd be interested in a no-obligation chat about whether it could work for {{business}}, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Salon',
    category: 'Industry',
    subject: 'Helping {{business}} book more appointments online',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look at {{business}} and noticed there isn't currently an easy way for clients to book online. In practice that usually means a steady trickle of missed bookings from people browsing outside your opening hours, who move on to a salon that lets them book instantly.

I build premium, mobile-friendly websites with a built-in booking system for salons like yours — designed to look professional, work smoothly on a phone, and make it effortless for clients to book whenever suits them.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Gym',
    category: 'Industry',
    subject: 'A modern website + booking system for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look at {{business}} online and thought there was an opportunity worth mentioning. I help gyms get a modern, mobile-friendly website with class bookings and membership sign-ups built directly in — so prospective members can see your schedule and sign up without having to call or message you first.{{portfolio_line}}

If you'd be interested in a no-obligation chat about what this could look like for {{business}}, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Law Firm',
    category: 'Industry',
    subject: 'A more professional online presence for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

First impressions matter a great deal in your industry, and I had a look at {{business}}'s website with that in mind. I believe a refresh could help present the firm more strongly and win more client enquiries from people comparing their options online.

I build premium, professional websites for firms like yours — designed to build trust quickly and make it easy for a prospective client to get in touch.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Restaurant',
    category: 'Industry',
    subject: 'Getting {{business}} more online orders/bookings',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look at {{business}} online and wanted to reach out. I help restaurants get a website that makes it simple for customers to see the menu, book a table, or order online — all from their phone, without friction.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Trades',
    category: 'Industry',
    subject: 'A website that brings {{business}} more enquiries',
    body: `Hi {{contact}},

I hope you're doing well.

Most people search online before hiring a tradesperson these days — if {{business}} doesn't show up well in that search, those jobs are quietly going to a competitor instead. I build simple, fast, mobile-friendly websites for trades that make it easy for a customer to find you and get in touch.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Dentist',
    category: 'Industry',
    subject: 'Helping {{business}} book more patients online',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look at {{business}} online and thought there was an opportunity worth mentioning. I believe an easier online booking experience could help you pick up new patients who'd rather book a check-up in a couple of taps than pick up the phone.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Electrician',
    category: 'Industry',
    subject: 'More enquiries for {{business}} online',
    body: `Hi {{contact}},

I hope you're doing well.

I build simple, fast, mobile-friendly websites for electricians that make it easy for a customer to see what you offer and request a quote — often the difference between winning a job and them moving straight on to the next search result.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Plumber',
    category: 'Industry',
    subject: 'Getting {{business}} found online',
    body: `Hi {{contact}},

I hope you're doing well.

I help tradespeople like {{business}} get a website that ranks well in local search and actually converts visitors into calls — rather than one that just sits there looking dated while jobs go elsewhere.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Broken Website',
    category: 'Issue-based',
    subject: 'Noticed an issue on {{website}}',
    body: `Hi {{contact}},

I hope you're doing well.

I was checking out {{website}} and noticed a few things that could be improved{{issue_note}} — issues like this are easy to miss day-to-day, but they're likely quietly costing {{business}} visitors and enquiries that would otherwise convert.

I specialise in fixing exactly this kind of issue and rebuilding sites so they're fast, reliable, and mobile-friendly.{{portfolio_line}}

If you'd be interested in a no-obligation chat about what I found, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Slow Website',
    category: 'Issue-based',
    subject: '{{website}} is loading slowly — quick fix ideas',
    body: `Hi {{contact}},

I hope you're doing well.

I ran a quick check on {{website}} and it's loading slower than it should. This matters more than it might seem — it affects how visitors experience the site, and it can also hurt where you rank in Google, which compounds the problem over time.

I specialise in fast, modern, mobile-friendly websites and would be glad to share a few quick wins.{{portfolio_line}}

If you'd be interested in a no-obligation chat about it, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Outdated Website',
    category: 'Issue-based',
    subject: 'A modern refresh for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

{{business}}'s website looks like it could use a modern refresh{{issue_highlight}}. First impressions form fast online, and an outdated design can quietly turn visitors away before they even read what you offer.

I build premium, mobile-friendly websites designed to look professional and perform well across all devices, helping turn more visitors into enquiries.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Missing Booking System',
    category: 'Issue-based',
    subject: 'Add online booking to {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I noticed {{business}} doesn't currently have an online booking system. In practice that usually means missed bookings from customers browsing outside your working hours who'd rather book instantly than wait to call.

I build this kind of booking functionality directly into premium, mobile-friendly websites, so customers can book whenever suits them.{{portfolio_line}}

If you'd be interested in a no-obligation chat about what this could look like for {{business}}, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Follow Up',
    category: 'Follow-up',
    subject: 'Following up — {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I just wanted to follow up on my previous email in case you hadn't had a chance to read it.

When I visited your website, I noticed a few areas where I believe it could be improved. Whether that was an outdated design, mobile usability issues, slow loading, or another issue, I'd be happy to discuss it further if it's something you're already considering.

I build premium, mobile-friendly websites for local businesses that are designed to look professional, perform well across all devices, and help turn more visitors into enquiries.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Quote Follow Up',
    category: 'Follow-up',
    subject: 'Checking in on the quote for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I just wanted to check in and see if you had any questions about the quote I sent over for {{business}}. I know these things can sit in a busy inbox, so no worries at all if you haven't had a chance to look yet.

I'm happy to jump on a call if that's easier than going back and forth over email, or to adjust the scope if anything needs revisiting.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Thank You',
    category: 'Relationship',
    subject: 'Thank you, {{contact}}!',
    body: `Hi {{contact}},

I just wanted to say a proper thank you for choosing to work with me on {{business}} — I really appreciate the trust, and I'm genuinely looking forward to getting started.

I'll be in touch shortly with next steps, and please don't hesitate to reach out in the meantime if anything comes to mind.

Thank you again.

{{signature}}`,
  },
  {
    name: 'Referral Request',
    category: 'Relationship',
    subject: 'Quick favour, {{contact}}?',
    body: `Hi {{contact}},

I hope you're doing well, and that {{business}}'s new site has been working out well for you.

If you know anyone else who could use a similar website — another local business owner, a friend, a supplier you work with — I'd really appreciate the introduction. Referrals like that mean a lot to a small business like mine.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
];

// Deterministic id from a name — used so auto-seeding writes the same doc ID
// every time instead of addDoc-ing a new one, which is what causes duplicates
// when a component mounts more than once before a previous write lands.
export function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─── Template variable substitution ────────────────────────────────────────
// Any variable with no value (missing lead field, no portfolio picked, etc.)
// is dropped to an empty string rather than left as literal "{{business}}"
// text — a template should be safe to send to any lead, however incomplete.
// A cleanup pass then tidies the punctuation that leaves behind, so
// "Hi {{contact}}," reads as "Hi," (not "Hi ,") when there's no name, and
// "Thank you, {{contact}}!" reads as "Thank you!" instead of "Thank you, !".
export function applyTemplateVars(text, vars) {
  if (!text) return '';
  // Check non-emptiness via trim(), but substitute the raw (untrimmed) value —
  // computed clauses like portfolio_line intentionally start with "\n\n" to
  // open a new paragraph, and .trim()-ing the substitution would silently
  // eat that.
  const substituted = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars?.[key];
    return typeof val === 'string' && val.trim() ? val : '';
  });
  return substituted
    .replace(/ +,/g, ',')
    .replace(/, +!/g, '!')
    .replace(/, +\?/g, '?')
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * Builds the full variable set used to render a template for a lead,
 * including computed fallback-safe clauses (portfolio_line, issue_note,
 * issue_highlight) so templates never end up with a dangling "Example: "
 * or a broken sentence when a demo/issue hasn't been picked/logged.
 */
const MY_WEBSITE = 'https://dean-da-dev.co.uk';
const MY_EMAIL = 'dean@dean-da-dev.co.uk';

export function buildTemplateVars(lead, { demoUrl = '', myName } = {}) {
  const issue = (lead?.issuesChecklist ?? [])[0] ?? '';
  return {
    business: lead?.businessName ?? '',
    contact: lead?.contactName?.trim() ?? '',
    website: lead?.website ?? '',
    industry: lead?.industry ?? '',
    issue,
    portfolio: demoUrl,
    portfolio_line: `\n\nWebsite: ${MY_WEBSITE}${demoUrl ? `\nPortfolio example: ${demoUrl}` : ''}`,
    issue_note: issue ? ` (${issue})` : '',
    issue_highlight: issue ? ` — ${issue} stood out to me` : '',
    myname: myName ?? '',
    signature: myName ? `Kind regards,\n\n${myName}\ndean-da-dev\n📧 ${MY_EMAIL}\n🌐 ${MY_WEBSITE}` : '',
  };
}
