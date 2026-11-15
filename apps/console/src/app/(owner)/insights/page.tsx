import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.insights');

export default function InsightsPage() {
  return <PlaceholderPage section="insights" />;
}
