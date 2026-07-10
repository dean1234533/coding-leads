export const SCRIPTS = [
  {
    id: 'cold',
    label: 'Cold Call',
    colour: 'sky',
    intro: 'Calling a business out of the blue. Keep it short — your goal is to get them curious, not to sell on the first call.',
    steps: [
      {
        heading: 'Opening',
        lines: [
          'Hi, is that [Owner Name]?',
          'Hi [Name], my name\'s Dean — I\'m a local web and app developer based in the area.',
          'I\'m not trying to sell you anything right now — I just had a quick look at your business online and I had an idea I thought might be worth 60 seconds of your time. Is now an okay moment?',
        ],
      },
      {
        heading: 'The Hook',
        lines: [
          'I noticed [Business Name] doesn\'t currently have a website / your website looks like it could do with a refresh — and for a business like yours, that\'s probably costing you customers who search online and can\'t find you.',
          'I put together a quick mockup of what a new site could look like for you — no cost, no obligation, just wanted to show you what\'s possible.',
        ],
      },
      {
        heading: 'The Ask',
        lines: [
          'Would you be open to a quick 10-minute call this week so I can show you what I\'ve put together?',
        ],
      },
      {
        heading: 'If They Say They\'re Busy',
        lines: [
          'No problem at all — when\'s a better time? I can work around you.',
        ],
      },
      {
        heading: 'If They Say They\'re Not Interested',
        lines: [
          'That\'s completely fine — can I ask, do you already have someone handling your website, or is it just not a priority right now?',
          '(Listen — this tells you whether to follow up later or move on.)',
        ],
      },
    ],
  },
  {
    id: 'followup',
    label: 'Follow-Up Call',
    colour: 'violet',
    intro: 'They\'ve already received your email but haven\'t replied. This call is warm — they know who you are.',
    steps: [
      {
        heading: 'Opening',
        lines: [
          'Hi [Name], it\'s Dean — I sent you a quick email earlier this week about [Business Name]\'s website. Did you get a chance to see it?',
        ],
      },
      {
        heading: 'If They Saw It',
        lines: [
          'Great — I didn\'t want it to get lost in your inbox. Did any of it make sense for where you\'re at right now?',
        ],
      },
      {
        heading: 'If They Didn\'t See It',
        lines: [
          'No worries — in short, I had a look at your business online and I think there\'s a real opportunity to get more customers coming through the door with a proper website or app. I\'ve actually put a quick mockup together for you.',
          'Would you have 10 minutes this week to take a look?',
        ],
      },
      {
        heading: 'Closing the Follow-Up',
        lines: [
          'I\'m not here to push anything — I just think when you see what\'s possible for [Business Name] you\'ll find it interesting. When works best for you?',
        ],
      },
    ],
  },
  {
    id: 'discovery',
    label: 'Discovery Call',
    colour: 'emerald',
    intro: 'They\'re interested. Your job here is to listen more than you talk — find out exactly what they need so you can quote accurately.',
    steps: [
      {
        heading: 'Set the Agenda',
        lines: [
          'Thanks for making time — I\'ll keep this to 10–15 minutes. I just want to ask you a few questions so I understand your situation properly, and then I can tell you honestly whether I think I can help.',
        ],
      },
      {
        heading: 'Key Questions to Ask',
        lines: [
          'Tell me a bit about the business — how long have you been going, and what do you mainly do?',
          'How are customers finding you at the moment?',
          'What\'s your website situation — do you have one, or is it something you\'ve been meaning to sort?',
          'Have you had a website before? What happened with it?',
          'What would a good result look like for you — more calls, more bookings, more walk-ins?',
          'Is there a timeframe you have in mind, or a budget you\'re working to?',
        ],
      },
      {
        heading: 'Wrap Up',
        lines: [
          'That\'s really helpful — based on what you\'ve told me, I think I can definitely help you with this.',
          'What I\'ll do is put together a proper proposal with exactly what I\'d build, a timeline, and a price — and I\'ll send it over by [day]. Does that work?',
        ],
      },
    ],
  },
  {
    id: 'closing',
    label: 'Closing Call',
    colour: 'amber',
    intro: 'They\'ve seen your proposal. This call is about answering objections and agreeing to move forward.',
    steps: [
      {
        heading: 'Opening',
        lines: [
          'Hi [Name] — did you get a chance to look over the proposal I sent?',
          'What did you think — did it all make sense?',
        ],
      },
      {
        heading: 'If They Like It But Haven\'t Committed',
        lines: [
          'What\'s holding you back — is it the timing, the price, or something else?',
          '(Wait for them to answer — silence is fine here. Don\'t fill it.)',
        ],
      },
      {
        heading: 'Objection: "It\'s Too Expensive"',
        lines: [
          'I understand — can I ask what budget you had in mind?',
          'I might be able to adjust the scope to fit that — for example, we could start with a smaller site and add features later once you\'re seeing a return.',
        ],
      },
      {
        heading: 'Objection: "I Need to Think About It"',
        lines: [
          'Of course — what\'s the main thing you\'re unsure about? I\'d rather answer any questions now so you\'ve got everything you need to make a decision.',
        ],
      },
      {
        heading: 'Objection: "I\'ll Sort It Myself / Use a Template"',
        lines: [
          'Totally — a lot of people start that way. The difference is time: most business owners I speak to say they\'ve had a half-finished site on their to-do list for over a year. I handle the whole thing so you don\'t have to think about it.',
        ],
      },
      {
        heading: 'Closing',
        lines: [
          'If you\'re happy to go ahead, all I need to get started is a 50% deposit and I can have a first draft in front of you within [X] weeks.',
          'Want me to send over the invoice now so we can lock in the start date?',
        ],
      },
    ],
  },
];

export const SCRIPT_COLOUR_MAP = {
  sky:     { border: 'border-sky-500/30',     bg: 'bg-sky-500/5',     badge: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',     heading: 'text-sky-400'     },
  violet:  { border: 'border-violet-500/30',  bg: 'bg-violet-500/5',  badge: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',  heading: 'text-violet-400'  },
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', heading: 'text-emerald-400' },
  amber:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   badge: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',   heading: 'text-amber-400'   },
};

// Fills [Business Name] / [Owner Name] / [Name] in from a CRM lead. Anything
// not known about the lead is left as the original bracketed placeholder
// (rather than blanked out), so the line always still reads sensibly as a
// prompt to fill in by hand — same principle as the email template fallback.
export function fillCallScriptLine(line, lead) {
  if (!lead) return line;
  let result = line;
  if (lead.businessName?.trim()) {
    result = result.replaceAll('[Business Name]', lead.businessName.trim());
  }
  if (lead.contactName?.trim()) {
    const firstName = lead.contactName.trim().split(/\s+/)[0];
    result = result.replaceAll('[Owner Name]', lead.contactName.trim()).replaceAll('[Name]', firstName);
  }
  return result;
}
