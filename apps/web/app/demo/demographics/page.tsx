import type { Metadata } from 'next';
import DemographicDemo from '@/components/DemographicDemo';

export const metadata: Metadata = {
  title: 'Buying-Power Geo-Grid & AI Citation Sandbox',
  description: 'Explore U.S. Census income, homeownership and housing age beneath simulated Google Maps rankings and AI citations. Test the Buying-Power Geo-Grid, then request a live Android evidence audit.',
};

export default function DemographicsDemoPage() {
  return <DemographicDemo />;
}
