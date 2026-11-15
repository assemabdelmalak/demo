import { PlaceholderPage } from '@/components/shell/placeholder-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = () => pageMetadata('nav.settings');

export default function SettingsPage() {
  return <PlaceholderPage section="settings" />;
}
