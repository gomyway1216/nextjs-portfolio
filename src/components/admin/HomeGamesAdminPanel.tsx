'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react';
import { games } from '@/components/game/constants/games';
import { DEFAULT_HOME_GAME_IDS, getHomeGamesByIds } from '@/lib/homeGames';
import { getHomeGamesConfig, updateHomeGamesConfig } from '@/services/homeGamesService';

interface HomeGamesAdminPanelProps {
  onMessage?: (type: 'success' | 'error', text: string) => void;
}

const colors = {
  surface: 'var(--admin-surface)',
  surfaceRaised: 'var(--admin-surface-raised)',
  surfaceMuted: 'var(--admin-surface-muted)',
  border: 'var(--admin-border)',
  borderStrong: 'var(--admin-border-strong)',
  text: 'var(--admin-text)',
  textSoft: 'var(--admin-text-soft)',
  textMuted: 'var(--admin-text-muted)',
  textSubtle: 'var(--admin-text-subtle)',
  accent: 'var(--admin-accent)',
  accentSoft: 'var(--admin-accent-soft)',
  accentBorder: 'var(--admin-accent-border)',
  danger: 'var(--admin-danger)',
  dangerSoft: 'var(--admin-danger-soft)',
  dangerBorder: 'var(--admin-danger-border)',
  primaryText: 'var(--admin-primary-text)',
  success: 'var(--admin-success)',
  successSoft: 'var(--admin-success-soft)',
  successBorder: 'var(--admin-success-border)',
};

function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function moveItem(items: string[], fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= items.length) return items;

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return items;
  next.splice(toIndex, 0, item);
  return next;
}

export default function HomeGamesAdminPanel({ onMessage }: HomeGamesAdminPanelProps) {
  const [visibleGameIds, setVisibleGameIds] = useState<string[]>(DEFAULT_HOME_GAME_IDS);
  const [savedGameIds, setSavedGameIds] = useState<string[]>(DEFAULT_HOME_GAME_IDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const visibleGames = useMemo(() => getHomeGamesByIds(visibleGameIds), [visibleGameIds]);
  const hiddenGames = useMemo(
    () => games.filter((game) => !visibleGameIds.includes(game.id)),
    [visibleGameIds],
  );
  const hasChanges = !sameOrder(visibleGameIds, savedGameIds);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await getHomeGamesConfig();
      setVisibleGameIds(config.gameIds);
      setSavedGameIds(config.gameIds);
    } catch (error) {
      onMessage?.('error', `Failed to load home games: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    let cancelled = false;

    const loadInitialConfig = async () => {
      try {
        const config = await getHomeGamesConfig();
        if (cancelled) return;
        setVisibleGameIds(config.gameIds);
        setSavedGameIds(config.gameIds);
      } catch (error) {
        if (!cancelled) {
          onMessage?.('error', `Failed to load home games: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialConfig();

    return () => {
      cancelled = true;
    };
  }, [onMessage]);

  const handleSave = async () => {
    if (visibleGameIds.length === 0) {
      onMessage?.('error', 'At least one game must be visible on the home page.');
      return;
    }

    setSaving(true);
    try {
      const config = await updateHomeGamesConfig(visibleGameIds);
      setVisibleGameIds(config.gameIds);
      setSavedGameIds(config.gameIds);
      onMessage?.('success', 'Home game order saved.');
    } catch (error) {
      onMessage?.('error', `Failed to save home games: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setVisibleGameIds(savedGameIds);
  };

  const handleUseDefault = () => {
    setVisibleGameIds(DEFAULT_HOME_GAME_IDS);
  };

  const hideGame = (gameId: string) => {
    if (visibleGameIds.length <= 1) {
      onMessage?.('error', 'At least one game must stay visible.');
      return;
    }
    setVisibleGameIds((current) => current.filter((id) => id !== gameId));
  };

  const showGame = (gameId: string) => {
    setVisibleGameIds((current) => current.includes(gameId) ? current : [...current, gameId]);
  };

  const moveVisibleGame = (index: number, direction: -1 | 1) => {
    setVisibleGameIds((current) => moveItem(current, index, index + direction));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '30px', fontWeight: 650, color: colors.text, lineHeight: 1.15, marginBottom: '6px' }}>
            Home Games
          </h1>
          <p style={{ color: colors.textMuted }}>
            Manage which games appear in the home page slideshow and the order they appear in.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void loadConfig()}
            disabled={loading || saving}
            style={buttonStyle('outline', loading || saving)}
          >
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
            Refresh
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges || saving}
            style={buttonStyle('outline', !hasChanges || saving)}
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!hasChanges || saving || visibleGameIds.length === 0}
            style={buttonStyle('primary', !hasChanges || saving || visibleGameIds.length === 0)}
          >
            {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
            Save
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '18px' }}>
        <section style={cardStyle}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ color: colors.text, fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                  Visible on home
                </h2>
                <p style={{ color: colors.textMuted, fontSize: '13px' }}>
                  The first three are visible in the desktop carousel before scrolling.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUseDefault}
                disabled={saving || sameOrder(visibleGameIds, DEFAULT_HOME_GAME_IDS)}
                style={buttonStyle('outline', saving || sameOrder(visibleGameIds, DEFAULT_HOME_GAME_IDS))}
              >
                <RotateCcw size={16} />
                Use default order
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '48px', color: colors.textMuted }}>
              <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
              Loading home games...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visibleGames.map((game, index) => (
                <div key={game.id} style={rowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: '1 1 auto' }}>
                    <span style={orderBadgeStyle}>{index + 1}</span>
                    <div style={thumbnailStyle}>{game.thumbnail}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <strong style={{ color: colors.text }}>{game.title}</strong>
                        {index < 3 && (
                          <span style={badgeStyle('accent')}>Initial desktop</span>
                        )}
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {game.path} / {game.category} / {game.difficulty}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <IconButton
                      label={`Move ${game.title} up`}
                      disabled={index === 0 || saving}
                      onClick={() => moveVisibleGame(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      label={`Move ${game.title} down`}
                      disabled={index === visibleGames.length - 1 || saving}
                      onClick={() => moveVisibleGame(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                    <Link
                      href={game.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Preview ${game.title}`}
                      style={iconButtonStyle(false)}
                    >
                      <ExternalLink size={16} />
                    </Link>
                    <IconButton
                      label={`Hide ${game.title} from home`}
                      disabled={visibleGames.length <= 1 || saving}
                      onClick={() => hideGame(game.id)}
                      tone="danger"
                    >
                      <EyeOff size={16} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${colors.border}` }}>
            <h2 style={{ color: colors.text, fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
              Hidden from home
            </h2>
            <p style={{ color: colors.textMuted, fontSize: '13px' }}>
              Hidden games still remain available on the full games page.
            </p>
          </div>

          {hiddenGames.length === 0 ? (
            <div style={{ padding: '32px', color: colors.textSubtle, textAlign: 'center' }}>
              Every game is currently visible on the home page.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {hiddenGames.map((game) => (
                <div key={game.id} style={rowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <div style={thumbnailStyle}>{game.thumbnail}</div>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ color: colors.text }}>{game.title}</strong>
                      <div style={{ color: colors.textMuted, fontSize: '13px' }}>
                        {game.category} / {game.difficulty}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => showGame(game.id)}
                    disabled={saving}
                    style={buttonStyle('outline', saving)}
                  >
                    <Eye size={16} />
                    Show
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function buttonStyle(variant: 'primary' | 'outline', disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '9px 14px',
    borderRadius: '8px',
    border: variant === 'primary' ? `1px solid ${colors.accent}` : `1px solid ${colors.borderStrong}`,
    backgroundColor: variant === 'primary' ? colors.accent : colors.surfaceRaised,
    color: variant === 'primary' ? colors.primaryText : colors.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.2,
    textDecoration: 'none',
  };
}

function iconButtonStyle(disabled: boolean, tone: 'default' | 'danger' = 'default'): React.CSSProperties {
  return {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: `1px solid ${tone === 'danger' ? colors.dangerBorder : colors.borderStrong}`,
    backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.surfaceRaised,
    color: tone === 'danger' ? colors.danger : colors.text,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    textDecoration: 'none',
  };
}

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={iconButtonStyle(disabled, tone)}
    >
      {children}
    </button>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: colors.surface,
  borderRadius: '8px',
  border: `1px solid ${colors.border}`,
  overflow: 'hidden',
  boxShadow: 'var(--admin-shadow-surface)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '14px 16px',
  borderBottom: `1px solid ${colors.border}`,
};

const thumbnailStyle: React.CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '8px',
  border: `1px solid ${colors.borderStrong}`,
  backgroundColor: colors.surfaceMuted,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  flexShrink: 0,
};

const orderBadgeStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '999px',
  backgroundColor: colors.surfaceRaised,
  border: `1px solid ${colors.borderStrong}`,
  color: colors.textMuted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 700,
  flexShrink: 0,
};

function badgeStyle(tone: 'accent' | 'success'): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 7px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: tone === 'accent' ? colors.accentSoft : colors.successSoft,
    border: `1px solid ${tone === 'accent' ? colors.accentBorder : colors.successBorder}`,
    color: tone === 'accent' ? colors.accent : colors.success,
  };
}
