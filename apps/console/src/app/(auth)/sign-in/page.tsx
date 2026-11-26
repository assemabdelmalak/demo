import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SignInFlow } from './sign-in-flow';

import { pageMetadata } from '@/lib/metadata';
import { destinationFor, firstParam, safeNextPath } from '@/lib/navigation';
import { loadMeIfReachable } from '@/lib/session.server';

export const generateMetadata = () => pageMetadata('auth.signIn.title');

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const me = await loadMeIfReachable();
  if (me) redirect(destinationFor(me, next));
  const t = await getTranslations('auth.signIn');
  return (
    <SignInFlow
      next={next}
      passwordChanged={firstParam(params.reset) === 'done'}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  );
}
