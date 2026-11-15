import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.organizations');

export default function OrganizationsPage() {
  return <PlaceholderPage section="organizations" />;
}
