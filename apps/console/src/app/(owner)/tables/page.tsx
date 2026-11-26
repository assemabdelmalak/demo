import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.tables');

export default function TablesPage() {
  return <PlaceholderPage section="tables" />;
}
