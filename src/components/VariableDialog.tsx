import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, CornerDownLeft, RotateCcw } from 'lucide-react';
import { canInsert, deliver } from '../lib/actions';
import { keys, storage } from '../lib/storage';
import { useVault } from '../lib/store';
import { extractVars, fillTemplate, humanize, segments } from '../lib/template';
import { useUI } from '../lib/ui';
import { cx, modKey } from '../lib/utils';
import { Button, inputClass, Sheet } from './ui';

export function VariableDialog() {
  const dlg = useUI((s) => s.varDialog);
  const prompt = useVault((s) => (dlg ? s.prompts[dlg.promptId] : undefined));
  const close = () => useUI.getState().set({ varDialog: null });
  return (
    <Sheet
      open={!!dlg && !!prompt}
      onOpenChange={(o) => !o && close()}
      title={prompt?.title ?? ''}
      description="Fill in the blanks — the preview updates as you type."
      initialFocus="[data-var-input]"
    >
      {dlg && prompt && <VarForm key={prompt.id} promptId={prompt.id} mode={dlg.mode} onDone={close} />}
    </Sheet>
  );
}

function VarForm({ promptId, mode, onDone }: { promptId: string; mode: 'copy' | 'insert'; onDone: () => void }) {
  const prompt = useVault((s) => s.prompts[promptId]);
  const vars = useMemo(() => extractVars(prompt.content), [prompt.content]);
  // Empty = use the default (shown as the placeholder), so typing never has to delete it first.
  const [values, setValues] = useState<Record<string, string>>({});
  const loaded = useRef(false);

  // Restore the values used last time for this prompt.
  useEffect(() => {
    void storage.get<Record<string, string>>(keys.vars(promptId)).then((last) => {
      if (last && !loaded.current) setValues((cur) => ({ ...cur, ...pick(last, vars.map((v) => v.name)) }));
      loaded.current = true;
    });
  }, [promptId, vars]);

  const finalText = () => fillTemplate(prompt.content, values);

  const submit = async (how: 'copy' | 'insert') => {
    void storage.set({ [keys.vars(promptId)]: values });
    onDone();
    await deliver(prompt, finalText(), how);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(mode);
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          void submit(e.shiftKey && canInsert() ? 'insert' : mode);
        }
      }}
      className="space-y-3 pt-1"
    >
      <div className="space-y-2.5">
        {vars.map((v, i) => (
          <label key={v.name} className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-muted">
              <span>
                {humanize(v.name)} <span className="font-mono text-[10.5px] text-subtle">{`{{${v.name}}}`}</span>
              </span>
            </span>
            <textarea
              data-var-input={i === 0 ? '' : undefined}
              rows={1}
              value={values[v.name] ?? ''}
              placeholder={v.defaultValue || `Enter ${humanize(v.name).toLowerCase()}…`}
              onChange={(e) => {
                setValues({ ...values, [v.name]: e.target.value });
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight + 2, 140) + 'px';
              }}
              onKeyDown={(e) => {
                // Enter submits from the last field; Shift+Enter adds a new line.
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  const next = e.currentTarget.form?.querySelectorAll('textarea')[i + 1];
                  if (next) (next as HTMLTextAreaElement).focus();
                  else void submit(mode);
                }
              }}
              className={cx(inputClass, 'resize-none')}
            />
          </label>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="section-label">Preview</span>
          <button
            type="button"
            onClick={() => setValues({})}
            className="flex items-center gap-1 text-[11px] text-subtle transition-colors hover:text-fg"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
        <div
          className={cx(
            'max-h-40 overflow-y-auto rounded-lg border border-line bg-s1 px-2.5 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-muted',
            prompt.monospace && 'font-mono text-[12px]',
          )}
        >
          {segments(prompt.content).map((s, i) => {
            if (!s.varName) return <span key={i}>{s.text}</span>;
            const v = values[s.varName]?.trim() || vars.find((x) => x.name === s.varName)?.defaultValue;
            return v ? (
              <span key={i} className="rounded-[3px] bg-success-soft px-0.5 text-fg">
                {v}
              </span>
            ) : (
              <span key={i} className="var-chip">
                {s.text}
              </span>
            );
          })}
        </div>
      </div>

      <div className="-mx-4 flex items-center gap-2 border-t border-line px-4 pt-3">
        <span className="hidden text-[11px] text-subtle min-[400px]:inline">
          <span className="kbd">{modKey}+↵</span>
        </span>
        <span className="flex-1" />
        {canInsert() && (
          <Button variant={mode === 'insert' ? 'primary' : 'secondary'} size="sm" onClick={() => void submit('insert')}>
            <CornerDownLeft size={13} /> Insert
          </Button>
        )}
        <Button type={mode === 'copy' ? 'submit' : 'button'} variant={mode === 'copy' ? 'primary' : 'secondary'} size="sm" onClick={mode === 'copy' ? undefined : () => void submit('copy')}>
          <Copy size={13} /> Copy
        </Button>
      </div>
    </form>
  );
}

const pick = (o: Record<string, string>, names: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => names.includes(k) && typeof v === 'string'));
