import React from 'react';
import Link from 'next/link';

export default function Tags() {
  return (
    <div className="nav tag-cloud">
      <Link href="/blog-post-2">Design</Link>
      <Link href="/blog-post-4">Development</Link>
      <Link href="/blog-post-1">Travel</Link>
      <Link href="/blog-post-5">Web Design</Link>
      <Link href="/blog-post-2">Marketing</Link>
      <Link href="/blog-post-3">Research</Link>
      <Link href="/blog-post-6">Managment</Link>
    </div>
  );
}
