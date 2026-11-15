import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.menu');

export default function MenuPage() {
  return <PlaceholderPage section="menu" />;
}
