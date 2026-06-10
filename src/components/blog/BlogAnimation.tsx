'use client';
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import Contact from '../contact/Contact';
import * as postApi from '@/services/postsService';
import type { ListingPost } from '@/services/postsService';
import { sanitizeRichHtml } from '@/lib/sanitizeHtml';
import * as util from '@/lib/utils/util';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '@/lib/blog/postTranslations';


// Modal.setAppElement('#root');

const Blogs = () => {
  const { t, i18n } = useTranslation();
  // const [isOpen, setIsOpen] = useState(false);
  // const [isOpen2, setIsOpen2] = useState(false);
  // const [isOpen3, setIsOpen3] = useState(false);
  // const [isOpen4, setIsOpen4] = useState(false);
  const [posts, setPosts] = useState<ListingPost[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ListingPost | null>(null);
  const [body, setBody] = useState<string>('');

  // Set app element for accessibility once component has mounted
  // useEffect(() => {
  //   Modal.setAppElement('#root');
  // }, []);

  useEffect(() => {
    let cancelled = false;
    setFetchError(null);
    (async () => {
      try {
        const fetchedPosts = await postApi.getTop4Posts(normalizeLanguage(i18n.language));
        if (!cancelled) setPosts(fetchedPosts);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BlogAnimation] failed to fetch top posts:', msg);
        setFetchError(msg);
        setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const handlePostClick = (post: ListingPost) => {
    setSelectedPost(post);
    setModalOpen(true);
    setBody(sanitizeRichHtml(post.body));
  };

  if (posts.length === 0) {
    return (
      <div>
        <div>{t('home.blog.comingSoon')}</div>
        {fetchError && <ErrorWithLinks message={fetchError} />}
      </div>
    );
  }

  return (
    <>
      <div className="row">
        {posts.map((post, index) => (
          <div
            className="col-md-6 m-15px-tb"
            data-aos="fade-right"

            // data-aos-delay="200 * index"
            data-aos-delay={200 * index}
            key={index + 'id:' + post.id}
          >
            <div
              className="blog-grid modern-card"
              onClick={() => handlePostClick(post)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handlePostClick(post);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="blog-img" style={{ position: 'relative', aspectRatio: '16 / 10' }}>
                {post.image && (
                  <Image
                    src={post.image}
                    alt={post.title || 'Blog post image'}
                    fill
                    sizes="(max-width: 700px) 100vw, 33vw"
                    style={{ objectFit: 'cover' }}
                  />
                )}
              </div>
              <div className="blog-info">
                <div className="meta">{util.formatDate(post.created)}</div>
                <h6>
                  <a>
                    {post.title}
                  </a>
                </h6>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* End .row */}

      {/* Start Modal for Blog-1 */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="custom-overlay" />
          <Dialog.Content className="custom-modal" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">{selectedPost?.title || ''}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="close-modal" aria-label="Close">
                <Image src="/img/cancel.svg" alt="close icon" width={45} height={45} />
              </button>
            </Dialog.Close>
            {/* End close icon */}

          {selectedPost && <div className="box_inner">
            <div className="scrollable">
              <div className="blog-grid">
                <div className="blog-img" style={{ position: 'relative', aspectRatio: '16 / 10' }}>
                  {selectedPost?.image && (
                    <Image
                      src={selectedPost.image}
                      alt={selectedPost.title || 'Blog post'}
                      fill
                      sizes="(max-width: 768px) 100vw, 70vw"
                      style={{ objectFit: 'cover' }}
                    />
                  )}
                </div>
                {/* End blog-img */}
                <article className="article">
                  <div className="article-title">
                    <h2>
                      {selectedPost.title}
                    </h2>
                    <div className="media">
                      <div className="avatar" style={{ position: 'relative', width: 48, height: 48 }}>
                        {selectedPost.image && (
                          <Image
                            src={selectedPost.image}
                            alt="thumbnail"
                            fill
                            sizes="48px"
                            style={{ objectFit: 'cover', borderRadius: '50%' }}
                          />
                        )}
                      </div>
                      <div className="media-body">
                        <span>{util.formatDate(selectedPost.created)}</span>
                      </div>
                    </div>
                  </div>
                  {/* End .article-title */}

                  <div className="article-content">
                    <div dangerouslySetInnerHTML={{ __html: body }} />
                  </div>
                  {/* End article content */}
                  <ul className="nav tag-cloud">
                    <li>Design</li>
                    <li>Development</li>
                    <li>Travel</li>
                    <li>Web Design</li>
                    <li>Marketing</li>
                    <li>Research</li>
                    <li>Managment</li>
                  </ul>
                  {/* End tag */}
                </article>
                {/* End Article */}

                <div className="contact-form article-comment">
                  <h4>{t('home.blog.leaveReply')}</h4>
                  <Contact blogId={selectedPost.id}/>
                </div>
                {/* End .contact Form */}
              </div>
            </div>
          </div>}
          {/* End modal box news */}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {/* End  Modal for Blog-1 */}
    </>
  );
};

// Renders an error message verbatim with any URLs turned into clickable
// links. Firestore "needs an index" errors include a one-click create
// URL, and we want that URL to be reachable without copy-pasting.
const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

const ErrorWithLinks = ({ message }: { message: string }) => {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of message.matchAll(URL_REGEX)) {
    const url = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) segments.push(message.slice(lastIndex, start));
    segments.push(
      <a key={start} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#a855f7', textDecoration: 'underline', wordBreak: 'break-all' }}>
        {url}
      </a>,
    );
    lastIndex = start + url.length;
  }
  if (lastIndex < message.length) segments.push(message.slice(lastIndex));

  return (
    <div
      role="alert"
      style={{
        marginTop: '12px',
        padding: '12px 14px',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        borderRadius: '8px',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        color: '#fecaca',
        fontSize: '12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {segments}
    </div>
  );
};

export default Blogs;
