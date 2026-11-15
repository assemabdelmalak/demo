'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Alert, Button } from '@radd/ui';

import { AuthHeading } from '@/components/auth/auth-heading';
import { FailureAlert } from '@/components/auth/form-messages';
import { authClient } from '@/lib/auth-client';
import { type Failure, runAuth } from '@/lib/auth-errors';
import { signInHref } from '@/lib/navigation';

interface InvitationSummary {
  organizationName: string;
  inviterEmail: string;
  role: string;
}

const KNOWN_ROLES = new Set(['owner', 'manager', 'staff', 'kitchen']);

/**
 * Better Auth answers an expired, answered or unknown invitation with a bare 400 and no code;
 * it is the "not found" case for the reader.
 */
function invitationFailure(failure: Failure): Failure {
  return failure.kind === 'unknown' && failure.status === 400
    ? { kind: 'code', code: 'INVITATION_NOT_FOUND', status: 400 }
    : failure;
}

export function AcceptInvitation({ id, email }: { id: string; email: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationSummary | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let current = true;
    void runAuth(() => authClient().organization.getInvitation({ query: { id } })).then(
      (result) => {
        if (!current) return;
        if (result.ok) setInvitation(result.data);
        else setFailure(invitationFailure(result.failure));
      },
    );
    return () => {
      current = false;
    };
  }, [id]);

  async function answer(action: 'accept' | 'decline') {
    if (pending) return;
    setPending(action);
    setFailure(null);
    const organization = authClient().organization;
    const result =
      action === 'accept'
        ? await runAuth(() => organization.acceptInvitation({ invitationId: id }))
        : await runAuth(() => organization.rejectInvitation({ invitationId: id }));
    setPending(null);
    if (!result.ok) {
      setFailure(invitationFailure(result.failure));
      return;
    }
    // Accepting makes the organisation active; `/` then opens the shell for the new role.
    if (action === 'accept') router.replace('/');
    else setDeclined(true);
  }

  async function switchAccount() {
    await runAuth(() => authClient().signOut());
    router.replace(signInHref(`/accept-invitation/${id}`));
    router.refresh();
  }

  const signedInAs = (
    <p className="text-small text-muted">
      {t.rich('auth.invitation.signedInAs', {
        address: email,
        email: (chunks) => <bdi>{chunks}</bdi>,
      })}
    </p>
  );
  const otherAccount = (
    <Button
      variant="ghost"
      className="self-start"
      onClick={() => {
        void switchAccount();
      }}
    >
      {t('auth.invitation.otherAccount')}
    </Button>
  );

  if (declined) {
    return (
      <>
        <AuthHeading title={t('auth.invitation.signedOutTitle')} />
        <Alert tone="info">{t('auth.invitation.declined')}</Alert>
      </>
    );
  }

  if (!invitation) {
    return (
      <>
        <AuthHeading title={t('auth.invitation.signedOutTitle')} />
        {failure ? (
          <>
            <FailureAlert failure={failure} />
            {signedInAs}
            {otherAccount}
          </>
        ) : (
          <p role="status" className="text-muted">
            {t('auth.invitation.loading')}
          </p>
        )}
      </>
    );
  }

  const role = KNOWN_ROLES.has(invitation.role) ? t(`roles.${invitation.role}`) : invitation.role;
  return (
    <>
      <AuthHeading
        title={t('auth.invitation.title', { organization: invitation.organizationName })}
        subtitle={t('auth.invitation.body', {
          inviter: invitation.inviterEmail,
          organization: invitation.organizationName,
          role,
        })}
      />
      <FailureAlert failure={failure} />
      <div className="flex flex-wrap gap-2">
        <Button
          aria-disabled={pending !== null}
          onClick={() => {
            void answer('accept');
          }}
        >
          {pending === 'accept' ? t('auth.common.working') : t('auth.invitation.accept')}
        </Button>
        <Button
          variant="secondary"
          aria-disabled={pending !== null}
          onClick={() => {
            void answer('decline');
          }}
        >
          {pending === 'decline' ? t('auth.common.working') : t('auth.invitation.decline')}
        </Button>
      </div>
      {signedInAs}
      {otherAccount}
    </>
  );
}
