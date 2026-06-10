'use client';

import { useEffect } from 'react';
import AOS from 'aos';

export default function AOSInitializer() {
  useEffect(() => {
    AOS.init({
      // 1200ms made the home page feel sluggish — every fade-up took
      // over a second to land, and with `once: false` it re-ran on every
      // scroll-back. 500ms is enough to read as motion without making
      // the user wait for each element.
      duration: 500,
      easing: 'ease-out-quad',
      once: true,
      // Honor the OS-level reduced-motion setting: AOS strips its
      // data-aos hooks so content shows immediately and no scroll
      // listener work happens.
      disable: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
  }, []);

  return null;
}
