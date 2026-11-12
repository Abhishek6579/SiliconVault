/// <reference lib="webworker" />

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const text = await event.data.text();
    const value: unknown = JSON.parse(text);
    self.postMessage({ ok: true, value });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'The selected backup is not valid JSON.',
    });
  }
};
