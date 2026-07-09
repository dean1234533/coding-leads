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
  { name: 'Beauty Studio', url: '' },
  { name: 'Gym',           url: '' },
  { name: 'Law Firm',      url: '' },
  { name: 'Boxing Club',   url: '' },
];

// ─── Email templates ────────────────────────────────────────────────────
// Variables: {{business}} {{contact}} {{website}} {{industry}} {{issue}} {{portfolio}} {{myname}}
export const DEFAULT_TEMPLATES = [
  {
    name: 'General Outreach',
    category: 'Outreach',
    subject: 'A quick idea for {{business}}',
    body: `Hi {{contact}},

I came across {{business}} and had a couple of ideas for how a refreshed website could help bring in more customers.

I'm {{myname}}, a web designer/developer, and I'd love to show you a quick example of what's possible: {{portfolio}}

Would you be open to a quick chat this week?

Best,
{{myname}}`,
  },
  {
    name: 'Digital Agency Partner',
    category: 'Partnerships',
    subject: 'Technical partnership inquiry — {{business}}',
    body: `Hi {{contact}},

I've been following {{business}}'s work and love the quality of your digital projects.

I'm a full-stack developer specialising in building mobile apps and websites. I handle the full development lifecycle — from design and code to store submission — and I'm looking to partner with a few select agencies that need reliable, back-office technical capacity.

You can also see an example of my recent work here: {{portfolio}}

If you ever have a client project requiring app or dashboard development that falls outside your current bandwidth, I'd love to be a reliable resource you can lean on.

Are you open to a brief chat to see if we could be a fit for future overflow work?

Best,
{{myname}}`,
  },
  {
    name: 'Bookrightly Platform Pitch',
    category: 'Bookrightly',
    subject: `Built something I think you'd find useful — {{business}}`,
    body: `Hey {{contact}},

I've been building a platform called Bookrightly and I think it'd be useful for {{business}}.

It basically gives businesses like yours everything they need to run properly — your own booking site, online card payments, automated reminders, invoices, and a dashboard to manage everything. There's also trade-specific stuff built in (like a quote generator with a shareable client link, or workout plans for PTs).

It's 90 days free to try, no card required, and takes about 10 minutes to set up.

Worth having a look: bookrightly.co.uk

{{myname}}`,
  },
  {
    name: 'Bookrightly Subscription Pitch',
    category: 'Bookrightly',
    subject: 'Get online with a website and booking system — {{business}}',
    body: `Hi {{contact}},

I came across {{business}} and noticed you don't currently have a website. Without one, you're likely missing out on customers who search online before booking — and that's a big chunk of new business going elsewhere.

I run a platform called Bookrightly (www.bookrightly.co.uk) built specifically for businesses like yours. For just £29/month you get:

  ✓ Your own professional website
  ✓ Online booking system so clients can book 24/7
  ✓ Card payments built in
  ✓ Client management and appointment reminders
  ✓ Calendar sync with Google Calendar
  ✓ No setup fees — up and running in days

I've put together a quick mockup of what your site could look like — take a look: {{portfolio}}

Most customers say it pays for itself with just one or two extra bookings a month.

Would you be open to a quick 5-minute chat to see if it could work for {{business}}?

Best,
{{myname}}
www.bookrightly.co.uk`,
  },
  {
    name: 'Salon',
    category: 'Industry',
    subject: 'Helping {{business}} book more appointments online',
    body: `Hi {{contact}},

I noticed {{business}} doesn't have an easy way for clients to book online — that's a lot of missed bookings outside opening hours.

I build websites with built-in booking systems for salons like yours. Here's an example: {{portfolio}}

Worth a quick chat?

{{myname}}`,
  },
  {
    name: 'Gym',
    category: 'Industry',
    subject: 'A modern website + booking system for {{business}}',
    body: `Hi {{contact}},

I help gyms like {{business}} get a modern website with class bookings and membership sign-ups built in.

Here's a demo you can look at: {{portfolio}}

Let me know if you'd like to chat.

{{myname}}`,
  },
  {
    name: 'Law Firm',
    category: 'Industry',
    subject: 'A more professional online presence for {{business}}',
    body: `Hi {{contact}},

First impressions matter a lot in your industry — I had a look at {{business}}'s website and think a refresh could help win more client enquiries.

Example of my work: {{portfolio}}

Happy to talk through some ideas.

{{myname}}`,
  },
  {
    name: 'Restaurant',
    category: 'Industry',
    subject: 'Getting {{business}} more online orders/bookings',
    body: `Hi {{contact}},

I help restaurants like {{business}} get a website that makes it easy for customers to see the menu, book a table, or order online.

Example: {{portfolio}}

Would you be open to a quick chat?

{{myname}}`,
  },
  {
    name: 'Trades',
    category: 'Industry',
    subject: 'A website that brings {{business}} more enquiries',
    body: `Hi {{contact}},

Most people search online before calling a {{industry}} — if {{business}} doesn't show up well, you're losing jobs to competitors.

I build simple, fast websites for trades. Example: {{portfolio}}

Worth a quick call?

{{myname}}`,
  },
  {
    name: 'Dentist',
    category: 'Industry',
    subject: 'Helping {{business}} book more patients online',
    body: `Hi {{contact}},

I noticed {{business}} could benefit from an easier online booking experience for new patients.

Here's an example of what I build: {{portfolio}}

Happy to chat if useful.

{{myname}}`,
  },
  {
    name: 'Electrician',
    category: 'Industry',
    subject: 'More enquiries for {{business}} online',
    body: `Hi {{contact}},

I build simple, fast websites for electricians that make it easy for customers to request a quote.

Example: {{portfolio}}

Let me know if you'd like to see more.

{{myname}}`,
  },
  {
    name: 'Plumber',
    category: 'Industry',
    subject: 'Getting {{business}} found online',
    body: `Hi {{contact}},

I help trades like {{business}} get a website that ranks well and converts visitors into calls.

Example: {{portfolio}}

Worth a quick chat?

{{myname}}`,
  },
  {
    name: 'Broken Website',
    category: 'Issue-based',
    subject: 'Noticed an issue on {{website}}',
    body: `Hi {{contact}},

I was checking out {{website}} and noticed {{issue}} — that's likely costing {{business}} visitors and enquiries.

I can fix this and give you a modern site that works properly. Example: {{portfolio}}

Want me to send over some ideas?

{{myname}}`,
  },
  {
    name: 'Slow Website',
    category: 'Issue-based',
    subject: '{{website}} is loading slowly — quick fix ideas',
    body: `Hi {{contact}},

I ran a quick check on {{website}} and it's loading slower than it should — this can hurt both user experience and Google rankings.

I specialise in fast, modern websites. Example: {{portfolio}}

Happy to share a few quick wins.

{{myname}}`,
  },
  {
    name: 'Outdated Website',
    category: 'Issue-based',
    subject: 'A modern refresh for {{business}}',
    body: `Hi {{contact}},

{{business}}'s website looks like it could use a modern refresh — {{issue}} stood out to me.

Here's an example of the kind of website I build: {{portfolio}}

Let me know if you'd like some ideas.

{{myname}}`,
  },
  {
    name: 'Missing Booking System',
    category: 'Issue-based',
    subject: 'Add online booking to {{business}}',
    body: `Hi {{contact}},

I noticed {{business}} doesn't currently have an online booking system — that means missed bookings outside working hours.

I can build this in. Example: {{portfolio}}

Worth a quick chat?

{{myname}}`,
  },
  {
    name: 'Follow Up',
    category: 'Follow-up',
    subject: 'Following up — {{business}}',
    body: `Hi {{contact}},

Just following up on my last email — happy to answer any questions or send over more examples of my work.

{{myname}}`,
  },
  {
    name: 'Quote Follow Up',
    category: 'Follow-up',
    subject: 'Checking in on the quote for {{business}}',
    body: `Hi {{contact}},

Just checking in to see if you had any questions about the quote I sent over for {{business}}.

Happy to jump on a call if that's easier.

{{myname}}`,
  },
  {
    name: 'Thank You',
    category: 'Relationship',
    subject: 'Thank you, {{contact}}!',
    body: `Hi {{contact}},

Thanks so much for choosing to work with me on {{business}} — really looking forward to getting started.

I'll be in touch shortly with next steps.

{{myname}}`,
  },
  {
    name: 'Referral Request',
    category: 'Relationship',
    subject: 'Quick favour, {{contact}}?',
    body: `Hi {{contact}},

Glad {{business}}'s new site is working out well! If you know anyone else who could use a similar website, I'd really appreciate the introduction.

Thanks again,
{{myname}}`,
  },
];

// ─── Template variable substitution ────────────────────────────────────────
export function applyTemplateVars(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => (vars?.[key]?.trim() ? vars[key] : match));
}
