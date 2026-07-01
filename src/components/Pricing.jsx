const WEBSITE_PACKAGES = [
  {
    name: 'Essential',
    price: '£399',
    agencyPrice: 'Agencies charge £1,500–£2,500',
    description: 'Their details swapped into a pre-built professional design. Live within a week.',
    features: [
      'Professional ready-made design',
      'Their logo, colours & contact details',
      'Services, reviews & enquiry form',
      'Mobile optimised',
      '1 round of revisions',
    ],
  },
  {
    name: 'Standard',
    price: '£699',
    agencyPrice: 'Agencies charge £3,000–£5,000',
    description: 'Fully tailored — custom content, their branding, SEO ready.',
    features: [
      'Everything in Essential',
      'Custom-written content for their firm',
      'SEO titles & meta descriptions',
      'Google Maps & Reviews integration',
      '3 rounds of revisions',
      '2 months free support',
    ],
    highlight: true,
  },
  {
    name: 'Premium',
    price: '£1,200',
    agencyPrice: 'Agencies charge £6,000–£10,000',
    description: 'Extra pages, client portal & full local SEO to bring in new clients.',
    features: [
      'Everything in Standard',
      'Individual service area pages',
      'Online client intake form',
      'Local SEO & Google Business setup',
      'Unlimited revisions',
      '6 months free support',
    ],
  },
];

const APP_PACKAGES = [
  {
    name: 'MVP App',
    price: '£3,500',
    description: 'Get your idea live quickly with the core features that matter most.',
    features: [
      'Single platform (Android or iOS)',
      'Up to 3 core features',
      'App store submission',
      'Delivered in 4–6 weeks',
    ],
  },
  {
    name: 'Standard App',
    price: '£7,500',
    description: 'A fully featured app for both platforms with user accounts and notifications.',
    features: [
      'Android + iOS',
      'User login & accounts',
      'Database integration',
      'Push notifications',
      'App store submission',
      'Delivered in 6–10 weeks',
    ],
    highlight: true,
  },
  {
    name: 'Full Product',
    price: '£15,000+',
    description: 'End-to-end product development with payments, admin dashboard, and ongoing support.',
    features: [
      'Custom features',
      'Payment integration',
      'Admin dashboard',
      'Ongoing support plan',
      'Timeline agreed per project',
    ],
  },
];

const RETAINER_PLANS = [
  {
    name: 'Basic',
    price: '£75/mo',
    features: [
      'Hosting & uptime monitoring',
      'Security updates',
      'Minor text & image changes',
    ],
  },
  {
    name: 'Pro',
    price: '£150/mo',
    features: [
      'Everything in Basic',
      'Priority support',
      'Monthly performance report',
      'Up to 2hrs development per month',
    ],
    highlight: true,
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
    name: 'Essential',
    price: '£49/mo',
    agencyPrice: 'Agencies charge £100–£150/mo',
    best: 'Static sites & portfolios',
    features: [
      'Managed hosting & SSL',
      '24/7 uptime monitoring',
      'Monthly security & backups',
      'Content updates at hourly rate',
      'Email support',
    ],
  },
  {
    name: 'Professional',
    price: '£99/mo',
    agencyPrice: 'Agencies charge £200–£350/mo',
    best: 'Small businesses & e-commerce',
    features: [
      'Everything in Essential',
      'Weekly security & backups',
      '1 hour content updates included/mo',
      'Priority email & phone support',
      'Monthly performance report',
    ],
    highlight: true,
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
        <div className="grid gap-4 sm:grid-cols-3">
          {WEBSITE_PACKAGES.map((pkg) => <PackageCard key={pkg.name} pkg={pkg} />)}
        </div>
      </section>

      {/* Mobile Apps */}
      <section>
        <SectionHeader
          title="Mobile Apps"
          subtitle="Full-cycle development — design, build, and store submission."
        />
        <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
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
