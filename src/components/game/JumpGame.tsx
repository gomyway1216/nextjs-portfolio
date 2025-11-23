'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Info, X, Trophy, Zap, Volume2, VolumeX, Heart } from 'lucide-react';

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

const JumpGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [currentStage, setCurrentStage] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const gameStateRef = useRef<GameState | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Keep isMutedRef in sync with isMuted state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Initialize audio context once
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
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
    } catch (e) {
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!gameStateRef.current) return;

    // Prevent default behavior (especially for spacebar scrolling)
    e.preventDefault();
    e.stopPropagation();

    const state = gameStateRef.current;

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
          if (state.score > highScore) {
            setHighScore(state.score);
          }
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
      const scoreLabel = 'SCORE: ' + state.score;
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
        ctx.fillText(`COMBO x${state.combo}`, 20, 460);
      }

      // Draw stage indicator
      if (state.stage > 1) {
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 14pt Arial';
        ctx.fillText(`STAGE ${state.stage}`, 20, 40);
      }

      // Draw active effects
      let effectY = 70;
      if (state.slowMoTimer > 0) {
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 10pt Arial';
        ctx.fillText(`SLOW-MO: ${Math.ceil(state.slowMoTimer / 60)}s`, 20, effectY);
        effectY += 20;
      }
      if (state.shieldTimer > 0) {
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 10pt Arial';
        ctx.fillText(`SHIELD: ${Math.ceil(state.shieldTimer / 60)}s`, 20, effectY);
        effectY += 20;
      }
      // Debug: Show invincibility status
      if (state.invincibilityTimer > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 10pt Arial';
        ctx.fillText(`INVINCIBLE: ${Math.ceil(state.invincibilityTimer / 60)}s`, 20, effectY);
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
      const scoreLabel = 'SCORE: ' + state.score;
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
        const gameOverLabel = 'GAME OVER';
        const gameOverWidth = ctx.measureText(gameOverLabel).width;
        ctx.fillText(gameOverLabel, -gameOverWidth / 2, 0);
        ctx.restore();

        // Draw final score
        if (state.frameCount > 45) {
          ctx.fillStyle = `rgba(14, 165, 233, ${Math.min((state.frameCount - 45) / 30, 1)})`;
          ctx.font = 'bold 24pt Arial';
          const finalScoreLabel = `Final Score: ${state.score}`;
          const finalScoreWidth = ctx.measureText(finalScoreLabel).width;
          ctx.fillText(finalScoreLabel, 240 - finalScoreWidth / 2, 260);
        }
      }

      // Draw restart prompt
      if (state.frameCount > 60) {
        const blinkAlpha = Math.sin(state.frameCount * 0.1) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(14, 165, 233, ${blinkAlpha})`;
        ctx.font = 'bold 16pt Arial';
        const restartLabel = 'Press any key to restart';
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

    // Add keyboard event listener
    document.addEventListener('keydown', handleKeyDown);

    // Start game loop
    gameLoop();
  };

  const stopGame = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    document.removeEventListener('keydown', handleKeyDown);
    gameStateRef.current = null;
    setIsGameStarted(false);
    setShowDifficultySelect(true);
    setCurrentStage(1);
  };

  useEffect(() => {
    return () => {
      stopGame();
    };
  }, []);

  const getDifficultyColor = (diff: Difficulty) => {
    switch (diff) {
      case 'easy':
        return { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e', text: '#22c55e' };
      case 'medium':
        return { bg: 'rgba(234, 179, 8, 0.2)', border: '#eab308', text: '#eab308' };
      case 'hard':
        return { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#ef4444' };
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(14, 165, 233, 0.3)',
        zIndex: 10
      }}>
        <Link
          href="/games"
          style={{
            color: '#94a3b8',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#0ea5e9'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
        >
          ← Back to Games
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Stage indicator */}
          {isGameStarted && currentStage > 1 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem'
            }}>
              <Zap style={{ width: '1.25rem', height: '1.25rem', color: '#eab308' }} />
              <div>
                <div style={{ fontSize: '0.625rem', color: '#94a3b8', textTransform: 'uppercase' }}>Stage</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#eab308' }}>{currentStage}</div>
              </div>
            </div>
          )}

          {/* High score */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem'
          }}>
            <Trophy style={{ width: '1.25rem', height: '1.25rem', color: '#0ea5e9' }} />
            <div>
              <div style={{ fontSize: '0.625rem', color: '#94a3b8', textTransform: 'uppercase' }}>High Score</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0ea5e9' }}>{highScore}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => {
              const newMutedState = !isMuted;
              setIsMuted(newMutedState);
              isMutedRef.current = newMutedState; // Update ref immediately
              console.log('Mute toggled:', newMutedState ? 'MUTED' : 'UNMUTED');
              // Play a test sound when unmuting to confirm it's working
              if (!newMutedState && audioContextRef.current) {
                try {
                  const audioContext = audioContextRef.current;
                  if (audioContext.state === 'suspended') {
                    audioContext.resume();
                  }
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();
                  oscillator.connect(gainNode);
                  gainNode.connect(audioContext.destination);
                  oscillator.frequency.value = 800;
                  oscillator.type = 'sine';
                  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                  oscillator.start(audioContext.currentTime);
                  oscillator.stop(audioContext.currentTime + 0.1);
                } catch (e) {
                  console.log('Could not play test sound');
                }
              }
            }}
            style={{
              background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(14, 165, 233, 0.2)',
              border: `1px solid ${isMuted ? 'rgba(239, 68, 68, 0.5)' : 'rgba(14, 165, 233, 0.5)'}`,
              borderRadius: '0.5rem',
              color: isMuted ? '#ef4444' : '#0ea5e9',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isMuted ? 'rgba(239, 68, 68, 0.3)' : 'rgba(14, 165, 233, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(14, 165, 233, 0.2)';
            }}
          >
            {isMuted ? (
              <VolumeX style={{ width: '1rem', height: '1rem' }} />
            ) : (
              <Volume2 style={{ width: '1rem', height: '1rem' }} />
            )}
            {isMuted ? 'Muted' : 'Sound'}
          </button>

          <button
            onClick={() => setShowInfo(!showInfo)}
            style={{
              background: 'rgba(14, 165, 233, 0.2)',
              border: '1px solid rgba(14, 165, 233, 0.5)',
              borderRadius: '0.5rem',
              color: '#0ea5e9',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(14, 165, 233, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(14, 165, 233, 0.2)';
            }}
          >
            <Info style={{ width: '1rem', height: '1rem' }} />
            How to Play
          </button>
        </div>
      </div>

      {/* Game Canvas */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          style={{
            border: '3px solid #0ea5e9',
            borderRadius: '0.5rem',
            boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)',
            backgroundColor: '#000'
          }}
        />

        {/* Difficulty Selection */}
        {!isGameStarted && showDifficultySelect && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.95)',
            borderRadius: '0.5rem',
            padding: '2rem'
          }}>
            <h2 style={{
              color: '#fff',
              fontSize: '1.875rem',
              fontWeight: 'bold',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              Select Difficulty
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              width: '100%',
              maxWidth: '320px',
              marginBottom: '2rem'
            }}>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => {
                const colors = getDifficultyColor(diff);
                const isSelected = selectedDifficulty === diff;

                return (
                  <button
                    key={diff}
                    onClick={() => setSelectedDifficulty(diff)}
                    style={{
                      background: isSelected ? colors.bg : 'rgba(31, 41, 55, 0.5)',
                      border: `2px solid ${isSelected ? colors.border : 'rgba(75, 85, 99, 1)'}`,
                      borderRadius: '0.5rem',
                      color: isSelected ? colors.text : '#9ca3af',
                      padding: '1rem',
                      fontSize: '1.125rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textTransform: 'uppercase'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(55, 65, 81, 0.7)';
                        e.currentTarget.style.borderColor = colors.border;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(31, 41, 55, 0.5)';
                        e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 1)';
                      }
                    }}
                  >
                    {diff}
                    <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                      {diff === 'easy' && 'Slower obstacles, perfect for beginners'}
                      {diff === 'medium' && 'Balanced challenge for most players'}
                      {diff === 'hard' && 'Fast-paced, for experienced players'}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={startGame}
              style={{
                background: '#0ea5e9',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                padding: '1.5rem 3rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 10px 40px rgba(14, 165, 233, 0.5)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0284c7';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0ea5e9';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Start Game
            </button>
          </div>
        )}
      </div>

      {/* Stop Button */}
      {isGameStarted && (
        <div style={{ position: 'absolute', bottom: '2rem' }}>
          <button
            onClick={stopGame}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '0.5rem',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: '600',
              padding: '0.75rem 2rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#dc2626';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Stop Game
          </button>
        </div>
      )}

      {/* Info Modal */}
      {showInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            style={{
              background: '#1f2937',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '600px',
              maxHeight: '90vh',
              width: '100%',
              position: 'relative',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInfo(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#fff',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              <X style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>

            <h2 style={{
              color: '#fff',
              fontSize: '1.875rem',
              fontWeight: 'bold',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              How to Play
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                background: 'rgba(14, 165, 233, 0.1)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#0ea5e9', fontSize: '2rem', marginBottom: '0.5rem' }}>⌨️</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Controls</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Press any key to make the blue circle jump
                </p>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Objective</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Avoid the red square obstacles
                </p>
              </div>

              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#eab308', fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Scoring</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Each successful dodge earns 100 points
                </p>
              </div>

              <div style={{
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#a855f7', fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Stages</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Speed increases every 500 points - survive as long as you can!
                </p>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '0.5rem' }}>❤️</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Lives</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  You have 3 lives. Getting hit loses one life!
                </p>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '0.5rem' }}>💕</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Heart Powerup</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Red heart - Appears every 30 seconds to restore 1 life (max 3)
                </p>
              </div>

              <div style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#22c55e', fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Shield Powerup</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Green hexagon - Protects from one hit for 5 seconds
                </p>
              </div>

              <div style={{
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#a855f7', fontSize: '2rem', marginBottom: '0.5rem' }}>💎</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Slow-Mo Powerup</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Purple diamond - Slows down time for 3 seconds
                </p>
              </div>

              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#eab308', fontSize: '2rem', marginBottom: '0.5rem' }}>🔥</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Combo System</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Chain successful dodges to build your combo multiplier!
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '0.5rem',
              padding: '1rem'
            }}>
              <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>💡 Pro Tips</div>
              <ul style={{ color: '#d1d5db', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
                <li>Easy: Only ground obstacles in stage 1, perfect for beginners!</li>
                <li>Medium: Balanced challenge with progressive difficulty</li>
                <li>Hard: Fast-paced from the start, increases rapidly</li>
                <li>You have 3 lives - use them wisely!</li>
                <li>Obstacles appear at different heights - time your jumps carefully!</li>
                <li>Each obstacle has random speed variation</li>
                <li>Collect heart powerups to restore lost lives</li>
                <li>Shield gives you temporary invincibility after getting hit</li>
                <li>Master your timing to survive higher stages!</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JumpGame;
