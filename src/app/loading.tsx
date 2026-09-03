import RouteLoading from '@/components/common/RouteLoading';

// Immediate feedback for routes that do not define a more specific loading
// UI. This keeps a slow server round-trip from looking like a missed click.
export default function Loading() {
  return <RouteLoading />;
}
