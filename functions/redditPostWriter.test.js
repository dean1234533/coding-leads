import { describe, it, expect } from 'vitest';
import { buildRedditPostPrompt } from './redditPostWriter.js';

describe('buildRedditPostPrompt', () => {
  it('includes the topic and every given key point', () => {
    const prompt = buildRedditPostPrompt({
      topic: 'How I get web dev clients using a free tool',
      keyPoints: ['Built a free website audit tool', 'Got my first client from a cold email'],
      myName: 'Dean',
    });
    expect(prompt).toContain('How I get web dev clients using a free tool');
    expect(prompt).toContain('Built a free website audit tool');
    expect(prompt).toContain('Got my first client from a cold email');
  });

  it('never invents facts — explicitly instructs using ONLY the given points', () => {
    const prompt = buildRedditPostPrompt({ topic: 'x', keyPoints: ['real fact'], myName: 'Dean' });
    expect(prompt).toContain('use ONLY these');
    expect(prompt).toContain('never invent a specific number, client name, income figure or outcome');
  });

  it('handles no key points without breaking — tells the model to stay general rather than invent', () => {
    const prompt = buildRedditPostPrompt({ topic: 'x', keyPoints: [], myName: 'Dean' });
    expect(prompt).toContain('no specific facts given');
  });

  it('bans links, DMing, pricing and any direct pitch', () => {
    const prompt = buildRedditPostPrompt({ topic: 'x', keyPoints: [], myName: 'Dean' });
    expect(prompt).toContain('No links, no "DM me"');
    expect(prompt).toContain('not an ad');
  });

  it('mentions the subreddit when given, for tone-fitting', () => {
    const prompt = buildRedditPostPrompt({ topic: 'x', keyPoints: [], subreddit: 'r/Freelancers', myName: 'Dean' });
    expect(prompt).toContain('r/Freelancers');
  });

  it('requests the exact JSON response shape', () => {
    const prompt = buildRedditPostPrompt({ topic: 'x', keyPoints: [], myName: 'Dean' });
    expect(prompt).toContain('{"title": "...", "body": "..."}');
  });
});
