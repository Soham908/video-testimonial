import { useEffect, useRef, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { addCustomPrompt, parsePromptChoices, promptScope, resolvePrompts, togglePrompt, type PromptChoice, type PromptChoices, type PromptSelectionControl } from './promptSelection';

const preferencesFile = () => new File(Paths.document, 'question-prompts.json');
function readChoices(): PromptChoices {
  try {
    const file = preferencesFile();
    return file.exists ? parsePromptChoices(JSON.parse(file.textSync())) : {};
  } catch (error) {
    console.warn('[prompts] could not read saved choices', error);
    return {};
  }
}

export function useQuestionPrompts(owner: string | null, questionId: string, language: string, defaults: readonly string[]) {
  const [entries, setEntries] = useState(readChoices);
  useEffect(() => { setEntries(readChoices()); }, [owner]);
  const latest = useRef(entries);
  latest.current = entries;
  const [saveFailed, setSaveFailed] = useState(false);
  const scope = promptScope(owner, questionId, language);
  const selection = resolvePrompts(defaults, entries[scope]);
  const current = () => resolvePrompts(defaults, latest.current[scope]);
  function save(choice: PromptChoice) {
    const next = { ...readChoices(), [scope]: choice };
    latest.current = next;
    setEntries(next);
    // Saving only on deliberate edits avoids startup writes overwriting
    // existing preferences before questions/auth have loaded.
    if (!owner || !questionId) return;
    try {
      const file = preferencesFile();
      if (!file.exists) file.create();
      const persisted = Object.fromEntries(Object.entries(next).filter(([key]) => JSON.parse(key)[0] != null));
      file.write(JSON.stringify({ version: 1, entries: persisted }));
      setSaveFailed(false);
    } catch (error) {
      console.warn('[prompts] could not save choices', error);
      setSaveFailed(true);
    }
  }
  const controls: PromptSelectionControl = {
    ...selection, saveFailed,
    onToggle(id) { save(togglePrompt(current(), id)); },
    onAdd(text) {
      const added = addCustomPrompt(current(), text, `custom:${Date.now()}-${Math.random().toString(36).slice(2)}`);
      if (added.choice) save(added.choice);
      return added.result;
    },
    onRemove(id) {
      const value = current();
      save({ custom: value.options.filter(option => option.custom && option.id !== id), selectedIds: value.selectedIds.filter(selected => selected !== id) });
    },
  };
  return { controls, prompts: selection.options.filter(option => selection.selectedIds.includes(option.id)).map(option => option.text) };
}
