'use client';
import React, { useState } from 'react';
import Scrollspy from 'react-scrollspy';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tooltip } from 'react-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/providers/AuthProvider';

const Header = () => {
  const [click, setClick] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const handleClick = () => setClick(!click);
  const toggleDropdown = () => setShowDropdown(!showDropdown);
  const router = useRouter();
  const { currentUser, signOut } = useAuth();

  const handleSignOut = () => {
    signOut();
  };

  return (
    <>
      {/* Header */}
      <div className="mob-header">
        <button className="toggler-menu" onClick={handleClick}>
          <div className={click ? 'active' : ''}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </div>
      {/* End Header */}

      {/* nav bar */}
      <header className={click ? 'header-left menu-open' : 'header-left '}>
        <div className="scroll-bar">
          <div className="hl-top">
            <div className="hl-logo">
              <Link href="/">Y</Link>
            </div>
          </div>
          {/* End htl-top */}

          <Scrollspy
            className="nav nav-menu"
            items={['home', 'about', 'resume', 'work', 'games', 'tools', 'blog', 'contactus', 'admin']}
            currentClassName="active"
            offset={-30}
          >
            <li>
              <a
                className="nav-link "
                href="#home"
                data-tip
                data-for="HOME"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>🏠</span>
                <Tooltip
                  id="HOME"
                  place="right"
                  variant="dark"
                >
                  <span>Home</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#about"
                data-tip
                data-for="ABOUT"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>👨‍💼</span>
                <Tooltip
                  id="ABOUT"
                  place="right"
                  variant="dark"
                >
                  <span>About</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#resume"
                data-tip
                data-for="RESUME"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>📄</span>
                <Tooltip
                  id="RESUME"
                  place="right"
                  variant="dark"
                >
                  <span>Resume</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#work"
                data-tip
                data-for="WORK"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>💼</span>
                <Tooltip
                  id="WORK"
                  place="right"
                  variant="dark"
                >
                  <span>Work</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#games"
                data-tip
                data-for="GAMES"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>🎮</span>
                <Tooltip
                  id="GAMES"
                  place="right"
                  variant="dark"
                >
                  <span>Games</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#tools"
                data-tip
                data-for="TOOLS"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>🛠️</span>
                <Tooltip
                  id="TOOLS"
                  place="right"
                  variant="dark"
                >
                  <span>Tools</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#blog"
                data-tip
                data-for="BLOG"
                onClick={handleClick}
              >
                <span style={{ fontSize: '20px' }}>📝</span>
                <Tooltip
                  id="BLOG"
                  place="right"
                  variant="dark"
                >
                  <span>Blog</span>
                </Tooltip>
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="/hobbies"
                data-tip
                data-for="HOBBIES"
                onClick={(e) => {
                  e.preventDefault();
                  handleClick();
                  router.push('/hobbies');
                }}
              >
                <span style={{ fontSize: '20px' }}>❤️</span>
                <Tooltip
                  id="HOBBIES"
                  place="right"
                  variant="dark"
                >
                  <span>Hobbies</span>
                </Tooltip>
              </a>
            </li>
            {/* <li>
              <a
                className="nav-link"
                href="#contactus"
                data-tip
                data-for="CONTACT"
                onClick={handleClick}
              >
                <FiPhoneOutgoing />
                <Tooltip
                  id="CONTACT"
                  place="right"
                  variant="dark"
                >
                  <span>Contact</span>
                </Tooltip>
              </a>
            </li> */}
            {currentUser && (
              <li>
                <a
                  className="nav-link"
                  href="/study"
                  data-tip
                  data-for="STUDY"
                  onClick={(e) => {
                    e.preventDefault();
                    handleClick();
                    router.push('/study');
                  }}
                >
                  <span style={{ fontSize: '20px' }}>📚</span>
                  <Tooltip
                    id="STUDY"
                    place="right"
                    variant="dark"
                  >
                    <span>Study</span>
                  </Tooltip>
                </a>
              </li>
            )}
            {currentUser && (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <a
                      className="nav-link"
                      data-tip
                      data-for="ADMIN"
                    >
                      <span style={{ fontSize: '20px' }}>⚙️</span>
                      <Tooltip
                        id="ADMIN"
                        place="right"
                        variant="dark"
                      >
                        <span>Admin</span>
                      </Tooltip>
                    </a>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                      Admin Page
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSignOut}>
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )}
          </Scrollspy>
        </div>
      </header>
      {/* End Header */}
    </>
  );
};

export default Header;
