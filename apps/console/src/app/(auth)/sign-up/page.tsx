import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SignUpForm } from './sign-up-form';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';
import { destinationFor, firstParam, safeNextPath } from '@/lib/navigation';
import { loadMeIfReachable } from '@/lib/session.server';

export const generateMetadata = () => pageMetadata('auth.signUp.title');

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath(firstParam((await searchParams).next));
  const me = await loadMeIfReachable();
  if (me) redirect(destinationFor(me, next));
  const t = await getTranslations('auth.signUp');
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <SignUpForm next={next} />
    </>
  );
}
