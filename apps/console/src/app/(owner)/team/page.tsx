import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.team');

export default function TeamPage() {
  return <PlaceholderPage section="team" />;
}
