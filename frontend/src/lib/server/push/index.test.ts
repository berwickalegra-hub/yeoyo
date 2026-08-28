import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { isPushConfigured, sendPushToUser } from './index';

const ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ENV };
});
afterEach(() => {
  process.env = { ...ENV };
});

function configureVapid() {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_SUBJECT = 'mailto:x@y.z';
}

describe('isPushConfigured', () => {
  it('false when any VAPID var is missing', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect(isPushConfigured()).toBe(false);
  });
  it('true when all three are set', () => {
    configureVapid();
    expect(isPushConfigured()).toBe(true);
  });
});

describe('sendPushToUser', () => {
  it('no-ops (no DB call) when push is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app' });
    expect(prismaMock.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends one notification per subscription', async () => {
    configureVapid();
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { endpoint: 'e1', p256dh: 'a', auth: 'b' },
      { endpoint: 'e2', p256dh: 'c', auth: 'd' },
    ] as never);
    sendNotification.mockResolvedValue(undefined);
    await sendPushToUser(prismaMock as never, 'u1', {
      title: 't',
      body: 'b',
      url: '/app/messages/1',
    });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('deletes a subscription that returns 410 Gone', async () => {
    configureVapid();
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { endpoint: 'dead', p256dh: 'a', auth: 'b' },
    ] as never);
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app' });
    expect(prismaMock.pushSubscription.delete).toHaveBeenCalledWith({
      where: { endpoint: 'dead' },
    });
  });

  it('swallows a 500 and does not throw or delete', async () => {
    configureVapid();
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { endpoint: 'e1', p256dh: 'a', auth: 'b' },
    ] as never);
    sendNotification.mockRejectedValueOnce({ statusCode: 500 });
    await expect(
      sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app' }),
    ).resolves.toBeUndefined();
    expect(prismaMock.pushSubscription.delete).not.toHaveBeenCalled();
  });
});
