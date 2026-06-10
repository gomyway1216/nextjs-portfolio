import type { IconType } from 'react-icons';
import { FaFacebookF, FaLinkedinIn, FaGithub } from 'react-icons/fa';
import { RiTwitterXLine } from 'react-icons/ri';
import type { SocialPlatform } from '@/lib/socialLinks';

export const SOCIAL_PLATFORM_META: Record<SocialPlatform, { Icon: IconType; label: string }> = {
  facebook: { Icon: FaFacebookF, label: 'Facebook' },
  linkedin: { Icon: FaLinkedinIn, label: 'LinkedIn' },
  github: { Icon: FaGithub, label: 'GitHub' },
  twitter: { Icon: RiTwitterXLine, label: 'X' },
};
