import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRecognition } from './useRecognition';
import { RecognitionError } from '../lib/recognitionError';
import { stroke } from '../test/fixtures';

// Mock the heavy OCR module so the hook's lifecycle can be tested in isolation.
const recognizeText = vi.fn();
vi.mock('../lib/recognition', () => ({
  recognizeText: (...args: unknown[]) => recognizeText(...args),
}));

const strokes = [stroke([[0, 0]])];

describe('useRecognition', () => {
  beforeEach(() => {
    recognizeText.mockReset();
  });

  it('starts idle', () => {
    const { result } = renderHook(() => useRecognition());
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('goes loading → success and stores trimmed text', async () => {
    recognizeText.mockResolvedValue({ text: '  hello  ' });
    const { result } = renderHook(() => useRecognition());
    await act(async () => {
      await result.current.recognize(strokes);
    });
    expect(result.current.status).toBe('success');
    expect(result.current.text).toBe('hello');
  });

  it('surfaces a RecognitionError message on failure', async () => {
    recognizeText.mockRejectedValue(new RecognitionError('canvas is empty', 'empty'));
    const { result } = renderHook(() => useRecognition());
    await act(async () => {
      await result.current.recognize(strokes);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('canvas is empty');
  });

  it('wraps a non-RecognitionError into a failure message', async () => {
    recognizeText.mockRejectedValue(new Error('worker exploded'));
    const { result } = renderHook(() => useRecognition());
    await act(async () => {
      await result.current.recognize(strokes);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Recognition failed: worker exploded');
  });

  it('discards a stale (superseded) response when a newer request resolves first', async () => {
    // First call hangs on a deferred promise; second resolves immediately.
    let resolveFirst!: (v: { text: string }) => void;
    const firstPending = new Promise<{ text: string }>((res) => {
      resolveFirst = res;
    });
    recognizeText
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce({ text: 'second' });

    const { result } = renderHook(() => useRecognition());
    let firstCall!: Promise<void>;
    await act(async () => {
      firstCall = result.current.recognize(strokes); // id 1, pending
    });
    await act(async () => {
      await result.current.recognize(strokes); // id 2, wins
    });
    expect(result.current.text).toBe('second');

    // Now let the stale first request resolve — it must be ignored.
    await act(async () => {
      resolveFirst({ text: 'first' });
      await firstCall;
    });
    expect(result.current.text).toBe('second');
    expect(result.current.status).toBe('success');
  });

  it('reset() returns to idle and clears text/error', async () => {
    recognizeText.mockResolvedValue({ text: 'hi' });
    const { result } = renderHook(() => useRecognition());
    await act(async () => {
      await result.current.recognize(strokes);
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('reset() supersedes an in-flight request so its result is dropped', async () => {
    let release!: (v: { text: string }) => void;
    const pending = new Promise<{ text: string }>((res) => {
      release = res;
    });
    recognizeText.mockReturnValue(pending);
    const { result } = renderHook(() => useRecognition());
    let call!: Promise<void>;
    await act(async () => {
      call = result.current.recognize(strokes);
    });
    act(() => result.current.reset());
    await act(async () => {
      release({ text: 'late' });
      await call;
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.text).toBe('');
  });
});
