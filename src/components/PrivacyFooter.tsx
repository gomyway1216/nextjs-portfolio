/**
 * Minimal privacy notice surfaced site-wide. Anonymous Firebase Auth
 * gives every visitor a uid even before they sign in, so disclosing this
 * is the right thing to do.
 */
export default function PrivacyFooter() {
  return (
    <div
      style={{
        padding: '12px 16px',
        fontSize: '11px',
        color: '#94a3b8',
        textAlign: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      We log activity (page views, requests, errors) to operate this site. No tracking cookies, no third-party analytics.
    </div>
  );
}
