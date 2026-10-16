export type AIProblem = { code: string; message: string };

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// Never return provider response bodies, credentials or arbitrary exception messages to clients.
export function aiProblem(error: unknown): AIProblem {
  if (error instanceof ProviderError) return { code: error.code, message: error.message };
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    return { code: 'timeout', message: 'The AI provider took too long to respond. Try again.' };
  return {
    code: 'unavailable',
    message: 'Could not reach the AI provider. Check LLM_BASE_URL and that the server is running.',
  };
}

export function localAIProblem(enabled: boolean, configured: boolean): AIProblem | null {
  if (!configured)
    return {
      code: 'not_configured',
      message:
        'No AI model is configured. Set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in .env, then restart the app.',
    };
  if (!enabled)
    return {
      code: 'disabled',
      message:
        'AI is switched off. Enable “Send chat evidence to the configured model” in Settings and save preferences.',
    };
  return null;
}

export function isRecallQuestion(message: string) {
  return /\b(what (was|were|did|am|have)|my (activity|goals?|tasks?|ideas?|projects?|memories)|yesterday|last week|unfinished|haven.t.*(touch|work)|currently working|what.*(mention|working|doing))\b|เมื่อวาน|สัปดาห์ที่แล้ว|อาทิตย์ที่แล้ว|ทำอะไรอยู่|ทำอะไรไป|ทำอะไรค้าง|งานที่ค้าง|เป้าหมายของฉัน|ไอเดียที่|เคยบอก|เคยพูด|กิจกรรมของ/i.test(
    message,
  );
}
