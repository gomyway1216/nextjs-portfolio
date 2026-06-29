'use client';

import { useGameToolbar } from '@/contexts/GameToolbarContext';
import { useHighScore } from '@/hooks/useHighScore';
import { Info,Trophy,Volume2,VolumeX,Zap } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { getJumpGameUITranslation,getUITranslation } from '../constants/gameTranslations';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { InfoModal } from '../common/InfoModal';
import styles from './JumpGame.module.css';
enum Scene {
  GameMain = 'GameMain',
  GameOver = 'GameOver',
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface Enemy {
  x: number;
  y: number;
  r: number;
  speed: number;
  type: 'ground' | 'mid' | 'high';
}

interface Powerup {
  x: number;
  y: number;
  r: number;
  type: 'shield' | 'slow' | 'heart';
}

interface GameState {
  characterPosX: number;
  characterPosY: number;
  characterR: number;
  speed: number;
  acceleration: number;
  enemies: Enemy[];
  powerups: Powerup[];
  baseSpeed: number;
  score: number;
  scene: Scene;
  frameCount: number;
  bound: boolean;
  stage: number;
  difficulty: Difficulty;
  combo: number;
  hasShield: boolean;
  shieldTimer: number;
  slowMoTimer: number;
  lives: number;
  maxLives: number;
  lastHeartSpawn: number;
  invincibilityTimer: number;
}

const infoCardStyles = [
  { icon: '⌨️', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)', border: 'rgba(14, 165, 233, 0.3)' },
  { icon: '🎯', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' },
  { icon: '⭐', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)' },
  { icon: '⚡', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)' },
  { icon: '❤️', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' },
  { icon: '💕', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' },
  { icon: '🛡️', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)' },
  { icon: '💎', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)' },
  { icon: '🔥', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)' },
] as const;

const JumpGame = () => {
  useFeatureLifecycle('game.jump-game');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setContent } = useGameToolbar();
  const { language } = useGameLanguage();
  const ui = getUITranslation(language);
  const jumpCopy = getJumpGameUITranslation(language);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [highScore, updateHighScore] = useHighScore('jumpgame');
  const [showInfo, setShowInfo] = useState(false);
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [currentStage, setCurrentStage] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const jumpCopyRef = useRef(jumpCopy);
  const gameStateRef = useRef<GameState | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const keyDownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Keep isMutedRef in sync with isMuted state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    jumpCopyRef.current = jumpCopy;
  }, [jumpCopy]);

  // Initialize audio context once
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const AudioContextConstructor =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) {
          throw new Error('Web Audio API not available');
        }
        audioContextRef.current = new AudioContextConstructor();
      } catch (_e) {
        console.warn('Web Audio API not available');
      }
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Web Audio API for better sound effects
  const createSound = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (isMutedRef.current || !audioContextRef.current || typeof window === 'undefined') return;
    try {
      const audioContext = audioContextRef.current;

      // Resume audio context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_e) {
      // Silently fail if audio context not available
    }
  };

  const playJumpSound = () => {
    createSound(400, 0.1, 'square');
    setTimeout(() => createSound(600, 0.1, 'square'), 50);
  };

  const playScoreSound = () => {
    createSound(800, 0.08, 'sine');
    setTimeout(() => createSound(1000, 0.08, 'sine'), 40);
    setTimeout(() => createSound(1200, 0.12, 'sine'), 80);
  };

  const playCollisionSound = () => {
    createSound(100, 0.3, 'sawtooth');
  };

  const playStageCompleteSound = () => {
    createSound(600, 0.1, 'sine');
    setTimeout(() => createSound(700, 0.1, 'sine'), 70);
    setTimeout(() => createSound(800, 0.1, 'sine'), 140);
    setTimeout(() => createSound(1000, 0.15, 'sine'), 210);
  };

  const playPowerupSound = () => {
    createSound(1000, 0.08, 'sine');
    setTimeout(() => createSound(1200, 0.08, 'sine'), 40);
    setTimeout(() => createSound(1400, 0.08, 'sine'), 80);
    setTimeout(() => createSound(1600, 0.12, 'sine'), 120);
  };

  const playHealSound = () => {
    createSound(800, 0.1, 'sine');
    setTimeout(() => createSound(1000, 0.1, 'sine'), 60);
    setTimeout(() => createSound(1200, 0.15, 'sine'), 120);
  };

  const getDifficultyMultiplier = (difficulty: Difficulty): number => {
    switch (difficulty) {
      case 'easy':
        return 0.7; // Slower obstacles for easier gameplay
      case 'medium':
        return 1.0;
      case 'hard':
        return 1.5;
      default:
        return 1.0;
    }
  };

  const createEnemy = (baseSpeed: number, stage: number, difficulty: Difficulty, existingEnemies?: Enemy[]): Enemy => {
    let types: ('ground' | 'mid' | 'high')[] = ['ground', 'mid', 'high'];

    // Easy mode: only ground obstacles for stage 1
    if (difficulty === 'easy' && stage === 1) {
      types = ['ground'];
    } else if (difficulty === 'easy' && stage < 5) {
      // Easy mode stages 2-4: mostly ground with some mid
      types = ['ground', 'ground', 'ground', 'mid'];
    }

    // Get heights of ALL existing enemies to prevent any duplicates at same height
    const occupiedHeights = new Set<number>();
    if (existingEnemies && existingEnemies.length > 0) {
      existingEnemies.forEach(enemy => {
        occupiedHeights.add(enemy.y);
      });
    }

    // Map types to heights
    const heightMap: Record<'ground' | 'mid' | 'high', number> = {
      ground: 400,
      mid: 320,
      high: 240,
    };

    // Filter out types that are already occupied
    let availableTypes = types.filter(type => !occupiedHeights.has(heightMap[type]));

    // If all heights are occupied, try to use ANY available height (not restricted by difficulty)
    if (availableTypes.length === 0) {
      console.warn('All restricted heights occupied! Trying any height...');
      // Try all possible heights
      const allTypes: ('ground' | 'mid' | 'high')[] = ['ground', 'mid', 'high'];
      availableTypes = allTypes.filter(type => !occupiedHeights.has(heightMap[type]));

      // If still no available heights, something is wrong - use ground as fallback
      if (availableTypes.length === 0) {
        console.error('ALL heights occupied! Using ground as fallback.');
        availableTypes = ['ground'];
      }
    }

    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)] as 'ground' | 'mid' | 'high';

    // Speed variation based on difficulty
    let speedVariation: number;
    if (difficulty === 'easy') {
      // Easy mode: minimal speed variation (±5%)
      speedVariation = baseSpeed * (0.95 + Math.random() * 0.1);
    } else if (difficulty === 'medium') {
      // Medium mode: moderate variation (±15%)
      speedVariation = baseSpeed * (0.85 + Math.random() * 0.3);
    } else {
      // Hard mode: high variation (±30%)
      speedVariation = baseSpeed * (0.7 + Math.random() * 0.6);
    }

    const speed = speedVariation + (stage - 1) * 0.3; // Reduced stage speed increase

    const y = heightMap[type];

    // Calculate spawn position with minimum distance from other enemies
    let spawnX = 600;
    const minDistance = 250; // Minimum horizontal distance between enemies

    // Find a spawn position that's far enough from all existing enemies
    if (existingEnemies && existingEnemies.length > 0) {
      let attemptCount = 0;
      let validPosition = false;

      while (!validPosition && attemptCount < 10) {
        spawnX = 600 + Math.random() * 300; // Wider spawn range
        validPosition = true;

        // Check distance from all existing enemies
        for (const enemy of existingEnemies) {
          const distance = Math.abs(spawnX - enemy.x);
          if (distance < minDistance) {
            validPosition = false;
            break;
          }
        }
        attemptCount++;
      }

      // If we couldn't find a good position, use far right
      if (!validPosition) {
        spawnX = 900;
      }
    }

    return {
      x: spawnX,
      y: y,
      r: 16,
      speed: speed,
      type: type,
    };
  };

  const initGame = (difficulty: Difficulty = selectedDifficulty): GameState => {
    const multiplier = getDifficultyMultiplier(difficulty);
    const baseSpeed = 5 * multiplier;

    // Start with fewer enemies to ensure no height conflicts
    // Easy mode: only 1 enemy initially since we restrict heights
    const firstEnemy = createEnemy(baseSpeed, 1, difficulty, []);
    const enemies: Enemy[] = [firstEnemy];

    // Only add second enemy if NOT easy mode (to avoid duplicate heights)
    if (difficulty !== 'easy') {
      const secondEnemy = createEnemy(baseSpeed, 1, difficulty, [firstEnemy]);
      secondEnemy.x = 900; // Space them out
      enemies.push(secondEnemy);
    }

    return {
      characterPosX: 100,
      characterPosY: 400,
      characterR: 16,
      speed: 0,
      acceleration: 0,
      enemies: enemies,
      powerups: [],
      baseSpeed: baseSpeed,
      score: 0,
      scene: Scene.GameMain,
      frameCount: 0,
      bound: false,
      stage: 1,
      difficulty: difficulty,
      combo: 0,
      hasShield: false,
      shieldTimer: 0,
      slowMoTimer: 0,
      lives: 3,
      maxLives: 3,
      lastHeartSpawn: 0,
      invincibilityTimer: 0,
    };
  };

  const triggerJumpAction = () => {
    const state = gameStateRef.current;
    if (!state) return;

    if (state.scene === Scene.GameMain) {
      if (state.speed === 0) {
        // Slightly higher jump with longer float time
        state.speed = -17;
        state.acceleration = 0.9;
        playJumpSound();
      }
    } else if (state.scene === Scene.GameOver) {
      if (state.frameCount > 60) {
        gameStateRef.current = initGame(state.difficulty);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Prevent default behavior (especially for spacebar scrolling)
    e.preventDefault();
    e.stopPropagation();
    triggerJumpAction();
  };

  const update = (state: GameState) => {
    if (state.scene === Scene.GameMain) {
      // Update character
      state.speed += state.acceleration;
      state.characterPosY += state.speed;
      if (state.characterPosY > 400) {
        state.characterPosY = 400;
        state.speed = 0;
        state.acceleration = 0;
      }

      // Update timers
      if (state.shieldTimer > 0) {
        state.shieldTimer--;
        if (state.shieldTimer === 0) {
          state.hasShield = false;
        }
      }
      if (state.slowMoTimer > 0) state.slowMoTimer--;
      if (state.invincibilityTimer > 0) state.invincibilityTimer--;

      // Spawn heart every 30 seconds (1800 frames at 60fps)
      if (state.frameCount - state.lastHeartSpawn > 1800 && state.powerups.filter(p => p.type === 'heart').length === 0) {
        state.powerups.push({
          x: 600,
          y: 400, // On the ground
          r: 12,
          type: 'heart',
        });
        state.lastHeartSpawn = state.frameCount;
      }

      // Slow-mo multiplier
      const slowMoMultiplier = state.slowMoTimer > 0 ? 0.5 : 1.0;

      // Update enemies
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const enemy = state.enemies[i];
        enemy.x -= enemy.speed * slowMoMultiplier;

        // If enemy passed the screen, remove it and add score
        if (enemy.x < -100) {
          state.enemies.splice(i, 1);
          state.score += 100;
          state.combo++;

          // Play score sound
          playScoreSound();

          // Spawn new enemy at a different height than existing ones
          state.enemies.push(createEnemy(state.baseSpeed, state.stage, state.difficulty, state.enemies));

          // Spawn powerup randomly (10% chance, but not hearts)
          if (Math.random() < 0.1 && state.powerups.filter(p => p.type !== 'heart').length < 2) {
            const powerupType: 'shield' | 'slow' = Math.random() < 0.5 ? 'shield' : 'slow';
            state.powerups.push({
              x: 600,
              y: 350 - Math.random() * 150,
              r: 12,
              type: powerupType,
            });
          }

          // Progressive difficulty: increase speed every 500 points
          if (state.score % 500 === 0 && state.score > 0) {
            state.stage += 1;
            setCurrentStage(state.stage);
            playStageCompleteSound();

            // Add more enemies at higher stages (max 3 since we have 3 heights)
            if (state.stage % 3 === 0 && state.enemies.length < 3) {
              state.enemies.push(createEnemy(state.baseSpeed, state.stage, state.difficulty, state.enemies));
            }
          }

          // Update high score
          updateHighScore(state.score);
        }
      }

      // Update powerups
      for (let i = state.powerups.length - 1; i >= 0; i--) {
        const powerup = state.powerups[i];
        powerup.x -= state.baseSpeed * slowMoMultiplier;

        // Remove if off screen
        if (powerup.x < -50) {
          state.powerups.splice(i, 1);
          continue;
        }

        // Check collision with character
        const diffX = state.characterPosX - powerup.x;
        const diffY = state.characterPosY - powerup.y;
        const distance = Math.sqrt(diffX * diffX + diffY * diffY);
        if (distance < state.characterR + powerup.r) {
          if (powerup.type === 'shield') {
            playPowerupSound();
            state.hasShield = true;
            state.shieldTimer = 300; // 5 seconds at 60fps
            state.powerups.splice(i, 1);
          } else if (powerup.type === 'slow') {
            playPowerupSound();
            state.slowMoTimer = 180; // 3 seconds at 60fps
            state.powerups.splice(i, 1);
          } else if (powerup.type === 'heart') {
            if (state.lives < state.maxLives) {
              playHealSound();
              state.lives++;
              state.powerups.splice(i, 1);
            }
          }
        }
      }

      // Collision detection with enemies (only if not invincible)
      // Make sure invincibilityTimer is never negative or invalid
      if (state.invincibilityTimer < 0 || !Number.isFinite(state.invincibilityTimer)) {
        state.invincibilityTimer = 0;
      }

      if (state.invincibilityTimer === 0) {
        for (const enemy of state.enemies) {
          const diffX = state.characterPosX - enemy.x;
          const diffY = state.characterPosY - enemy.y;
          const distance = Math.sqrt(diffX * diffX + diffY * diffY);

          if (distance < state.characterR + enemy.r) {

            if (state.hasShield) {
              // Shield protects once, then breaks
              console.log('Shield broke! Lives:', state.lives);
              state.hasShield = false;
              state.shieldTimer = 0;
              playPowerupSound(); // Break sound
              // Give brief invincibility after shield breaks
              state.invincibilityTimer = 60; // 1 second
            } else {
              // Lose a life
              console.log('Hit! Lives before:', state.lives);
              state.lives--;
              console.log('Lives after:', state.lives);
              state.combo = 0; // Reset combo on hit
              playCollisionSound();

              if (state.lives <= 0) {
                // Game over
                console.log('Game Over!');
                state.scene = Scene.GameOver;
                state.frameCount = 0;
              } else {
                // Temporary invincibility after getting hit
                console.log('Setting invincibility to 120 frames');
                state.invincibilityTimer = 120; // 2 seconds of invincibility
              }
            }
            break; // Only process one collision per frame
          }
        }
      }
    } else if (state.scene === Scene.GameOver) {
      // Game over - enemies keep moving
      for (const enemy of state.enemies) {
        enemy.x -= enemy.speed;
      }
    }

    state.frameCount++;
  };

  const draw = (
    ctx: CanvasRenderingContext2D,
    state: GameState
  ) => {
    const copy = jumpCopyRef.current;

    ctx.imageSmoothingEnabled = false;

    if (state.scene === Scene.GameMain) {
      // Background (add slow-mo tint)
      if (state.slowMoTimer > 0) {
        ctx.fillStyle = 'rgb(0, 10, 30)'; // Blue tint for slow-mo
      } else {
        ctx.fillStyle = 'rgb(0,0,0)';
      }
      ctx.fillRect(0, 0, 480, 480);

      // Draw ground line
      ctx.strokeStyle = 'rgb(100,100,100)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 420);
      ctx.lineTo(480, 420);
      ctx.stroke();

      // Draw powerups
      for (const powerup of state.powerups) {
        ctx.save();
        ctx.translate(powerup.x, powerup.y);
        ctx.rotate((state.frameCount * Math.PI * 2) / 60); // Rotate

        if (powerup.type === 'shield') {
          // Shield powerup (green hexagon)
          ctx.fillStyle = '#22c55e';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i) / 6;
            const x = Math.cos(angle) * powerup.r;
            const y = Math.sin(angle) * powerup.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (powerup.type === 'slow') {
          // Slow powerup (purple diamond)
          ctx.fillStyle = '#a855f7';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -powerup.r);
          ctx.lineTo(powerup.r, 0);
          ctx.lineTo(0, powerup.r);
          ctx.lineTo(-powerup.r, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (powerup.type === 'heart') {
          // Heart powerup (red heart)
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          const r = powerup.r;

          // Draw heart shape
          ctx.beginPath();
          ctx.moveTo(0, r / 4);
          // Left curve
          ctx.bezierCurveTo(-r, -r / 2, -r * 1.5, r / 2, 0, r * 1.5);
          // Right curve
          ctx.bezierCurveTo(r * 1.5, r / 2, r, -r / 2, 0, r / 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
      }

      // Draw enemies
      for (const enemy of state.enemies) {
        ctx.fillStyle = '#ef4444'; // Red color
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        const enemySize = enemy.r * 2;
        ctx.fillRect(
          enemy.x - enemy.r,
          enemy.y - enemy.r,
          enemySize,
          enemySize
        );
        ctx.strokeRect(
          enemy.x - enemy.r,
          enemy.y - enemy.r,
          enemySize,
          enemySize
        );

        // Draw enemy type indicator
        if (enemy.type === 'high') {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(enemy.x - 2, enemy.y - 2, 4, 4);
        }
      }

      // Draw character (blue circle with white outline)
      // Flash when invincible (but not from shield)
      const isFlashing = state.invincibilityTimer > 0 && !state.hasShield;
      const showCharacter = !isFlashing || (state.frameCount % 10 < 5);

      if (showCharacter) {
        ctx.fillStyle = '#0ea5e9'; // Sky blue color
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(state.characterPosX, state.characterPosY, state.characterR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Draw shield if active
      if (state.hasShield) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(state.characterPosX, state.characterPosY, state.characterR + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw score
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.font = 'bold 16pt Arial';
      const scoreLabel = `${copy.score.toUpperCase()}: ${state.score}`;
      const scoreLabelWidth = ctx.measureText(scoreLabel).width;
      ctx.fillText(scoreLabel, 460 - scoreLabelWidth, 40);

      // Draw lives (hearts)
      for (let i = 0; i < state.lives; i++) {
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        const heartX = 460 - (i * 25);
        const heartY = 60;
        const heartSize = 8;

        ctx.save();
        ctx.translate(heartX, heartY);
        ctx.beginPath();
        ctx.moveTo(0, heartSize / 4);
        ctx.bezierCurveTo(-heartSize, -heartSize / 2, -heartSize * 1.5, heartSize / 2, 0, heartSize * 1.5);
        ctx.bezierCurveTo(heartSize * 1.5, heartSize / 2, heartSize, -heartSize / 2, 0, heartSize / 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Draw combo
      if (state.combo > 1) {
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 12pt Arial';
        ctx.fillText(`${copy.combo.toUpperCase()} x${state.combo}`, 20, 460);
      }

      // Draw stage indicator
      if (state.stage > 1) {
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 14pt Arial';
        ctx.fillText(`${copy.stage.toUpperCase()} ${state.stage}`, 20, 40);
      }

      // Draw active effects
      let effectY = 70;
      if (state.slowMoTimer > 0) {
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 10pt Arial';
        ctx.fillText(`${copy.slowMo.toUpperCase()}: ${Math.ceil(state.slowMoTimer / 60)}s`, 20, effectY);
        effectY += 20;
      }
      if (state.shieldTimer > 0) {
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 10pt Arial';
        ctx.fillText(`${copy.shield.toUpperCase()}: ${Math.ceil(state.shieldTimer / 60)}s`, 20, effectY);
        effectY += 20;
      }
      // Debug: Show invincibility status
      if (state.invincibilityTimer > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 10pt Arial';
        ctx.fillText(`${copy.invincible.toUpperCase()}: ${Math.ceil(state.invincibilityTimer / 60)}s`, 20, effectY);
      }
    } else if (state.scene === Scene.GameOver) {
      // Background with fade
      const fadeAlpha = Math.min(state.frameCount / 60, 0.7);
      ctx.fillStyle = 'rgb(0,0,0)';
      ctx.fillRect(0, 0, 480, 480);
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
      ctx.fillRect(0, 0, 480, 480);

      // Draw ground line
      ctx.strokeStyle = 'rgb(100,100,100)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 420);
      ctx.lineTo(480, 420);
      ctx.stroke();

      // Draw particle explosion effect
      if (state.frameCount < 60) {
        const particleCount = 20;
        for (let i = 0; i < particleCount; i++) {
          const angle = (Math.PI * 2 * i) / particleCount;
          const speed = state.frameCount * 3;
          const x = state.characterPosX + Math.cos(angle) * speed;
          const y = state.characterPosY + Math.sin(angle) * speed;
          const alpha = 1 - state.frameCount / 60;
          const size = 6 - (state.frameCount / 60) * 4;

          ctx.fillStyle = `rgba(14, 165, 233, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw enemies (faded)
      for (const enemy of state.enemies) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        const enemySize = enemy.r * 2;
        ctx.fillRect(
          enemy.x - enemy.r,
          enemy.y - enemy.r,
          enemySize,
          enemySize
        );
        ctx.strokeRect(
          enemy.x - enemy.r,
          enemy.y - enemy.r,
          enemySize,
          enemySize
        );
        ctx.globalAlpha = 1.0;
      }

      // Draw score
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.font = 'bold 16pt Arial';
      const scoreLabel = `${copy.score.toUpperCase()}: ${state.score}`;
      const scoreLabelWidth = ctx.measureText(scoreLabel).width;
      ctx.fillText(scoreLabel, 460 - scoreLabelWidth, 40);

      // Draw game over text with fade-in and scale
      if (state.frameCount > 30) {
        const textAlpha = Math.min((state.frameCount - 30) / 30, 1);
        const textScale = 0.5 + (Math.min((state.frameCount - 30) / 30, 1) * 0.5);

        ctx.save();
        ctx.translate(240, 200);
        ctx.scale(textScale, textScale);
        ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
        ctx.font = 'bold 48pt Arial';
        const gameOverLabel = copy.gameOver.toUpperCase();
        const gameOverWidth = ctx.measureText(gameOverLabel).width;
        ctx.fillText(gameOverLabel, -gameOverWidth / 2, 0);
        ctx.restore();

        // Draw final score
        if (state.frameCount > 45) {
          ctx.fillStyle = `rgba(14, 165, 233, ${Math.min((state.frameCount - 45) / 30, 1)})`;
          ctx.font = 'bold 24pt Arial';
          const finalScoreLabel = `${copy.finalScore}: ${state.score}`;
          const finalScoreWidth = ctx.measureText(finalScoreLabel).width;
          ctx.fillText(finalScoreLabel, 240 - finalScoreWidth / 2, 260);
        }
      }

      // Draw restart prompt
      if (state.frameCount > 60) {
        const blinkAlpha = Math.sin(state.frameCount * 0.1) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(14, 165, 233, ${blinkAlpha})`;
        ctx.font = 'bold 16pt Arial';
        const restartLabel = copy.restartPrompt;
        const restartWidth = ctx.measureText(restartLabel).width;
        ctx.fillText(restartLabel, 240 - restartWidth / 2, 320);
      }
    }
  };

  const gameLoop = () => {
    if (!canvasRef.current || !gameStateRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const state = gameStateRef.current;

    update(state);
    draw(ctx, state);

    animationIdRef.current = requestAnimationFrame(gameLoop);
  };

  const startGame = () => {
    if (!canvasRef.current) return;

    // Blur any focused element (like the Start button) to prevent space from triggering it
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    gameStateRef.current = initGame(selectedDifficulty);
    setCurrentStage(1);
    setIsGameStarted(true);
    setShowDifficultySelect(false);

    if (keyDownHandlerRef.current) {
      document.removeEventListener('keydown', keyDownHandlerRef.current);
    }

    // Add keyboard event listener
    keyDownHandlerRef.current = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);

    // Start game loop
    gameLoop();
  };

  const stopGame = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    if (keyDownHandlerRef.current) {
      document.removeEventListener('keydown', keyDownHandlerRef.current);
      keyDownHandlerRef.current = null;
    }
    gameStateRef.current = null;
    setIsGameStarted(false);
    setShowDifficultySelect(true);
    setCurrentStage(1);
  };

  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      if (keyDownHandlerRef.current) {
        document.removeEventListener('keydown', keyDownHandlerRef.current);
        keyDownHandlerRef.current = null;
      }
      gameStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const toggleMute = () => {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      isMutedRef.current = newMutedState;
      if (!newMutedState && audioContextRef.current) {
        try {
          const audioContext = audioContextRef.current;
          if (audioContext.state === 'suspended') audioContext.resume();
        } catch {}
      }
    };
    setContent({
      center: (
        <div className={styles.toolbarStats}>
          {isGameStarted && currentStage > 1 && (
            <div className={`${styles.toolbarPill} ${styles.stagePill}`}>
              <Zap className={styles.toolbarIcon} />
              <div className={styles.toolbarPillText}>
                <div className={styles.toolbarLabel}>{jumpCopy.stage}</div>
                <div className={styles.toolbarValue}>{currentStage}</div>
              </div>
            </div>
          )}
          <div className={`${styles.toolbarPill} ${styles.scorePill}`}>
            <Trophy className={styles.toolbarIcon} />
            <div className={styles.toolbarPillText}>
              <div className={styles.toolbarLabel}>{jumpCopy.highScore}</div>
              <div className={styles.toolbarValue}>{highScore}</div>
            </div>
          </div>
        </div>
      ),
      right: (
        <>
          <button
            type="button"
            onClick={toggleMute}
            className={`${styles.toolbarButton} ${isMuted ? styles.mutedButton : ''}`}
          >
            {isMuted ? <VolumeX className={styles.toolbarButtonIcon} /> : <Volume2 className={styles.toolbarButtonIcon} />}
            <span className={styles.toolbarActionLabel}>{isMuted ? jumpCopy.muted : jumpCopy.sound}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className={styles.toolbarButton}
          >
            <Info className={styles.toolbarButtonIcon} />
            <span className={styles.toolbarActionLabel}>{ui.howToPlay}</span>
          </button>
        </>
      )
    });
    return () => setContent(null);
  }, [isGameStarted, currentStage, highScore, isMuted, showInfo, setContent, ui.howToPlay, jumpCopy]);

  return (
    <div className={styles.gameShell}>
      {/* Game Canvas */}
      <div className={styles.canvasFrame}>
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          onPointerDown={(e) => {
            e.preventDefault();
            triggerJumpAction();
          }}
          className={styles.gameCanvas}
        />

        {/* Difficulty Selection */}
        {!isGameStarted && showDifficultySelect && (
          <div className={styles.difficultyOverlay}>
            <h2 className={styles.difficultyTitle}>
              {jumpCopy.selectDifficulty}
            </h2>

            <div className={styles.difficultyOptions}>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => {
                const isSelected = selectedDifficulty === diff;

                return (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff)}
                    aria-pressed={isSelected}
                    className={styles.difficultyButton}
                    data-difficulty={diff}
                  >
                    <span className={styles.difficultyLabel}>{jumpCopy.difficulties[diff].label}</span>
                    <span className={styles.difficultyDescription}>
                      {jumpCopy.difficulties[diff].description}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={startGame}
              className={styles.startButton}
            >
              {jumpCopy.startGame}
            </button>
          </div>
        )}
      </div>

      {/* Stop Button */}
      {isGameStarted && (
        <div className={styles.stopButtonWrap}>
          <button
            type="button"
            onClick={stopGame}
            className={styles.stopButton}
          >
            {jumpCopy.stopGame}
          </button>
        </div>
      )}

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={ui.howToPlay}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {jumpCopy.infoSections.map((section, index) => {
            const style = infoCardStyles[index];

            return (
              <div
                key={section.title}
                style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: '0.5rem',
                  padding: '1rem'
                }}
              >
                <div style={{ color: style.color, fontSize: '2rem', marginBottom: '0.5rem' }}>{style.icon}</div>
                <h3 style={{ color: 'var(--games-route-fg)', fontWeight: '600', marginBottom: '0.25rem' }}>{section.title}</h3>
                <p style={{ color: 'var(--games-route-muted)', fontSize: '0.875rem' }}>
                  {section.description}
                </p>
              </div>
            );
          })}
        </div>

        <div style={{
          background: 'rgba(14, 165, 233, 0.1)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          borderRadius: '0.5rem',
          padding: '1rem'
        }}>
          <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>💡 {jumpCopy.proTipsTitle}</div>
          <ul style={{ color: 'var(--games-route-muted)', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
            {jumpCopy.proTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
};

export default JumpGame;
