import { doc, setDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { slugify } from './crmConstants';

// Per-issue send/reply counters — lets the dashboard answer "which kind of
// finding actually gets replies?" instead of only tracking reply rate per
// template. Reply/interested counts are written server-side (see
// syncGmailReplies in crmGmailService.js) when a reply is detected; this is
// only the "sent" half, called right after a successful send alongside the
// existing per-template sentCount tracking.
export async function recordIssuesSent(issuesChecklist) {
  if (!issuesChecklist?.length) return;
  await Promise.all(
    issuesChecklist.map((issue) =>
      setDoc(doc(db, 'issueAnalytics', slugify(issue)), { issue, sentCount: increment(1) }, { merge: true }).catch(() => {})
    )
  );
}
