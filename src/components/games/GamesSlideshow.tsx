'use client';

import React, { useCallback, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Gamepad2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import './games-carousel.scss';

interface Game {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  path: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
}

const games: Game[] = [
  {
    id: 'jump-game',
    title: 'Jump Game',
    description: 'A classic jump-and-dodge arcade game. Press any key to jump over obstacles and rack up points!',
    thumbnail: '🎮',
    path: '/games/jump-game',
    difficulty: 'Easy',
    category: 'Arcade',
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    description: 'Challenge the AI in this classic strategy game! Choose from Easy, Medium, or Hard difficulty.',
    thumbnail: '⭕',
    path: '/games/tic-tac-toe',
    difficulty: 'Medium',
    category: 'Strategy',
  },
  {
    id: 'gomoku',
    title: 'Gomoku',
    description: 'Five in a Row! Strategic board game with AI using minimax and alpha-beta pruning.',
    thumbnail: '⚫',
    path: '/games/gomoku',
    difficulty: 'Hard',
    category: 'Strategy',
  },
  {
    id: 'tetris',
    title: 'Tetris',
    description: 'Classic block-stacking puzzle game. Clear lines by completing horizontal rows.',
    thumbnail: '🟦',
    path: '/games/tetris',
    difficulty: 'Medium',
    category: 'Puzzle',
  },
];

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
