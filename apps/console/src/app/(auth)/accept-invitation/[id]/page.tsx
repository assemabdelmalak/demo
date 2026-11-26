import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { isUuid } from '@radd/shared';
import { Button } from '@radd/ui';

import { AcceptInvitation } from './accept-invitation';

import { AuthHeading } from '@/components/auth/auth-heading';
import { pageMetadata } from '@/lib/metadata';
import { withNext } from '@/lib/navigation';
import { loadMe } from '@/lib/session.server';

export const generateMetadata = () => pageMetadata('auth.invitation.signedOutTitle');

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Invitation IDs are UUIDs; anything else cannot be one of ours.
  if (!isUuid(id)) notFound();
  const me = await loadMe();
  const t = await getTranslations('auth.invitation');

  if (!me) {
    // Answering needs an account with the invited address; both paths come back here.
    const here = `/accept-invitation/${id}`;
    return (
      <>
        <AuthHeading title={t('signedOutTitle')} subtitle={t('signedOutBody')} />
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={withNext('/sign-in', here)}>{t('signIn')}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={withNext('/sign-up', here)}>{t('signUp')}</Link>
          </Button>
        </div>
      </>
    );
  }

  return <AcceptInvitation id={id} email={me.user.email} />;
}
