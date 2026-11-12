const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = async (event: MessageEvent<File>) => {
  try {
    const text = await event.data.text();
    const value: unknown = JSON.parse(text);
    workerScope.postMessage({ ok: true, value });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'The selected backup is not valid JSON.',
    });
  }
};
