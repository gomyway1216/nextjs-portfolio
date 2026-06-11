'use client';
import React from 'react';
import { useProfile } from '@/hooks/useProfile';
import { resolveSocialLinks } from '@/lib/socialLinks';
import { SOCIAL_PLATFORM_META } from '@/components/socialPlatforms';

const Social = () => {
  const { profile } = useProfile();
  const links = resolveSocialLinks(profile);

  return (
    <div className="nav social-icons justify-content-center">
      {links.map(({ platform, url }) => {
        const { Icon, label } = SOCIAL_PLATFORM_META[platform];
        return (
          <a key={`${platform}-${url}`} href={url} rel="noopener noreferrer" target="_blank" aria-label={label}>
            <Icon />
          </a>
        );
      })}
    </div>
  );
};

export default Social;
