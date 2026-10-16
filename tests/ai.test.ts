import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpenAICompatibleProvider,
  classifyMessage,
  ConversationResponder,
  MemoryExtractor,
  testProvider,
  type LLMProvider,
} from '../packages/core/src/ai';
import { isRecallQuestion } from '../packages/core/src/ai-status';
import { openDatabase } from '../packages/database/src';
import { createApp } from '../apps/api/src/app';
import { extractionSchema } from '../packages/shared/src/schema';

afterEach(() => vi.unstubAllGlobals());

describe('real provider HTTP contract', () => {
  it('uses GPT-6 compatible parameters for OpenAI chat and structured output', async () => {
    const request = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ choices: [{ message: { content: '{"memories":[]}' } }] }),
      );
    vi.stubGlobal('fetch', request);
    const openai = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-secret',
      model: 'gpt-6-luna',
    });
    await openai.generate('Be helpful', 'Hello');
    await openai.generateStructured('Return JSON', 'Hello', extractionSchema);
    for (const [, options] of request.mock.calls) {
      const body = JSON.parse(options.body);
      expect(body).toMatchObject({
        model: 'gpt-6-luna',
        max_completion_tokens: 1200,
        reasoning_effort: 'none',
      });
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('temperature');
    }
    expect(JSON.parse(request.mock.calls[1][1].body).response_format).toEqual({
      type: 'json_object',
    });
  });
  const provider = () =>
    new OpenAICompatibleProvider({
      baseUrl: 'http://127.0.0.1:12345/v1/',
      apiKey: 'test-secret',
      model: 'test-model',
    });
  it('sends the configured model and authorization to chat completions', async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'Hello!' } }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', request);
    expect(await provider().generate('Be helpful', 'Hello')).toBe('Hello!');
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:12345/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-secret' }),
      }),
    );
    const options = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(options[1].body as string)).toMatchObject({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hello' },
      ],
    });
  });
  it.each([
    [401, 'authentication'],
    [403, 'permission'],
    [404, 'not_found'],
    [429, 'rate_limit'],
    [500, 'provider_error'],
  ])('reports HTTP %s safely', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('test-secret should never be returned', { status: status as number }),
      ),
    );
    const result = await testProvider(provider());
    expect(result.ok).toBe(false);
    expect(result.problem?.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
  it('reports connection failures without leaking exception text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('test-secret');
      }),
    );
    const result = await testProvider(provider());
    expect(result.problem?.code).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
  it('falls back when structured JSON is malformed but ordinary chat works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: 'Hello, not JSON' } }] })),
      ),
    );
    const result = await new MemoryExtractor(provider()).extract(
      'I want to finish my character.',
      '',
      true,
    );
    expect(result.memories[0].type).toBe('GOAL');
    expect(result.problem?.code).toBe('invalid_output');
    const chat = await new ConversationResponder(provider()).respond(
      'Hello',
      {},
      'local',
      true,
      false,
    );
    expect(chat.mode).toBe('AI response');
    expect(chat.problem).toBeNull();
  });
  it('rejects an empty provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }))),
    );
    expect((await testProvider(provider())).problem?.code).toBe('invalid_output');
  });
});

describe('chat mode and diagnostics', () => {
  it('understands Thai example prompts without turning recall into a goal', () => {
    expect(classifyMessage('ฉันอยากทำตัวละครใน Blender ให้เสร็จ').memories[0].type).toBe('GOAL');
    expect(classifyMessage('เมื่อวานฉันทำอะไรไปบ้าง?').memories).toEqual([]);
    expect(isRecallQuestion('ฉันเคยพูดถึงไอเดียอะไรบ้าง?')).toBe(true);
  });
  it('retrieves the same period for Thai and English yesterday questions', () => {
    const store = openDatabase(':memory:');
    const { app, conversation } = createApp({ store, collector: false });
    try {
      expect(conversation.retrieve('เมื่อวานฉันทำอะไรไปบ้าง?').range).toEqual(
        conversation.retrieve('What was I working on yesterday?').range,
      );
    } finally {
      void app.close();
      store.close();
    }
  });
  it('recognizes English and Thai recall requests, not greetings', () => {
    expect(isRecallQuestion('can you talk with me normally')).toBe(false);
    expect(isRecallQuestion('สวัสดี คุยกันหน่อย')).toBe(false);
    expect(isRecallQuestion('What was I working on yesterday?')).toBe(true);
    expect(isRecallQuestion('เมื่อวานทำอะไรไปบ้าง')).toBe(true);
  });
  it('keeps configured but disabled AI local and explains why', async () => {
    const generate = vi.fn(async () => 'Hello');
    const provider: LLMProvider = {
      generate,
      generateStructured: async (_s, _i, schema) => schema.parse({ memories: [] }),
    };
    const store = openDatabase(':memory:');
    const { app, conversation } = createApp({ store, collector: false, provider });
    try {
      const status = (await app.inject('/api/v1/ai/status')).json();
      expect(status).toMatchObject({
        configured: true,
        enabled: false,
        problem: { code: 'disabled' },
      });
      const chat = await conversation.send('can you talk with me normally');
      expect(chat.mode).toBe('local mode');
      expect(chat.aiProblem?.code).toBe('disabled');
      expect(chat.response).toContain('AI chat is turned off');
      const thaiChat = await conversation.send('ไง');
      expect(thaiChat.response).toContain('AI ในแชตยังปิดอยู่');
      expect(thaiChat.response).toContain('บันทึกการตั้งค่า');
      expect(chat.response).not.toContain('Observed foreground');
      expect(generate).not.toHaveBeenCalled();
    } finally {
      await app.close();
      store.close();
    }
  });
  it('converses using the model and excludes activity from ordinary chat evidence', async () => {
    const generate = vi.fn(async () => 'Of course! What would you like to talk about?');
    const provider: LLMProvider = {
      generate,
      generateStructured: async (_s, _i, schema) => schema.parse({ memories: [] }),
    };
    const store = openDatabase(':memory:');
    store.setSettings({ llmEnabled: true });
    const { app, conversation } = createApp({ store, collector: false, provider });
    try {
      const chat = await conversation.send('can you talk with me normally');
      expect(chat.response).toBe('Of course! What would you like to talk about?');
      expect(chat.mode).toBe('AI response');
      expect(chat.aiProblem).toBeNull();
      const call = generate.mock.calls[0] as unknown as [string, string];
      expect(call[0]).toContain('chat normally');
      expect(JSON.parse(call[1]).evidence).not.toHaveProperty('activity');
      expect(JSON.parse(call[1]).evidence.conversation).toHaveLength(1);
    } finally {
      await app.close();
      store.close();
    }
  });
  it('allows a synthetic connection test while AI sharing remains off', async () => {
    const generate = vi.fn(async () => 'Hello');
    const provider: LLMProvider = {
      generate,
      generateStructured: async (_s, _i, schema) =>
        schema.parse(extractionSchema.parse({ memories: [] })),
    };
    const store = openDatabase(':memory:');
    const { app } = createApp({ store, collector: false, provider, token: 'test' });
    try {
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/ai/test', payload: {} })).statusCode,
      ).toBe(403);
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/test',
        headers: { 'x-local-token': 'test' },
        payload: {},
      });
      expect(result.json()).toEqual({ ok: true, problem: null });
      expect(store.settings().llmEnabled).toBe(false);
      expect(generate).toHaveBeenCalledWith(
        'This is a connection test. Reply briefly.',
        'Say hello.',
      );
    } finally {
      await app.close();
      store.close();
    }
  });
});
