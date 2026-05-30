'use client';

// Home is the only route that uses [data-aos] elements, so AOS init +
// stylesheet live here instead of the root layout. Every other route
// (games, blog, tools, …) skips the AOS payload entirely.
import 'aos/dist/aos.css';
import AOSInitializer from './AOSInitializer';
import HomeLightAnimation from '@/views/all-home-version/HomeLightAnimation';

export default function Home() {
  return (
    <>
      <AOSInitializer />
      <HomeLightAnimation />
    </>
  );
}
