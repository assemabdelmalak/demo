import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.floor');

export default function FloorPage() {
  return <PlaceholderPage section="floor" />;
}
