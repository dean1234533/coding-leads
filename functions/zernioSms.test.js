import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSms, toE164Uk, _internal } from './zernioSms.js';

const axiosPost = vi.fn();
_internal.setAxiosPostForTests(axiosPost);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZERNIO_API_KEY = 'test-key';
});

describe('toE164Uk', () => {
  it('adds +44 to a leading-0 UK number', () => {
    expect(toE164Uk('07712345678')).toBe('+447712345678');
  });

  it('adds + to a number already starting 44', () => {
    expect(toE164Uk('447712345678')).toBe('+447712345678');
  });

  it('leaves an already-E.164 number unchanged', () => {
    expect(toE164Uk('+447712345678')).toBe('+447712345678');
  });

  it('strips formatting (spaces, dashes, brackets) before normalizing', () => {
    expect(toE164Uk('(0771) 234-5678')).toBe('+447712345678');
  });

  it('returns null for empty/missing input', () => {
    expect(toE164Uk('')).toBeNull();
    expect(toE164Uk(undefined)).toBeNull();
    expect(toE164Uk(null)).toBeNull();
  });
});

describe('sendSms', () => {
  it('posts to the Zernio SMS endpoint with the recipient normalized to E.164 and a Bearer auth header', async () => {
    axiosPost.mockResolvedValue({ data: { id: 'msg_1', conversationId: 'conv_1', status: 'sent' } });
    const result = await sendSms({ to: '07712345678', text: 'Hello' });
    expect(axiosPost).toHaveBeenCalledWith(
      'https://zernio.com/api/v1/sms/messages',
      expect.objectContaining({ to: '+447712345678', text: 'Hello' }),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) }),
    );
    expect(result).toEqual({ id: 'msg_1', conversationId: 'conv_1' });
  });

  it('sends the Idempotency-Key header when one is provided, and omits it when not', async () => {
    axiosPost.mockResolvedValue({ data: { id: 'msg_1', conversationId: 'conv_1' } });
    await sendSms({ to: '07712345678', text: 'Hi', idempotencyKey: 'followup:lead1:0' });
    expect(axiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'followup:lead1:0' }) }),
    );

    axiosPost.mockClear();
    await sendSms({ to: '07712345678', text: 'Hi' });
    const [, , config] = axiosPost.mock.calls[0];
    expect(config.headers['Idempotency-Key']).toBeUndefined();
  });

  it('returns null without throwing when ZERNIO_API_KEY is not set', async () => {
    delete process.env.ZERNIO_API_KEY;
    const result = await sendSms({ to: '07712345678', text: 'Hi' });
    expect(result).toBeNull();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('returns null without throwing when there is no usable phone number', async () => {
    const result = await sendSms({ to: '', text: 'Hi' });
    expect(result).toBeNull();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('returns null (not a thrown error) on a 409 — opted-out recipient is an expected outcome, not a failure', async () => {
    axiosPost.mockRejectedValue({ response: { status: 409, data: { message: 'Recipient opted out' } } });
    const result = await sendSms({ to: '07712345678', text: 'Hi' });
    expect(result).toBeNull();
  });

  it('returns null (not a thrown error) on a carrier-side 502 failure', async () => {
    axiosPost.mockRejectedValue({ response: { status: 502, data: { message: 'Carrier error' } } });
    const result = await sendSms({ to: '07712345678', text: 'Hi' });
    expect(result).toBeNull();
  });

  it('never throws even on a network-level error with no response object', async () => {
    axiosPost.mockRejectedValue(new Error('ECONNRESET'));
    await expect(sendSms({ to: '07712345678', text: 'Hi' })).resolves.toBeNull();
  });
});
