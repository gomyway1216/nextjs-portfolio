'use client';
import React from 'react';
import { useProfile } from '@/hooks/useProfile';
import { resolveSocialLinks } from '@/lib/socialLinks';
import { SOCIAL_PLATFORM_META } from '@/components/socialPlatforms';

const Footer = () => {
  const { profile } = useProfile();
  const links = resolveSocialLinks(profile);

  return (
    <>
      <div className="row align-items-center">
        <div className="col-md-6 my-2">
          <div className="nav justify-content-center justify-content-md-start">
            {links.map(({ platform, url }) => {
              const { Icon, label } = SOCIAL_PLATFORM_META[platform];
              return (
                <a key={platform} href={url} rel="noopener noreferrer" target="_blank" aria-label={label}>
                  <Icon />
                </a>
              );
            })}
          </div>
          {/* End .nav */}
        </div>
        {/* End .col */}

        <div className="col-md-6 my-2 text-center text-md-end">
          <p>
            © {new Date().getFullYear()} Yudai Yaguchi. All rights reserved.
          </p>
        </div>
        {/* End .col */}
      </div>
      {/* End .row */}
    </>
  );
};

export default Footer;
