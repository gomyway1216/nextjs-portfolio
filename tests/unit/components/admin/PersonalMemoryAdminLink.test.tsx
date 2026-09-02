import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PersonalMemoryAdminLink from '@/components/admin/PersonalMemoryAdminLink';

describe('PersonalMemoryAdminLink', () => {
  it('opens the authenticated private memory dashboard from the admin sidebar', () => {
    const markup = renderToStaticMarkup(<PersonalMemoryAdminLink />);

    expect(markup).toContain('href="/memory?view=private"');
    expect(markup).toContain('Personal Memory');
    expect(markup).toContain('admin-console__nav-button');
  });
});
