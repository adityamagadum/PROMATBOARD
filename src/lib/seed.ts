import type { Folder, Prompt } from '../types';

// Deterministic ids: if two views seed at the same moment they write identical records.
export function examples(now = Date.now()): { folders: Folder[]; prompts: Prompt[] } {
  const folder: Folder = {
    id: 'examples',
    name: 'Examples',
    emoji: '✨',
    color: 'violet',
    parentId: null,
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
  const base = { folderId: folder.id, usageCount: 0, lastUsedAt: null, createdAt: now, updatedAt: now };
  const prompts: Prompt[] = [
    {
      ...base,
      id: 'example-portrait',
      order: 0,
      title: 'Image gen – cinematic portrait',
      tags: ['midjourney', 'image'],
      favorite: true,
      content:
        'Cinematic portrait of {{subject}}, {{lighting|golden hour rim light}}, shallow depth of field, 85mm lens, film grain, rich color grading, highly detailed skin texture --ar 4:5 --style raw',
    },
    {
      ...base,
      id: 'example-summary',
      order: 1,
      title: 'Summarize for a busy reader',
      tags: ['writing', 'summary'],
      favorite: false,
      content:
        'Summarize the text below for {{audience|a busy executive}}.\n\n- Start with a one-sentence TL;DR\n- Then 3–5 bullet points with the key facts\n- End with any decisions or actions required\n\nText:\n"""\n{{text}}\n"""',
    },
    {
      ...base,
      id: 'example-review',
      order: 2,
      title: 'Code review – senior engineer',
      tags: ['coding', 'review'],
      favorite: false,
      monospace: true,
      content:
        'You are a senior software engineer doing a careful code review.\nReview the code below for correctness, edge cases, security issues and readability.\nFor each issue: quote the line, explain the problem, and suggest a concrete fix.\nFinish with a short overall verdict.\n\n```\n<paste code here>\n```',
    },
    {
      ...base,
      id: 'example-followup',
      order: 3,
      title: 'Email – polite follow-up',
      tags: ['email', 'writing'],
      favorite: false,
      content:
        'Write a short, friendly follow-up email to {{name}} about {{topic}}. It has been {{time_since|a week}} since my last message. Keep it under 120 words, warm but direct, and end with one clear question.',
    },
  ];
  return { folders: [folder], prompts };
}
