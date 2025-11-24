'use client';

import React, { useCallback, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Gamepad2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { games } from '@/components/game/constants/games';
import './games-carousel.scss';

const GamesSlideshow = () => {
  const router = useRouter();
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'start',
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

  const handleGameClick = (path: string) => {
    router.push(path);
  };

  const handleViewAllClick = () => {
    router.push('/games');
  };

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

  return (
    <>
      <div className="games-carousel">
        <div className="games-carousel__viewport" ref={emblaRef}>
          <div className="games-carousel__container">
            {games.map((game) => (
              <div
                key={game.id}
                className="games-carousel__slide"
                data-aos="fade-right"
                data-aos-duration="1200"
              >
                <div className="game-card-wrapper" onClick={() => handleGameClick(game.path)}>
                  <div className="blog-grid">
                    <div className="blog-img">
                      <div className="game-thumbnail">{game.thumbnail}</div>
                      <div className="game-overlay">
                        <Gamepad2 size={40} strokeWidth={2} />
                        <p>Click to Play</p>
                      </div>
                    </div>
                    <div className="blog-info">
                      <div className="game-header">
                        <h6>
                          <a>{game.title}</a>
                        </h6>
                        <span className={`px-btn px-btn-sm difficulty-badge ${getDifficultyClass(game.difficulty)}`}>
                          {game.difficulty}
                        </span>
                      </div>
                      <div className="meta game-description">{game.description}</div>
                      <div className="meta game-category">{game.category}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="games-carousel__button games-carousel__button--prev px-btn px-btn-white"
          onClick={scrollPrev}
          type="button"
          aria-label="Previous slide"
        >
          <ChevronLeft size={24} />
        </button>

        <button
          className="games-carousel__button games-carousel__button--next px-btn px-btn-white"
          onClick={scrollNext}
          type="button"
          aria-label="Next slide"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="games-view-all">
        <button className="px-btn px-btn-theme" onClick={handleViewAllClick}>
          <span>
            View All Games
            <ChevronRight size={20} />
          </span>
        </button>
      </div>
    </>
  );
};

export default GamesSlideshow;
