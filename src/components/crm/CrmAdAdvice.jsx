import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';

// Written content, not AI-generated — the actual setup flow doesn't need
// personalizing per-business and shouldn't drift/hallucinate between runs.
// Verified against Meta's current (2026) setup flow and terminology
// (Meta Business Suite/Manager, simplified campaign objectives, Pixel +
// Conversions API as the now-mandatory tracking setup) rather than assumed
// from stale training knowledge, since ad platforms change their UI often.
const SETUP_STEPS = [
  {
    title: '1. Set up Meta Business Suite',
    body: "You'll need a personal Facebook account first (Meta uses it as the login), then create or connect your business Facebook Page. Meta Business Suite (business.facebook.com) is the central hub — it'll walk you through connecting the Page and, if you use one, your Instagram account too.",
  },
  {
    title: '2. Create a Business Manager + Ad Account',
    body: 'Inside Business Suite, set up a Meta Business Manager (manages assets, permissions, security) and an Ad Account (where campaigns, billing, and your payment method live). This also covers team permissions and business verification — expect about 15 minutes for this part.',
  },
  {
    title: '3. Install the Meta Pixel + Conversions API',
    body: "Do this before your first campaign, not after. The Pixel tracks visitors on your site from the browser side; the Conversions API (CAPI) is a server-side feed that keeps working even with ad blockers or iOS privacy restrictions. Without both, Meta can't tell which ads are actually driving enquiries — you'd be flying blind on what's working.",
  },
  {
    title: '4. Open Ads Manager and create a campaign',
    body: "From Business Suite's left panel: Ads Manager → Account Overview → the green \"Create Ad\" button. You'll be asked for a campaign objective (Meta's objectives are simplified now — pick the one closest to \"leads\" or \"messages\" for a service business like this) and a buying type.",
  },
  {
    title: '5. Set your audience, budget, and creative',
    body: "Meta increasingly favours broad targeting and lets its own AI find likely buyers rather than manually stacking narrow interest filters — for a local service business, still set a location radius around where you actually work, and let the objective/creative do more of the targeting work. Add your ad image/video, headline, and a single clear call to action (e.g. \"Get a free quote\").",
  },
  {
    title: '6. Submit for review',
    body: "Most ads are reviewed within 24 hours against Meta's ad policies and community standards. You'll get a notification once it's approved and live — if it's rejected, the notification explains why so you can fix and resubmit.",
  },
];

const SOURCES_NOTE = (
  <>
    Sources: <a href="https://buffer.com/resources/facebook-ads-beginners-guide/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Buffer</a>,{' '}
    <a href="https://adadvisor.ai/blog/complete-guide-setting-up-meta-ads-2026" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">AdAdvisor</a>,{' '}
    <a href="https://www.pansofic.com/blog/meta-ads-changes-2026-setup-guide" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Pansofic</a> — worth a quick check against Meta's own docs before spending, since ad-platform UIs shift often.
  </>
);

export default function CrmAdAdvice() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      // Same cached endpoint the Insights tab uses (see CrmInsights.jsx) —
      // one shared 1-hour cache, so opening both tabs doesn't double the AI
      // calls unless you explicitly refresh.
      const fn = httpsCallable(getFunctions(app), 'getBusinessInsights', { timeout: 60000 });
      const { data } = await fn({ forceRefresh });
      setInsights(data);
    } catch (err) {
      setError(err?.message ?? 'Failed to load advice.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Ads & Instagram Growth</h2>
          <p className="mt-1 text-xs text-gray-500">How to set up Facebook/Instagram ads, when to post organically, and what else is worth focusing on right now.</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh Advice'}
        </button>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-200">Setting Up a Facebook/Instagram (Meta) Ad</h3>
        <div className="mt-4 space-y-4">
          {SETUP_STEPS.map((step) => (
            <div key={step.title}>
              <p className="text-sm font-semibold text-blue-400">{step.title}</p>
              <p className="mt-1 text-sm text-gray-400">{step.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-gray-600">{SOURCES_NOTE}</p>
      </section>

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{error}</p>}

      {loading && !insights ? (
        <p className="text-sm text-gray-500">Loading advice…</p>
      ) : insights?.adAdvice ? (
        <>
          <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 sm:p-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-400">Best Times to Run Ads</h3>
            <p className="mt-2 text-sm text-gray-300">{insights.adAdvice.bestTimes}</p>
          </section>

          {insights.adAdvice.instagram && (
            <section className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 sm:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-pink-400">Instagram Growth</h3>
              {insights.adAdvice.instagram.bestTimes && (
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Best times to post</p>
                  <p className="mt-1 text-sm text-gray-300">{insights.adAdvice.instagram.bestTimes}</p>
                </div>
              )}
              {insights.adAdvice.instagram.postFrequency && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">How often to post</p>
                  <p className="mt-1 text-sm text-gray-300">{insights.adAdvice.instagram.postFrequency}</p>
                </div>
              )}
              {insights.adAdvice.instagram.contentIdeas?.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">What to post</p>
                  <ul className="mt-1 space-y-1.5 text-sm text-gray-300">
                    {insights.adAdvice.instagram.contentIdeas.map((idea, i) => (
                      <li key={i} className="flex gap-2"><span className="text-pink-500">•</span>{idea}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-[11px] text-gray-600">
                For account-specific timing (not just general guidance), check your own Instagram Insights (Professional Dashboard → Insights) — it shows when your actual followers are active, which beats any generic recommendation.
              </p>
            </section>
          )}

          {insights.adAdvice.tips?.length > 0 && (
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Other Growth Advice</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
                {insights.adAdvice.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2"><span className="text-blue-500">•</span>{tip}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : !loading && (
        <p className="text-sm text-gray-500">AI advice unavailable right now — the setup guide above still applies. Try Refresh Advice shortly.</p>
      )}

      <p className="text-xs text-gray-600">
"Best times", posting frequency, and content ideas are AI-generated general marketing guidance informed by your CRM's lead-source data — not based on real ad-performance or Instagram-account analytics, since this app isn't connected to either. Treat them as a starting point, not measured results.
      </p>
    </div>
  );
}
