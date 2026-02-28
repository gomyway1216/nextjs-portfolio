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
import {
  House,
  UserRound,
  FileText,
  BriefcaseBusiness,
  Gamepad2,
  Wrench,
  NotebookPen,
  Palette,
  BookOpenText,
  Shield,
} from 'lucide-react';
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
              <Link
                href="/"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Home"
              >
                Y
              </Link>
            </div>
          </div>
          {/* End htl-top */}

          <Scrollspy
            className="nav nav-menu"
            items={['home', 'work', 'tools', 'games', 'blog', 'about', 'resume']}
            currentClassName="active"
            offset={-30}
          >
            <li>
              <a
                className="nav-link "
                href="#home"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Home"
                onClick={handleClick}
              >
                <House size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#work"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Work"
                onClick={handleClick}
              >
                <BriefcaseBusiness size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#tools"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Tools"
                onClick={handleClick}
              >
                <Wrench size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#games"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Games"
                onClick={handleClick}
              >
                <Gamepad2 size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#blog"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Blog"
                onClick={handleClick}
              >
                <NotebookPen size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#about"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="About"
                onClick={handleClick}
              >
                <UserRound size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="#resume"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Resume"
                onClick={handleClick}
              >
                <FileText size={20} />
              </a>
            </li>
            <li>
              <a
                className="nav-link"
                href="/hobbies"
                data-tooltip-id="left-menu-tooltip"
                data-tooltip-content="Hobbies"
                onClick={handleClick}
              >
                <Palette size={20} />
              </a>
            </li>
            {currentUser && (
              <li>
                <a
                  className="nav-link"
                  href="/study"
                  data-tooltip-id="left-menu-tooltip"
                  data-tooltip-content="Study"
                  onClick={(e) => {
                    e.preventDefault();
                    handleClick();
                    router.push('/study');
                  }}
                >
                  <BookOpenText size={20} />
                </a>
              </li>
            )}
            {currentUser && (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <a
                      className="nav-link"
                      data-tooltip-id="left-menu-tooltip"
                      data-tooltip-content="Admin"
                    >
                      <Shield size={20} />
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
          <Tooltip id="left-menu-tooltip" place="right" variant="dark" />
        </div>
      </header>
      {/* End Header */}
    </>
  );
};

export default Header;
