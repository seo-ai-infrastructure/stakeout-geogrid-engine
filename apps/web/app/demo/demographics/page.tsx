import type { Metadata } from 'next';
import DemographicDemo from '@/components/DemographicDemo';

export const metadata: Metadata = {
  title: 'Lakeland demographic map demo',
  description: 'Explore Census tract estimates beneath simulated local ranking pins in Lakeland, Florida.',
};

export default function DemographicsDemoPage() {
  return <DemographicDemo />;
}
