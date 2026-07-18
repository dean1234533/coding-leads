// ─── Lead statuses (pipeline stages) ───────────────────────────────────────
export const STATUSES = [
  'New',
  'Researching',
  'Ready To Contact',
  'Email Sent',
  'Follow Up Scheduled',
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
  'Follow Up Scheduled': { dot: 'bg-amber-400',    text: 'text-amber-400',   bg: 'bg-amber-400/10 ring-amber-400/20' },
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
  'Cluttered Mobile Nav',
  'Weak Logo',
  'Other',
];

// Specific, human consequence for each checked website issue — used to build
// {{issue_highlight}} so ticking "Missing SSL" etc. in the website review
// actually changes what the email says, instead of just repeating the issue
// name back ("Missing SSL stood out to me").
export const ISSUE_DETAILS = {
  'Outdated Design': 'the design looks dated next to competitors, which can make people question how established the business is',
  'Slow Loading': "it takes too long to load, and most visitors leave before it even finishes",
  'Not Mobile Friendly': "it doesn't work properly on mobile, where most visitors are browsing from",
  'Broken Links': 'there are broken links, which makes the site feel unfinished',
  'Broken Images': "several images aren't loading properly, which looks unprofessional",
  'Missing SSL': `the site isn't secured with SSL, so browsers flag it as "Not Secure" — enough on its own to make people leave`,
  'Poor Navigation': "it's hard to find key information, which loses visitors before they get to what you offer",
  'No Booking System': "there's no way to book online, so you're relying on people calling during business hours",
  'No Contact Form': "there's no contact form, so getting in touch takes more effort than it should",
  'Poor CTA': "there's no clear next step for visitors, so a lot of interest is probably going nowhere",
  'Text Hard To Read': 'the text is hard to read, which pushes visitors away before they take anything in',
  'Low Quality Images': 'the images are low quality, which undersells the actual work',
  'No Testimonials': 'there are no reviews or testimonials shown, which makes it harder for new visitors to trust you',
  'No Portfolio': "there's no portfolio or past work shown, so visitors have nothing to judge quality by",
  'No Google Reviews': "there's no sign of Google reviews, which is often the first thing people check",
  'Old Branding': 'the branding feels outdated, which can undersell how good the business actually is',
  'Confusing Layout': 'the layout is confusing, so visitors likely leave before finding what they came for',
  'Cluttered Mobile Nav': 'the mobile menu takes up a big chunk of the screen and feels cluttered, pushing your actual content further down and making the site harder to use on a phone',
  'Weak Logo': "the logo doesn't reflect the quality of the business, which can undersell how professional and established you actually are",
};

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
//   {{portfolio_line}} — a "Portfolio: <MY_PORTFOLIO>" block (with its own
//     leading blank line). An "Example project: <demo url>" line is added
//     once a demo's been picked. The main website isn't repeated here since
//     it's already in {{signature}}.
//   {{issue_note}} / {{issue_highlight}} — parenthetical/dash clauses built
//     from {{issue}} (the first checked issue only) so the surrounding
//     sentence still reads as a complete thought when no website issue has
//     been logged. Prefers the AI auto-audit's own observation when present.
//   {{issue_list}} — every checked issue as its own bullet line (not just
//     the first), each with its ISSUE_DETAILS consequence — for templates
//     that present the full audit rather than folding one issue into a
//     sentence.
//   {{website_score_note}} — " It scored N/100 on page speed." when the
//     lead's been through the auto-audit, else empty.
//   {{competitor_line}} — a sentence naming a genuinely stronger-rated
//     nearby competitor found in the same scan batch, only when the
//     comparison is real and meaningful (see runBusinessScan), else empty.
//   {{signature}} — the full sign-off block (name, dean-da-dev, email, site).
export const DEFAULT_TEMPLATES = [
  {
    name: 'General Outreach',
    category: 'Outreach',
    subject: 'A quick idea for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I came across {{business}} and had a look at your website. I noticed a few areas where I believe it could be improved{{issue_highlight}}, which could be affecting enquiries from potential customers.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Digital Agency Partner',
    category: 'Partnerships',
    subject: 'Technical partnership inquiry — {{business}}',
    body: `Hi {{contact}},

I've been following {{business}}'s work and love the quality of your digital projects — it's clear a lot of care goes into what you put out.

I'm a full-stack developer specialising in mobile apps and websites, handling the full development lifecycle from design and code through to store submission. I'm looking to partner with a small number of agencies that occasionally need reliable, back-office technical capacity for projects that fall outside their current bandwidth — the kind of overflow work you can hand off with confidence and not worry about.{{portfolio_line}}

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

I run a platform called Bookrightly (https://bookrightly.co.uk), built specifically for businesses like yours. For £10–20/month depending on your business type, you get:

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

I had a look at {{business}} and noticed there isn't currently an easy way for clients to book online{{issue_highlight}}. That usually means missed bookings from people browsing outside your opening hours, who end up booking with a salon that lets them book instantly instead.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}} and noticed the website doesn't currently make it easy to see class times or sign up for a membership online{{issue_highlight}}. That's often enough to make someone try a different gym instead.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Law Firm',
    category: 'Industry',
    subject: 'A more professional online presence for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look at {{business}}'s website and noticed it could do more to build trust with new visitors before they ever pick up the phone{{issue_highlight}}. First impressions matter a great deal in your industry.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}}'s website and noticed it isn't easy to see the menu or book a table online{{issue_highlight}}. That's often enough for someone to choose a different restaurant instead.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}} online and noticed the website could do more to build trust with potential customers before they decide who to call{{issue_highlight}}.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}}'s website and noticed there isn't an easy way for new patients to book online{{issue_highlight}}. That extra step of having to call can be enough to put some people off.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}} online and noticed the website could do more to help customers request a quote quickly{{issue_highlight}}.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}} online and noticed the website could do more to help customers find you and get in touch quickly, especially for more urgent jobs{{issue_highlight}}.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'No Website',
    category: 'Issue-based',
    subject: 'Getting {{business}} online',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look and noticed {{business}} doesn't currently have a website. That means potential customers searching online can't easily find you, and are likely finding a competitor instead.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about getting a website set up, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Broken Website',
    category: 'Issue-based',
    subject: 'Noticed an issue on {{website}}',
    body: `Hi {{contact}},

I hope you're doing well.

I was checking out {{website}} and noticed a few areas where I believe it could be improved{{issue_note}}. That's likely costing {{business}} visitors and enquiries.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Slow Website',
    category: 'Issue-based',
    subject: '{{website}} is loading slowly — quick fix ideas',
    body: `Hi {{contact}},

I hope you're doing well.

I ran a quick check on {{website}} and noticed it's loading slower than it should{{issue_highlight}}, which can affect both how visitors experience the site and where it ranks in Google.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Outdated Website',
    category: 'Issue-based',
    subject: 'A modern refresh for {{business}}',
    body: `Hi {{contact}},

I hope you're doing well.

I had a look at {{business}}'s website and noticed it could use a modern refresh{{issue_highlight}}.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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

I had a look at {{business}}'s website and noticed there isn't currently a way for customers to book online{{issue_highlight}}.

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

If you'd be interested in a no-obligation chat about your website, just reply to this email and I'd be happy to help.

Thank you for your time, and I hope to hear from you.

{{signature}}`,
  },
  {
    name: 'Website Audit Findings',
    category: 'Issue-based',
    subject: `A quick audit of {{business}}'s website`,
    body: `Hi {{contact}},

I'm {{myname}}, a web developer who builds websites for local businesses. I ran {{business}}'s website through a quick audit and wanted to share what came up, in case it's useful.{{website_score_note}}{{competitor_line}}

{{issue_list}}

None of this is a huge job to fix, and getting it sorted properly tends to make a real difference to how many visitors actually turn into enquiries — a modern, mobile-friendly website is often the first impression a potential customer gets before deciding whether to trust you, and it means you can pick up enquiries any time, not just during opening hours.{{portfolio_line}}

If you'd be interested in a no-obligation chat about any of this, just reply to this email and I'd be happy to help.

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

A modern, mobile-friendly website does more than just look good — it's often the first impression a potential customer gets before deciding whether to trust you, it helps people actually find you when they search on Google, and it means you can pick up enquiries and bookings any time, not just during opening hours. Without one, that's business quietly going to a competitor who does show up.{{portfolio_line}}

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
  {
    name: 'Two-Path Offer',
    category: 'Bookrightly',
    subject: 'Quick idea for {{business}}',
    body: `Hi {{contact}},

I had a look at {{business}}'s website and think it's likely costing you enquiries{{issue_highlight}}. Visitors expect a fast, mobile-friendly site with a clear way to book or get in touch, and without that they tend to move straight on to a competitor who does offer it. I build custom websites through Dean Da Dev from £399 to fix that properly, but if a full rebuild is more than you need right now, I also run Bookrightly (https://bookrightly.co.uk) — a booking platform that gets clients booking and paying online in about ten minutes, for £10–20/month with a 90-day free trial. Either way, would you be up for a quick chat to see which one actually fits?

Dean
dean-da-dev.co.uk`,
  },
  {
    name: 'Two-Path Offer (No Website)',
    category: 'Bookrightly',
    subject: 'Quick idea for {{business}}',
    body: `Hi {{contact}},

I had a look and noticed {{business}} doesn't currently have a website — which likely means customers searching online can't find you and are booking with a competitor who does show up. I build custom websites through Dean Da Dev from £399, but if a full site is more than you need right now, I also run Bookrightly (https://bookrightly.co.uk) — a booking platform that gets you a professional online presence plus bookings and payments live in about ten minutes, for £10–20/month with a 90-day free trial. Either way, would you be up for a quick chat to see which one actually fits?

Dean
dean-da-dev.co.uk`,
  },
  {
    name: 'Backlink Outreach',
    category: 'Backlink',
    subject: 'Free tool suggestion for {{business}}',
    body: `Hi {{contact}},

I came across {{business}} while looking at resource pages for developers and freelancers, and thought a couple of tools I've built might be a useful addition for your readers.

I run dean-da-dev.co.uk, which has a set of free browser-based tools — no sign-up, no paywall. A few that tend to fit lists like yours:
{{tool_pitch}}

If any of these would be a good fit for {{business}}, I'd really appreciate a mention or link — happy to return the favour if there's ever anything of yours worth sharing too.

Thanks for your time either way.

Dean
dean-da-dev.co.uk`,
  },
  {
    name: 'Guest Post Pitch',
    category: 'Backlink',
    subject: 'Guest post idea for {{business}}',
    body: `Hi {{contact}},

I came across {{business}} while looking for web dev/design blogs that take guest contributions, and wanted to reach out with an idea.

I'm {{myname}}, a web developer who builds custom sites for small businesses through dean-da-dev.co.uk. I'd like to write a free, genuinely useful article for your readers — no charge, just credit and a link back to my site in return. Happy to fit it to whatever your readers actually care about; a few directions that tend to work well:
  • Practical website tips for small business owners
  • What actually makes a site convert visitors into enquiries
  • A beginner-friendly explainer on a specific web/design topic your audience would find useful

Let me know if that's of interest and I'll send over a draft outline first, so you can see it's a good fit before committing to anything.

{{signature}}`,
  },
  {
    name: 'Charity / Non-Profit Offer',
    category: 'Charity',
    subject: 'Free website help for {{business}}',
    body: `Hi {{contact}},

I'm {{myname}}, a web developer, and each year I set aside some free work for local churches, charities, and community organisations — I wanted to reach out to {{business}} directly rather than wait to be asked.

To be upfront about exactly what's on offer: I'd build or improve your website for free, no strings attached. The only thing I'd ask in return is that, if you're happy with the result, you'd be willing to recommend me to anyone else you know who might need a website built — that's the whole ask, nothing more, and no hidden costs later.{{portfolio_line}}

If that's of interest, just reply and let me know a bit about what you're looking for and I'll take it from there.

{{signature}}`,
  },
];

// ─── Free tools on dean-da-dev.co.uk (for backlink outreach) ──────────────
// Used to pick which tools to mention in the "Backlink Outreach" template —
// matched against keywords found in the target page's title/snippet (stored
// in the lead's notes) so the pitch is relevant instead of always the same
// fixed three.
const DEAN_TOOLS = [
  { name: 'QR Code Generator', slug: 'qr-code-generator', keywords: ['qr code', 'qr generator'] },
  { name: 'Password Generator', slug: 'password-generator', keywords: ['password'] },
  { name: 'Invoice Generator', slug: 'invoice-generator', keywords: ['invoice', 'freelancer', 'freelance'] },
  { name: 'UUID Generator', slug: 'uuid-generator', keywords: ['uuid', 'guid'] },
  { name: 'Colour Palette Generator', slug: 'colour-palette-generator', keywords: ['colour palette', 'color palette', 'palette', 'design tool'] },
  { name: 'Gradient Generator', slug: 'gradient-generator', keywords: ['gradient', 'css'] },
  { name: 'Meta Title Generator', slug: 'meta-title-generator', keywords: ['meta title', 'seo'] },
  { name: 'Meta Description Generator', slug: 'meta-description-generator', keywords: ['meta description', 'seo'] },
  { name: 'Open Graph Generator', slug: 'open-graph-generator', keywords: ['open graph', 'social preview', 'og tag'] },
  { name: 'Schema Generator', slug: 'schema-generator', keywords: ['schema', 'structured data'] },
  { name: 'Sitemap Generator', slug: 'sitemap-generator', keywords: ['sitemap'] },
  { name: 'Lorem Ipsum Generator', slug: 'lorem-ipsum-generator', keywords: ['lorem ipsum', 'placeholder text'] },
  { name: 'Website Image Size Checker', slug: 'image-size-checker', keywords: ['image size', 'page speed', 'performance'] },
  { name: 'Image Compressor', slug: 'image-compressor', keywords: ['image compress', 'compressor', 'compress images'] },
  { name: 'PDF Compressor', slug: 'pdf-compressor', keywords: ['pdf compress', 'compress pdf'] },
  { name: 'Website Cost Calculator', slug: 'website-cost-calculator', keywords: ['website cost', 'pricing calculator'] },
  { name: 'Website ROI Calculator', slug: 'website-roi-calculator', keywords: ['roi calculator', 'website roi'] },
  { name: 'Project Cost Calculator', slug: 'project-cost-calculator', keywords: ['project cost', 'freelance rate', 'quote'] },
  { name: 'AI Prompt Generator', slug: 'ai-prompt-generator', keywords: ['ai prompt', 'prompt generator', 'ai tools', 'chatgpt'] },
];

const DEFAULT_TOOLS = ['qr-code-generator', 'invoice-generator', 'password-generator']
  .map((slug) => DEAN_TOOLS.find((t) => t.slug === slug));

/** Picks up to 3 tools whose keywords match the lead's page content, falling back to a sane default set. */
function pickRelevantTools(lead) {
  const haystack = `${lead?.businessName ?? ''} ${lead?.notes ?? ''} ${lead?.website ?? ''}`.toLowerCase();
  const matched = DEAN_TOOLS.filter((tool) => tool.keywords.some((k) => haystack.includes(k)));
  const picked = matched.length > 0 ? matched.slice(0, 3) : DEFAULT_TOOLS;
  return picked;
}

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
const MY_WEBSITE = 'https://www.dean-da-dev.co.uk';
const MY_PORTFOLIO = 'https://www.dean-da-dev.co.uk/portfolio';
const MY_EMAIL = 'dean@dean-da-dev.co.uk';

export function buildTemplateVars(lead, { demoUrl = '', myName } = {}) {
  const issue = (lead?.issuesChecklist ?? [])[0] ?? '';
  // A real AI-written observation from the auto-audit ("small, illegible
  // logo, cookie banner blocking the mobile layout") is far more specific
  // and convincing than the generic per-checkbox text in ISSUE_DETAILS —
  // prefer it whenever the lead was auto-audited.
  const aiNote = lead?.aiDesignNote?.trim().replace(/\.+$/, '');
  const issueDetail = aiNote || (issue ? (ISSUE_DETAILS[issue] ?? `${issue} stood out to me`) : '');

  // {{issue_highlight}} only ever surfaces ONE finding — for a lead that's
  // been through the website auto-audit (or a full manual review with
  // several boxes ticked), that throws away everything else it found.
  // issue_list gives templates access to the whole set.
  const allIssues = lead?.issuesChecklist ?? [];
  const issueListText = allIssues.length > 0
    ? allIssues.map((iss) => `  • ${iss}${ISSUE_DETAILS[iss] ? ` — ${ISSUE_DETAILS[iss]}` : ''}`).join('\n')
    : "  • Nothing major stood out, but there's usually still room to sharpen things up";
  const websiteScoreNote = typeof lead?.websiteScore === 'number' ? ` It scored ${lead.websiteScore}/100 on page speed.` : '';

  // Only ever set when the scan found a genuinely stronger nearby
  // competitor (see runBusinessScan's Step 4b) — empty otherwise, so this
  // never forces a weak or invented comparison into a template.
  const competitorLine = lead?.competitorName
    ? ` For comparison, ${lead.competitorName} nearby is rated ${lead.competitorRating}★ from ${lead.competitorReviewCount} reviews — worth knowing what's working for them.`
    : '';

  return {
    business: lead?.businessName ?? '',
    contact: lead?.contactName?.trim() ?? '',
    website: lead?.website ?? '',
    industry: lead?.industry ?? '',
    issue,
    portfolio: demoUrl,
    portfolio_line: `\n\nYou can view my portfolio and live demos here:\n\nPortfolio: ${MY_PORTFOLIO}${demoUrl ? `\nExample project: ${demoUrl}` : ''}`,
    issue_note: issue ? ` (${issue})` : '',
    issue_highlight: issueDetail ? ` — ${issueDetail}` : '',
    issue_list: issueListText,
    website_score_note: websiteScoreNote,
    competitor_line: competitorLine,
    tool_pitch: `\n\n${pickRelevantTools(lead).map((t) => `  • ${t.name} — https://www.dean-da-dev.co.uk/${t.slug}`).join('\n')}`,
    myname: myName ?? '',
    signature: myName ? `Kind regards,\n\n${myName}\ndean-da-dev\n📧 ${MY_EMAIL}\n🌐 ${MY_WEBSITE}` : '',
  };
}
