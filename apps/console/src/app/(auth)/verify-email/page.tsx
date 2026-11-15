import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { VerifyEmailForm } from './verify-email-form';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';
import { destinationFor, firstParam, safeNextPath } from '@/lib/navigation';
import { loadMeIfReachable } from '@/lib/session.server';

export const generateMetadata = () => pageMetadata('auth.verifyEmail.title');

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const me = await loadMeIfReachable();
  if (me) redirect(destinationFor(me, next));
  const t = await getTranslations('auth.verifyEmail');
  const email = firstParam(params.email) ?? '';
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      {/* `fresh`: sign-up and a refused sign-in send a code just before linking here. */}
      <VerifyEmailForm email={email} next={next} fresh={email !== ''} />
    </>
  );
}
