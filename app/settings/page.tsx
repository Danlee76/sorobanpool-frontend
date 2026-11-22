'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useConfirm } from '@/components/ConfirmDialog';
import { useRequireAuth } from '@/lib/auth';
import { useSession } from '@/lib/store';
import { listPasskeys, passkeyCancelled, removePasskey, usePasskeySupport, registerPasskey } from '@/lib/passkey';
import { backupSecret, confirmWithDevice, loadWallet } from '@/lib/wallet';
import { api } from '@/lib/api';

interface NotificationPreferences {
  sms: {
    priceBreaks: boolean;
    reminders: boolean;
    pickup: boolean;
  };
  whatsapp: {
    priceBreaks: boolean;
    reminders: boolean;
    pickup: boolean;
  };
  push: {
    priceBreaks: boolean;
    reminders: boolean;
    pickup: boolean;
  };
}

const defaultPreferences: NotificationPreferences = {
  sms: { priceBreaks: true, reminders: true, pickup: true },
  whatsapp: { priceBreaks: true, reminders: true, pickup: true },
  push: { priceBreaks: true, reminders: true, pickup: true },
};

export default function Settings() {
  const t = useTranslations('settings');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { ready } = useRequireAuth();
  const signOut = useSession((s) => s.signOut);
  const [secret, setSecret] = useState<string | null>(null);
  const passkeySupport = usePasskeySupport();
  const [passkey, setPasskey] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const { ask, dialog } = useConfirm();
  const qc = useQueryClient();
  const passkeyList = useQuery({ queryKey: ['passkeys'], queryFn: listPasskeys, enabled: ready && passkeySupport });
  const wallet = useQuery({ queryKey: ['wallet', 'local'], queryFn: loadWallet, enabled: ready });

  const notificationPrefs = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => api<NotificationPreferences>('/profile/notifications'),
    enabled: ready,
    placeholderData: defaultPreferences,
  });

  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>(
    notificationPrefs.data || defaultPreferences
  );

  const savePrefs = useMutation({
    mutationFn: (prefs: NotificationPreferences) =>
      api('/profile/notifications', { body: prefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
    },
  });

  function setLocale(l: 'en' | 'pcm') {
    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  async function showBackup() {
    if ((await confirmWithDevice()) === 'denied') return;
    setSecret(await backupSecret());
  }

  async function addPasskey() {
    setPasskey('busy');
    try {
      await registerPasskey();
      setPasskey('done');
      await qc.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (e) {
      setPasskey(passkeyCancelled(e) ? 'idle' : 'failed');
    }
  }

  async function removeOne(id: string) {
    if (!(await ask())) return;
    await removePasskey(id);
    await qc.invalidateQueries({ queryKey: ['passkeys'] });
  }

  const toggleNotification = (channel: keyof NotificationPreferences, category: keyof NotificationPreferences['sms']) => {
    const updated = {
      ...localPrefs,
      [channel]: {
        ...localPrefs[channel],
        [category]: !localPrefs[channel][category],
      },
    };
    setLocalPrefs(updated);
    savePrefs.mutate(updated);
  };

  if (!ready) return <p>{common('loading')}</p>;
  const btn = 'min-h-12 w-full rounded-xl border border-neutral-500 font-semibold';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      
      <section aria-labelledby="lang-h" className="space-y-2">
        <h2 id="lang-h" className="font-semibold">{t('language')}</h2>
        <div className="flex gap-3">
          <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')} className={`${btn} ${locale === 'en' ? 'border-emerald-800 bg-emerald-50' : ''}`}>{t('english')}</button>
          <button aria-pressed={locale === 'pcm'} onClick={() => setLocale('pcm')} className={`${btn} ${locale === 'pcm' ? 'border-emerald-800 bg-emerald-50' : ''}`}>{t('pidgin')}</button>
        </div>
      </section>

      <section aria-labelledby="notifications-h" className="space-y-4">
        <div>
          <h2 id="notifications-h" className="font-semibold">{t('notifications')}</h2>
          <p className="mt-1 text-sm text-neutral-700">{t('notificationsHelp')}</p>
        </div>

        <div className="space-y-4">
          {(['sms', 'whatsapp', 'push'] as const).map((channel) => (
            <div key={channel} className="rounded-xl border border-neutral-200 bg-white p-4">
              <h3 className="mb-3 font-semibold capitalize">{t(channel)}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('priceBreaks')}</p>
                    <p className="text-xs text-neutral-600">{t('priceBreaksHelp')}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(channel, 'priceBreaks')}
                    role="switch"
                    aria-checked={localPrefs[channel].priceBreaks}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      localPrefs[channel].priceBreaks ? 'bg-emerald-800' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        localPrefs[channel].priceBreaks ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('reminders')}</p>
                    <p className="text-xs text-neutral-600">{t('remindersHelp')}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(channel, 'reminders')}
                    role="switch"
                    aria-checked={localPrefs[channel].reminders}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      localPrefs[channel].reminders ? 'bg-emerald-800' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        localPrefs[channel].reminders ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('pickup')}</p>
                    <p className="text-xs text-neutral-600">{t('pickupHelp')}</p>
                  </div>
                  <button
                    onClick={() => toggleNotification(channel, 'pickup')}
                    role="switch"
                    aria-checked={localPrefs[channel].pickup}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      localPrefs[channel].pickup ? 'bg-emerald-800' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        localPrefs[channel].pickup ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">{t('criticalMessages')}</p>
          <p className="mt-1 text-xs text-amber-800">{t('criticalMessagesHelp')}</p>
        </div>
      </section>

      <section aria-labelledby="wallet-h" className="space-y-2">
        <h2 id="wallet-h" className="font-semibold">{t('wallet')}</h2>
        {wallet.data?.kind === 'passkey' ? (
          <p className="text-sm text-neutral-700">{t('walletPasskey')}</p>
        ) : wallet.data ? (
          <>
            <button onClick={() => void showBackup()} className={btn}>{t('backup')}</button>
            {secret && (<><p className="text-sm text-red-800">{t('backupWarn')}</p><code className="block break-all rounded-lg bg-neutral-100 p-3 text-sm">{secret}</code></>)}
          </>
        ) : null}
      </section>

      <section aria-labelledby="passkey-h" className="space-y-2">
        <h2 id="passkey-h" className="font-semibold">{t('passkeyTitle')}</h2>
        {passkeySupport ? (
          <>
            <p className="text-sm text-neutral-700">{t('passkeyHelp')}</p>
            <button onClick={() => void addPasskey()} disabled={passkey === 'busy' || passkey === 'done'} className={btn}>{t('passkeyAdd')}</button>
            {passkey === 'done' && <p role="status" className="text-sm text-emerald-800">{t('passkeyDone')}</p>}
            {passkey === 'failed' && <p role="alert" className="text-sm text-red-800">{common('error')}</p>}
            {passkeyList.data && passkeyList.data.length > 0 && (
              <ul className="space-y-2">
                {passkeyList.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-xl border border-neutral-300 p-3">
                    <span className="text-sm">{t('passkeyAddedOn', { date: new Date(p.createdAt).toLocaleDateString() })}</span>
                    <button onClick={() => void removeOne(p.id)} className="flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-800">{t('passkeyRemove')}</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : <p className="text-sm text-neutral-700">{t('passkeyUnsupported')}</p>}
      </section>
      {dialog}
      <button onClick={() => { signOut(); router.replace('/'); }} className={btn}>{t('signOut')}</button>
    </div>
  );
}
