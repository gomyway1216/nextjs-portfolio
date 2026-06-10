import styles from './RouteLoading.module.css';

/**
 * Route-level loading fallback shared by the app router loading.tsx files.
 * Server-renderable on purpose (no i18n hook) so it paints before any
 * client bundle loads.
 */
export default function RouteLoading() {
  return (
    <div className={styles.wrap} role="status" aria-label="Loading">
      <div className={styles.spinner} />
    </div>
  );
}
