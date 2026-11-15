import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.allergens');

export default function AllergensPage() {
  return <PlaceholderPage section="allergens" />;
}
