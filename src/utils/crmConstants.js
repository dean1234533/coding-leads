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

I came across {{business}} recently and had a look at your online presence. A few things stood out as worth improving — whether that's the overall design, how it performs on mobile, page loading speed, or something else that could be quietly costing you enquiries from potential customers.

I'm {{myname}}, and I build premium, mobile-friendly websites for local businesses that are designed to look professional, perform well across all devices, and turn more visitors into enquiries.{{portfolio_line}}

No pressure at all — if it's useful, just reply and I'll share a few specific thoughts on what I noticed.

{{signature}}`,
  },
  {
    name: 'Digital Agency Partner',
    category: 'Partnerships',
    subject: 'Technical partnership inquiry — {{business}}',
    body: `Hi {{contact}},

I've been following {{business}}'s work and love the quality of your digital projects — it's clear a lot of care goes into what you put out.

I'm a full-stack developer specialising in mobile apps and websites, handling the full development lifecycle from design and code through to store submission. I'm looking to partner with a small number of agencies that occasionally need reliable, back-office technical capacity for projects that fall outside their current bandwidth — the kind of overflow work you can hand off with confidence and not worry about.{{portfolio_line}}

Would it be worth a short call to see if there's a fit for future projects?

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

A lot of salon bookings happen outside opening hours — someone's scrolling in the evening, decides they want an appointment, and if they can't book there and then, they'll often just message the next salon on the list instead.

I noticed {{business}} doesn't currently have a way for clients to book online, which means those late-evening and weekend browsers are probably going elsewhere. I build websites for salons with a booking system built straight in, plus a proper gallery so your work speaks for itself — clients pick a time that suits them, no back-and-forth over DMs or phone calls needed.{{portfolio_line}}

Would it be worth a quick 10-minute call to see what this could look like for {{business}}?

{{signature}}`,
  },
  {
    name: 'Gym',
    category: 'Industry',
    subject: 'A modern website + booking system for {{business}}',
    body: `Hi {{contact}},

Signing up to a new gym is a bit of a leap of faith — most people want to see the space, check the class timetable, and get a feel for the place before they ever walk in. If that's hard to do on {{business}}'s current site (or there isn't one), you're likely losing a chunk of people at that first step.

I build gym websites with the class timetable, membership sign-up, and booking all built directly in, so a prospective member can see what's on, pick a class, and sign up without waiting for someone to get back to them.{{portfolio_line}}

Happy to put together a mockup so you can see it in action — worth a quick chat this week?

{{signature}}`,
  },
  {
    name: 'Law Firm',
    category: 'Industry',
    subject: 'A more professional online presence for {{business}}',
    body: `Hi {{contact}},

Before someone calls a solicitor, they almost always look them up first — and in a field built on trust, a dated or generic-looking website can quietly cost you the enquiry before you ever get the chance to speak to them.

I had a look at {{business}}'s website with that in mind. I build clean, professional sites for firms that are designed to build credibility fast and make it obvious how to get in touch — clear practice areas, straightforward contact routes, no clutter.{{portfolio_line}}

Would you be open to a short call to talk through some ideas for {{business}}?

{{signature}}`,
  },
  {
    name: 'Restaurant',
    category: 'Industry',
    subject: 'Getting {{business}} more online orders/bookings',
    body: `Hi {{contact}},

When someone searches for a place to eat, they usually want three things fast: the menu, whether you take bookings, and what the place looks like. If {{business}}'s website makes that hard — or there isn't one — a fair few of those searches end up at a competitor instead.

I build restaurant websites that put the menu and table booking front and centre, look great on a phone (which is how most people are browsing), and make ordering or booking a simple couple of taps.{{portfolio_line}}

Would it be worth a quick chat about what this could do for {{business}}?

{{signature}}`,
  },
  {
    name: 'Trades',
    category: 'Industry',
    subject: 'A website that brings {{business}} more enquiries',
    body: `Hi {{contact}},

Most people search online before hiring a tradesperson now, and they're quick to judge — a bare-bones or missing website often reads as "not established," even when the work itself is excellent. That impression costs jobs before you ever get a chance to quote.

I build simple, fast websites for trades that show off previous work, make it obvious what areas you cover, and give people an easy way to request a quote — the kind of site that builds trust in the first few seconds.{{portfolio_line}}

Worth a quick call to see what this could look like for {{business}}?

{{signature}}`,
  },
  {
    name: 'Dentist',
    category: 'Industry',
    subject: 'Helping {{business}} book more patients online',
    body: `Hi {{contact}},

A lot of people put off booking a dentist simply because picking up the phone feels like a bigger step than it should be. If {{business}} makes it easy to book a check-up online instead, in a couple of taps, some of that hesitation disappears — and you pick up patients who'd otherwise have kept putting it off.

I build websites for dental practices with online booking built in, alongside clear information about treatments and new-patient registration, so it's as easy as possible for someone to take that first step.{{portfolio_line}}

Would you be open to a quick chat about this for {{business}}?

{{signature}}`,
  },
  {
    name: 'Electrician',
    category: 'Industry',
    subject: 'More enquiries for {{business}} online',
    body: `Hi {{contact}},

When someone needs an electrician, they're often comparing two or three options within minutes — whoever looks most established and makes it easiest to request a quote tends to get the call. A weak or missing website puts {{business}} at a real disadvantage in that moment, regardless of the quality of the work.

I build fast, simple websites for electricians that show your certifications, the work you cover, and give visitors a quick way to request a quote — built to convert a search into an enquiry.{{portfolio_line}}

Let me know if you'd like to see what this could look like — worth a quick call?

{{signature}}`,
  },
  {
    name: 'Plumber',
    category: 'Industry',
    subject: 'Getting {{business}} found online',
    body: `Hi {{contact}},

Plumbing enquiries are often urgent — someone's searching right now, on their phone, and they'll call whoever looks reliable and comes up first. If {{business}} isn't ranking well locally or the site looks dated, those jobs are going to a competitor by default.

I build websites for tradespeople that are built to rank well in local search and make it fast and obvious for someone to call or request a quote — the goal is converting that search into a job, not just having a page that exists.{{portfolio_line}}

Worth a quick chat about what this could do for {{business}}?

{{signature}}`,
  },
  {
    name: 'Broken Website',
    category: 'Issue-based',
    subject: 'Noticed an issue on {{website}}',
    body: `Hi {{contact}},

I was checking out {{website}} and noticed a specific issue worth flagging{{issue_note}}. It's the kind of thing that's easy to miss day-to-day since you're not looking at your own site with fresh eyes, but it's likely turning visitors away before they get to see what {{business}} actually offers.

I specialise in fixing exactly this kind of issue and rebuilding sites so they're fast, reliable, and work properly on every device.{{portfolio_line}}

Want me to send over what I found and a few thoughts on fixing it?

{{signature}}`,
  },
  {
    name: 'Slow Website',
    category: 'Issue-based',
    subject: '{{website}} is loading slowly — quick fix ideas',
    body: `Hi {{contact}},

I ran a quick check on {{website}} and it's loading noticeably slower than it should. It's an easy thing to overlook, but it matters more than it looks — most visitors give up on a slow page within a few seconds, and Google factors load speed into how highly you rank, so it compounds over time.

I specialise in fast, modern websites and would be glad to share the specific things that are slowing {{website}} down.{{portfolio_line}}

Happy to send over a few quick wins if that would be useful?

{{signature}}`,
  },
  {
    name: 'Outdated Website',
    category: 'Issue-based',
    subject: 'A modern refresh for {{business}}',
    body: `Hi {{contact}},

First impressions online form in seconds, and {{business}}'s website looks like it could use a modern refresh{{issue_highlight}}. An outdated design doesn't necessarily reflect the quality of the business behind it, but visitors don't know that — they'll often judge on looks alone and move on before reading further.

I build modern, mobile-friendly websites designed to make a strong first impression and turn more of those visitors into enquiries.{{portfolio_line}}

Would it be worth a quick chat about a refresh for {{business}}?

{{signature}}`,
  },
  {
    name: 'Missing Booking System',
    category: 'Issue-based',
    subject: 'Add online booking to {{business}}',
    body: `Hi {{contact}},

I noticed {{business}} doesn't currently have a way to book online. In practice, that usually means losing customers who browse outside your working hours and would rather book instantly than wait to call — a gap that's easy to miss because you never see the people who leave.

I build this kind of booking functionality directly into premium, mobile-friendly websites, so customers can book whenever suits them.{{portfolio_line}}

Would it be worth a quick chat about what this could look like for {{business}}?

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
