type WorkerMessage =
  | { type: 'progress'; stage: 'Reading backup file in background…' | 'Parsing backup JSON in background…' }
  | { type: 'result'; ok: true; value: unknown }
  | { type: 'result'; ok: false; error: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (message: WorkerMessage) => void;
};

workerScope.onmessage = async (event: MessageEvent<File>) => {
  try {
    workerScope.postMessage({ type: 'progress', stage: 'Reading backup file in background…' });
    const text = await event.data.text();
    workerScope.postMessage({ type: 'progress', stage: 'Parsing backup JSON in background…' });
    const value: unknown = JSON.parse(text);
    workerScope.postMessage({ type: 'result', ok: true, value });
  } catch (error) {
    workerScope.postMessage({
      type: 'result',
      ok: false,
      error: error instanceof Error ? error.message : 'The selected backup is not valid JSON.',
    });
  }
};
