import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.kitchen');

export default function KitchenPage() {
  return <PlaceholderPage section="kitchen" />;
}
