import { useCallback, useRef, useState } from 'react';
import type { Stroke } from '../types';
import { RecognitionError, recognizeText } from '../lib/recognition';

export type RecognitionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseRecognitionResult {
  status: RecognitionStatus;
  text: string;
  error: string | null;
  recognize: (strokes: Stroke[]) => Promise<void>;
  reset: () => void;
}

/**
 * Manages the async lifecycle of a handwriting-recognition request.
 *
 * Guards against overlapping requests: a request id is bumped on each call and
 * stale responses are discarded, so rapid clicks don't show out-of-order text.
 */
export function useRecognition(): UseRecognitionResult {
  const [status, setStatus] = useState<RecognitionStatus>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const recognize = useCallback(async (strokes: Stroke[]) => {
    const id = ++requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await recognizeText(strokes);
      if (id !== requestId.current) return; // superseded
      setText(result.text.trim());
      setStatus('success');
    } catch (err) {
      if (id !== requestId.current) return;
      const message =
        err instanceof RecognitionError
          ? err.message
          : `Recognition failed: ${(err as Error).message}`;
      setError(message);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current++;
    setStatus('idle');
    setText('');
    setError(null);
  }, []);

  return { status, text, error, recognize, reset };
}
