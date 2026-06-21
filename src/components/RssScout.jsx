/**
 * RssScout
 *
 * Finds potential business clients by scanning subreddits where business
 * owners and entrepreneurs post about their needs (r/smallbusiness,
 * r/Entrepreneur, r/startups, r/ecommerce, r/forhire [Hiring only]).
 *
 * Posts are scored for relevance to mobile/web app development services and
 * sorted highest-relevance first. "Hot lead" badges flag the best matches.
 *
 * Props:
 *   onCopyToForm({ companyName, websiteUrl, ownerName }) — called when the
 *   user clicks "Copy to Lead Form" on a post. The parent updates its form state.
 */

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Finds the first http/https URL in a block of text.
 * Used to pre-fill the Website URL field from post content.
 */
function extractFirstUrl(text) {
  const match = text?.match(/https?:\/\/(?!www\.reddit\.com)[^\s)<>"]+/);
  return match?.[0]?.replace(/\.$/, '') ?? '';
}

/**
 * Attempts to extract a company/business name from a Reddit post title.
 * Strips common Reddit prefixes like [Hiring], [For Hire], etc.
 * Returns the cleaned title capped at 60 chars as a best-effort value.
 */
function extractCompanyName(title) {
  return title
    .replace(/^\[.*?\]\s*/g, '')     // remove [tags] at the start
    .replace(/^(hiring|for hire|looking for|need|wanted|seeking):?\s*/gi, '')
    .trim()
    .slice(0, 60);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Source badge — colored differently per subreddit */
function SourceBadge({ source }) {
  const styles = {
    'r/forhire':       'bg-violet-500/10 text-violet-400 ring-violet-500/20',
    'r/smallbusiness': 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
    'r/Entrepreneur':  'bg-orange-500/10 text-orange-400 ring-orange-500/20',
    'r/startups':      'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    'r/ecommerce':     'bg-pink-500/10 text-pink-400 ring-pink-500/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${styles[source] ?? 'bg-gray-500/10 text-gray-400 ring-gray-500/20'}`}>
      {source}
    </span>
  );
}

/** Hot lead badge shown when relevanceScore >= 2 */
function HotBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/25">
      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
      </svg>
      Hot Lead
    </span>
  );
}

/** Single post card */
function PostCard({ post, onCopy, isCopied }) {
  const excerpt = post.content?.slice(0, 180).trim();
  const isHot = (post.relevanceScore ?? 0) >= 2;

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 transition hover:border-gray-700 ${
      isHot ? 'border-amber-500/30 bg-amber-500/5' : 'border-gray-800 bg-gray-900/60'
    }`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <SourceBadge source={post.source} />
            {isHot && <HotBadge />}
            {post.author && (
              <span className="text-xs text-gray-500">u/{post.author}</span>
            )}
            {post.pubDate && (
              <span className="text-xs text-gray-600">
                {new Date(post.pubDate).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                })}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium leading-snug text-gray-100 line-clamp-2">
            {post.title}
          </h3>
        </div>
      </div>

      {/* Excerpt */}
      {excerpt && (
        <p className="text-xs leading-relaxed text-gray-500 line-clamp-3">
          {excerpt}{excerpt.length >= 180 ? '…' : ''}
        </p>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-3 pt-1">
        {/* Copy to Lead Form */}
        <button
          onClick={() => onCopy(post)}
          className={`
            inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
            transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
            ${isCopied
              ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 focus:ring-emerald-500'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-indigo-500'
            }
          `}
        >
          {isCopied ? (
            <>
              {/* Checkmark icon */}
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Copied to Form
            </>
          ) : (
            <>
              {/* Arrow-up-right icon */}
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Copy to Lead Form
            </>
          )}
        </button>

        {/* View on Reddit */}
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 transition hover:text-gray-400"
        >
          View post →
        </a>
      </div>
    </div>
  );
}

/** Skeleton card shown while loading */
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
      <div className="flex gap-2">
        <div className="h-4 w-20 rounded-full bg-gray-800" />
        <div className="h-4 w-16 rounded-full bg-gray-800" />
      </div>
      <div className="h-4 w-3/4 rounded bg-gray-800" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-gray-800" />
        <div className="h-3 w-5/6 rounded bg-gray-800" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RssScout({ onCopyToForm }) {
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  // Track which post was most recently copied (by post ID) for button feedback
  const [copiedId, setCopiedId] = useState(null);
  // Active filter: 'all' | 'hot' | source name
  const [filter, setFilter] = useState('all');

  // Extracted so it can be called on mount AND by the Refresh button
  const loadFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fns = getFunctions(app);
      const fetchRssFeeds = httpsCallable(fns, 'fetchRssFeeds');
      const result = await fetchRssFeeds();
      setPosts(result.data.items);
    } catch (err) {
      console.error('[RssScout]', err);
      setError(err?.message ?? 'Failed to load feeds.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  /**
   * Called when the user clicks "Copy to Lead Form" on a post.
   * Extracts best-effort values and passes them up to LeadDashboard.
   */
  const handleCopy = useCallback((post) => {
    onCopyToForm({
      companyName: extractCompanyName(post.title),
      websiteUrl:  extractFirstUrl(post.content),
      ownerName:   post.author ?? '',
    });

    // Show success state on the button for 2 seconds
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, [onCopyToForm]);

  const filteredPosts = filter === 'all'
    ? posts
    : filter === 'hot'
      ? posts.filter(p => (p.relevanceScore ?? 0) >= 2)
      : posts.filter(p => p.source === filter);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">

      {/* ── Section header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Lead Scout</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Business owners &amp; entrepreneurs posting about app/tech needs — sorted by relevance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={loadFeeds}
            disabled={loading}
            title="Refresh posts"
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-800 bg-gray-950 p-1">
            {[
              { key: 'all',              label: 'All'              },
              { key: 'hot',              label: 'Hot Leads'        },
              { key: 'r/smallbusiness',  label: 'Small Biz'       },
              { key: 'r/Entrepreneur',   label: 'Entrepreneur'     },
              { key: 'r/startups',       label: 'Startups'         },
              { key: 'r/ecommerce',      label: 'eCommerce'        },
              { key: 'r/forhire',        label: 'For Hire'         },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  filter === key
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-6">

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredPosts.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No leads found for this filter.</p>
            <p className="mt-1 text-xs text-gray-600">
              {filter === 'hot'
                ? 'No high-relevance posts right now — check back later or browse All.'
                : 'Try switching to All or refreshing.'}
            </p>
          </div>
        )}

        {/* Post grid */}
        {!loading && !error && filteredPosts.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onCopy={handleCopy}
                isCopied={copiedId === post.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
