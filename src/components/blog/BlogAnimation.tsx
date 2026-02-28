'use client';
import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import Contact from '../contact/Contact';
import * as postApi from '@/services/postsService';
import DOMPurify from 'dompurify';
import * as util from '@/lib/utils/util';


// Modal.setAppElement('#root');

const Blogs = () => {
  // const [isOpen, setIsOpen] = useState(false);
  // const [isOpen2, setIsOpen2] = useState(false);
  // const [isOpen3, setIsOpen3] = useState(false);
  // const [isOpen4, setIsOpen4] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>({});
  const [body, setBody] = useState<any>();

  // Set app element for accessibility once component has mounted
  // useEffect(() => {
  //   Modal.setAppElement('#root');
  // }, []);

  const getPosts = async () => {
    const fetchedPosts = await postApi.getTop4Posts();
    setPosts(fetchedPosts);
  };

  useEffect(() => {
    getPosts();
  }, []);

  const handlePostClick = (post: any) => {
    setSelectedPost(post);
    setModalOpen(true);
    const purifiedBody = DOMPurify.sanitize(post.body, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
    });
    setBody(purifiedBody);
  };

  if (posts.length === 0) {
    return <div>Coming soon...</div>;
  }

  return (
    <>
      <div className="row">
        {posts.map((post, index) => (
          <div
            className="col-md-6 m-15px-tb"
            data-aos="fade-right"
            data-aos-duration="1200"
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
              <div className="blog-img">
                <img src={post.image} alt="blog image"></img>
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
      <Modal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        contentLabel="My dialog"
        className="custom-modal"
        overlayClassName="custom-overlay"
        closeTimeoutMS={500}
      >
        <div>
          <button className="close-modal" onClick={() => setModalOpen(false)}>
            <img src="/img/cancel.svg" alt="close icon" />
          </button>
          {/* End close icon */}

          <div className="box_inner">
            <div className="scrollable">
              <div className="blog-grid">
                <div className="blog-img">
                  <img src={selectedPost.image} alt="blog post"></img>
                </div>
                {/* End blog-img */}
                <article className="article">
                  <div className="article-title">
                    <h2>
                      {selectedPost.title}
                    </h2>
                    <div className="media">
                      <div className="avatar">
                        <img src={selectedPost.image} alt="thumbnail" />
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
                  <h4>Leave a Reply</h4>
                  <Contact blogId={selectedPost.id}/>
                </div>
                {/* End .contact Form */}
              </div>
            </div>
          </div>
        </div>
        {/* End modal box news */}
      </Modal>
      {/* End  Modal for Blog-1 */}
    </>
  );
};

export default Blogs;