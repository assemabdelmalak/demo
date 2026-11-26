import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.bills');

export default function BillsPage() {
  return <PlaceholderPage section="bills" />;
}
