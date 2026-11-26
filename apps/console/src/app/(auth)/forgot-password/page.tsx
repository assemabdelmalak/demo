import { getTranslations } from 'next-intl/server';

import { ForgotPasswordForm } from './forgot-password-form';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('auth.forgotPassword.title');

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgotPassword');
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <ForgotPasswordForm />
    </>
  );
}
