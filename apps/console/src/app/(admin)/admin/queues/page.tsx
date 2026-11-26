import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.queues');

export default function QueuesPage() {
  return <PlaceholderPage section="queues" />;
}
