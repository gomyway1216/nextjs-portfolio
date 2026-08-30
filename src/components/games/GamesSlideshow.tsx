'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getGameCoverPath } from '@/components/game/constants/games';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getHomeGamesByIds } from '@/lib/homeGames';
import './games-carousel.scss';

interface GamesSlideshowProps {
  gameIds?: string[];
}

function GamesSlideshowContent({ gameIds }: GamesSlideshowProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const slideshowGames = useMemo(() => getHomeGamesByIds(gameIds), [gameIds]);

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
    if (!emblaApi || prefersReducedMotion) return;

    // Auto-advance only while the carousel is actually on screen — the
    // interval otherwise keeps triggering slide layout work while the
    // user scrolls elsewhere on the page.
    let interval: ReturnType<typeof setInterval> | null = null;

    const advance = () => {
      // loop is false, so wrap back to the first slide manually instead
      // of letting scrollNext() no-op forever at the end.
      if (emblaApi.canScrollNext()) {
        emblaApi.scrollNext();
      } else {
        emblaApi.scrollTo(0);
      }
    };

    const start = () => {
      if (!interval) {
        interval = setInterval(advance, 5000);
      }
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    // JSDOM and very old browsers lack IntersectionObserver — fall back
    // to the previous always-on behavior rather than crashing.
    if (typeof IntersectionObserver === 'undefined') {
      start();
      return stop;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        start();
      } else {
        stop();
      }
    });

    observer.observe(emblaApi.rootNode());

    return () => {
      observer.disconnect();
      stop();
    };
  }, [emblaApi, prefersReducedMotion]);

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

  return (
    <>
      <div className="games-carousel">
        <div className="games-carousel__viewport" ref={emblaRef}>
          <div className="games-carousel__container">
            {slideshowGames.map((game, index) => {
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
                        <Image
                          className="game-cover"
                          src={getGameCoverPath(game.id)}
                          alt=""
                          fill
                          loading={index < 3 ? 'eager' : 'lazy'}
                          sizes="(max-width: 640px) calc(100vw - 132px), (max-width: 1024px) 42vw, 29vw"
                        />
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

const GamesSlideshow = GamesSlideshowContent;

export default GamesSlideshow;
