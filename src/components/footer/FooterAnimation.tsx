import React from 'react';
import {
  FaFacebookF,
  FaLinkedinIn,
  FaGithub
} from 'react-icons/fa';
import { RiTwitterXLine } from 'react-icons/ri';

const SocialShare = [
  { Social: <FaFacebookF />, link: 'https://www.facebook.com/yaguchiyuudai/' },
  { Social: <FaLinkedinIn />, link: 'https://www.linkedin.com/in/yudai-yaguchi/' },
  { Social: <FaGithub />, link: 'https://github.com/gomyway1216/' },
  { Social: <RiTwitterXLine />, link: 'https://twitter.com/yudai_engineer/' },
];

const Footer = () => {
  return (
    <>
      <div className="row align-items-center">
        <div className="col-md-6 my-2">
          <div className="nav justify-content-center justify-content-md-start">
            {SocialShare.map((val, i) => (
              <a key={i} href={`${val.link}`} rel="noreferrer" target="_blank">
                {val.Social}
              </a>
            ))}
          </div>
          {/* End .nav */}
        </div>
        {/* End .col */}

        <div className="col-md-6 my-2 text-center text-md-end">
          <p>
            © {new Date().getFullYear()} copyright{' '}
            Yudai Yaguchi
            all right reserved
          </p>
        </div>
        {/* End .col */}
      </div>
      {/* End .row */}
    </>
  );
};

export default Footer;
