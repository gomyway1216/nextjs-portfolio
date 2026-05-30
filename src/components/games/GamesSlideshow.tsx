'use client';

import React, { useCallback, useEffect } from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Swords,
  Puzzle,
  Rocket,
  CreditCard,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { games } from '@/components/game/constants/games';
import {
  GameLanguageProvider,
  LanguageSelector,
} from '@/components/game/contexts/GameLanguageContext';
import './games-carousel.scss';

function GamesSlideshowContent() {
  const { t } = useTranslation();

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
  });

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  useEffect(() => {
    if (emblaApi) {
      const interval = setInterval(() => {
        emblaApi.scrollNext();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [emblaApi]);

  const getDifficultyClass = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'px-btn-theme';
      case 'Medium':
        return 'px-btn-theme2';
      case 'Hard':
        return 'px-btn-theme3';
      default:
        return 'px-btn-theme';
    }
  };

  const getDifficultyKey = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'games.difficulty.easy';
      case 'Medium':
        return 'games.difficulty.medium';
      case 'Hard':
        return 'games.difficulty.hard';
      default:
        return 'games.difficulty.easy';
    }
  };

  const getCategoryKey = (category: string) => {
    switch (category) {
      case 'Arcade':
        return 'games.category.arcade';
      case 'Strategy':
        return 'games.category.strategy';
      case 'Puzzle':
        return 'games.category.puzzle';
      case 'RPG':
        return 'games.category.rpg';
      case 'Card':
        return 'games.category.card';
      default:
        return 'games.category.arcade';
    }
  };

  const getGameIcon = (category: string) => {
    switch (category) {
      case 'Strategy':
        return <Swords size={56} strokeWidth={1.8} />;
      case 'Puzzle':
        return <Puzzle size={56} strokeWidth={1.8} />;
      case 'RPG':
        return <Rocket size={56} strokeWidth={1.8} />;
      case 'Card':
        return <CreditCard size={56} strokeWidth={1.8} />;
      default:
        return <Gamepad2 size={56} strokeWidth={1.8} />;
    }
  };

  return (
    <>
      {/* Language Selector */}
      <div className="games-language-selector" style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '1rem'
      }}>
        <LanguageSelector />
      </div>

      <div className="games-carousel">
        <div className="games-carousel__viewport" ref={emblaRef}>
          <div className="games-carousel__container">
            {games.map((game) => {
              const gameKey = game.id;
              const title = t(`games.${gameKey}.title`);
              const description = t(`games.${gameKey}.description`);
              const difficultyLabel = t(getDifficultyKey(game.difficulty));
              const categoryLabel = t(getCategoryKey(game.category));

              return (
                <div
                  key={game.id}
                  className="games-carousel__slide"
                  data-aos="fade-right"

                >
                  <Link
                    className="game-card-wrapper"
                    href={game.path}
                  >
                    <div className="blog-grid modern-card">
                      <div className="blog-img">
                        <div className="game-thumbnail">{getGameIcon(game.category)}</div>
                        <div className="game-overlay">
                          <Gamepad2 size={40} strokeWidth={2} />
                          <p>{t('games.clickToPlay')}</p>
                        </div>
                      </div>
                      <div className="blog-info">
                        <div className="game-header">
                          <h6>
                            <span>{title}</span>
                          </h6>
                          <span className={`px-btn px-btn-sm difficulty-badge ${getDifficultyClass(game.difficulty)}`}>
                            {difficultyLabel}
                          </span>
                        </div>
                        <div className="meta game-description">{description}</div>
                        <div className="meta game-category">{categoryLabel}</div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="games-carousel__button games-carousel__button--prev"
          onClick={scrollPrev}
          type="button"
          aria-label="Previous slide"
        >
          <ChevronLeft size={24} />
        </button>

        <button
          className="games-carousel__button games-carousel__button--next"
          onClick={scrollNext}
          type="button"
          aria-label="Next slide"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="games-view-all">
        <Link
          className="px-btn px-btn-theme games-view-all__link"
          href="/games"
        >
          <span>
            {t('games.viewAllGames')}
            <ChevronRight size={20} />
          </span>
        </Link>
      </div>
    </>
  );
}

const GamesSlideshow = () => {
  return (
    <GameLanguageProvider>
      <GamesSlideshowContent />
    </GameLanguageProvider>
  );
};

export default GamesSlideshow;
