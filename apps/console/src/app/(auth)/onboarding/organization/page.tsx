import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { OrganizationForm } from './organization-form';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';
import { activeMembership, homeForRole } from '@/lib/navigation';
import { requireSignedIn } from '@/lib/session.server';

export const generateMetadata = () => pageMetadata('auth.onboarding.title');

/** Onboarding step 0 (P1-T04): the signed-in person names an organisation and becomes its owner. */
export default async function OnboardingOrganizationPage() {
  const me = await requireSignedIn();
  const membership = activeMembership(me);
  if (membership) redirect(homeForRole(membership.role));
  const t = await getTranslations('auth.onboarding');
  return (
    <>
      <AuthHeading title={t('title')} subtitle={t('subtitle')} />
      <OrganizationForm />
    </>
  );
}
