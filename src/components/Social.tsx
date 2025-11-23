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


const Social = () => {
  return (
    <div className="nav social-icons justify-content-center">
      {SocialShare.map((val, i) => (
        <a key={i} href={`${val.link}`} rel="noreferrer" target="_blank">
          {val.Social}
        </a>
      ))}
    </div>
  );
};

export default Social;
