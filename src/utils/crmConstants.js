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
  'No Website',
  'Social Media Only',
  'Outdated Design',
  'Slow Loading',
  'Not Mobile Friendly',
  'Site Doesn\'t Load',
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
  'Page Jumps While Loading',
  'Too Much Scrolling',
  'Other',
];

// Specific, human consequence for each checked website issue — used to build
// {{issue_highlight}} so ticking "Missing SSL" etc. in the website review
// actually changes what the email says, instead of just repeating the issue
// name back ("Missing SSL stood out to me").
export const ISSUE_DETAILS = {
  'No Website': "there's no website at all, so anyone searching online can't find you and is likely finding a competitor instead",
  'Social Media Only': "the only online presence is a social media page, not an actual website — so there's nothing to rank on Google, and the page itself is controlled by someone else's platform, not yours",
  'Outdated Design': 'the design looks dated next to competitors, which can make people question how established the business is',
  'Slow Loading': "it takes too long to load, and most visitors leave before it even finishes",
  'Not Mobile Friendly': "it doesn't work properly on mobile, where most visitors are browsing from",
  'Site Doesn\'t Load': "the website didn't load at all when I tried to visit it, which means you're losing every single visitor who tries to find you online right now",
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
  'Page Jumps While Loading': 'the page visibly jumps around as it loads (images, ads, or embeds shifting things after the fact), which is disorienting and can make people click the wrong thing',
  'Too Much Scrolling': "the homepage is packed with images and takes a long time to scroll through on both mobile and desktop, which can make visitors give up before they reach what they came for",
};

// ─── Email templates ────────────────────────────────────────────────────
// Variables: {{business}} {{contact}} {{website}} {{industry}} {{myname}}
// Plus computed fallback-safe variables built from the above (see
// buildTemplateVars() below, used by CrmComposer.jsx / CrmBulkSendModal.jsx):
//   {{bookrightly_link}} — bookrightly.co.uk. The primary CTA across every
//     outreach template — "here's what it could look like for you" — not a
//     claim about specific findings, since a static template can't safely
//     reference real per-lead audit data (that's what the Growth Audit
//     Outreach generator on the lead page is for).
//   {{signature}} — the full sign-off block (name, Bookrightly, email, site).
export const DEFAULT_TEMPLATES = [
  {
    name: 'General Outreach',
    category: 'Outreach',
    subject: 'A quick idea for {{business}}',
    body: `Hi {{greeting}},

I'm Dean — a web developer and founder of Bookrightly.

I came across {{business}} and thought Bookrightly might be useful for you. It gives small businesses their own professional website and online booking system in one place, so customers can find out about you, view your services, and book online (and pay a deposit) without everything having to go through calls or messages.

You can have a look here: {{bookrightly_link}}

Would you be interested?

{{signature}}`,
  },
  {
    name: 'Digital Agency Partner',
    category: 'Partnerships',
    subject: 'Technical partnership inquiry — {{business}}',
    body: `Hi {{contact}},

I've been following {{business}}'s work and love the quality of your digital projects — it's clear a lot of care goes into what you put out.

I'm a full-stack developer specialising in mobile apps and websites, handling the full development lifecycle from design and code through to store submission. I'm looking to partner with a small number of agencies that occasionally need reliable, back-office technical capacity for projects that fall outside their current bandwidth — the kind of overflow work you can hand off with confidence and not worry about.

If you'd be interested in a no-obligation chat about how this could work, just reply to this email and I'd be happy to help.

{{signature}}`,
  },
  {
    name: 'Bookrightly Platform Pitch',
    category: 'Bookrightly',
    subject: `Built something I think you'd find useful — {{business}}`,
    body: `Hi {{contact}},

I've been building a platform called Bookrightly, and having looked at {{business}}, I think it could genuinely be useful to you.

It gives businesses like yours everything needed to run day-to-day operations properly in one place — your own booking site, online card payments, automated reminders, invoices, and a dashboard to manage all of it. There's trade-specific functionality built in too, like a quote generator with a shareable client link, or workout plans if you train clients.

It's 90 days free to try, no card required, and takes about 10 minutes to set up: https://bookrightly.co.uk

If you'd be interested in a no-obligation chat about whether it's a good fit for {{business}}, just reply to this email and I'd be happy to help.

{{signature}}`,
  },
  {
    name: 'Bookrightly Subscription Pitch',
    category: 'Bookrightly',
    subject: 'Get online with a website and booking system — {{business}}',
    body: `Hi {{contact}},

I came across {{business}} and noticed you don't currently have a website. Without one, you're likely missing out on customers who search online before booking — and that can be a significant chunk of new business going elsewhere to a competitor who does show up.

I run a platform called Bookrightly (https://bookrightly.co.uk), built specifically for businesses like yours. For £10–20/month depending on your business type, you get:

  ✓ Your own professional website
  ✓ Online booking system so clients can book 24/7
  ✓ Card payments built in
  ✓ Client management and appointment reminders
  ✓ Calendar sync with Google Calendar
  ✓ No setup fees — up and running within days

Most customers tell us it pays for itself with just one or two extra bookings a month.

If you'd be interested in a no-obligation chat about whether it could work for {{business}}, just reply to this email and I'd be happy to help.

{{signature}}`,
  },
  {
    name: 'No Website',
    category: 'Issue-based',
    subject: 'Getting {{business}} online',
    body: `Hi {{greeting}},

I'm Dean — a web developer and founder of Bookrightly. I noticed {{business}} doesn't currently have a website, so I thought I'd reach out.

Bookrightly gives small businesses their own professional website and online booking system in one place — so customers can find out about you, view your services, book online and pay a deposit, without everything having to go through calls or messages.

You can have a look here: {{bookrightly_link}}

Would you be interested?

{{signature}}`,
  },
  {
    name: 'Broken Website',
    category: 'Issue-based',
    subject: 'Noticed an issue on {{website}}',
    body: `Hi {{greeting}},

I'm Dean — a web developer and founder of Bookrightly. I tried visiting {{business}}'s website — unfortunately it didn't load properly on my end.

Anyone finding you through Google or a recommendation could be hitting the same problem and leaving within seconds, which can mean missed enquiries without you even realising it. Bookrightly gives small businesses a reliable website and online booking system in one place, so this doesn't happen.

You can have a look here: {{bookrightly_link}}

Would you be interested?

{{signature}}`,
  },
  {
    name: 'Slow Website',
    category: 'Issue-based',
    subject: '{{website}} is loading slowly',
    body: `Hi {{greeting}},

I'm Dean — a web developer and founder of Bookrightly. I had a quick look at {{business}}'s website — it's loading slower than it should, which affects both visitor experience and where it ranks in Google.

Bookrightly gives small businesses a fast, professional website with online booking built in, so it's one less thing to worry about.

You can have a look here: {{bookrightly_link}}

Would you be interested?

{{signature}}`,
  },
  {
    name: 'Outdated Website',
    category: 'Issue-based',
    subject: 'A quick idea for {{business}}',
    body: `Hi {{greeting}},

I'm Dean — a web developer and founder of Bookrightly. I had a look at {{business}}'s website — it could use a modern refresh, which can quietly cost enquiries even when the work itself is great.

Bookrightly gives small businesses their own professional website and online booking system in one place.

You can have a look here: {{bookrightly_link}}

Would you be interested?

{{signature}}`,
  },
  {
    name: 'Missing Booking System',
    category: 'Issue-based',
    subject: 'Add online booking to {{business}}',
    body: `Hi {{greeting}},

I'm Dean — a web developer and founder of Bookrightly. I had a look at {{business}}'s website — there isn't currently a way for customers to book online, which likely means missed bookings from people browsing outside your opening hours.

Bookrightly gives small businesses their own website with online booking (and deposit payments) built in, so customers can book any time.

You can have a look here: {{bookrightly_link}}

Would you be interested?

{{signature}}`,
  },
  {
    name: 'Follow Up',
    category: 'Follow-up',
    subject: 'Following up — {{business}}',
    body: `Hi {{contact}},

Just following up on this — still happy to show you what Bookrightly could look like for {{business}} if that's of interest, no obligation at all.

{{bookrightly_link}}

No pressure at all — thought it might be useful.

{{myname}}
Founder, Bookrightly`,
  },
  {
    name: 'Quote Follow Up',
    category: 'Follow-up',
    subject: 'Checking in on the quote for {{business}}',
    body: `Hi {{contact}},

Just wanted to check in and see if you had any questions about the quote I sent over for {{business}}. I know these things can sit in a busy inbox, so no worries at all if you haven't had a chance to look yet.

Happy to jump on a call if that's easier than going back and forth over email, or to adjust the scope if anything needs revisiting.

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

Hope things are going well with {{business}}'s new site.

If you know anyone else who could use a similar website — another local business owner, a friend, a supplier you work with — I'd really appreciate the introduction. Referrals like that mean a lot to a small business like mine.

{{signature}}`,
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

To be upfront about exactly what's on offer: I'd build or improve your website for free, no strings attached. The only thing I'd ask in return is that, if you're happy with the result, you'd be willing to recommend me to anyone else you know who might need a website built — that's the whole ask, nothing more, and no hidden costs later.

If that's of interest, just reply and let me know a bit about what you're looking for and I'll take it from there.

{{signature}}`,
  },
  {
    name: 'Instagram DM — Bookrightly Flyer',
    category: 'Instagram',
    subject: 'Instagram DM (not sent by email — copy the caption and attach the flyer manually)',
    imageUrl: '/bookrightly-flyer.png',
    // Instagram DMs don't render markdown — a literal "**word**" shows the
    // asterisks — so this stays plain text even though the version this was
    // based on used bold for emphasis.
    body: `Hey 👋 I came across {{business}} and noticed you're taking bookings through Instagram.

I've built a simple booking page called Bookrightly that lets clients book online and pay a deposit automatically, so you're not chasing appointments in DMs.

I've attached a quick screenshot of how it looks 👇

It's free for 90 days, no card required, and I can set the whole thing up for you in about 10 minutes.

If you'd like me to create a booking page for your business, just reply "book" and I'll get it ready.

— {{myname}}`,
  },
  {
    name: 'Instagram DM — Free Ideas',
    category: 'Instagram',
    channels: ['Instagram', 'WhatsApp', 'Facebook'],
    subject: 'Instagram DM (not sent by email — send as a direct message)',
    body: `Hi, I'm Dean — a web developer and founder of Bookrightly 👋

I came across {{business}} and had a quick look at your page.

Bookrightly gives small businesses their own professional website and online booking system in one place — so customers can book without everything going through DMs.

You can have a look here: {{bookrightly_link}}

Would you be interested?

— {{myname}}`,
  },
  {
    name: 'Instagram DM — Free Mockup',
    category: 'Instagram',
    // Also usable on WhatsApp/Facebook — the pitch itself isn't Instagram-
    // specific, just the "book in under 60 seconds from Instagram" line,
    // which still reads fine there since it's talking about where their
    // customers come from, not which app this message is arriving through.
    channels: ['Instagram', 'WhatsApp', 'Facebook'],
    subject: 'Instagram DM (not sent by email — send as a direct message)',
    body: `Hey 👋 I came across {{business}} and your work looks really strong.

Most customers are probably coming through Instagram/Facebook, which is great for showing your work, but people still have to message or search around for pricing and availability.

I've built Bookrightly — a simple booking page for local businesses that lets clients:

  • See services + prices
  • Choose a time
  • Pay a deposit
  • Book in under 60 seconds from Instagram

The goal isn't to replace your Instagram — it's to turn more profile visitors into confirmed appointments.

You can have a look here: {{bookrightly_link}}

Would you be interested?

— {{myname}}`,
  },
  {
    name: 'WhatsApp — Quick Intro',
    category: 'WhatsApp',
    channels: ['WhatsApp', 'Facebook'],
    subject: 'WhatsApp message (not sent by email — opens a pre-filled WhatsApp chat instead)',
    // Leads with identity + a link, no unprompted critique of their site —
    // reads as rude out of nowhere on a personal channel like WhatsApp with
    // no signature/subject line for context to soften it.
    body: `Hi, I'm Dean — a web developer and founder of Bookrightly. I came across {{business}} and thought it might be useful — Bookrightly gives small businesses their own professional website and online booking system in one place: {{bookrightly_link}}

No pressure either way — just thought it might be useful.

— Dean`,
  },
  {
    name: 'WhatsApp — No Website',
    category: 'WhatsApp',
    channels: ['WhatsApp', 'Facebook'],
    subject: 'WhatsApp message (not sent by email — opens a pre-filled WhatsApp chat instead)',
    // Distinct from "Quick Intro" above (a specific problem found on an
    // existing site) since "no website at all" isn't a website issue to
    // reference, it's a different pitch entirely — this one exists for
    // real, not just to have every scenario covered. Spells out pricing
    // and the feature list rather than staying vague, since a concrete
    // £/month figure and a "one extra booking pays for it" framing converts
    // better on a channel where there's no separate landing page to lean on.
    body: `Hi, I'm Dean 👋 I came across {{business}} and noticed you don't currently have your own website, so I thought I'd reach out.

I run Bookrightly ({{bookrightly_link}}), which gives small businesses their own professional website + online booking system in one place.

For just £10–£15/month you get:

✓ Your own professional website
✓ 24/7 online bookings
✓ Card payments & deposits
✓ Appointment reminders
✓ Client management
✓ Google Calendar sync
✓ No setup fee

So instead of potential clients having to message or call, they can learn about you, check availability and book straight away.

Even one extra booking could cover the monthly cost.

I'd be happy to show you what Bookrightly could look like for {{business}} — no obligation at all.

Would you be interested in having a look?

— Dean
Founder, Bookrightly`,
  },
  {
    name: 'WhatsApp — Previously Contacted (Rebrand)',
    category: 'WhatsApp',
    channels: ['WhatsApp', 'Facebook'],
    subject: 'WhatsApp message (not sent by email — opens a pre-filled WhatsApp chat instead)',
    // For a lead already contacted before the Bookrightly rebrand (under
    // the old dean-da-dev identity, pitching a one-off custom-built
    // website) — Bookrightly is a genuinely different offer (a subscription
    // website + booking system, not a one-off build), so this explicitly
    // names the earlier contact and frames it as a different option rather
    // than reading as a repeat follow-up on the same pitch.
    body: `Hi, it's Dean 👋 I actually reached out a while back through Dean-da-Dev about a website for {{business}}.

Since then, I've built something that I think could be a much better fit — Bookrightly ({{bookrightly_link}}).

Instead of paying hundreds for a website, Bookrightly gives you your own professional website + booking system for just £10–£15/month.

You get:

✓ 24/7 online bookings
✓ Card payments & deposits
✓ Appointment reminders
✓ Client management
✓ Google Calendar sync
✓ Your own professional website
✓ No setup fee

Even one extra booking could cover the monthly cost.

Thought it was worth reaching out again because this is a completely different option from what I contacted you about before.

Would you be interested in having a look?

— Dean`,
  },
  {
    name: 'SMS — Quick Intro',
    category: 'SMS',
    subject: 'SMS (not sent by email — opens a pre-filled text message instead)',
    // Kept deliberately short — SMS has no formatting and reads worse the
    // longer it gets, unlike email/WhatsApp where a few paragraphs are normal.
    body: `Hi, it's Dean, founder of Bookrightly — websites + online booking for local businesses. Worth a quick look for {{business}}? {{bookrightly_link}}`,
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

// Relevance order for the template pickers (Composer's "Insert template…"
// dropdown, Bulk Send's default selection) — most-personalized/likely-to-
// convert first, working down to later-funnel/relationship templates that
// only apply once a lead is already warm. Audit Findings leads since it's
// built entirely from that specific lead's real scan results, not a
// one-size-fits-all pitch. Anything not listed here (a custom template
// someone adds through the Template Library) sorts after all of these,
// alphabetically.
const TEMPLATE_RELEVANCE_ORDER = [
  'General Outreach',
  'Broken Website',
  'Slow Website',
  'Outdated Website',
  'Missing Booking System',
  'No Website',
  'Bookrightly Platform Pitch',
  'Bookrightly Subscription Pitch',
  'Instagram DM — Free Ideas',
  'Instagram DM — Free Mockup',
  'Instagram DM — Bookrightly Flyer',
  'WhatsApp — Quick Intro',
  'SMS — Quick Intro',
  'Digital Agency Partner',
  'Follow Up',
  'Quote Follow Up',
  'Thank You',
  'Referral Request',
  'Backlink Outreach',
  'Guest Post Pitch',
  'Charity / Non-Profit Offer',
];

export function sortTemplatesByRelevance(templates) {
  return [...templates].sort((a, b) => {
    const ai = TEMPLATE_RELEVANCE_ORDER.indexOf(a.name);
    const bi = TEMPLATE_RELEVANCE_ORDER.indexOf(b.name);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
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
 * Builds the full variable set used to render a template for a lead.
 */
const MY_WEBSITE = 'https://bookrightly.co.uk';
const MY_EMAIL = 'info@bookrightly.co.uk';
// Mirrors functions/growthAuditConfig.js's PRODUCT_URL — kept as its own
// constant here too since this template library is a separate (manual,
// non-AI) outreach surface that isn't bundled with functions/.
const BOOKRIGHTLY_URL = 'https://bookrightly.co.uk/';

export function buildTemplateVars(lead, { myName } = {}) {
  const contactTrimmed = lead?.contactName?.trim() ?? '';
  const business = lead?.businessName ?? '';

  return {
    business,
    contact: contactTrimmed,
    // "Hi {{contact}}," leaves a bare "Hi," when no contact name is on
    // file (the common case for scraped local-business leads) — falls back
    // to "Hi <Business> team," instead, which still reads as addressed to
    // someone rather than a mail-merge blank.
    greeting: contactTrimmed || (business ? `${business} team` : 'there'),
    website: lead?.website ?? '',
    industry: lead?.industry ?? '',
    tool_pitch: `\n\n${pickRelevantTools(lead).map((t) => `  • ${t.name} — https://www.dean-da-dev.co.uk/${t.slug}`).join('\n')}`,
    bookrightly_link: BOOKRIGHTLY_URL,
    myname: myName ?? '',
    signature: myName ? `Thanks,\n\n${myName}\nFounder, Bookrightly\n📧 ${MY_EMAIL}\n🌐 ${MY_WEBSITE}` : '',
  };
}
