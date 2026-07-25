const WEBSITE_PACKAGES = [
  {
    name: 'Launch Website',
    price: '£249',
    description: 'A clean, professional site to get them online and taking enquiries.',
    features: [
      'Mobile-friendly design',
      '1–3 pages',
      'Contact form',
      'Basic SEO setup',
      'Fast loading',
      'Hosting guidance',
    ],
  },
  {
    name: 'Core Website',
    price: '£399',
    agencyPrice: 'Agencies charge £1,500–£2,500',
    description: 'A ready-made setup with their branding, built to look credible fast.',
    features: [
      'Everything in Launch',
      'Up to 5 pages',
      'Logo & brand colours',
      'Google Maps & reviews',
      '30 days support',
    ],
  },
  {
    name: 'Business Website',
    price: '£699',
    agencyPrice: 'Agencies charge £3,000–£5,000',
    description: 'Custom-written content and stronger SEO for businesses ready to grow.',
    features: [
      'Everything in Core',
      'Custom-written content',
      'SEO titles & meta descriptions',
      'Analytics setup',
      'One revision round',
    ],
    highlight: true,
  },
  {
    name: 'Elite Website',
    price: '£1,200',
    agencyPrice: 'Agencies charge £6,000–£10,000',
    description: 'A complete, conversion-focused site for growing, multi-location businesses.',
    features: [
      'Everything in Business',
      '8+ pages',
      'Conversion-focused sections',
      'Booking/intake forms',
      'Security hardening',
      '60 days support',
    ],
  },
];

const APP_PACKAGES = [
  {
    name: 'App Prototype',
    price: '£1,999',
    description: 'Clickable app design or lean proof-of-concept for validating the idea before a full MVP.',
    features: [
      'User journey & core screens',
      'Clickable prototype',
      'Build direction for a full MVP',
    ],
  },
  {
    name: 'Starter App MVP',
    price: '£4,999',
    description: 'A focused app build with the core screens and backend needed to launch.',
    features: [
      'UX & core screens',
      'Authentication',
      'Simple backend/database',
      'Testing & launch-ready foundations',
      'Delivered in 4–6 weeks',
    ],
    highlight: true,
  },
  {
    name: 'Growth App',
    price: '£7,999',
    description: 'A more complete app with dashboards, booking, payments, or AI features.',
    features: [
      'Everything in Starter MVP',
      'Dashboards & admin tools',
      'Booking & payments',
      'AI features / integrations',
      'Launch support',
    ],
  },
  {
    name: 'AI Tool or Dashboard',
    price: '£2,999',
    description: 'A focused AI tool, calculator, dashboard, or automation that solves one clear business problem.',
    features: [
      'Scoped to a single business problem',
      'Admin view or intake form',
      'Automation or AI-powered output',
    ],
  },
];

const MAINTENANCE_FEATURES = [
  { label: 'Managed Hosting & CDN', desc: 'High-performance globally distributed hosting. I handle all server config, performance tuning, and SSL certificates.' },
  { label: '24/7 Uptime Monitoring', desc: 'Constant watch on the site. If anything goes down I\'m alerted immediately and resolve it before customers notice.' },
  { label: 'Security & Threat Protection', desc: 'Proactive firewall management and regular security scanning against malicious traffic and vulnerabilities.' },
  { label: 'Deployment Pipeline', desc: 'Automated, safe updates. When they need a change I handle deployment to keep the site stable.' },
  { label: 'Reliable Backups', desc: 'Regular automated backups of all site files and data — quick restore if anything goes wrong.' },
];

const MAINTENANCE_PLANS = [
  {
    name: 'Basic',
    price: '£29/mo',
    features: [
      'Hosting included',
      'Security monitoring',
      'Automatic backups',
      'Uptime monitoring',
    ],
  },
  {
    name: 'Business',
    price: '£59/mo',
    features: [
      'Everything in Basic',
      'Monthly software updates',
      'Up to 2 small content edits/mo',
      'Priority email support',
    ],
    highlight: true,
  },
  {
    name: 'Growth',
    price: '£99/mo',
    features: [
      'Everything in Business',
      'Unlimited small content edits',
      'Same-day priority support',
      'Monthly performance report',
    ],
  },
];

function PackageCard({ pkg }) {
  return (
    <div className={`flex flex-col rounded-xl border p-5 transition ${
      pkg.highlight
        ? 'border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20'
        : 'border-gray-800 bg-gray-900'
    }`}>
      {pkg.highlight && (
        <span className="mb-3 self-start rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400 ring-1 ring-inset ring-blue-500/30">
          Most Popular
        </span>
      )}
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-gray-100">{pkg.name}</h3>
        <span className="text-lg font-bold text-gray-100">{pkg.price}</span>
      </div>
      {pkg.agencyPrice && (
        <p className="mb-1 text-[11px] text-gray-600 line-through">{pkg.agencyPrice}</p>
      )}
      {pkg.description && (
        <p className="mb-4 text-xs text-gray-500 leading-relaxed">{pkg.description}</p>
      )}
      <ul className="mt-auto space-y-2">
        {pkg.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-gray-400">
            <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-gray-100">{title}</h2>
      <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}

export default function Pricing() {
  return (
    <div className="space-y-10">

      <div>
        <h1 className="text-xl font-bold text-white">Pricing</h1>
        <p className="text-xs text-gray-500">
          Reference rates for websites, mobile apps, and monthly retainers.
        </p>
      </div>

      {/* Websites */}
      <section>
        <SectionHeader
          title="Websites"
          subtitle="Custom-built, mobile-first websites — not templates."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WEBSITE_PACKAGES.map((pkg) => <PackageCard key={pkg.name} pkg={pkg} />)}
        </div>
      </section>

      {/* Mobile Apps */}
      <section>
        <SectionHeader
          title="Mobile Apps & AI Tools"
          subtitle="Full-cycle development — design, build, and store submission."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {APP_PACKAGES.map((pkg) => <PackageCard key={pkg.name} pkg={pkg} />)}
        </div>
      </section>

      {/* Maintenance & Management */}
      <section>
        <SectionHeader
          title="Website Maintenance & Management"
          subtitle="Keeping their site fast, secure, and always online — so they don't have to think about it."
        />

        {/* What's included */}
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 divide-y divide-gray-800">
          {MAINTENANCE_FEATURES.map((f) => (
            <div key={f.label} className="flex gap-3 px-5 py-3.5">
              <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              <div>
                <p className="text-xs font-semibold text-gray-200">{f.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
          {MAINTENANCE_PLANS.map((pkg) => <PackageCard key={pkg.name} pkg={pkg} />)}
        </div>

        <p className="mt-4 text-xs text-gray-600 leading-relaxed max-w-xl">
          Covers all infrastructure and uptime tasks. New features, major design changes, or large content updates are billed at standard hourly rate.
        </p>
      </section>

      {/* Note */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 text-xs text-gray-500 leading-relaxed">
        <span className="font-semibold text-gray-400">Note:</span> All prices are starting points.
        Final quotes are agreed after a discovery call based on your specific requirements.
        A 50% deposit is required to begin work.
      </div>

    </div>
  );
}
