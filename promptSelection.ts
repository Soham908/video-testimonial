export const MAX_SELECTED_PROMPTS = 3;
export const MAX_CUSTOM_PROMPT_LENGTH = 40;

export interface PromptOption { id: string; text: string; custom: boolean; }
export interface PromptChoice { custom: PromptOption[]; selectedIds: string[]; }
export interface PromptSelection { options: PromptOption[]; selectedIds: string[]; }
export type AddPromptResult = 'selected' | 'unselected' | 'empty' | 'duplicate' | 'tooLong';
export interface PromptSelectionControl extends PromptSelection {
  onToggle: (id: string) => void;
  onAdd: (text: string) => AddPromptResult;
  onRemove: (id: string) => void;
  saveFailed: boolean;
}
export type PromptChoices = Record<string, PromptChoice>;
export const normalizePrompt = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
const comparable = (text: string) => normalizePrompt(text).toLowerCase();

// Stable question IDs survive question reordering. Language and account are
// separate scopes, so personal reminders never appear for another user.
export function promptScope(owner: string | null, questionId: string, language: string): string {
  return JSON.stringify([owner, questionId, language]);
}

export function resolvePrompts(defaults: readonly string[], saved?: PromptChoice): PromptSelection {
  const texts = new Set<string>();
  const options: PromptOption[] = [];
  for (const raw of defaults) {
    const text = normalizePrompt(raw);
    if (!text || texts.has(comparable(text))) continue;
    texts.add(comparable(text));
    options.push({ id: `default:${text}`, text, custom: false });
  }
  for (const option of saved?.custom ?? []) {
    if (texts.has(comparable(option.text))) continue;
    texts.add(comparable(option.text));
    options.push(option);
  }
  const available = new Set(options.map(option => option.id));
  // An explicitly empty selection stays empty. Refreshing/reordering the
  // backend list preserves surviving choices without selecting new ones.
  const selectedIds = saved
    ? [...new Set(saved.selectedIds)].filter(id => available.has(id)).slice(0, MAX_SELECTED_PROMPTS)
    : options.slice(0, MAX_SELECTED_PROMPTS).map(option => option.id);
  return { options, selectedIds };
}

export function togglePrompt(selection: PromptSelection, id: string): PromptChoice {
  let selectedIds = selection.selectedIds;
  if (selectedIds.includes(id)) selectedIds = selectedIds.filter(value => value !== id);
  else if (selectedIds.length < MAX_SELECTED_PROMPTS && selection.options.some(option => option.id === id)) selectedIds = [...selectedIds, id];
  return { custom: selection.options.filter(option => option.custom), selectedIds };
}

export function addCustomPrompt(selection: PromptSelection, raw: string, id: string): { result: AddPromptResult; choice?: PromptChoice } {
  const text = normalizePrompt(raw);
  if (!text) return { result: 'empty' };
  if (text.length > MAX_CUSTOM_PROMPT_LENGTH) return { result: 'tooLong' };
  if (selection.options.some(option => comparable(option.text) === comparable(text))) return { result: 'duplicate' };
  const canSelect = selection.selectedIds.length < MAX_SELECTED_PROMPTS;
  return {
    result: canSelect ? 'selected' : 'unselected',
    choice: {
      custom: [...selection.options.filter(option => option.custom), { id, text, custom: true }],
      selectedIds: canSelect ? [...selection.selectedIds, id] : selection.selectedIds,
    },
  };
}

export function parsePromptChoices(value: unknown): PromptChoices {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('entries' in value)) return {};
  const entries = value.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
  const result: PromptChoices = {};
  for (const [key, raw] of Object.entries(entries)) {
    try {
      const scope = JSON.parse(key);
      if (!Array.isArray(scope) || scope.length !== 3 || typeof scope[0] !== 'string' || typeof scope[1] !== 'string' || typeof scope[2] !== 'string') continue;
    } catch { continue; }
    if (!raw || !Array.isArray(raw.custom) || !Array.isArray(raw.selectedIds)) continue;
    const ids = new Set<string>();
    const custom: PromptOption[] = [];
    for (const item of raw.custom) {
      if (!item || typeof item.id !== 'string' || !item.id.startsWith('custom:') || ids.has(item.id) || typeof item.text !== 'string') continue;
      const text = normalizePrompt(item.text);
      if (!text || text.length > MAX_CUSTOM_PROMPT_LENGTH) continue;
      ids.add(item.id);
      custom.push({ id: item.id, text, custom: true });
    }
    result[key] = { custom, selectedIds: [...new Set<string>(raw.selectedIds.filter((id: unknown) => typeof id === 'string'))].slice(0, MAX_SELECTED_PROMPTS) };
  }
  return result;
}
