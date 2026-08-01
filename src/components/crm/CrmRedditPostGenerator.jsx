import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';

const MY_NAME = 'Dean Burt';

/**
 * Generates a genuine Reddit "success story / lessons learned" post from
 * real facts Dean supplies — never a pitch, never a link (see
 * functions/redditPostWriter.js for why). Copy-paste straight into Reddit.
 */
export default function CrmRedditPostGenerator() {
  const [topic, setTopic] = useState('');
  const [subreddit, setSubreddit] = useState('');
  const [pointsText, setPointsText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [post, setPost] = useState(null); // { title, body }
  const [copiedField, setCopiedField] = useState(null);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const keyPoints = pointsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'generateRedditPostNow', { timeout: 30000 });
      const { data } = await fn({ topic: topic.trim(), keyPoints, subreddit: subreddit.trim() || undefined, myName: MY_NAME });
      setPost(data);
    } catch (err) {
      console.error('[CrmRedditPostGenerator] generation failed:', err);
      setError(err?.message ?? 'Could not generate a post right now.');
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy(field, text) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <p className="text-sm font-semibold text-gray-200">Reddit Post Generator</p>
        <p className="mt-1 text-xs text-gray-500">
          Writes a genuine "success story" style post — no links, no pitch, no "DM me". Give it real facts; it won't invent numbers or claims.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Topic</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. How I get web dev clients using a free tool I built"
              className="rounded-lg border border-gray-800 bg-gray-800/30 px-2.5 py-1.5 text-sm text-gray-200 transition focus:border-blue-500 focus:bg-gray-800/60 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Subreddit (optional, for tone)</span>
            <input
              type="text"
              value={subreddit}
              onChange={(e) => setSubreddit(e.target.value)}
              placeholder="e.g. r/Freelancers"
              className="rounded-lg border border-gray-800 bg-gray-800/30 px-2.5 py-1.5 text-sm text-gray-200 transition focus:border-blue-500 focus:bg-gray-800/60 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              Real facts (one per line — what actually happened, any real numbers/steps)
            </span>
            <textarea
              rows={5}
              value={pointsText}
              onChange={(e) => setPointsText(e.target.value)}
              placeholder={'Built a free website audit tool\nUsed it to reach out to local businesses\nGot my first client from a cold email'}
              className="rounded-lg border border-gray-800 bg-gray-800/30 px-2.5 py-1.5 text-sm text-gray-200 transition focus:border-blue-500 focus:bg-gray-800/60 focus:outline-none"
            />
          </label>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating || !topic.trim()}
          className="mt-4 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? 'Writing…' : post ? 'Regenerate' : 'Generate Post'}
        </button>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {post && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Title</span>
              <button onClick={() => handleCopy('title', post.title)} className="rounded bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-700">
                {copiedField === 'title' ? 'Copied!' : 'Copy Title'}
              </button>
            </div>
            <p className="mt-1.5 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 text-sm font-medium text-gray-100">{post.title}</p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Body</span>
              <button onClick={() => handleCopy('body', post.body)} className="rounded bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-700">
                {copiedField === 'body' ? 'Copied!' : 'Copy Body'}
              </button>
            </div>
            <textarea
              readOnly
              rows={12}
              value={post.body}
              className="mt-1.5 w-full rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2 text-sm text-gray-200 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
