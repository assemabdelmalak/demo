import { getTranslations } from 'next-intl/server';

import { ResetPasswordForm } from './reset-password-form';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';
import { firstParam } from '@/lib/navigation';

export const generateMetadata = () => pageMetadata('auth.resetPassword.title');

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.resetPassword');
  const email = firstParam((await searchParams).email) ?? '';
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <ResetPasswordForm email={email} />
    </>
  );
}
