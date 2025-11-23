import React, { forwardRef } from 'react';
import { htmlToText } from 'html-to-text';
import PropTypes from 'prop-types';

const PostListItem = forwardRef(
  ({ id, title, body, isPublic, created, lastUpdated, category, image, handleClick }: any, ref: any) => {
    const bodyText = htmlToText(body);
    return (
      <div
        ref={ref}
        style={{
          borderBottom: 'solid 1px rgba(242, 242, 242, 1)',
          paddingBottom: '40px',
          marginRight: 'auto',
        }}
      >
        <p
          style={{
            fontSize: '13.15px',
            color: 'gray',
            fontFamily: 'Roboto Slab',
            marginBottom: '10px',
          }}
        >
          {lastUpdated.toISOString().split('T')[0]}
        </p>
        <div
          className="postgap"
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: '45px',
          }}
        >
          <div className="left_post">
            <h3
              className="post_heading"
              style={{ margin: '8px 0', marginTop: '-2px', fontSize: '22px' }}
            >
              <div
                onClick={() => handleClick(id, category)}
                style={{
                  cursor: 'pointer',
                  fontFamily: 'Poppins',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                {title}
              </div>
            </h3>
            <div
              className="resp_summary"
              onClick={() => handleClick(id, category)}
              style={{
                cursor: 'pointer',
                fontSize: '15.25px',
                marginTop: '10px',
                letterSpacing: '0.2px',
                lineHeight: '25px',
                fontFamily: 'Roboto Slab',
                color: 'rgb(80 80 80)',
                textDecoration: 'none',
              }}
            >
              {bodyText.slice(0, 190) + '...'}
            </div>
          </div>
          <div onClick={() => handleClick(id, category)}
            style={{
              cursor: 'pointer'
            }}
            className="image">
            {image && (
              <img
                className="post_image"
                style={{ width: '112px', height: '112px', objectFit: 'cover' }}
                src={image}
                alt=""
              />
            )}
          </div>
        </div>
      </div>
    );
  }
);

PostListItem.propTypes = {
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
  isPublic: PropTypes.bool,
  created: PropTypes.instanceOf(Date),
  lastUpdated: PropTypes.instanceOf(Date).isRequired,
  category: PropTypes.string.isRequired,
  image: PropTypes.string,
  language: PropTypes.string.isRequired,
  handleClick: PropTypes.func.isRequired,
};

PostListItem.displayName = 'PostListItem';

export default PostListItem;