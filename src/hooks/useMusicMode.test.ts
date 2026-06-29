import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const loadAudioEngine = vi.fn().mockResolvedValue(undefined);
const startAudioContext = vi.fn();
const playShapeSound = vi.fn();

vi.mock('../lib/kandinsky/audio', () => ({
  loadAudioEngine: (...a: unknown[]) => loadAudioEngine(...a),
  startAudioContext: (...a: unknown[]) => startAudioContext(...a),
  playShapeSound: (...a: unknown[]) => playShapeSound(...a),
}));

import { useMusicMode } from './useMusicMode';
import type { Stroke } from '../types';

function lineStroke(): Stroke {
  return {
    id: 'x',
    color: '#fff',
    size: 4,
    points: Array.from({ length: 30 }, (_, i) => ({ x: i * 5, y: i * 5, pressure: 0.5, t: 0 })),
  };
}

describe('useMusicMode', () => {
  beforeEach(() => {
    loadAudioEngine.mockClear();
    startAudioContext.mockClear();
    playShapeSound.mockClear();
  });

  it('starts disabled and silent', () => {
    const { result } = renderHook(() => useMusicMode());
    expect(result.current.enabled).toBe(false);
    result.current.handleStrokeEnd(lineStroke(), 600);
    expect(playShapeSound).not.toHaveBeenCalled();
  });

  it('toggling lazily loads the engine, starts the context, and enables', async () => {
    const { result } = renderHook(() => useMusicMode());
    await act(async () => {
      result.current.toggleMusicMode();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(loadAudioEngine).toHaveBeenCalledTimes(1);
    expect(startAudioContext).toHaveBeenCalledTimes(1);
  });

  it('plays a note on stroke end while enabled', async () => {
    const { result } = renderHook(() => useMusicMode());
    await act(async () => {
      result.current.toggleMusicMode();
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    act(() => result.current.handleStrokeEnd(lineStroke(), 600));
    expect(playShapeSound).toHaveBeenCalledTimes(1);
    expect(playShapeSound).toHaveBeenCalledWith('line', expect.any(String), 'A');
  });

  it('cyclePalette flips A <-> B', () => {
    const { result } = renderHook(() => useMusicMode());
    expect(result.current.palette).toBe('A');
    act(() => result.current.cyclePalette());
    expect(result.current.palette).toBe('B');
    act(() => result.current.cyclePalette());
    expect(result.current.palette).toBe('A');
  });
});
