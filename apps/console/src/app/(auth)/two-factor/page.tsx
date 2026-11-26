import { getTranslations } from 'next-intl/server';

import { TwoFactorSettings } from './two-factor-settings';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';
import { requireSignedIn } from '@/lib/session.server';

export const generateMetadata = () => pageMetadata('auth.twoFactor.title');

export default async function TwoFactorPage() {
  const me = await requireSignedIn();
  const t = await getTranslations('auth.twoFactor');
  return (
    <>
      <AuthHeading title={t('title')} />
      <TwoFactorSettings enabled={me.user.twoFactorEnabled} />
    </>
  );
}
